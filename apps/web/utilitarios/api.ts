import { enderecoLogin } from './rotas';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export type SessionUser = { id: string; name: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'SELLER'; maxDiscountPercent: number };
type Session = { accessToken: string; user: SessionUser };
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
let refreshPromise: Promise<void> | null = null;
let sessionVersion = 0;
let signingOut = false;

export function token() { return typeof window === 'undefined' ? null : localStorage.getItem('inova_access_token'); }
export function definirSessao(accessToken: string, user: SessionUser) {
  localStorage.setItem('inova_access_token', accessToken);
  localStorage.setItem('inova_user', JSON.stringify(user));
}
function limparSessao() {
  sessionVersion += 1;
  localStorage.removeItem('inova_access_token');
  localStorage.removeItem('inova_user');
  sessionStorage.removeItem('inova_catalog_cache_v1');
}
async function request(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  const cancel = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('content-type', 'application/json');
    const accessToken = token();
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include', signal: controller.signal });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    if (controller.signal.aborted) throw new Error('O servidor demorou para responder. Tente novamente.');
    throw new Error('Não foi possível conectar ao servidor da Inova. Verifique a conexão e tente novamente.');
  } finally { window.clearTimeout(timeout); init.signal?.removeEventListener('abort', cancel); }
}
async function erroResposta(response: Response) {
  const body = await response.json().catch(() => ({}));
  return new ApiError(body.message ?? 'Não foi possível concluir a operação.', response.status);
}
async function renovarSessao() {
  if (!refreshPromise) {
    const version = sessionVersion;
    refreshPromise = (async () => {
      const response = await request('/auth/refresh', { method: 'POST' });
      if (!response.ok) throw await erroResposta(response);
      const session = await response.json() as Session;
      // A renovação iniciada antes de sair não pode reativar a sessão.
      if (version !== sessionVersion || signingOut) throw new ApiError('Sessão encerrada.', 401);
      definirSessao(session.accessToken, session.user);
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
async function requisicaoAutenticada(path: string, init: RequestInit = {}) {
  let response = await request(path, init);
  if (response.status === 401 && !['/auth/login', '/auth/logout', '/auth/refresh'].includes(path)) {
    try {
      await renovarSessao();
      response = await request(path, init);
      if (response.status === 401) throw await erroResposta(response);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        limparSessao();
        // Depois de entrar de novo, volta para a tela em que estava.
        if (window.location.pathname !== '/login') window.location.replace(enderecoLogin(window.location.pathname + (window.location.search ?? '')));
      }
      throw cause;
    }
  }
  if (!response.ok) throw await erroResposta(response);
  return response;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resposta = await requisicaoAutenticada(path, init);
  // 204 (ex.: excluir): sem conteúdo para ler.
  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}
export async function buscarArquivoApi(path: string): Promise<Blob> {
  return (await requisicaoAutenticada(path)).blob();
}
export async function encerrarSessao() {
  signingOut = true;
  sessionVersion += 1;
  try {
    // O backend limpa o cookie HttpOnly; depois removemos as credenciais locais.
    await api('/auth/logout', { method: 'POST' });
    limparSessao();
  } finally { signingOut = false; }
}
