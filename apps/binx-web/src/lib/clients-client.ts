/**
 * clients-client.ts
 *
 * The `lib/clients.ts` bits that are safe to import from a Client Component —
 * `lib/clients.ts` pulls in `next/headers` (server-only). Mirrors
 * `lib/agencies-client.ts`'s split, for the per-client portal logo.
 *
 * @module apps/binx-web/src/lib/clients-client.ts
 * @author Binx.io
 */

/** Keep in sync with binx-api's `agency_image_max_bytes` (core/config.py) — the client logo reuses the same cap. */
export const CLIENT_LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const CLIENT_LOGO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * clientLogoUrl
 *
 * Points at this app's own proxy route (which attaches the session bearer
 * token server-side) — never straight at binx-api. `version` (the
 * branding's cache-bust token) is appended as `?v=` so a re-uploaded logo
 * isn't served stale from the browser cache.
 */
export function clientLogoUrl(agencyId: string, clientId: string, version?: string | null): string {
  const base = `/api/clients/${agencyId}/${clientId}/logo`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}
