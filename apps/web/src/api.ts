const TOKEN_KEY = 'suite.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage non disponibile: la sessione dura quanto la pagina */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errori: { campo: string; messaggio: string }[] = [],
  ) {
    super(message);
  }
}

/** Chiamata all'API con token e gestione uniforme degli errori. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('suite:logout'));
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Errore imprevisto');
    throw new ApiError(message, res.status, data.errori);
  }
  return data as T;
}
