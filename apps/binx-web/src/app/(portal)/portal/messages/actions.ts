/**
 * actions.ts - Portal Messages
 *
 * Thin server actions over the `/portal/conversations/*` endpoints. The
 * client portal reuses binx-api's conversation system — a client contact is
 * a real participant on threads linked to their client — so this is just
 * send + mark-read + a refetch for the poll.
 *
 * @module apps/binx-web/src/app/(portal)/portal/messages/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  getPortalMessages,
  markPortalConversationRead,
  sendPortalMessage,
  type Message,
} from "@/lib/portal";

export interface SendPortalMessageResult {
  error?: string;
  message?: Message;
}

export async function sendPortalMessageAction(
  conversationId: string,
  body: string,
): Promise<SendPortalMessageResult> {
  try {
    const message = await sendPortalMessage(conversationId, body);
    return { message };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to send your message" };
  }
}

export interface PortalThreadResult {
  error?: string;
  messages?: Message[];
}

export async function getPortalThreadAction(conversationId: string): Promise<PortalThreadResult> {
  try {
    const messages = await getPortalMessages(conversationId);
    return { messages };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to load messages" };
  }
}

export async function markPortalReadAction(conversationId: string): Promise<void> {
  try {
    await markPortalConversationRead(conversationId);
  } catch {
    // Best-effort — a missed read receipt isn't worth surfacing.
  }
}
