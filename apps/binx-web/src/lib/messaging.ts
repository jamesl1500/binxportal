/**
 * messaging.ts
 *
 * Server-only helpers for authenticated calls to binx-api's
 * `/agencies/{agencyId}/conversations/*` endpoints — the inbox, a
 * conversation's participants and messages, and message attachments. Like
 * `lib/projects.ts`, these attach the existing access token rather than
 * establishing a new session.
 *
 * @module apps/binx-web/src/lib/messaging.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import {
  getMessageAttachmentDownloadUrl,
  MESSAGE_UPLOAD_MAX_BYTES,
  type Conversation,
  type ConversationDetail,
  type ConversationKind,
  type Message,
} from "@/lib/messaging-client";

// Re-exported so server-side callers import everything from one module.
export { getMessageAttachmentDownloadUrl, MESSAGE_UPLOAD_MAX_BYTES };
export type { Conversation, ConversationDetail, ConversationKind, Message };
export type {
  ConversationParticipant,
  MessageAttachment,
  MessagingEvent,
  MessageType,
} from "@/lib/messaging-client";

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  return error;
}

export interface CreateConversationInput {
  kind: ConversationKind;
  title?: string | null;
  participantUserIds: string[];
  clientId?: string | null;
  projectId?: string | null;
  initialMessage?: string | null;
}

export interface ConversationFilter {
  clientId?: string;
  projectId?: string;
  q?: string;
}

/**
 * getConversations
 *
 * Lists the caller's conversations in an agency, newest activity first, via
 * `GET /agencies/{agencyId}/conversations`. Optionally scoped to a client or
 * project context, or filtered by a free-text query.
 *
 * @function getConversations
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getConversations(agencyId: string, filter: ConversationFilter = {}): Promise<Conversation[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<Conversation[]>(`/agencies/${agencyId}/conversations`, {
      headers,
      params: {
        client_id: filter.clientId,
        project_id: filter.projectId,
        q: filter.q || undefined,
      },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load conversations");
  }
}

/**
 * getUnreadMessageCount
 *
 * Total unread messages across the caller's conversations in an agency, via
 * `GET /agencies/{agencyId}/conversations/unread-summary` — what the top-nav
 * badge shows.
 *
 * @function getUnreadMessageCount
 */
export async function getUnreadMessageCount(agencyId: string): Promise<number> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<{ unread_total: number }>(
      `/agencies/${agencyId}/conversations/unread-summary`,
      { headers },
    );
    return data.unread_total;
  } catch {
    // The nav badge is cosmetic — never let it break rendering the app shell.
    return 0;
  }
}

/**
 * getConversation
 *
 * Fetches one conversation's detail (participants, context) via
 * `GET /agencies/{agencyId}/conversations/{conversationId}`.
 *
 * @function getConversation
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a participant (404).
 */
export async function getConversation(agencyId: string, conversationId: string): Promise<ConversationDetail> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<ConversationDetail>(
      `/agencies/${agencyId}/conversations/${conversationId}`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load conversation");
  }
}

/**
 * createConversation
 *
 * Starts a conversation via `POST /agencies/{agencyId}/conversations`. A
 * `direct` conversation is idempotent — if one already exists between the two
 * people, binx-api returns it rather than creating a duplicate.
 *
 * @function createConversation
 * @throws {AuthApiError} - Thrown if not authenticated, or a participant isn't an agency member.
 */
export async function createConversation(
  agencyId: string,
  input: CreateConversationInput,
): Promise<ConversationDetail> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<ConversationDetail>(
      `/agencies/${agencyId}/conversations`,
      {
        kind: input.kind,
        title: input.title ?? null,
        participant_user_ids: input.participantUserIds,
        client_id: input.clientId ?? null,
        project_id: input.projectId ?? null,
        initial_message: input.initialMessage ?? null,
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to start conversation");
  }
}

/**
 * updateConversation
 *
 * Renames a group and/or sets its client/project context via
 * `PATCH /agencies/{agencyId}/conversations/{conversationId}`.
 *
 * @function updateConversation
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a participant.
 */
export async function updateConversation(
  agencyId: string,
  conversationId: string,
  input: { title?: string | null; clientId?: string | null; projectId?: string | null },
): Promise<ConversationDetail> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<ConversationDetail>(
      `/agencies/${agencyId}/conversations/${conversationId}`,
      { title: input.title ?? null, client_id: input.clientId ?? null, project_id: input.projectId ?? null },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update conversation");
  }
}

/**
 * addConversationParticipants
 *
 * Adds agency members to a group via
 * `POST /agencies/{agencyId}/conversations/{conversationId}/participants`.
 *
 * @function addConversationParticipants
 * @throws {AuthApiError} - Thrown if not authenticated, it's a direct message, or someone isn't a member.
 */
export async function addConversationParticipants(
  agencyId: string,
  conversationId: string,
  userIds: string[],
): Promise<ConversationDetail> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<ConversationDetail>(
      `/agencies/${agencyId}/conversations/${conversationId}/participants`,
      { user_ids: userIds },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to add people");
  }
}

