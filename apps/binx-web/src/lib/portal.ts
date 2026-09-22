/**
 * portal.ts
 *
 * Server-only helpers for the client portal — authenticated calls to
 * binx-api's `/portal/*` endpoints. A client contact holds a normal Binx
 * account; these calls are scoped server-side to the one AgencyClient they're
 * a contact for (see binx-api's require_client_contact).
 *
 * @module apps/binx-web/src/lib/portal.ts
 * @author Binx.io
 */
import axios from "axios";
import { cache } from "react";

import { api } from "@/lib/api";
import { getMyAgencies } from "@/lib/agencies";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { Board, BoardComment, BoardItem, BoardItemPatch } from "@/lib/boards-client";
import type { BoardReactions, CreateBoardItemInput } from "@/lib/boards";
import type { InvoiceDetail, Invoice as StaffInvoice } from "@/lib/invoicing";
import type { Meeting as StaffMeeting, Slot } from "@/lib/meetings";
import type { Conversation, ConversationDetail, Message } from "@/lib/messaging-client";
import type { ProposalDetail, Proposal as StaffProposal } from "@/lib/proposals";

export type PortalInvoice = StaffInvoice;
export type PortalInvoiceDetail = InvoiceDetail;
export type PortalMeeting = StaffMeeting;
export type PortalSlot = Slot;
export type PortalProposal = StaffProposal;
export type PortalProposalDetail = ProposalDetail;
export type { Conversation, ConversationDetail, Message };

export type PortalAgency = Schemas["PortalAgencyRead"];
export type PortalClientRef = Schemas["PortalClientRead"];
export type PortalContact = Schemas["PortalContactRead"];
export type PortalContext = Schemas["PortalContextRead"];
export type PortalProgress = Schemas["PortalProgress"];
export type PortalProject = Schemas["PortalProjectRead"];
export type PortalBoardColumn = Schemas["PortalBoardColumn"];
export type PortalProjectDetail = Schemas["PortalProjectDetailRead"];
export type PortalTask = Schemas["PortalTaskRead"];
export type PortalTaskList = Schemas["PortalTaskListRead"];

export type PortalInvitationPreview = Schemas["ClientInvitationPreview"];
export type PortalMeetingSettings = Schemas["PortalMeetingSettingsRead"];
export type PortalMeetingBookingInput = Schemas["PortalMeetingCreate"];

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function rethrow(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error) && error.response) {
    throw new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  throw error;
}

/**
 * getPortalContext
 *
 * The signed-in user's portal membership (agency + client + contact), or
 * `null` when they aren't a client contact at all — the routing layer uses
 * that to decide between `/portal` and `/dashboard`.
 */
export async function getPortalContext(): Promise<PortalContext | null> {
  let headers: { Authorization: string };
  try {
    headers = await authHeader();
  } catch {
    return null;
  }
  try {
    const { data } = await api.get<PortalContext>("/portal/context", { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && [401, 403].includes(error.response.status)) {
      return null;
    }
    rethrow(error, "Unable to load your portal");
  }
}

export async function getPortalProjects(): Promise<PortalProject[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalProject[]>("/portal/projects", { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load projects");
  }
}

/**
 * getPortalProject
 *
 * The project's layout and each of its Overview/Board/Canvas pages all need
 * this, so it's wrapped in React's `cache()` — one request's worth of calls
 * with the same `projectId` share a single fetch, the same dedup
 * `getAgencyProject` uses on the staff side (lib/projects.ts).
 */
export const getPortalProject = cache(async (projectId: string): Promise<PortalProjectDetail> => {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalProjectDetail>(`/portal/projects/${projectId}`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load this project");
  }
});

export async function getPortalTaskBoard(projectId: string): Promise<PortalTaskList[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalTaskList[]>(`/portal/projects/${projectId}/board`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the board");
  }
}

export async function getPortalInvoices(): Promise<PortalInvoice[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalInvoice[]>("/portal/invoices", { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load invoices");
  }
}

export async function getPortalInvoice(invoiceId: string): Promise<PortalInvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalInvoiceDetail>(`/portal/invoices/${invoiceId}`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load this invoice");
  }
}

/**
 * startPortalInvoiceCheckout
 *
 * Starts a real Stripe Checkout Session for the full outstanding balance via
 * `POST /portal/invoices/{invoiceId}/pay`, on the agency's own connected
 * Stripe account. Returns the URL to redirect the browser to. Rejects (409)
 * if the agency hasn't finished Stripe Connect onboarding yet.
 */
export async function startPortalInvoiceCheckout(invoiceId: string): Promise<string> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ checkout_url: string }>(`/portal/invoices/${invoiceId}/pay`, undefined, {
      headers,
    });
    return data.checkout_url;
  } catch (error) {
    rethrow(error, "Unable to start checkout");
  }
}

