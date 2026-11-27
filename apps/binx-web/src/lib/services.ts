/**
 * services.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/services`
 * catalog: what the agency sells, picked from when building proposals,
 * invoices and recurring schedules. Every member can read it; only owners
 * and admins can change it. Money is integer cents, quantities decimal
 * strings, same as `lib/invoicing.ts`. Client Components import the shared
 * shape and labels from `lib/services-client.ts` instead.
 *
 * @module apps/binx-web/src/lib/services.ts
 * @author Binx Portal
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type {
  Service,
  ServiceAttachment,
  ServiceCategory,
} from "@/lib/services-client";

export type {
  Service,
  ServiceAttachment,
  ServiceCategory,
} from "@/lib/services-client";

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(
      extractDetailMessage(error.response.data, fallback),
      error.response.status,
    );
  }
  return error;
}

export interface ServiceInput {
  name: string;
  description: string | null;
  pricingType: string;
  unitPriceCents: number;
  defaultQuantity: string;
  /** The price is where it starts ("From $2,500"). */
  isStartingPrice?: boolean;
  categoryId?: string | null;
}

function toPayload(input: ServiceInput) {
  return {
    name: input.name,
    description: input.description,
    pricing_type: input.pricingType,
    unit_price_cents: input.unitPriceCents,
    default_quantity: input.defaultQuantity,
    is_starting_price: input.isStartingPrice ?? false,
    category_id: input.categoryId ?? null,
  };
}

export async function getServices(
  agencyId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<Service[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Service[]>(
      `/agencies/${agencyId}/services`,
      { headers, params: includeArchived ? { include_archived: true } : {} },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load services");
  }
}

export async function createService(
  agencyId: string,
  input: ServiceInput,
): Promise<Service> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<Service>(
      `/agencies/${agencyId}/services`,
      toPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to add service");
  }
}

export async function updateService(
  agencyId: string,
  serviceId: string,
  input: Partial<ServiceInput> & { isArchived?: boolean },
): Promise<Service> {
  const headers = await authHeader();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.pricingType !== undefined) payload.pricing_type = input.pricingType;
  if (input.unitPriceCents !== undefined)
    payload.unit_price_cents = input.unitPriceCents;
  if (input.defaultQuantity !== undefined)
    payload.default_quantity = input.defaultQuantity;
  if (input.isArchived !== undefined) payload.is_archived = input.isArchived;
  if (input.isStartingPrice !== undefined)
    payload.is_starting_price = input.isStartingPrice;
  // null takes it out of its category.
  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  try {
    const { data } = await api.patch<Service>(
      `/agencies/${agencyId}/services/${serviceId}`,
      payload,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update service");
  }
}

export async function deleteService(
  agencyId: string,
  serviceId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/services/${serviceId}`, {
      headers,
    });
  } catch (error) {
    throw apiError(error, "Unable to delete service");
  }
}

// ---- Categories --------------------------------------------------------------

export async function getServiceCategories(
  agencyId: string,
): Promise<ServiceCategory[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ServiceCategory[]>(
      `/agencies/${agencyId}/service-categories`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load categories");
  }
}

export async function createServiceCategory(
  agencyId: string,
  name: string,
): Promise<ServiceCategory> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ServiceCategory>(
      `/agencies/${agencyId}/service-categories`,
      { name },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to add the category");
  }
}

export async function updateServiceCategory(
  agencyId: string,
  categoryId: string,
  input: { name?: string; position?: number },
): Promise<ServiceCategory> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<ServiceCategory>(
      `/agencies/${agencyId}/service-categories/${categoryId}`,
      input,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update the category");
  }
}

export async function deleteServiceCategory(
  agencyId: string,
  categoryId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/service-categories/${categoryId}`, {
      headers,
    });
  } catch (error) {
    throw apiError(error, "Unable to delete the category");
  }
}

// ---- Photos and PDFs -------------------------------------------------------------

export async function uploadServiceAttachment(
  agencyId: string,
  serviceId: string,
  file: File,
): Promise<ServiceAttachment> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);
  try {
    // Dropping Content-Type lets axios set the multipart boundary.
    const { data } = await api.post<ServiceAttachment>(
      `/agencies/${agencyId}/services/${serviceId}/attachments`,
      formData,
      { headers: { ...headers, "Content-Type": undefined } },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to add that file");
  }
}

export async function deleteServiceAttachment(
  agencyId: string,
  serviceId: string,
  attachmentId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(
      `/agencies/${agencyId}/services/${serviceId}/attachments/${attachmentId}`,
      { headers },
    );
  } catch (error) {
    throw apiError(error, "Unable to remove that file");
  }
}