/**
 * removeConversationParticipant
 *
 * Removes someone from a group (or leaves it, if it's you) via
 * `DELETE /agencies/{agencyId}/conversations/{conversationId}/participants/{userId}`.
 *
 * @function removeConversationParticipant
 * @throws {AuthApiError} - Thrown if not authenticated, or it's a direct message.
 */
export async function removeConversationParticipant(
  agencyId: string,
  conversationId: string,
  userId: string,
): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/conversations/${conversationId}/participants/${userId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to remove this person");
  }
}

/**
 * markConversationRead
 *
 * Marks the caller caught up on a conversation via
 * `POST /agencies/{agencyId}/conversations/{conversationId}/read`.
 *
 * @function markConversationRead
 */
export async function markConversationRead(agencyId: string, conversationId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.post(`/agencies/${agencyId}/conversations/${conversationId}/read`, null, { headers });
  } catch (error) {
    throw apiError(error, "Unable to update read state");
  }
}

/**
 * setConversationMuted
 *
 * Mutes/unmutes a conversation for the caller via
 * `PATCH /agencies/{agencyId}/conversations/{conversationId}/settings`.
 *
 * @function setConversationMuted
 */
export async function setConversationMuted(
  agencyId: string,
  conversationId: string,
  isMuted: boolean,
): Promise<ConversationDetail> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<ConversationDetail>(
      `/agencies/${agencyId}/conversations/${conversationId}/settings`,
      { is_muted: isMuted },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update settings");
  }
}

/**
 * getMessages
 *
 * A page of a conversation's message history, oldest-first for display, via
 * `GET /agencies/{agencyId}/conversations/{conversationId}/messages`. Pass
 * `before` (an ISO timestamp — the oldest message you already have) to page
 * backwards.
 *
 * @function getMessages
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a participant.
 */
export async function getMessages(
  agencyId: string,
  conversationId: string,
  options: { limit?: number; before?: string } = {},
): Promise<Message[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<Message[]>(
      `/agencies/${agencyId}/conversations/${conversationId}/messages`,
      { headers, params: { limit: options.limit, before: options.before } },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load messages");
  }
}

/**
 * sendMessage
 *
 * Posts a message via
 * `POST /agencies/{agencyId}/conversations/{conversationId}/messages`
 * (multipart/form-data — the message can carry any number of files, each
 * capped at binx-api's per-file size limit). binx-api pushes the new message
 * to every participant over the websocket.
 *
 * @function sendMessage
 * @throws {AuthApiError} - Thrown if not authenticated, the message is empty, or a file is too large.
 */
export async function sendMessage(
  agencyId: string,
  conversationId: string,
  body: string,
  files: File[] = [],
): Promise<Message> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("body", body);
  for (const file of files) {
    formData.append("files", file);
  }

  try {
    // See lib/projects.ts's uploadProjectFile: the axios instance defaults to
    // `Content-Type: application/json`, which a per-request headers object
    // merges on top of — deleting it lets axios detect the FormData body and
    // set its own multipart boundary.
    const { data } = await api.post<Message>(
      `/agencies/${agencyId}/conversations/${conversationId}/messages`,
      formData,
      { headers: { ...headers, "Content-Type": undefined } },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to send message");
  }
}

/**
 * editMessage
 *
 * Edits the caller's own message via
 * `PATCH /agencies/{agencyId}/conversations/{conversationId}/messages/{messageId}`.
 *
 * @function editMessage
 * @throws {AuthApiError} - Thrown if not authenticated, or it isn't the caller's message.
 */
export async function editMessage(
  agencyId: string,
  conversationId: string,
  messageId: string,
  body: string,
): Promise<Message> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<Message>(
      `/agencies/${agencyId}/conversations/${conversationId}/messages/${messageId}`,
      { body },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to edit message");
  }
}

/**
 * deleteMessage
 *
 * Soft-deletes a message via
 * `DELETE /agencies/{agencyId}/conversations/{conversationId}/messages/{messageId}`.
 * binx-api allows this for the author, or an agency owner/admin (moderation).
 *
 * @function deleteMessage
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller may not delete this message.
 */
export async function deleteMessage(agencyId: string, conversationId: string, messageId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/conversations/${conversationId}/messages/${messageId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete message");
  }
}

/**
 * getWsTicket
 *
 * Trades the session for a short-lived websocket ticket via
 * `POST /auth/ws-ticket`. Called by the internal `/api/messages/ws-ticket`
 * route, never straight from the browser.
 *
 * @function getWsTicket
 * @throws {AuthApiError} - Thrown if not authenticated.
 */
export async function getWsTicket(): Promise<string> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<{ ticket: string }>("/auth/ws-ticket", null, { headers });
    return data.ticket;
  } catch (error) {
    throw apiError(error, "Unable to open a live connection");
  }
}
