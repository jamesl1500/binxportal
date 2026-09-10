/**
 * proxy.ts (Next 16's renamed `middleware`)
 *
 * Keeps a session alive silently. The access token cookie is short-lived
 * (~30 min) and every authenticated call in this app is made server-side from
 * a Server Component render, where `cookies().set()` is a no-op — so there is
 * nowhere else the token can actually be refreshed. This runs before every
 * page / route handler / server action: if the access cookie is gone (or about
 * to expire) but a valid refresh cookie is present, it trades the refresh
 * token for a fresh pair, sets the new cookies on the response, AND rewrites
 * this request's `cookie` header so the render that follows sees the new token
 * immediately.
 *
 * A user therefore stays logged in for as long as the refresh token is valid
 * (30 days) or until it's revoked — not just for one 30-minute access window.
 *
 * @module apps/binx-web/src/proxy.ts
 * @author Binx.io
 */
import { decodeJwt } from "jose";
import { NextRequest, NextResponse } from "next/server";

// Keep in sync with lib/auth.ts (can't import it here — it pulls in
// `next/headers`, which isn't available in the proxy runtime).
const ACCESS_TOKEN_COOKIE = "binx_access_token";
const REFRESH_TOKEN_COOKIE = "binx_refresh_token";
const ACCESS_TOKEN_MAX_AGE = 30 * 60;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;
/** Refresh a bit early so a token never expires mid-request. */
const REFRESH_SKEW_MS = 60_000;

export const config = {
  // Everything except static assets, image optimizer, and the auth API
  // (login/refresh manage their own cookies).
  matcher: [
    "/((?!_next/static|_next/image|api/auth|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|map)$).*)",
  ],
};

function accessTokenIsFresh(token: string): boolean {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" && exp * 1000 - Date.now() > REFRESH_SKEW_MS;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // A usable access token, or no refresh token to fall back on → nothing to do.
  if ((access && accessTokenIsFresh(access)) || !refresh) {
    return NextResponse.next();
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!apiBase) {
    return NextResponse.next();
  }

  let tokens: { access_token: string; refresh_token: string } | null = null;
  try {
    const res = await fetch(`${apiBase}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    });

    if (res.ok) {
      tokens = await res.json();
    } else if (res.status === 400 || res.status === 401 || res.status === 403) {
      // The refresh token is genuinely dead (expired / replayed / account
      // disabled) — clear both cookies so the user gets a clean login rather
      // than a redirect loop.
      const dead = NextResponse.next();
      dead.cookies.delete(ACCESS_TOKEN_COOKIE);
      dead.cookies.delete(REFRESH_TOKEN_COOKIE);
      return dead;
    }
    // 5xx or anything else: transient — leave the cookies untouched and let
    // the page/route decide what to do.
  } catch {
    // Network blip (API restarting in dev, etc.) — never nuke a good session.
  }

  if (!tokens) {
    return NextResponse.next();
  }

  // Make the new access token visible to THIS request's Server Components:
  // rewrite the incoming `cookie` header and forward it via `next({ request })`.
  request.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token);
  request.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("cookie", request.cookies.toString());

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, { ...base, maxAge: ACCESS_TOKEN_MAX_AGE });
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, { ...base, maxAge: REFRESH_TOKEN_MAX_AGE });
  return response;
}
