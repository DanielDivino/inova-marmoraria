import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
}
const user = { id: 'internal-user', name: 'Equipe', role: 'ADMIN' as const, maxDiscountPercent: 10 };
const response = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', { setTimeout, clearTimeout, location: { pathname: '/', replace: vi.fn() } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('consulta cancelável mantém o timeout para não deixar a busca carregando indefinidamente', async () => {
  vi.useFakeTimers();
  window.setTimeout = setTimeout as unknown as typeof window.setTimeout;
  window.clearTimeout = clearTimeout as unknown as typeof window.clearTimeout;
  vi.stubGlobal('fetch', vi.fn((_path, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')));
  })));
  const { api } = await import('./api');
  const request = api('/quotes', { signal: new AbortController().signal });
  const assertion = expect(request).rejects.toThrow('O servidor demorou para responder');
  await vi.advanceTimersByTimeAsync(12_000);
  await assertion;
});

it('cancelar uma pesquisa obsoleta não encerra a sessão', async () => {
  vi.stubGlobal('fetch', vi.fn((_path, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')));
  })));
  const { api } = await import('./api');
  localStorage.setItem('inova_access_token', 'valid-token');
  const controller = new AbortController();
  const request = api('/quotes', { signal: controller.signal });
  const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await assertion;
  expect(localStorage.getItem('inova_access_token')).toBe('valid-token');
  expect(window.location.replace).not.toHaveBeenCalled();
});

describe('sessão da aplicação', () => {
  it('senha incorreta permanece no login, sem renovar outra sessão', async () => {
    const fetch = vi.fn().mockResolvedValue(response(401, { message: 'E-mail ou senha inválidos.' }));
    vi.stubGlobal('fetch', fetch);
    const { api } = await import('./api');
    await expect(api('/auth/login', { method: 'POST' })).rejects.toThrow('E-mail ou senha inválidos.');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('renova apenas uma vez para consultas simultâneas, incluindo PDF', async () => {
    let refreshed = false;
    const fetch = vi.fn(async (path: string) => {
      if (path.endsWith('/auth/refresh')) { await Promise.resolve(); refreshed = true; return response(200, { accessToken: 'renewed', user }); }
      if (!refreshed) return response(401, { message: 'Expirou' });
      return path.endsWith('/pdf') ? new Response('%PDF-1.3', { headers: { 'content-type': 'application/pdf' } }) : response(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetch);
    const { api, apiFile } = await import('./api');
    const [data, file] = await Promise.all([api('/quotes'), apiFile('/quotes/example/pdf')]);
    expect(data).toEqual({ ok: true });
    expect(await file.text()).toBe('%PDF-1.3');
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(localStorage.getItem('inova_access_token')).toBe('renewed');
  });

  it('falha de conexão durante renovação não apaga credenciais nem redireciona', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(401, {})).mockRejectedValueOnce(new TypeError('Failed to fetch')));
    localStorage.setItem('inova_access_token', 'old-token');
    const { api } = await import('./api');
    await expect(api('/auth/me')).rejects.toThrow('Não foi possível conectar');
    expect(localStorage.getItem('inova_access_token')).toBe('old-token');
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('sessão expirada leva ao login e preserva o rascunho', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(response(401, { message: 'Sessão expirada.' }))));
    localStorage.setItem('inova_access_token', 'expired');
    localStorage.setItem('inova_quote_draft_v2:internal-user', 'draft');
    const { api } = await import('./api');
    await expect(api('/auth/me')).rejects.toThrow('Sessão expirada.');
    expect(localStorage.getItem('inova_access_token')).toBeNull();
    expect(localStorage.getItem('inova_quote_draft_v2:internal-user')).toBe('draft');
    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('sair limpa credenciais e cache somente após encerrar o cookie no backend', async () => {
    const fetch = vi.fn().mockResolvedValue(response(200, { ok: true }));
    vi.stubGlobal('fetch', fetch);
    const { setSession, logout } = await import('./api');
    setSession('token', user);
    sessionStorage.setItem('inova_catalog_cache_v1', 'catalog');
    localStorage.setItem('inova_quote_draft_v2:internal-user', 'draft');
    await logout();
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(localStorage.getItem('inova_user')).toBeNull();
    expect(localStorage.getItem('inova_access_token')).toBeNull();
    expect(sessionStorage.getItem('inova_catalog_cache_v1')).toBeNull();
    expect(localStorage.getItem('inova_quote_draft_v2:internal-user')).toBe('draft');
  });

  it('renovação em andamento não restaura credenciais após sair', async () => {
    let finishRefresh!: (value: Response) => void;
    let refreshStarted!: () => void;
    const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
    vi.stubGlobal('fetch', vi.fn((path: string) => {
      if (path.endsWith('/auth/refresh')) return new Promise<Response>((resolve) => { finishRefresh = resolve; refreshStarted(); });
      if (path.endsWith('/auth/logout')) return Promise.resolve(response(200, { ok: true }));
      return Promise.resolve(response(401, {}));
    }));
    const { api, logout } = await import('./api');
    const pending = api('/quotes');
    const assertion = expect(pending).rejects.toThrow('Sessão encerrada.');
    await started;
    await logout();
    finishRefresh(response(200, { accessToken: 'too-late', user }));
    await assertion;
    expect(localStorage.getItem('inova_access_token')).toBeNull();
  });
});
