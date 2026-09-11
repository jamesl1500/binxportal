/**
 * agencies.ts
 *
 * Server-only helpers for authenticated calls to binx-api's `/agencies/*`
 * endpoints. Like `lib/users.ts`, these attach the existing access token
 * rather than establishing a new session. Also holds the "current agency"
 * cookie helpers — a user can belong to multiple agencies, and this is how
 * their choice of which one they're working in persists across the app.
 *
 * @module apps/binx-web/src/lib/agencies.ts
 * @author Binx.io
 */
import axios from "axios";
import { cookies } from "next/headers";
import { cache } from "react";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import { agencyImageUrl, type AgencyImageKind } from "@/lib/agencies-client";

export { agencyImageUrl };
export type { AgencyImageKind };

/** The caller's membership role within a given agency — distinct from their global account role. */
export type AgencyRole = "owner" | "admin" | "member";

/** The signed-in user's agency + their role in it. */
export type AgencyRead = Omit<Schemas["AgencyRead"], "role"> & { role: AgencyRole };

/** The general agency profile — branding, about/contact, socials, policies. */
export type AgencyProfile = Schemas["AgencyProfileRead"];

/** Every editable profile field — the settings forms submit the full set each save. */
export type AgencyProfileInput = Partial<
  Omit<AgencyProfile, "agency_id" | "has_logo" | "has_cover" | "logo_version" | "cover_version">
