import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, getAccessToken, setAccessToken } from '../services/apiClient';

function setCsrfCookie(value: string) {
  document.cookie = `companyaudit_csrf=${encodeURIComponent(value)}; path=/`;
}

function clearCsrfCookie() {
  document.cookie = 'companyaudit_csrf=; Max-Age=0; path=/';
}

describe('apiClient security & transport contracts', () => {
  beforeEach(() => {
    setAccessToken('initial-access-jwt');
    setCsrfCookie('csrf-secret-xyz');
  });

  afterEach(() => {
    setAccessToken(null);
    clearCsrfCookie();
    vi.unstubAllGlobals();
  });

  it('injects X-CSRF-Token and Authorization headers on POST requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.post<{ ok: boolean }>('/audits', { title: 'Test Audit' });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/audits');
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer initial-access-jwt');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-secret-xyz');
    expect(init.credentials).toBe('include');
  });

  it('handles 204 No Content and JSON bodies on DELETE requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true, id: 'fnd-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const noContentRes = await apiClient.delete<void>('/findings/fnd-2');
    expect(noContentRes).toBeUndefined();

    const jsonRes = await apiClient.delete<{ deleted: boolean; id: string }>('/findings/fnd-1');
    expect(jsonRes).toEqual({ deleted: true, id: 'fnd-1' });
  });

  it('refreshes expired JWT on 401 with CSRF token and retries original request', async () => {
    const fetchMock = vi
      .fn()
      // 1. Original GET returns 401
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Token expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      // 2. Refresh call returns fresh access token
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'fresh-access-jwt',
            token_type: 'bearer',
            expires_in: 1800,
            user: {
              id: 'u-1',
              company_id: 'c-1',
              department_id: null,
              department_name: null,
              email: 'eleanor.vance@companyaudit.io',
              full_name: 'Eleanor Vance',
              initials: 'EV',
              job_title: 'CAO',
              role: 'Admin',
              certifications: ['CPA'],
              is_active: true,
              last_login_at: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      // 3. Retried GET succeeds
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const data = await apiClient.get<{ status: string }>('/dashboard');
    expect(data).toEqual({ status: 'ok' });
    expect(getAccessToken()).toBe('fresh-access-jwt');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshUrl).toBe('/api/auth/refresh');
    expect((refreshInit.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-secret-xyz');

    const [, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect((retryInit.headers as Headers).get('Authorization')).toBe('Bearer fresh-access-jwt');
  });
});

