/**
 * actions.ts - Client Settings
 *
 * Server actions for the client's portal-contacts panel: invite someone to
 * the client portal, resend / revoke a pending invite, remove a contact.
 * Plain authenticated mutations against `lib/clients.ts`.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/settings/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  type ClientContactInvitation,
  inviteClientContact,
  removeClientContact,
  resendClientContactInvitation,
  revokeClientContactInvitation,
} from "@/lib/clients";

export interface InviteClientContactResult {
  error?: string;
  invitation?: ClientContactInvitation;
}

export async function inviteClientContactAction(
  agencyId: string,
  clientId: string,
  email: string,
  title: string | null,
): Promise<InviteClientContactResult> {
  try {
    const invitation = await inviteClientContact(agencyId, clientId, { email, title });
    return { invitation };
  } catch (error) {
    if (error instanceof AuthApiError) return { error: error.message };
    return { error: "Unable to send the invitation" };
  }
}

export async function resendClientContactInvitationAction(
  agencyId: string,
  clientId: string,
  invitationId: string,
): Promise<InviteClientContactResult> {
  try {
    const invitation = await resendClientContactInvitation(agencyId, clientId, invitationId);
    return { invitation };
  } catch (error) {
    if (error instanceof AuthApiError) return { error: error.message };
    return { error: "Unable to resend the invitation" };
  }
}

export interface ClientContactMutationResult {
  error?: string;
}

export async function revokeClientContactInvitationAction(
  agencyId: string,
  clientId: string,
  invitationId: string,
): Promise<ClientContactMutationResult> {
  try {
    await revokeClientContactInvitation(agencyId, clientId, invitationId);
  } catch (error) {
    if (error instanceof AuthApiError) return { error: error.message };
    return { error: "Unable to revoke the invitation" };
  }
  return {};
}

export async function removeClientContactAction(
  agencyId: string,
  clientId: string,
  contactId: string,
): Promise<ClientContactMutationResult> {
  try {
    await removeClientContact(agencyId, clientId, contactId);
  } catch (error) {
    if (error instanceof AuthApiError) return { error: error.message };
    return { error: "Unable to remove the contact" };
  }
  return {};
}
