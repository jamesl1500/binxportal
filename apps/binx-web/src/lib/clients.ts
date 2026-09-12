/**
 * clients.ts
 *
 * Server-only helpers for authenticated calls to binx-api's
 * `/agencies/{agencyId}/clients/*` endpoints. Like `lib/agencies.ts`'s
 * members/invitations helpers, these attach the existing access token
 * rather than establishing a new session.
 *
 * @module apps/binx-web/src/lib/clients.ts
 * @author Binx.io
 */
import axios from "axios";
import { cache } from "react";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

export type AgencyClient = Schemas["AgencyClientRead"];

/** Fields the create/edit form submits. Contact details are all optional — a client can be jotted down with just a name. */
export interface ClientDetailsInput {
  name: string;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  website: string | null;
  notes: string | null;
  billingEmail?: string | null;
  billingAddress?: string | null;
}

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function toPayload(input: ClientDetailsInput) {
  return {
    name: input.name,
    primary_contact_name: input.primaryContactName,
    primary_contact_email: input.primaryContactEmail,
    primary_contact_phone: input.primaryContactPhone,
    website: input.website,
    notes: input.notes,
    billing_email: input.billingEmail ?? null,
    billing_address: input.billingAddress ?? null,
  };
}

/**
 * getAgencyClients
 *
 * Lists an agency's clients via `GET /agencies/{agencyId}/clients` — active
 * ones first, alphabetical within each group. Any member can call this.
 *
 * @function getAgencyClients
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getAgencyClients(agencyId: string): Promise<AgencyClient[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<AgencyClient[]>(`/agencies/${agencyId}/clients`, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to load clients"), error.response.status);
    }
    throw error;
  }
}

/**
 * getAgencyClient
 *
 * Fetches a single client via `GET /agencies/{agencyId}/clients/{clientId}`,
 * for the client detail pages. Wrapped in React's `cache()` so the client
 * layout and each of its tabs (dashboard/projects/messages/invoices/settings)
 * share one request per render, the same dedup `getAgencyProject` uses.
 *
 * @function getAgencyClient
 * @throws {AuthApiError} - Thrown if not authenticated, or the client doesn't exist in this agency.
 */
export const getAgencyClient = cache(async (agencyId: string, clientId: string): Promise<AgencyClient> => {
  const headers = await authHeader();

  try {
    const { data } = await api.get<AgencyClient>(`/agencies/${agencyId}/clients/${clientId}`, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to load client"), error.response.status);
    }
    throw error;
  }
});

/**
 * createAgencyClient
 *
 * Creates a client under an agency via `POST /agencies/{agencyId}/clients`.
 * Any member can call this — adding clients is day-to-day work, not agency
 * administration.
 *
 * @function createAgencyClient
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function createAgencyClient(agencyId: string, input: ClientDetailsInput): Promise<AgencyClient> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<AgencyClient>(`/agencies/${agencyId}/clients`, toPayload(input), { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to create client"), error.response.status);
    }
    throw error;
  }
}

/**
 * updateAgencyClient
 *
 * Replaces a client's details via `PATCH /agencies/{agencyId}/clients/{clientId}`.
 * A full replace, not a partial patch — the edit form always submits every
 * field together. Doesn't touch active/archived status; see setAgencyClientActive.
 *
 * @function updateAgencyClient
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function updateAgencyClient(
  agencyId: string,
  clientId: string,
  input: ClientDetailsInput,
): Promise<AgencyClient> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<AgencyClient>(
      `/agencies/${agencyId}/clients/${clientId}`,
      toPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to update client"), error.response.status);
    }
    throw error;
  }
}

/**
 * setAgencyClientActive
 *
 * Archives or restores a client via `PATCH /agencies/{agencyId}/clients/{clientId}/status`.
 * Kept separate from updateAgencyClient so a quick table-row action doesn't
 * need the full edit form's data.
 *
 * @function setAgencyClientActive
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function setAgencyClientActive(
  agencyId: string,
  clientId: string,
  isActive: boolean,
): Promise<AgencyClient> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<AgencyClient>(
      `/agencies/${agencyId}/clients/${clientId}/status`,
      { is_active: isActive },
      { headers },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update client status"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * deleteAgencyClient
 *
 * Permanently deletes a client via `DELETE /agencies/{agencyId}/clients/{clientId}`.
 * binx-api requires the caller to be an owner or admin of this agency — a
 * bigger, harder-to-undo action than archiving, same split as deleting the
 * agency itself.
 *
 * @function deleteAgencyClient
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function deleteAgencyClient(agencyId: string, clientId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/clients/${clientId}`, { headers });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to delete client"), error.response.status);
    }
    throw error;
  }
}

// ---- Client portal contacts ----

/** Someone on the client's side with `/portal` access to this client. */
export type ClientContact = Schemas["ClientContactRead"];

