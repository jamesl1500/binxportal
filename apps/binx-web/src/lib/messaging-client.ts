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

/** Keep in sync with binx-api's `message_upload_max_bytes` (core/config.py). */
export const MESSAGE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export type ConversationKind = "direct" | "group";
export type MessageType = "user" | "system";

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  /** "user" today; "client" reserved for a future client portal — see binx-api's SENDER_CLIENT. */
  sender_kind: "user" | "client";
  sender_name: string;
  message_type: MessageType;
  body: string;
  attachments: MessageAttachment[];
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ConversationParticipant {
  user_id: string;
  full_name: string;
  /** The @handle used to mention this person in a message. */
  user_name: string;
  email: string;
  job_title: string | null;
  is_muted: boolean;
  last_read_at: string | null;
  left_at: string | null;
}

export interface Conversation {
  id: string;
  agency_id: string;
  kind: ConversationKind;
  /** Resolved for display — the other person's name for a direct conversation. */
  title: string;
  client_id: string | null;
  client_name: string | null;
  project_id: string | null;
  project_name: string | null;
  participant_names: string[];
  participant_count: number;
  is_muted: boolean;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  participants: ConversationParticipant[];
}

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
