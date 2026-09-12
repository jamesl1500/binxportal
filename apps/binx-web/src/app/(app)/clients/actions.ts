/**
 * actions.ts - Clients
 *
 * Server actions for the clients list and detail pages: create, update,
 * archive/restore, and permanently delete. All are plain authenticated
 * mutations — no session cookies change — so they call binx-api directly via
 * `lib/clients.ts` rather than going through an internal `/api/*` proxy route.
 *
 * @module apps/binx-web/src/app/(app)/clients/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import {
  AgencyClient,
  ClientBranding,
  ClientBrandingInput,
  ClientDetailsInput,
  createAgencyClient,
  deleteAgencyClient,
  getClientBranding,
  removeClientLogo,
  setAgencyClientActive,
  updateAgencyClient,
  updateClientBranding,
  uploadClientLogo,
} from "@/lib/clients";

export interface CreateClientActionResult {
  error?: string;
  client?: AgencyClient;
}

export async function createClientAction(
  agencyId: string,
  input: ClientDetailsInput,
): Promise<CreateClientActionResult> {
  try {
    const client = await createAgencyClient(agencyId, input);
    return { client };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to create client" };
  }
}

export interface UpdateClientActionResult {
  error?: string;
  client?: AgencyClient;
}

export async function updateClientAction(
  agencyId: string,
  clientId: string,
  input: ClientDetailsInput,
): Promise<UpdateClientActionResult> {
  try {
    const client = await updateAgencyClient(agencyId, clientId, input);
    return { client };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to update client" };
  }
}

export interface SetClientActiveActionResult {
  error?: string;
  client?: AgencyClient;
}

export async function setClientActiveAction(
  agencyId: string,
  clientId: string,
  isActive: boolean,
): Promise<SetClientActiveActionResult> {
  try {
    const client = await setAgencyClientActive(agencyId, clientId, isActive);
    return { client };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to update client status" };
  }
}

export interface DeleteClientActionResult {
  error?: string;
}

export async function deleteClientAction(agencyId: string, clientId: string): Promise<DeleteClientActionResult> {
  try {
    await deleteAgencyClient(agencyId, clientId);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to delete client" };
  }

  redirect("/clients");
}

// ---- Portal branding ----

export interface ClientBrandingActionResult {
  error?: string;
  branding?: ClientBranding;
}

function brandingError(error: unknown, fallback: string): ClientBrandingActionResult {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export async function getClientBrandingAction(agencyId: string, clientId: string): Promise<ClientBrandingActionResult> {
  try {
    return { branding: await getClientBranding(agencyId, clientId) };
  } catch (error) {
    return brandingError(error, "Unable to load branding");
  }
}

export async function updateClientBrandingAction(
  agencyId: string,
  clientId: string,
  input: ClientBrandingInput,
): Promise<ClientBrandingActionResult> {
  try {
    return { branding: await updateClientBranding(agencyId, clientId, input) };
  } catch (error) {
    return brandingError(error, "Unable to update branding");
  }
}

export async function uploadClientLogoAction(
  agencyId: string,
  clientId: string,
  formData: FormData,
): Promise<ClientBrandingActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected" };
  }
  try {
    return { branding: await uploadClientLogo(agencyId, clientId, file) };
  } catch (error) {
    return brandingError(error, "Unable to upload the logo");
  }
}

export async function removeClientLogoAction(agencyId: string, clientId: string): Promise<ClientBrandingActionResult> {
  try {
    return { branding: await removeClientLogo(agencyId, clientId) };
  } catch (error) {
    return brandingError(error, "Unable to remove the logo");
  }
}
