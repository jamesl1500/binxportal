/**
 * UserAvatar.tsx
 *
 * The signed-in user's avatar for the AppHeader account trigger: their
 * uploaded photo (via the GET /api/users/me/avatar proxy), or — when they
 * haven't set one, so the proxy 404s, or the image fails to load for any
 * other reason — the initial of their first name. The <img> requesting the
 * URL itself is what detects the 404 (its onError fires), so there's no
 * separate fetch. Same pattern as messaging/MessageAvatar.
 *
 * @module src/components/navigation/AppHeader/UserAvatar/UserAvatar
 * @author Binx Portal
 */
"use client";

import { useState } from "react";

import { userImageUrl } from "@/lib/users-client";

import Image from "next/image";

import styles from "./UserAvatar.module.scss";

interface UserAvatarProps {
  /** The user's full name — its first character is the fallback initial. */
  name: string;
}

const UserAvatar = ({ name }: UserAvatarProps) => {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (!failed) {
    return (
      <Image
        className={styles.avatar}
        src={userImageUrl("avatar")}
        alt=""
        aria-hidden="true"
        onError={() => setFailed(true)}
        width={28}
        height={28}
        // The avatar proxy authenticates with the browser's session cookie,
        // which /_next/image's server-side fetch doesn't send (it gets a 401
        // and errors "internal response is invalid") — so load it directly.
        unoptimized
      />
    );
  }

  return (
    <span className={styles.avatar} aria-hidden="true">
      {initial}
    </span>
  );
};

export default UserAvatar;
