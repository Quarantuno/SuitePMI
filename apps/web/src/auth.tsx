import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthResponse } from '@suite/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';

type Sessione = Omit<AuthResponse, 'token'>;

interface AuthState {
  sessione: Sessione | null;
  caricamento: boolean;
  entra: (r: AuthResponse) => void;
  esci: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setTok] = useState(getToken);

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => api<Sessione>('/auth/me'),
    enabled: !!token,
    retry: false,
  });

  const esci = useCallback(() => {
    setToken(null);
    setTok(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    const onLogout = () => esci();
    window.addEventListener('suite:logout', onLogout);
    return () => window.removeEventListener('suite:logout', onLogout);
  }, [esci]);

  const entra = useCallback(
    (r: AuthResponse) => {
      setToken(r.token);
      qc.setQueryData(['me', r.token], { utente: r.utente, azienda: r.azienda });
      setTok(r.token);
    },
    [qc],
  );

  const value: AuthState = {
    sessione: token ? (me.data ?? null) : null,
    caricamento: !!token && me.isPending,
    entra,
    esci,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuori da AuthProvider');
  return ctx;
}
