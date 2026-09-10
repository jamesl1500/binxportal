/**
 * actions.ts - AI Assistant
 *
 * Server actions behind the global "Ask AI" modal (opened from the header
 * button or ⌘K/Ctrl+K — see components/ai/AiAssistantLauncher). There's no
 * dedicated /ai page — this file is the resource-based actions home for the
 * conversation endpoints, the same way notifications/actions.ts backs the
 * header's bell dropdown without a page of its own.
 *
 * @module apps/binx-web/src/app/(app)/ai/actions.ts
 * @author Binx.io
 */
"use server";

import {
  type AiConversation,
  type AiMessage,
  createAiConversation,
  deleteAiConversation,
  getAiConversationMessages,
  listAiConversations,
  sendAiMessage,
} from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface AiConversationsActionResult {
  error?: string;
  conversations?: AiConversation[];
}

export async function listAiConversationsAction(agencyId: string): Promise<AiConversationsActionResult> {
  try {
    return { conversations: await listAiConversations(agencyId) };
  } catch (error) {
    return errorResult(error, "Unable to load conversations");
  }
}

export interface AiConversationActionResult {
  error?: string;
  conversation?: AiConversation;
}

export async function createAiConversationAction(agencyId: string): Promise<AiConversationActionResult> {
  try {
    return { conversation: await createAiConversation(agencyId) };
  } catch (error) {
    return errorResult(error, "Unable to start a new conversation");
  }
}

export interface AiMessagesActionResult {
  error?: string;
  messages?: AiMessage[];
}

export async function getAiConversationMessagesAction(
  agencyId: string,
  conversationId: string,
): Promise<AiMessagesActionResult> {
  try {
    return { messages: await getAiConversationMessages(agencyId, conversationId) };
  } catch (error) {
    return errorResult(error, "Unable to load this conversation");
  }
}

export interface AiSendMessageActionResult {
  error?: string;
  message?: AiMessage;
}

export async function sendAiMessageAction(
  agencyId: string,
  conversationId: string,
  message: string,
): Promise<AiSendMessageActionResult> {
  try {
    return { message: await sendAiMessage(agencyId, conversationId, message) };
  } catch (error) {
    return errorResult(error, "Unable to send that message");
  }
}

export async function deleteAiConversationAction(agencyId: string, conversationId: string): Promise<{ error?: string }> {
  try {
    await deleteAiConversation(agencyId, conversationId);
  } catch (error) {
    return errorResult(error, "Unable to delete this conversation");
  }
  return {};
}
