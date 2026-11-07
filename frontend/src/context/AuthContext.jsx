// src/context/AuthContext.jsx
// Keeps "who is logged in" for the whole app.
//
// On page load (or refresh) we ask the backend GET /api/auth/me. The browser
// sends the session cookie automatically, so if the session is still valid
// the user stays logged in after a refresh. Until that answer arrives,
// `loading` is true and protected pages show a spinner instead of
// redirecting to the login page too early.
//
// The role comes ONLY from the backend ('admin' or 'employee'). The UI uses
// it to choose menus and pages, but the backend checks it again on every
// request - hiding a button is never the real protection.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Shown on the login page after an automatic logout ("Your session has expired...")
  const [sessionMessage, setSessionMessage] = useState('');

  // 1. Restore the session when the app starts
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((me) => !cancelled && setUser(me))
      .catch(() => !cancelled && setUser(null)) // 401 = simply not logged in
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. If any later request answers 401, the session is gone (expired,
  //    logged out in another tab, or the account was deactivated).
  useEffect(() => {
    setUnauthorizedHandler((message) => {
      setUser((current) => {
        if (current) setSessionMessage(message || 'Your session has expired. Please log in again.');
        return null;
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await authApi.login(email, password);
    setSessionMessage('');
    setUser(result.data);
    return result.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Even if the request fails (server down), forget the user in the UI
      setUser(null);
    }
  }, []);

  // After the employee edits their name, refresh the name shown in the navbar
  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, sessionMessage, clearSessionMessage: () => setSessionMessage('') }),
    [user, loading, login, logout, refreshUser, sessionMessage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

// Where each role lands after logging in
export function homePathFor(user) {
  if (!user) return '/login';
  return user.role === 'admin' ? '/admin' : '/employee';
}
