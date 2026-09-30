/**
 * api.ts
 *
 * Axios instance for talking to binx-api from the mobile app. Unlike
 * binx-web (which keeps tokens in httpOnly cookies and does the refresh
 * dance in Server Actions), there's no server hop here — the access token is
 * attached to every request on-device, and a 401 triggers an in-place
 * refresh-and-retry.
 *
 * @module apps/binx-mobile/src/lib/api.ts
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { clearTokens, getAccessToken, getRefreshToken, setTokens, type TokenPair } from '@/lib/token-storage';

/**
 * Base URL for binx-api. Set `EXPO_PUBLIC_API_URL` in `.env` (see
 * `.env.example`) — on a physical device or in Expo Go this must be your
 * machine's LAN IP (e.g. `http://192.168.1.20:8000`), not `localhost`.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL && __DEV__) {
  console.warn(
    '[api] EXPO_PUBLIC_API_URL is not set — requests to binx-api will fail. See apps/binx-mobile/.env.example.',
  );
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Requests that must never carry a stale access token or trigger a refresh loop. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/signup', '/auth/refresh'];

api.interceptors.request.use(async (config) => {
  if (AUTH_ENDPOINTS.some((path) => config.url?.startsWith(path))) return config;

  const accessToken = await getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/** Called once a refresh fails outright, so the app can drop back to the login screen. */
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// Dedupe concurrent refreshes: every 401 that arrives while a refresh is
// already in flight awaits that same promise instead of firing its own.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post<TokenPair>(`${API_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    await setTokens(data);
    return data.access_token;
  } catch {
    await clearTokens();
    return null;
  }
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;

    if (status !== 401 || !config || config._retried || AUTH_ENDPOINTS.some((path) => config.url?.startsWith(path))) {
      throw error;
    }

    config._retried = true;
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });

    const newAccessToken = await refreshPromise;
    if (!newAccessToken) {
      onSessionExpired?.();
      throw error;
    }

    config.headers.Authorization = `Bearer ${newAccessToken}`;
    return api.request(config);
  },
);
