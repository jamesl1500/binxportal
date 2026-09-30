/**
 * auth-context.tsx
 *
 * App-wide auth state. On mount it checks for a stored access token and
 * validates it against binx-api (`GET /users/me`); `api.ts`'s response
 * interceptor transparently refreshes an expired access token using the
 * stored refresh token, so this only has to handle "no session" vs "signed in".
 *
 * @module apps/binx-mobile/src/contexts/auth-context.tsx
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setOnSessionExpired } from '@/lib/api';
import { getCurrentUser, login as loginRequest, logout as logoutRequest, type CurrentUser } from '@/lib/auth';

interface AuthContextValue {
  /** `undefined` while the initial session check is in flight, `null` once it's resolved there's no session. */
  user: CurrentUser | null | undefined;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  useEffect(() => {
    // Fires when a background token refresh fails (refresh token expired/revoked) —
    // drop straight back to the login screen rather than leaving stale API errors on screen.
    setOnSessionExpired(() => setUser(null));
    return () => setOnSessionExpired(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await loginRequest(email, password);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading: user === undefined, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