export type ClientContactInvitation = Omit<Schemas["ClientInvitationRead"], "status"> & {
  status: "pending" | "accepted" | "revoked";
};

function contactError(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error) && error.response) {
    throw new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  throw error;
}

export async function getClientContacts(agencyId: string, clientId: string): Promise<ClientContact[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ClientContact[]>(
      `/agencies/${agencyId}/clients/${clientId}/contacts`,
      { headers },
    );
    return data;
  } catch (error) {
    contactError(error, "Unable to load portal contacts");
  }
}

export async function getClientContactInvitations(
  agencyId: string,
  clientId: string,
  options: { includeAll?: boolean } = {},
): Promise<ClientContactInvitation[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ClientContactInvitation[]>(
      `/agencies/${agencyId}/clients/${clientId}/contacts/invitations`,
      { headers, params: options.includeAll ? { status: "all" } : undefined },
    );
    return data;
  } catch (error) {
    contactError(error, "Unable to load invitations");
  }
}

export async function inviteClientContact(
  agencyId: string,
  clientId: string,
  input: { email: string; title?: string | null },
): Promise<ClientContactInvitation> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ClientContactInvitation>(
      `/agencies/${agencyId}/clients/${clientId}/contacts/invitations`,
      { email: input.email, title: input.title ?? null },
      { headers },
    );
    return data;
  } catch (error) {
    contactError(error, "Unable to send the invitation");
  }
}

export async function resendClientContactInvitation(
  agencyId: string,
  clientId: string,
  invitationId: string,
): Promise<ClientContactInvitation> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ClientContactInvitation>(
      `/agencies/${agencyId}/clients/${clientId}/contacts/invitations/${invitationId}/resend`,
      undefined,
      { headers },
    );
    return data;
  } catch (error) {
    contactError(error, "Unable to resend the invitation");
  }
}

export async function revokeClientContactInvitation(
  agencyId: string,
  clientId: string,
  invitationId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(
      `/agencies/${agencyId}/clients/${clientId}/contacts/invitations/${invitationId}`,
      { headers },
    );
  } catch (error) {
    contactError(error, "Unable to revoke the invitation");
  }
}

export async function removeClientContact(
  agencyId: string,
  clientId: string,
  contactId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/clients/${clientId}/contacts/${contactId}`, { headers });
  } catch (error) {
    contactError(error, "Unable to remove the contact");
  }
}

// ---- Portal branding ----

export type ClientBranding = Schemas["ClientBrandingRead"];

/** Every editable branding field — the form submits the full set each save, same as AgencyProfileInput. */
export type ClientBrandingInput = Partial<Omit<ClientBranding, "client_id" | "has_logo" | "logo_version">>;

export async function getClientBranding(agencyId: string, clientId: string): Promise<ClientBranding> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ClientBranding>(`/agencies/${agencyId}/clients/${clientId}/branding`, { headers });
    return data;
  } catch (error) {
    contactError(error, "Unable to load branding");
  }
}

export async function updateClientBranding(
  agencyId: string,
  clientId: string,
  input: ClientBrandingInput,
): Promise<ClientBranding> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<ClientBranding>(
      `/agencies/${agencyId}/clients/${clientId}/branding`,
      input,
      { headers },
    );
    return data;
  } catch (error) {
    contactError(error, "Unable to update branding");
  }
}

export async function uploadClientLogo(agencyId: string, clientId: string, file: File): Promise<ClientBranding> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);
  try {
    const { data } = await api.put<ClientBranding>(
      `/agencies/${agencyId}/clients/${clientId}/branding/logo`,
      formData,
      { headers: { ...headers, "Content-Type": undefined } },
    );
    return data;
  } catch (error) {
    contactError(error, "Unable to upload the logo");
  }
}

export async function removeClientLogo(agencyId: string, clientId: string): Promise<ClientBranding> {
  const headers = await authHeader();
  try {
    const { data } = await api.delete<ClientBranding>(`/agencies/${agencyId}/clients/${clientId}/branding/logo`, {
      headers,
    });
    return data;
  } catch (error) {
    contactError(error, "Unable to remove the logo");
  }
}
