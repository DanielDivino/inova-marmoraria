import { describe, expect, it } from 'vitest';
import { intervaloDoPeriodo, periodoSelecionado } from './periodos';

describe('Atalhos de período', () => {
  // 03:00 UTC ainda é dia 26 em Manaus: o período segue o dia da empresa.
  const agora = new Date('2026-09-27T03:00:00Z');

  it('calcula os intervalos pelo dia da empresa, incluindo hoje', () => {
    expect(intervaloDoPeriodo('HOJE', agora)).toEqual({ from: '2026-09-26', to: '2026-09-26' });
    expect(intervaloDoPeriodo('SETE_DIAS', agora)).toEqual({ from: '2026-09-20', to: '2026-09-26' });
    expect(intervaloDoPeriodo('TRINTA_DIAS', agora)).toEqual({ from: '2026-08-28', to: '2026-09-26' });
  });

  it('reconhece o atalho pelas datas e trata o resto como personalizado', () => {
    expect(periodoSelecionado('', '', agora)).toBe('TODOS');
    expect(periodoSelecionado('2026-09-20', '2026-09-26', agora)).toBe('SETE_DIAS');
    expect(periodoSelecionado('2026-09-03', '2026-09-10', agora)).toBe('PERSONALIZADO');
    expect(periodoSelecionado('2026-09-03', '', agora)).toBe('PERSONALIZADO');
  });
});
