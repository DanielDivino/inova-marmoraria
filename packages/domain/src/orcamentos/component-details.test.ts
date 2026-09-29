import { describe, expect, it } from 'vitest';
import { nomeProjeto } from './component-details';

describe('nome do projeto', () => {
  it('usa o nome digitado, sem espaços sobrando', () => {
    expect(nomeProjeto({ projectName: '  SOLEIRAS ', components: [{ label: '', componentType: 'THRESHOLD' }] })).toBe('SOLEIRAS');
  });
  it('sem nome, descreve pelas peças reais e nunca pelo tipo de produto interno', () => {
    expect(nomeProjeto({ projectName: '', components: [{ label: '', componentType: 'THRESHOLD' }] })).toBe('Soleira');
    expect(nomeProjeto({ projectName: null, components: [
      { label: '', componentType: 'COUNTER' }, { label: '', componentType: 'BACKSPLASH' }, { label: '', componentType: 'COUNTER' },
    ] })).toBe('Bancada + Rodabanca');
    expect(nomeProjeto({ components: [{ label: 'Balcão', componentType: 'COUNTER' }] })).toBe('Balcão');
  });
  it('resume listas longas e tem um nome neutro quando não há peças', () => {
    expect(nomeProjeto({ components: ['Tampo', 'Saia', 'Vista', 'Degrau'].map((label) => ({ label })) })).toBe('Tampo + Saia + Vista e outras');
    expect(nomeProjeto({ projectName: ' ', components: [] })).toBe('Projeto');
  });
});
