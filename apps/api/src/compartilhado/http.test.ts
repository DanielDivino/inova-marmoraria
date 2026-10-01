import { describe, expect, it } from 'vitest';
import { acessoHttps } from './http.js';

describe('Cookie de sessão', () => {
  it('só exige HTTPS quando o acesso é por HTTPS, inclusive atrás de proxy', () => {
    expect(acessoHttps({ protocol: 'http', headers: {} })).toBe(false);
    expect(acessoHttps({ protocol: 'http', headers: { 'x-forwarded-proto': 'http' } })).toBe(false);
    expect(acessoHttps({ protocol: 'https', headers: {} })).toBe(true);
    expect(acessoHttps({ protocol: 'http', headers: { 'x-forwarded-proto': 'https, http' } })).toBe(true);
  });
});
