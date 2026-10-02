import { describe, expect, it } from 'vitest';
import { deltaPeitorilAtual, larguraPeitorilPar, limitePeitorilBalanco, peitorilComLargura } from '../componentes/orcamento/OpcoesPeitoril';
import { criarComponenteRapido } from './quick-quote';

describe('peitoril de duas pedras (Opções da peça no Orçamento Rápido)', () => {
  it('divide largura + sobreposição ao meio; o balanço passa centímetros de uma pedra para a outra', () => {
    expect(larguraPeitorilPar('20', '2', 0)).toEqual({ top: '11', bottom: '11' });
    expect(larguraPeitorilPar('20', '2', 3)).toEqual({ top: '14', bottom: '8' });
    expect(deltaPeitorilAtual('14', '8')).toBe(3);
    expect(limitePeitorilBalanco('20', '2')).toBe(10);
    expect(larguraPeitorilPar('', '2', 0)).toBeUndefined();
  });

  it('mudar a largura da linha: com duas pedras, elas acompanham; peitoril simples ou outra peça, só a largura', () => {
    const peitoril = { ...criarComponenteRapido('stone'), componentType: 'SILL' as const, widthCm: '20', sillOverlapCm: '2', sillTopWidthCm: '14', sillBottomWidthCm: '8', sillFinalWidthCm: '20' };
    expect(peitorilComLargura(peitoril, '30')).toEqual({ widthCm: '30', sillFinalWidthCm: '30', sillTopWidthCm: '19', sillBottomWidthCm: '13' });
    expect(peitorilComLargura({ ...peitoril, sillOverlapCm: undefined }, '30')).toEqual({ widthCm: '30' });
    expect(peitorilComLargura(criarComponenteRapido('stone'), '30')).toEqual({ widthCm: '30' });
  });
});
