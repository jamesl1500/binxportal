/**
 * token-storage.ts
 *
 * Persists the access/refresh token pair on-device. Uses `expo-secure-store`
 * (iOS Keychain / Android Keystore) everywhere it's supported; SecureStore
 * has no web implementation, so on `Platform.OS === 'web'` we fall back to
 * `localStorage`, which is fine for local dev in a browser but is NOT what
 * ships to a client's phone.
 *
 * @module apps/binx-mobile/src/lib/token-storage.ts
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const ACCESS_TOKEN_KEY = 'binx_access_token';
export const REFRESH_TOKEN_KEY = 'binx_refresh_token';

const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function setTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, tokens.access_token),
    setItem(REFRESH_TOKEN_KEY, tokens.refresh_token),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
}
