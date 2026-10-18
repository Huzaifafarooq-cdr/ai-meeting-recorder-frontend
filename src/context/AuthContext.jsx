import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, clearAccessToken, onSessionExpired, refreshSession, setAccessToken } from '../lib/api';
import { AuthContext } from './useAuth';

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    refreshSession()
      .then(({ user }) => {
        setUser(user);
        setStatus('authenticated');
      })
      .catch(() => setStatus('anonymous'));
  }, []);

  const endSession = useCallback(() => {
    clearAccessToken();
    queryClient.clear();
    setUser(null);
    setStatus('anonymous');
  }, [queryClient]);

  useEffect(
    () =>
      onSessionExpired((err) => {
        endSession();
        toast.error(err?.message ?? 'Your session has expired. Please log in again.', { id: 'session-expired' });
      }),
    [endSession]
  );

  const startSession = useCallback(({ user, accessToken }) => {
    setAccessToken(accessToken);
    setUser(user);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (credentials) => startSession(await api('/api/auth/login', { method: 'POST', body: credentials, auth: false })),
    [startSession]
  );

  const register = useCallback(
    async (details) => startSession(await api('/api/auth/register', { method: 'POST', body: details, auth: false })),
    [startSession]
  );

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', auth: false, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    } catch {
      /* logging out locally is enough if the server is unreachable */
    }
    endSession();
  }, [endSession]);

  const value = useMemo(() => ({ user, status, login, register, logout }), [user, status, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
