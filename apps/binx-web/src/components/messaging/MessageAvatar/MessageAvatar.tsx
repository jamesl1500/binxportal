/**
 * MessageAvatar.tsx
 *
 * A round avatar for someone in a conversation: their uploaded photo when
 * the agency member has one (proxied through the agency-scoped member image
 * route), otherwise — or if the image fails to load — their initials. Senders
 * who aren't agency members (client contacts) always get initials.
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

interface MessageAvatarProps {
  agencyId: string;
  name: string;
  member?: AgencyMember | null;
  size?: "sm" | "md";
  className?: string;
}

const MessageAvatar = ({ agencyId, name, member, size = "md", className }: MessageAvatarProps) => {
  const [failed, setFailed] = useState(false);
  const classes = [styles.avatar, className].filter(Boolean).join(" ");

  if (member?.has_avatar && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={classes}
        data-size={size}
        src={memberImageUrl(agencyId, member.id, "avatar", member.avatar_version)}
        alt=""
        aria-hidden="true"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={classes} data-size={size} aria-hidden="true">
      {initials(name)}
    </span>
  );
};

export default MessageAvatar;
