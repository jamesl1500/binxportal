/**
 * MessageAttachmentView.tsx
 *
 * One attachment on a message: an inline thumbnail for images, a labelled
 * file chip otherwise. Both link to this app's proxy download route (the
 * browser has no bearer token for binx-api) — see
 * `getMessageAttachmentDownloadUrl`.
 *
 * @module apps/binx-web/src/components/messaging/MessageAttachmentView/MessageAttachmentView.tsx
 * @author Binx.io
 */
"use client";

import { Download, FileText } from "lucide-react";

import type { MessageAttachment } from "@/lib/messaging-client";
import { getMessageAttachmentDownloadUrl } from "@/lib/messaging-client";

import styles from "./MessageAttachmentView.module.scss";

interface MessageAttachmentViewProps {
  agencyId: string;
  conversationId: string;
  messageId: string;
  attachment: MessageAttachment;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MessageAttachmentView = ({
  agencyId,
  conversationId,
  messageId,
  attachment,
}: MessageAttachmentViewProps) => {
  const href = getMessageAttachmentDownloadUrl(agencyId, conversationId, messageId, attachment.id);
  const isImage = attachment.mime_type.startsWith("image/");

  if (isImage) {
    return (
      <a className={styles.image} href={href} target="_blank" rel="noreferrer" title={attachment.file_name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={attachment.file_name} loading="lazy" />
      </a>
    );
  }

  return (
    <a className={styles.file} href={href} target="_blank" rel="noreferrer">
      <FileText className={styles.fileIcon} aria-hidden="true" />
      <span className={styles.fileText}>
        <span className={styles.fileName}>{attachment.file_name}</span>
        <span className={styles.fileSize}>{formatSize(attachment.size)}</span>
      </span>
      <Download className={styles.downloadIcon} aria-hidden="true" />
    </a>
  );
};

export default MessageAttachmentView;
