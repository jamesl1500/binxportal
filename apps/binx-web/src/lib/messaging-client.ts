/**
 * messaging-client.ts
 *
 * The `lib/messaging.ts` exports that are safe to import from a Client
 * Component — plain types and functions with no dependency on `lib/auth.ts`
 * (which pulls in `next/headers`, server-only). Same split rationale as
 * `lib/projects-client.ts`.
 *
 * @module apps/binx-web/src/lib/messaging-client.ts
 * @author Binx.io
 */

import type { Schemas } from "@/lib/api-types";

/** Keep in sync with binx-api's `message_upload_max_bytes` (core/config.py). */
export const MESSAGE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export type ConversationKind = "direct" | "group";
export type MessageType = "user" | "system";

export type MessageAttachment = Schemas["MessageAttachmentRead"];

// The API types `sender_kind` / `message_type` / `kind` as plain strings; the
// narrower unions are kept so the UI's exhaustive checks still hold.
export type Message = Omit<Schemas["MessageRead"], "sender_kind" | "message_type"> & {
  sender_kind: "user" | "client";
  message_type: MessageType;
};

export type ConversationParticipant = Schemas["ParticipantRead"];

export type Conversation = Omit<Schemas["ConversationRead"], "kind"> & { kind: ConversationKind };

export type ConversationDetail = Omit<Schemas["ConversationDetailRead"], "kind"> & { kind: ConversationKind };

/** A realtime event pushed over the messaging websocket (see binx-api's realtime.py). */
export interface MessagingEvent {
  type:
    | "message.created"
    | "message.updated"
    | "message.deleted"
    | "conversation.created"
    | "conversation.updated"
    | "participant.added"
    | "participant.removed"
    | "conversation.read"
    | "typing"
    | "pong";
  conversation_id?: string;
  data?: Record<string, unknown>;
}

/**
 * getMessageAttachmentDownloadUrl
 *
 * Points at this app's own proxy route (which attaches the session's bearer
 * token server-side), never straight at binx-api — the browser has no token
 * to send there. Same reasoning as `getTaskFileDownloadUrl`.
 */
export function getMessageAttachmentDownloadUrl(
  agencyId: string,
  conversationId: string,
  messageId: string,
  attachmentId: string,
): string {
  return `/api/messages/${agencyId}/${conversationId}/messages/${messageId}/attachments/${attachmentId}`;
}
