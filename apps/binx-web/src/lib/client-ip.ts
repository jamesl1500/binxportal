/**
 * client-ip.ts
 *
 * Carries the real visitor IP from this server to binx-api.
 *
 * Nearly every binx-api call is made by this Next server, not the browser, so
 * binx-api would otherwise see one caller for everyone — and its per-IP rate
 * limits (login, signup, password reset, portal, imports) would be shared by
 * every user at once. With `PROXY_SHARED_SECRET` set on both apps, each
 * server-side call sends the visitor's IP plus the secret, and binx-api keys
 * its limits on that IP (see binx-api core/rate_limit.py). Without the secret
 * nothing is sent and behavior is unchanged.
 *
 * Server-only: imports `next/headers`.
 *
 * @module apps/binx-web/src/lib/client-ip.ts
 */
import { timingSafeEqual } from "node:crypto";

import { headers } from "next/headers";

export const CLIENT_IP_HEADER = "x-binx-client-ip";
export const PROXY_SECRET_HEADER = "x-binx-proxy-secret";

function secretsMatch(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The visitor's IP for the request being handled. Trusts the forwarded
 * `x-binx-client-ip` only when it arrives with the shared secret — i.e. from
 * one of our own Server Actions calling our own Route Handler — and otherwise
 * the first `X-Forwarded-For` hop, which Caddy sets from the TCP peer and
 * never takes from the client.
 */
export function resolveClientIp(
  headerList: Headers,
  secret: string,
): string | null {
  if (secretsMatch(headerList.get(PROXY_SECRET_HEADER), secret)) {
    const forwarded = headerList.get(CLIENT_IP_HEADER)?.trim();
    if (forwarded) return forwarded;
  }
  const first = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || headerList.get("x-real-ip")?.trim() || null;
}

/**
 * Headers to add to a server-side call to binx-api or to our own Route
 * Handlers. Empty when the secret isn't configured or there's no request in
 * scope (build time, background work).
 */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  const secret = process.env.PROXY_SHARED_SECRET;
  if (!secret) return {};
  let headerList: Headers;
  try {
    headerList = await headers();
  } catch {
    return {};
  }
  const ip = resolveClientIp(headerList, secret);
  return ip ? { [CLIENT_IP_HEADER]: ip, [PROXY_SECRET_HEADER]: secret } : {};
}
