/**
 * actions.ts - Agency Settings · Services
 *
 * Server actions for the services catalog: add, edit, archive/restore and
 * delete. binx-api re-checks that the caller is an owner or admin. Each
 * action calls `refresh()` so the page's server-rendered list updates in
 * place.
 *
 * @module apps/binx-web/src/app/(app)/settings/services/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  createService,
  createServiceCategory,
  deleteService,
  deleteServiceAttachment,
  deleteServiceCategory,
  type Service,
  type ServiceInput,
  updateService,
  updateServiceCategory,
  uploadServiceAttachment,
} from "@/lib/services";

export interface ServiceActionResult {
  error?: string;
  service?: Service;
}

function errorResult(error: unknown, fallback: string): { error: string } {
  return { error: error instanceof AuthApiError ? error.message : fallback };
}

export async function createServiceAction(
  agencyId: string,
  input: ServiceInput,
): Promise<ServiceActionResult> {
  try {
    const service = await createService(agencyId, input);
    refresh();
    return { service };
  } catch (error) {
    return errorResult(error, "Unable to add service");
  }
}

export async function updateServiceAction(
  agencyId: string,
  serviceId: string,
  input: ServiceInput,
): Promise<ServiceActionResult> {
  try {
    const service = await updateService(agencyId, serviceId, input);
    refresh();
    return { service };
  } catch (error) {
    return errorResult(error, "Unable to update service");
  }
}

export async function setServiceArchivedAction(
  agencyId: string,
  serviceId: string,
  archived: boolean,
): Promise<ServiceActionResult> {
  try {
    const service = await updateService(agencyId, serviceId, {
      isArchived: archived,
    });
    refresh();
    return { service };
  } catch (error) {
    return errorResult(
      error,
      archived ? "Unable to archive service" : "Unable to restore service",
    );
  }
}

export async function deleteServiceAction(
  agencyId: string,
  serviceId: string,
): Promise<{ error?: string }> {
  try {
    await deleteService(agencyId, serviceId);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete service");
  }
}

export async function createCategoryAction(
  agencyId: string,
  name: string,
): Promise<{ error?: string }> {
  try {
    await createServiceCategory(agencyId, name);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to add the category");
  }
}

export async function renameCategoryAction(
  agencyId: string,
  categoryId: string,
  name: string,
): Promise<{ error?: string }> {
  try {
    await updateServiceCategory(agencyId, categoryId, { name });
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to rename the category");
  }
}

export async function deleteCategoryAction(
  agencyId: string,
  categoryId: string,
): Promise<{ error?: string }> {
  try {
    await deleteServiceCategory(agencyId, categoryId);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete the category");
  }
}

export async function uploadServiceFileAction(
  agencyId: string,
  serviceId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo or PDF" };
  }
  try {
    await uploadServiceAttachment(agencyId, serviceId, file);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to add that file");
  }
}

export async function deleteServiceFileAction(
  agencyId: string,
  serviceId: string,
  attachmentId: string,
): Promise<{ error?: string }> {
  try {
    await deleteServiceAttachment(agencyId, serviceId, attachmentId);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to remove that file");
  }
}
