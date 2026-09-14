/**
 * users-client.ts
 *
 * The `lib/users.ts` bits that are safe to import from a Client Component —
 * `lib/users.ts` pulls in `next/headers` (server-only), but the team roster,
 * member drawer, and profile photo picker are Client Components that need to
 * build image URLs. Mirrors `lib/agencies-client.ts`.
 *
 * @module apps/binx-web/src/lib/users-client.ts
 * @author Binx.io
 */

/** Keep in sync with binx-api's `agency_image_max_bytes` (core/config.py) — user photos reuse the same cap. */
export const USER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const USER_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type UserImageKind = "avatar" | "cover";

/**
 * userImageUrl
 *
 * Points at this app's own proxy route for the signed-in user's own avatar
 * or cover (which attaches the session bearer token server-side) — never
 * straight at binx-api, which the browser has no token for. `version` (the
 * profile's cache-bust token) is appended as `?v=` so a re-uploaded image
 * isn't served stale from the browser cache.
 */
export function userImageUrl(kind: UserImageKind, version?: string | null): string {
  const base = `/api/users/me/${kind}`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

/**
 * memberImageUrl
 *
 * Same idea as userImageUrl, but for viewing a teammate's avatar/cover
 * anywhere in the team UI (roster, member drawer, profile page) — proxied
 * through the agency-scoped route so it respects membership.
 */
export function memberImageUrl(
  agencyId: string,
  memberId: string,
  kind: UserImageKind,
  version?: string | null,
): string {
  const base = `/api/agencies/${agencyId}/members/${memberId}/${kind}`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}
