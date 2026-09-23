/**
 * MessageAvatar.tsx
 *
 * A round avatar for someone in a conversation: their uploaded photo when
 * there's one to show, otherwise — or if the image fails to load — their
 * initials. Callers resolve `src` for their side of the app: staff views use
 * the agency-scoped member image route (`memberAvatarSrc`), the client portal
 * uses the conversation-scoped participant route.
 *
 * @module apps/binx-web/src/components/messaging/MessageAvatar/MessageAvatar.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";

import type { AgencyMember } from "@/lib/agencies";
import { memberImageUrl } from "@/lib/users-client";

import styles from "./MessageAvatar.module.scss";

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** The photo URL for an agency member, or null when they haven't set one (or aren't a member). */
export function memberAvatarSrc(agencyId: string, member: AgencyMember | null | undefined): string | null {
  return member?.has_avatar ? memberImageUrl(agencyId, member.id, "avatar", member.avatar_version) : null;
}

interface MessageAvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md";
  className?: string;
}

const MessageAvatar = ({ name, src, size = "md", className }: MessageAvatarProps) => {
  // Remember which URL failed rather than a flag, so a new src gets a fresh try.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const classes = [styles.avatar, className].filter(Boolean).join(" ");

  if (src && src !== failedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={classes} data-size={size} src={src} alt="" aria-hidden="true" onError={() => setFailedSrc(src)} />
    );
  }

  return (
    <span className={classes} data-size={size} aria-hidden="true">
      {initials(name)}
    </span>
  );
};

export default MessageAvatar;
