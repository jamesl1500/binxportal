/**
 * auth.ts
 *
 * Server-only helpers for managing auth session cookies and talking to the
 * binx-api auth endpoints. Tokens are stored in httpOnly cookies (never
 * localStorage) so they can't be read by client-side JS.
 *
 * @module apps/binx-web/src/lib/auth.ts
 * @author Binx.io
 */
import axios from "axios";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { api } from "@/lib/api";

/**
 * TokenPair
 *
 * Represents a pair of access and refresh tokens returned by the binx-api.
 * The access token is used for authenticating API requests, while the refresh
 * token is used to obtain a new access token when the current one expires.
 *
 * @interface TokenPair
 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

/** Error carrying the upstream binx-api HTTP status, so route handlers can propagate it. */
export class AuthApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

/** FastAPI's `detail` is either a plain string (HTTPException) or a list of pydantic validation errors (422). */
function extractDetailMessage(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | undefined)?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => (entry && typeof entry === "object" && "msg" in entry ? String(entry.msg) : null))
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) return messages.join(" ");
  }

  return fallback;
}

/**
 * CurrentUser
 *
 * Represents the currently authenticated user as returned by the binx-api.
 * This interface includes basic user information such as ID, username, email,
 * full name, role, and status flags indicating whether the user is active and
 * verified.
 *
 * @interface CurrentUser
 */
export interface CurrentUser {
  id: string;
  user_name: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
}

/**
 * Access and refresh token cookie names.
 *
 * These constants define the names of the cookies used to store the access and
 * refresh tokens in the user's browser. The access token cookie is used for
 * authenticating API requests, while the refresh token cookie is used to obtain
 * a new access token when the current one expires.
 *
 * @constant {string} ACCESS_TOKEN_COOKIE - The name of the cookie storing the access token.
 * @constant {string} REFRESH_TOKEN_COOKIE - The name of the cookie storing the refresh token.
 */
export const ACCESS_TOKEN_COOKIE = "binx_access_token";
export const REFRESH_TOKEN_COOKIE = "binx_refresh_token";

// Keep in sync with binx-api settings (core/config.py)
const ACCESS_TOKEN_MAX_AGE_SECONDS = 30 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * baseCookieOptions
 *
 * Base options for setting cookies, including httpOnly, secure, sameSite, and path.
 * These options ensure that the cookies are only accessible via HTTP requests,
 * are sent over secure connections in production, have a lax same-site policy,
 * and are available to all paths on the domain.
 *
 * @constant {object} baseCookieOptions - The base options for setting cookies.
 */
