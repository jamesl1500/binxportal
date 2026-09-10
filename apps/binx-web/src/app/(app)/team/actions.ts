/**
 * actions.ts - Team
 *
 * Server actions for the team page: inviting someone, changing a member's
 * role, editing a member's agency-scoped details, removing a member, and
 * resending / revoking / listing invitations. All are plain authenticated
 * mutations — no session cookies change — so they call binx-api directly via
 * `lib/agencies.ts` rather than going through an internal `/api/*` proxy route.
 *
 * @module apps/binx-web/src/app/(app)/team/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  AgencyInvitation,
  AgencyMember,
  AgencyRole,
  InvitableAgencyRole,
  createAgencyInvitation,
  getAgencyInvitations,
  removeAgencyMember,
  resendAgencyInvitation,
  revokeAgencyInvitation,
  updateAgencyMemberDetails,
  updateAgencyMemberRole,
} from "@/lib/agencies";

export interface InviteMemberActionResult {
  error?: string;
}

export async function inviteMemberAction(
  agencyId: string,
  email: string,
  role: InvitableAgencyRole,
): Promise<InviteMemberActionResult> {
  try {
    await createAgencyInvitation(agencyId, email, role);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to send invitation" };
  }

  return {};
}

export interface UpdateAgencyMemberRoleActionResult {
  error?: string;
  member?: AgencyMember;
}

export async function updateAgencyMemberRoleAction(
  agencyId: string,
  memberId: string,
  role: AgencyRole,
): Promise<UpdateAgencyMemberRoleActionResult> {
  try {
    const member = await updateAgencyMemberRole(agencyId, memberId, role);
    return { member };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to update member's role" };
  }
}

export interface UpdateMemberDetailsActionResult {
  error?: string;
  member?: AgencyMember;
}

export async function updateMemberDetailsAction(
  agencyId: string,
  memberId: string,
  details: { title: string | null; adminNotes: string | null },
): Promise<UpdateMemberDetailsActionResult> {
  try {
    const member = await updateAgencyMemberDetails(agencyId, memberId, details);
    return { member };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to update member's details" };
  }
}

export interface RemoveAgencyMemberActionResult {
  error?: string;
}

export async function removeAgencyMemberAction(
  agencyId: string,
  memberId: string,
): Promise<RemoveAgencyMemberActionResult> {
  try {
    await removeAgencyMember(agencyId, memberId);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to remove member" };
  }

  return {};
}

export interface ResendInvitationActionResult {
  error?: string;
  invitation?: AgencyInvitation;
}

export async function resendInvitationAction(
  agencyId: string,
  invitationId: string,
): Promise<ResendInvitationActionResult> {
  try {
    const invitation = await resendAgencyInvitation(agencyId, invitationId);
    return { invitation };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to resend invitation" };
  }
}

export interface RevokeAgencyInvitationActionResult {
  error?: string;
}

export async function revokeAgencyInvitationAction(
  agencyId: string,
  invitationId: string,
): Promise<RevokeAgencyInvitationActionResult> {
  try {
    await revokeAgencyInvitation(agencyId, invitationId);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to revoke invitation" };
  }

  return {};
}

export interface InvitationHistoryActionResult {
  error?: string;
  invitations?: AgencyInvitation[];
}

export async function getInvitationHistoryAction(agencyId: string): Promise<InvitationHistoryActionResult> {
  try {
    const invitations = await getAgencyInvitations(agencyId, { includeAll: true });
    return { invitations };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to load invitation history" };
  }
}