/**
 * getPortalMeetingSettings
 *
 * The agency's timezone, slot length, and whether self-service booking is
 * currently on, via `GET /portal/meeting-settings` — trimmed to what the
 * booking flow needs (no admin-only fields).
 */
export async function getPortalProposals(): Promise<PortalProposal[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalProposal[]>("/portal/proposals", { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load proposals");
  }
}

export async function getPortalProposal(proposalId: string): Promise<PortalProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalProposalDetail>(`/portal/proposals/${proposalId}`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load this proposal");
  }
}

/**
 * signPortalProposal
 *
 * Signs with the signed-in contact's own name/email via
 * `POST /portal/proposals/{proposalId}/sign` — unlike the public share-link
 * flow, the portal already knows who this is, so there's nothing to type.
 */
export async function signPortalProposal(proposalId: string): Promise<PortalProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<PortalProposalDetail>(`/portal/proposals/${proposalId}/sign`, undefined, {
      headers,
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to sign this proposal");
  }
}

export async function declinePortalProposal(proposalId: string, reason: string | null): Promise<PortalProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<PortalProposalDetail>(
      `/portal/proposals/${proposalId}/decline`,
      { reason },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to decline this proposal");
  }
}

export async function getPortalMeetingSettings(): Promise<PortalMeetingSettings> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalMeetingSettings>("/portal/meeting-settings", { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load meeting availability");
  }
}

/**
 * getPortalAvailableSlots
 *
 * Open booking slots via `GET /portal/meetings/slots` — the exact same
 * computation the staff-side preview uses, scoped to this client's agency.
 * Empty when the agency has turned self-service booking off.
 */
export async function getPortalAvailableSlots(fromDate: string, toDate?: string): Promise<PortalSlot[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalSlot[]>("/portal/meetings/slots", {
      headers,
      params: { from_date: fromDate, to_date: toDate },
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load available times");
  }
}

export async function getPortalMeetings(): Promise<PortalMeeting[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PortalMeeting[]>("/portal/meetings", { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load meetings");
  }
}

/**
 * bookPortalMeeting
 *
 * Books an open slot via `POST /portal/meetings` — instant, no staff
 * approval step. Rejects (409) if the slot was taken by someone else
 * between the client fetching slots and submitting this, or (403) if
 * self-service booking has since been turned off.
 */
export async function bookPortalMeeting(input: PortalMeetingBookingInput): Promise<PortalMeeting> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<PortalMeeting>("/portal/meetings", input, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to book that time");
  }
}

/**
 * cancelPortalMeeting
 *
 * Cancels one of this client's own meetings via
 * `POST /portal/meetings/{meetingId}/cancel`.
 */
export async function cancelPortalMeeting(meetingId: string): Promise<PortalMeeting> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<PortalMeeting>(`/portal/meetings/${meetingId}/cancel`, undefined, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to cancel this meeting");
  }
}

export async function getPortalConversations(): Promise<Conversation[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Conversation[]>("/portal/conversations", { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load messages");
  }
}

export async function getPortalConversation(conversationId: string): Promise<ConversationDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ConversationDetail>(`/portal/conversations/${conversationId}`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load this conversation");
  }
}