const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Resolves this app's own origin so Server Actions can call our `/api/auth/*` routes. */
export async function getInternalBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${host}`;
}

/**
 * Copies raw `Set-Cookie` header strings from an internal API call onto the
 * current request's cookies. Needed because calling our own Route Handler
 * (via `fetch()` or the `api` axios instance) runs it in an isolated request
 * context — its `cookies().set()` calls land on that nested response, not on
 * the Server Action's response, so they must be forwarded by hand.
 */
export async function forwardSetCookies(setCookieHeaders: string[] | undefined): Promise<void> {
  if (!setCookieHeaders || setCookieHeaders.length === 0) return;

  const cookieStore = await cookies();

  for (const header of setCookieHeaders) {
    const [pair, ...attributes] = header.split(";").map((part) => part.trim());
    const separatorIndex = pair.indexOf("=");
    const name = pair.slice(0, separatorIndex);
    const value = pair.slice(separatorIndex + 1);

    const options: Parameters<typeof cookieStore.set>[2] = {};
    for (const attribute of attributes) {
      const [rawKey, rawValue] = attribute.split("=");
      switch (rawKey.toLowerCase()) {
        case "max-age":
          options.maxAge = Number(rawValue);
          break;
        case "path":
          options.path = rawValue;
          break;
        case "samesite":
          options.sameSite = rawValue?.toLowerCase() as "lax" | "strict" | "none";
          break;
        case "httponly":
          options.httpOnly = true;
          break;
        case "secure":
          options.secure = true;
          break;
      }
    }

    cookieStore.set(name, decodeURIComponent(value), options);
  }
}

/** Persists a fresh token pair from login/refresh into httpOnly cookies. */
export async function setAuthCookies(
  tokens: TokenPair,
  res: NextResponse | null,
): Promise<NextResponse | void> {
  const cookieStore = await cookies();

  // Set access/refresh cookies
  try {
    cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.access_token, {
      ...baseCookieOptions,
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    });
    cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, {
      ...baseCookieOptions,
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    });
  } catch (error) {
    console.error("Failed to set auth cookies:", error);
  }

  if (res) {
    try {
      res.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, {
        ...baseCookieOptions,
        maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
      });
      res.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, {
        ...baseCookieOptions,
        maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
      });

      return res;
    } catch (error) {
      console.error("Failed to set auth cookies on response:", error);
    }
  }
}

/** Removes the session cookies, logging the user out client-side. */
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
}

/**
 * getCurrentUser
 *
 * Validates the access token cookie against binx-api and returns the current
 * user, or null if there is no token or it's invalid/expired. This is the
 * canonical "is this token still good" check — it delegates to GET /users/me
 * rather than decoding the JWT locally.
 *
 * @function getCurrentUser
 * @returns {Promise<CurrentUser | null>} - The current user if authenticated, otherwise null.
 * @throws {Error} - Throws an error if the access token is invalid or expired.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const { data } = await api.get<CurrentUser>("/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if( !data || !data.id) {
      throw new Error("Failed to fetch current user: Invalid response from server");
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * refreshSession
 *
 * Exchanges the refresh token cookie for a new token pair and stores it.
 *
 * @function refreshSession
 * @returns {Promise<boolean>} - True if the session was successfully refreshed, otherwise false.
 */
export async function refreshSession(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  try {
    const { data } = await api.post<TokenPair>("/auth/refresh", {
      refresh_token: refreshToken,
    });
    await setAuthCookies(data, null);
    return true;
  } catch {
    await clearAuthCookies();
    return false;
  }
}

/**
 * login
 *
 * Attempts to log in a user with the provided email and password. If successful,
 * it stores the returned token pair in httpOnly cookies and fetches the current
 * user. If the login fails, an error is thrown.
 *
 * @function login
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<CurrentUser>} - The currently authenticated user.
 * @throws {Error} - Throws an error if the login fails or the current user cannot be fetched.
 */
export async function login(
  email: string,
  password: string,
): Promise<CurrentUser> {
  let data: TokenPair;

  try {
    ({ data } = await api.post<TokenPair>("/auth/login", { email, password }));
  } catch (error) {
    // Surface binx-api's actual reason (e.g. "Incorrect email or password") instead
    // of axios's generic "Request failed with status code 401".
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to sign in"), error.response.status);
    }
    throw error;
  }

  if( !data || !data.access_token || !data.refresh_token) {
    throw new Error("Login failed: Invalid response from server");
  }

  await setAuthCookies(data, null);

  // Fetch the current user after setting the cookies
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Login succeeded but current user could not be fetched");
  }

  return user;
}

export interface SignupInput {
  userName: string;
  email: string;
  fullName: string;
  password: string;
}

/**
 * signup
 *
 * Creates a new account via binx-api. Unlike `login`, this does not issue
 * tokens — binx-api requires email verification before the account can sign
 * in, so no session cookies are set here.
 *
 * @function signup
 * @throws {AuthApiError} - Thrown with binx-api's reason (e.g. "Email already registered").
 */
export async function signup({ userName, email, fullName, password }: SignupInput): Promise<string> {
  try {
    const { data } = await api.post<{ message: string }>("/auth/signup", {
      user_name: userName,
      email,
      full_name: fullName,
      password,
    });
    return data.message;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to create account"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * requestPasswordReset
 *
 * Asks binx-api to send a password-reset email. Always resolves (binx-api
 * intentionally returns a generic success message whether or not the email
 * exists, to avoid leaking account existence).
 *
 * @function requestPasswordReset
 * @throws {AuthApiError} - Thrown if binx-api rejects the request outright (e.g. malformed email).
 */
export async function requestPasswordReset(email: string): Promise<string> {
  try {
    const { data } = await api.post<{ message: string }>("/auth/forgot-password", { email });
    return data.message;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to process your request"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * resetPassword
 *
 * Exchanges a password-reset token (from the emailed link) for a new password.
 *
 * @function resetPassword
 * @throws {AuthApiError} - Thrown with binx-api's reason (e.g. "Invalid or expired token").
 */
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  try {
    const { data } = await api.post<{ message: string }>("/auth/reset-password", {
      token,
      new_password: newPassword,
    });
    return data.message;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to reset password"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * logout
 *
 * Logs out the current user by clearing the session cookies. This effectively
 * ends the user's session on the client side.
 *
 * @function logout
 * @returns {Promise<void>} - A promise that resolves when the cookies have been cleared.
 */
export async function logout(): Promise<void> {
  await clearAuthCookies();
}

/**
 * Verify Email
 *
 * This function verifies a user's email address using a verification token.
 * It sends a POST request to the binx-api with the provided token.
 * If the verification is successful, it returns true; otherwise, it returns false.
 *
 * @function verifyEmail
 * @param {string} token - The verification token sent to the user's email.
 * @returns {Promise<boolean>} - True if the email was successfully verified, otherwise false.
 * @throws {Error} - Throws an error if the verification request fails.
 */
export async function verifyEmail(token: string): Promise<boolean> {
  try {
    if (token === undefined || token === null || token === "") {
      throw new Error("Token is required for email verification");
    }

    const response = await api.post("/auth/verify-email", { token });

    if (response.status !== 200) {
      throw new Error(
        `Email verification failed with status: ${response.status}`,
      );
    }

    return true;
  } catch {
    throw new Error(
      "Email verification failed. Please check the token and try again.",
    );
  }
}
