/**
 * actions.ts - Messaging
 *
 * Server actions for the messaging inbox — all plain authenticated mutations
 * (no session cookies change), so they call binx-api directly via
 * `lib/messaging.ts` rather than an internal `/api/*` proxy (attachment
 * downloads are the one exception; see app/api/messages/.../route.ts). Every
 * action returns `{ error? , ...data }`, the same shape the project actions use.
 *
 * @module apps/binx-web/src/app/(app)/messages/actions.ts
 * @author Binx.io
 */
"use server";

import { draftMessageReply } from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";
import {
  addConversationParticipants,
  type Conversation,
  type ConversationDetail,
  createConversation,
  type CreateConversationInput,
  deleteMessage,
  editMessage,
  getConversation,
  getConversations,
  getMessages,
  markConversationRead,
  type Message,
  removeConversationParticipant,
  sendMessage,
  setConversationMuted,
  updateConversation,
} from "@/lib/messaging";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface ConversationsActionResult {
  error?: string;
  conversations?: Conversation[];
}

export async function listConversationsAction(
  agencyId: string,
  filter: { clientId?: string; projectId?: string; q?: string } = {},
): Promise<ConversationsActionResult> {
  try {
    return { conversations: await getConversations(agencyId, filter) };
  } catch (error) {
    return errorResult(error, "Unable to load conversations");
  }
}

export interface ConversationActionResult {
  error?: string;
  conversation?: ConversationDetail;
}

export async function getConversationAction(
  agencyId: string,
  conversationId: string,
): Promise<ConversationActionResult> {
  try {
    return { conversation: await getConversation(agencyId, conversationId) };
  } catch (error) {
    return errorResult(error, "Unable to load conversation");
  }
}

export async function createConversationAction(
  agencyId: string,
  input: CreateConversationInput,
): Promise<ConversationActionResult> {
  try {
    return { conversation: await createConversation(agencyId, input) };
  } catch (error) {
    return errorResult(error, "Unable to start conversation");
  }
}

export async function renameConversationAction(
  agencyId: string,
  conversationId: string,
  title: string | null,
): Promise<ConversationActionResult> {
  try {
    return { conversation: await updateConversation(agencyId, conversationId, { title }) };
  } catch (error) {
    return errorResult(error, "Unable to rename conversation");
  }
}

export async function addParticipantsAction(
  agencyId: string,
  conversationId: string,
  userIds: string[],
): Promise<ConversationActionResult> {
  try {
    return { conversation: await addConversationParticipants(agencyId, conversationId, userIds) };
  } catch (error) {
    return errorResult(error, "Unable to add people");
  }
}

export async function removeParticipantAction(
  agencyId: string,
  conversationId: string,
  userId: string,
): Promise<{ error?: string }> {
  try {
    await removeConversationParticipant(agencyId, conversationId, userId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to remove this person");
  }
}

export async function toggleMuteAction(
  agencyId: string,
  conversationId: string,
  isMuted: boolean,
): Promise<ConversationActionResult> {
  try {
    return { conversation: await setConversationMuted(agencyId, conversationId, isMuted) };
  } catch (error) {
    return errorResult(error, "Unable to update settings");
  }
}

export async function markReadAction(agencyId: string, conversationId: string): Promise<{ error?: string }> {
  try {
    await markConversationRead(agencyId, conversationId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to update read state");
  }
}

export interface MessagesActionResult {
  error?: string;
  messages?: Message[];
}

export async function loadMessagesAction(
  agencyId: string,
  conversationId: string,
  options: { limit?: number; before?: string } = {},
): Promise<MessagesActionResult> {
  try {
    return { messages: await getMessages(agencyId, conversationId, options) };
  } catch (error) {
    return errorResult(error, "Unable to load messages");
  }
}

export interface MessageActionResult {
  error?: string;
  message?: Message;
}

export async function sendMessageAction(
  agencyId: string,
  conversationId: string,
  formData: FormData,
): Promise<MessageActionResult> {
  const body = String(formData.get("body") ?? "");
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  try {
    return { message: await sendMessage(agencyId, conversationId, body, files) };
  } catch (error) {
    return errorResult(error, "Unable to send message");
  }
}

export async function editMessageAction(
  agencyId: string,
  conversationId: string,
  messageId: string,
  body: string,
): Promise<MessageActionResult> {
  try {
    return { message: await editMessage(agencyId, conversationId, messageId, body) };
  } catch (error) {
    return errorResult(error, "Unable to edit message");
  }
}

export async function deleteMessageAction(
  agencyId: string,
  conversationId: string,
  messageId: string,
): Promise<{ error?: string }> {
  try {
    await deleteMessage(agencyId, conversationId, messageId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete message");
  }
}

export interface DraftMessageReplyActionResult {
  error?: string;
  draft?: string;
}

export async function draftMessageReplyAction(
  agencyId: string,
  conversationId: string,
): Promise<DraftMessageReplyActionResult> {
  try {
    return { draft: await draftMessageReply(agencyId, conversationId) };
  } catch (error) {
    return errorResult(error, "Unable to draft a reply");
  }
}
