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
  ClientDetailsInput,
  createAgencyClient,
  deleteAgencyClient,
  setAgencyClientActive,
  updateAgencyClient,
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
