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
 * @author Binx Portal
 */
"use server";

import {
  type AiAction,
  type AiConversation,
  type AiMessage,
  type AiPreferences,
  createAiConversation,
  deleteAiConversation,
  getAiConversationMessages,
  getAiPreferences,
  listAiConversations,
  resolveAiAction,
  sendAiMessage,
  updateAiPreferences,
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

export async function listAiConversationsAction(
  agencyId: string,
): Promise<AiConversationsActionResult> {
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

export async function createAiConversationAction(
  agencyId: string,
): Promise<AiConversationActionResult> {
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
    return {
      messages: await getAiConversationMessages(agencyId, conversationId),
    };
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

export async function deleteAiConversationAction(
  agencyId: string,
  conversationId: string,
): Promise<{ error?: string }> {
  try {
    await deleteAiConversation(agencyId, conversationId);
  } catch (error) {
    return errorResult(error, "Unable to delete this conversation");
  }
  return {};
}

export interface AiPreferencesActionResult {
  error?: string;
  preferences?: AiPreferences;
}

export async function getAiPreferencesAction(
  agencyId: string,
): Promise<AiPreferencesActionResult> {
  try {
    return { preferences: await getAiPreferences(agencyId) };
  } catch (error) {
    return errorResult(error, "Unable to load your AI preferences");
  }
}

export async function updateAiPreferencesAction(
  agencyId: string,
  preferences: AiPreferences,
): Promise<AiPreferencesActionResult> {
  try {
    return { preferences: await updateAiPreferences(agencyId, preferences) };
  } catch (error) {
    return errorResult(error, "Unable to save your AI preferences");
  }
}

export interface AiActionResult {
  error?: string;
  action?: AiAction;
}

export async function resolveAiActionAction(
  agencyId: string,
  conversationId: string,
  actionId: string,
  decision: "approve" | "decline",
): Promise<AiActionResult> {
  try {
    return {
      action: await resolveAiAction(
        agencyId,
        conversationId,
        actionId,
        decision,
      ),
    };
  } catch (error) {
    return errorResult(
      error,
      decision === "approve"
        ? "Unable to make that change"
        : "Unable to decline that change",
    );
  }
}
