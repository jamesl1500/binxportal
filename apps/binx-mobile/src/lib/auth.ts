/**
 * auth.ts
 *
 * Talks to binx-api's `/auth/*` and `/users/me` endpoints and persists the
 * resulting token pair via `token-storage`. Mirrors `apps/binx-web/src/lib/auth.ts`'s
 * error handling (unwrap FastAPI's `detail`) but without the cookie/server-action
 * plumbing, since the mobile app calls binx-api directly.
 *
 * @module apps/binx-mobile/src/lib/auth.ts
 */
import axios from 'axios';

import { api } from '@/lib/api';
import type { Schemas } from '@/lib/api-types';
import { clearTokens, getAccessToken, setTokens, type TokenPair } from '@/lib/token-storage';

export type CurrentUser = Schemas['UserRead'];

/** Error carrying the upstream binx-api HTTP status, so screens can branch on it (e.g. 403 = unverified). */
export class AuthApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

/** FastAPI's `detail` is either a plain string (HTTPException) or a list of pydantic validation errors (422). */
function extractDetailMessage(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | undefined)?.detail;

  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => (entry && typeof entry === 'object' && 'msg' in entry ? String(entry.msg) : null))
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) return messages.join(' ');
  }

  return fallback;
}

async function withAuthError<T>(request: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
    }
    throw error;
  }
}

/** Validates the stored access token against binx-api and returns the current user, or null if there isn't one / it's invalid. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const { data } = await api.get<CurrentUser>('/users/me');
    return data;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const { data } = await withAuthError(() => api.post<TokenPair>('/auth/login', { email, password }), 'Unable to sign in');

  await setTokens(data);

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Login succeeded but the current user could not be fetched');
  }
  return user;
}

export interface SignupInput {
  userName?: string;
  email: string;
  fullName: string;
  password: string;
}

/** Creates an account. binx-api requires email verification before login, so no tokens are issued here. */
export async function signup({ userName, email, fullName, password }: SignupInput): Promise<string> {
  const { data } = await withAuthError(
    () =>
      api.post<{ message: string }>('/auth/signup', {
        user_name: userName,
        email,
        full_name: fullName,
        password,
      }),
    'Unable to create account',
  );
  return data.message;
}

export async function logout(): Promise<void> {
  await clearTokens();
}
