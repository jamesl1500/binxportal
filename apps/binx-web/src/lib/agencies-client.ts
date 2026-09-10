/**
 * agencies-client.ts
 *
 * The `lib/agencies.ts` bits that are safe to import from a Client Component —
 * `lib/agencies.ts` pulls in `next/headers` (server-only), but the header and
 * org switcher are Client Components that need to build image URLs.
 *
 * @module apps/binx-web/src/lib/agencies-client.ts
 * @author Binx.io
 */

/** Keep in sync with binx-api's `agency_image_max_bytes` (core/config.py). */
export const AGENCY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AGENCY_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type AgencyImageKind = "logo" | "cover";

/**
 * agencyImageUrl
 *
 * Points at this app's own proxy route (which attaches the session bearer
 * token server-side) — never straight at binx-api, which the browser has no
 * token for. `version` (the profile's cache-bust token) is appended as `?v=`
 * so a re-uploaded image isn't served stale from the browser cache.
 */
export function agencyImageUrl(
  agencyId: string,
  kind: AgencyImageKind,
  version?: string | null,
): string {
  const base = `/api/agencies/${agencyId}/${kind}`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}
