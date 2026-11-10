import { TokenResponse } from '../types/api';

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

let inMemoryAccessToken: string | null = null;
let refreshInFlight: Promise<TokenResponse | null> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) {
    return null;
  }
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

function extractErrorDetail(body: unknown, fallbackStatus: number): string {
  if (!body || typeof body !== 'object') {
    return `Request failed with status ${fallbackStatus}`;
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.detail === 'string') {
    return obj.detail;
  }
  if (Array.isArray(obj.detail)) {
    return obj.detail
      .map((entry) => {
        if (entry && typeof entry === 'object' && 'msg' in entry) {
          const rec = entry as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(rec.loc) ? rec.loc.slice(1).join('.') : '';
          return field ? `${field}: ${rec.msg}` : String(rec.msg);
        }
        return JSON.stringify(entry);
      })
      .join('; ');
  }
  return `Request failed with status ${fallbackStatus}`;
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json = await res.json();
      return new ApiError(res.status, extractErrorDetail(json, res.status));
    } catch {
      return new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`);
    }
  }
  const text = await res.text().catch(() => '');
  return new ApiError(res.status, text || `HTTP ${res.status} ${res.statusText}`);
}

export async function refreshAccessToken(): Promise<TokenResponse | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      const csrf = readCookie('companyaudit_csrf');
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        inMemoryAccessToken = null;
        return null;
      }
      const data = (await res.json()) as TokenResponse;
      inMemoryAccessToken = data.access_token;
      return data;
    } catch {
      inMemoryAccessToken = null;
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
  retryOnUnauthorized?: boolean;
}

async function performFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const { body, skipAuth = false, retryOnUnauthorized = true, headers: customHeaders, ...rest } = options;

  const headers = new Headers(customHeaders);
  headers.set('Accept', headers.get('Accept') || 'application/json');

  let preparedBody: BodyInit | undefined;
  if (body instanceof FormData) {
    preparedBody = body;
  } else if (body !== undefined) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    preparedBody = typeof body === 'string' ? body : JSON.stringify(body);
  }

  if (!skipAuth && inMemoryAccessToken) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const method = (rest.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !headers.has('X-CSRF-Token')) {
    const csrf = readCookie('companyaudit_csrf');
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: preparedBody,
    credentials: 'include',
  });

  if (
    res.status === 401 &&
    !skipAuth &&
    retryOnUnauthorized &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/refresh')
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed?.access_token) {
      headers.set('Authorization', `Bearer ${refreshed.access_token}`);
      return fetch(`${API_BASE}${path}`, {
        ...rest,
        headers,
        body: preparedBody,
        credentials: 'include',
      });
    }
    if (sessionExpiredHandler) {
      sessionExpiredHandler();
    }
  }

  return res;
}

export const apiClient = {
  get: async <T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> => {
    const res = await performFetch(path, { ...options, method: 'GET' });
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as T;
  },

  post: async <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> => {
    const res = await performFetch(path, { ...options, method: 'POST', body });
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as T;
  },

  put: async <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> => {
    const res = await performFetch(path, { ...options, method: 'PUT', body });
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as T;
  },

  patch: async <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> => {
    const res = await performFetch(path, { ...options, method: 'PATCH', body });
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as T;
  },

  delete: async <T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> => {
    const res = await performFetch(path, { ...options, method: 'DELETE' });
    if (!res.ok) throw await parseErrorResponse(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  },

  uploadForm: async <T>(path: string, formData: FormData): Promise<T> => {
    const res = await performFetch(path, { method: 'POST', body: formData });
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as T;
  },

  downloadBlob: async (path: string): Promise<{ blob: Blob; filename: string; sha256: string | null }> => {
    const res = await performFetch(path, {
      method: 'GET',
      headers: { Accept: '*/*' },
    });
    if (!res.ok) throw await parseErrorResponse(res);

    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || 'download.bin';
    const sha256 = res.headers.get('x-evidence-sha256');
    const blob = await res.blob();
    return { blob, filename, sha256 };
  },
};