>;

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * createAgency
 *
 * Creates a new agency owned by the signed-in user via `POST /agencies`.
 *
 * @function createAgency
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function createAgency(name: string): Promise<AgencyRead> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<AgencyRead>("/agencies", { name }, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to create agency"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * getMyAgencies
 *
 * Lists the agencies the signed-in user belongs to via `GET /agencies/mine`.
 *
 * @function getMyAgencies
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function getMyAgencies(): Promise<AgencyRead[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<AgencyRead[]>("/agencies/mine", { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to load agencies"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * updateAgency
 *
 * Renames an agency via `PATCH /agencies/{agencyId}`. binx-api requires the
 * caller to be an owner or admin of that specific agency, independent of
 * their global account role.
 *
 * @function updateAgency
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function updateAgency(agencyId: string, name: string): Promise<AgencyRead> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<AgencyRead>(`/agencies/${agencyId}`, { name }, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update agency"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * deleteAgency
 *
 * Permanently deletes an agency via `DELETE /agencies/{agencyId}`. binx-api
 * requires the caller to be the OWNER of that specific agency.
 *
 * @function deleteAgency
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't the agency's owner.
 */
export async function deleteAgency(agencyId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}`, { headers });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to delete agency"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * Cookie holding the id of the agency the user last chose to work in. Not a
 * session credential (it's just a UI preference, and binx-api re-validates
 * membership whenever it actually matters), so it's a long-lived cookie
 * rather than one tied to the auth session's lifetime.
 */
export const CURRENT_AGENCY_COOKIE = "binx_current_agency_id";
const CURRENT_AGENCY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Reads the raw "current agency" cookie value, if any — may be stale or belong to an agency the user has since left. */
export async function getCurrentAgencyId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CURRENT_AGENCY_COOKIE)?.value;
}

/** Persists the user's choice of current agency. Only call this after verifying they're actually a member. */
export async function setCurrentAgencyId(agencyId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_AGENCY_COOKIE, agencyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CURRENT_AGENCY_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Clears the "current agency" cookie — e.g. after deleting the agency it pointed to. */
export async function clearCurrentAgencyId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CURRENT_AGENCY_COOKIE);
}

export interface CurrentAgencyContext {
  /** Every agency the signed-in user belongs to. */
  agencies: AgencyRead[];
  /**
   * The agency to treat as "current": the cookie's agency if the user is
   * still a member of it, otherwise the first agency (oldest membership —
   * see get_agencies_for_user on the backend for why that order is stable).
   * `null` only if the user belongs to no agency at all.
   */
  currentAgency: AgencyRead | null;
}

/**
 * getCurrentAgencyContext
 *
 * Resolves which agency the signed-in user is currently working in, along
 * with the full list to power a switcher. Combines `getMyAgencies` with the
 * "current agency" cookie so callers (the (app) layout, and any future
 * agency-scoped page) don't have to duplicate the fallback logic.
 *
 * Wrapped in React's `cache()` so multiple call sites in the same request
 * (e.g. the (app) layout and whatever page it wraps) share one fetch instead
 * of each hitting binx-api separately.
 *
 * @function getCurrentAgencyContext
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export const getCurrentAgencyContext = cache(async (): Promise<CurrentAgencyContext> => {
  const agencies = await getMyAgencies();
  if (agencies.length === 0) {
    return { agencies, currentAgency: null };
  }

  const currentAgencyId = await getCurrentAgencyId();
  const currentAgency = agencies.find((agency) => agency.id === currentAgencyId) ?? agencies[0];
  return { agencies, currentAgency };
});

// ---- Profile (branding / about / policies) ----

/**
 * getAgencyProfile
 *
 * The agency's general profile via `GET /agencies/{agencyId}/profile`
 * (binx-api lazy-creates the row). Any member can read it.
 *
 * @function getAgencyProfile
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getAgencyProfile(agencyId: string): Promise<AgencyProfile> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<AgencyProfile>(`/agencies/${agencyId}/profile`, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to load agency profile"), error.response.status);
    }
    throw error;
  }
}

/**
 * updateAgencyProfile
 *
 * Replaces the profile's text fields via `PATCH /agencies/{agencyId}/profile`.
 * A full replace — every form submits the full set it owns. Owner/admin only.
 *
 * @function updateAgencyProfile
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function updateAgencyProfile(agencyId: string, input: AgencyProfileInput): Promise<AgencyProfile> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<AgencyProfile>(`/agencies/${agencyId}/profile`, input, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to update agency profile"), error.response.status);
    }
    throw error;
  }
}

/**
 * uploadAgencyImage
 *
 * Uploads the agency logo or cover via `PUT /agencies/{agencyId}/{kind}`
 * (multipart/form-data). Owner/admin only; binx-api rejects non-images and
 * anything over its size cap. Returns the updated profile.
 *
 * @function uploadAgencyImage
 * @throws {AuthApiError} - Thrown if not authenticated, lacking permission, the type isn't allowed, or it's too large.
 */
export async function uploadAgencyImage(
  agencyId: string,
  kind: AgencyImageKind,
  file: File,
): Promise<AgencyProfile> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);
  try {
    // See lib/projects.ts's uploadProjectFile: delete the inherited
    // `Content-Type: application/json` so axios sets its own multipart boundary.
    const { data } = await api.put<AgencyProfile>(`/agencies/${agencyId}/${kind}`, formData, {
      headers: { ...headers, "Content-Type": undefined },
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to upload image"), error.response.status);
    }
    throw error;
  }
}

/**
 * deleteAgencyImage
 *
 * Clears the agency logo or cover via `DELETE /agencies/{agencyId}/{kind}`.
 * Owner/admin only. Returns the updated profile.
 *
 * @function deleteAgencyImage
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function deleteAgencyImage(agencyId: string, kind: AgencyImageKind): Promise<AgencyProfile> {
  const headers = await authHeader();
  try {
    const { data } = await api.delete<AgencyProfile>(`/agencies/${agencyId}/${kind}`, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to remove image"), error.response.status);
    }
    throw error;
  }
}

// ---- Members ----

export type AgencyMember = Omit<Schemas["AgencyMemberRead"], "role"> & { role: AgencyRole };

/**
 * getAgencyMembers
 *
 * Lists an agency's members via `GET /agencies/{agencyId}/members`. Any
 * member can call this; binx-api re-checks membership regardless of what the
 * frontend currently has selected as "current".
 *
 * @function getAgencyMembers
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getAgencyMembers(agencyId: string): Promise<AgencyMember[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<AgencyMember[]>(`/agencies/${agencyId}/members`, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to load members"), error.response.status);
    }
    throw error;
  }
}

/**
 * updateAgencyMemberRole
 *
 * Changes a member's role via `PATCH /agencies/{agencyId}/members/{memberId}`.
 * Requires the caller to be an owner or admin of that agency; binx-api also
 * rejects demoting the agency's last owner.
 *
 * @function updateAgencyMemberRole
 * @throws {AuthApiError} - Thrown if not authenticated, lacking permission, or the change would leave no owner.
 */
export async function updateAgencyMemberRole(agencyId: string, memberId: string, role: AgencyRole): Promise<AgencyMember> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<AgencyMember>(`/agencies/${agencyId}/members/${memberId}`, { role }, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update member's role"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * updateAgencyMemberDetails
 *
 * Sets a membership's agency-scoped fields — the job title they hold at this
 * agency and the internal owner/admin-only notes — via
 * `PATCH /agencies/{agencyId}/members/{memberId}/details`. A full replace:
 * omitting a field clears it. Owner/admin only.
 *
 * @function updateAgencyMemberDetails
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function updateAgencyMemberDetails(
  agencyId: string,
  memberId: string,
  details: { title: string | null; adminNotes: string | null },
): Promise<AgencyMember> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<AgencyMember>(
      `/agencies/${agencyId}/members/${memberId}/details`,
      { title: details.title, admin_notes: details.adminNotes },
      { headers },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update member's details"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * removeAgencyMember
 *
 * Removes a member via `DELETE /agencies/{agencyId}/members/{memberId}`.
 * binx-api rejects removing yourself or the agency's last owner.
 *
 * @function removeAgencyMember
 * @throws {AuthApiError} - Thrown if not authenticated, lacking permission, or the removal is disallowed.
 */
export async function removeAgencyMember(agencyId: string, memberId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/members/${memberId}`, { headers });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to remove member"), error.response.status);
    }
    throw error;
  }
}

// ---- Invitations ----

export type AgencyInvitationStatus = "pending" | "accepted" | "revoked";
/** Roles an invite can grant. Deliberately excludes "owner" — see binx-api's AgencyInvitationCreate. */
export type InvitableAgencyRole = "admin" | "member";

export type AgencyInvitation = Omit<Schemas["AgencyInvitationRead"], "role" | "status"> & {
  role: InvitableAgencyRole;
  status: AgencyInvitationStatus;
};

/**
 * getAgencyInvitations
 *
 * Lists an agency's invitations via `GET /agencies/{agencyId}/invitations`.
 * Pending only by default; pass `{ includeAll: true }` for the accepted /
 * revoked history too. Requires the caller to be an owner or admin.
 *
 * @function getAgencyInvitations
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function getAgencyInvitations(
  agencyId: string,
  options: { includeAll?: boolean } = {},
): Promise<AgencyInvitation[]> {
  const headers = await authHeader();
  const params = options.includeAll ? { status: "all" } : undefined;

  try {
    const { data } = await api.get<AgencyInvitation[]>(`/agencies/${agencyId}/invitations`, { headers, params });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to load invitations"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * createAgencyInvitation
 *
 * Invites someone to an agency by email via `POST /agencies/{agencyId}/invitations`.
 * Re-sending to an address with an existing pending invite reissues it rather
 * than creating a duplicate. Requires the caller to be an owner or admin.
 *
 * @function createAgencyInvitation
 * @throws {AuthApiError} - Thrown if not authenticated, lacking permission, or the address is already a member.
 */
export async function createAgencyInvitation(
  agencyId: string,
  email: string,
  role: InvitableAgencyRole,
): Promise<AgencyInvitation> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<AgencyInvitation>(`/agencies/${agencyId}/invitations`, { email, role }, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to send invitation"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * resendAgencyInvitation
 *
 * Re-issues a pending invitation's token + expiry and re-sends the email via
 * `POST /agencies/{agencyId}/invitations/{invitationId}/resend`. The response
 * carries a fresh `accept_url`. Requires the caller to be an owner or admin.
 *
 * @function resendAgencyInvitation
 * @throws {AuthApiError} - Thrown if not authenticated, lacking permission, or the invitation is no longer pending.
 */
export async function resendAgencyInvitation(agencyId: string, invitationId: string): Promise<AgencyInvitation> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<AgencyInvitation>(
      `/agencies/${agencyId}/invitations/${invitationId}/resend`,
      undefined,
      { headers },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to resend invitation"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * revokeAgencyInvitation
 *
 * Cancels a pending invitation via `DELETE /agencies/{agencyId}/invitations/{invitationId}`.
 * Requires the caller to be an owner or admin.
 *
 * @function revokeAgencyInvitation
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function revokeAgencyInvitation(agencyId: string, invitationId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/invitations/${invitationId}`, { headers });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to revoke invitation"),
        error.response.status,
      );
    }
    throw error;
  }
}

export type AgencyInvitationPreview = Omit<Schemas["AgencyInvitationPreview"], "role"> & {
  role: InvitableAgencyRole;
};

/**
 * previewAgencyInvitation
 *
 * Resolves an invite token to what it grants via `GET /agencies/invitations/preview`,
 * without consuming it. Deliberately unauthenticated — an invitee should see
 * what they're accepting before being asked to log in.
 *
 * @function previewAgencyInvitation
 * @throws {AuthApiError} - Thrown if the token is invalid, already used, or expired.
 */
export async function previewAgencyInvitation(token: string): Promise<AgencyInvitationPreview> {
  try {
    const { data } = await api.get<AgencyInvitationPreview>("/agencies/invitations/preview", { params: { token } });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "This invitation link is invalid or has expired"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * acceptAgencyInvitation
 *
 * Consumes an invite token via `POST /agencies/invitations/accept`, creating
 * the signed-in user's membership. binx-api rejects tokens sent to a
 * different email address than the signed-in account's.
 *
 * @function acceptAgencyInvitation
 * @throws {AuthApiError} - Thrown if not authenticated, the token is invalid/expired, or the email doesn't match.
 */
export async function acceptAgencyInvitation(token: string): Promise<AgencyRead> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<AgencyRead>("/agencies/invitations/accept", { token }, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to accept invitation"),
        error.response.status,
      );
    }
    throw error;
  }
}