export async function getPortalMessages(
  conversationId: string,
  options: { limit?: number; before?: string } = {},
): Promise<Message[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Message[]>(`/portal/conversations/${conversationId}/messages`, {
      headers,
      params: { limit: options.limit ?? 50, before: options.before },
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load messages");
  }
}

export async function sendPortalMessage(conversationId: string, body: string): Promise<Message> {
  const headers = await authHeader();
  const form = new FormData();
  form.append("body", body);
  try {
    const { data } = await api.post<Message>(`/portal/conversations/${conversationId}/messages`, form, {
      headers: { ...headers, "Content-Type": undefined },
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to send your message");
  }
}

export async function markPortalConversationRead(conversationId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.post(`/portal/conversations/${conversationId}/read`, undefined, { headers });
  } catch (error) {
    rethrow(error, "Unable to update read state");
  }
}

// ---- Collaboration canvas ----
// The same board the agency team edits — full collaboration. Mirrors
// lib/boards.ts against the portal-scoped endpoints.

function canvasBase(projectId: string): string {
  return `/portal/projects/${projectId}/canvas`;
}

export async function getPortalBoard(projectId: string): Promise<Board> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Board>(canvasBase(projectId), { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the canvas");
  }
}

export async function createPortalBoardItem(projectId: string, input: CreateBoardItemInput): Promise<BoardItem> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BoardItem>(`${canvasBase(projectId)}/items`, input, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to add the card");
  }
}

export async function updatePortalBoardItem(
  projectId: string,
  itemId: string,
  patch: BoardItemPatch,
): Promise<BoardItem> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<BoardItem>(`${canvasBase(projectId)}/items/${itemId}`, patch, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to update the card");
  }
}

export async function deletePortalBoardItem(projectId: string, itemId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`${canvasBase(projectId)}/items/${itemId}`, { headers });
  } catch (error) {
    rethrow(error, "Unable to delete the card");
  }
}

export async function uploadPortalBoardImage(
  projectId: string,
  file: File,
  placement: { x: number; y: number; width?: number; height?: number },
): Promise<BoardItem> {
  const headers = await authHeader();
  const form = new FormData();
  form.append("file", file);
  try {
    const { data } = await api.post<BoardItem>(`${canvasBase(projectId)}/images`, form, {
      headers: { ...headers, "Content-Type": undefined },
      params: placement,
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to upload the image");
  }
}

export async function togglePortalBoardReaction(
  projectId: string,
  itemId: string,
  kind: string,
): Promise<BoardReactions> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BoardReactions>(
      `${canvasBase(projectId)}/items/${itemId}/reactions`,
      { kind },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to react");
  }
}

export async function getPortalBoardComments(projectId: string, itemId: string): Promise<BoardComment[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<BoardComment[]>(`${canvasBase(projectId)}/items/${itemId}/comments`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load comments");
  }
}

export async function addPortalBoardComment(
  projectId: string,
  itemId: string,
  body: string,
): Promise<BoardComment> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BoardComment>(
      `${canvasBase(projectId)}/items/${itemId}/comments`,
      { body },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to add the comment");
  }
}

export async function deletePortalBoardComment(
  projectId: string,
  itemId: string,
  commentId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`${canvasBase(projectId)}/items/${itemId}/comments/${commentId}`, { headers });
  } catch (error) {
    rethrow(error, "Unable to delete the comment");
  }
}

export async function decidePortalBoardApproval(
  projectId: string,
  itemId: string,
  decision: "approved" | "changes_requested",
  note?: string,
): Promise<BoardItem> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BoardItem>(
      `${canvasBase(projectId)}/items/${itemId}/approval/decide`,
      { status: decision, note: note || null },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to record your decision");
  }
}

// ---- Invitation (onboarding) ----

export async function previewPortalInvitation(token: string): Promise<PortalInvitationPreview> {
  try {
    const { data } = await api.get<PortalInvitationPreview>("/portal/invitations/preview", {
      params: { token },
    });
    return data;
  } catch (error) {
    rethrow(error, "This invitation link is invalid or has expired");
  }
}

export async function acceptPortalInvitation(token: string): Promise<PortalContext> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<PortalContext>(
      "/portal/invitations/accept",
      { token },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to accept this invitation");
  }
}

/**
 * resolveHome
 *
 * Where a signed-in user belongs: staff (an agency member) → `/dashboard`;
 * a client contact → `/portal`; neither → onboarding. Used by the login
 * redirect and the two layout guards so the split lives in one place.
 */
export async function resolveHome(): Promise<"/dashboard" | "/portal" | "/onboarding/one"> {
  const agencies = await getMyAgencies().catch(() => []);
  if (agencies.length > 0) return "/dashboard";
  const portal = await getPortalContext();
  if (portal) return "/portal";
  return "/onboarding/one";
}
