import { describe, expect, it } from 'vitest';
import { servicoDeRecorte } from './service-groups';

describe('Separação de serviços de recortes e cubas', () => {
  it.each([
    ['Corte para Fogão', 'Recortes / Furações'], ['Furo de Cuba', 'Recortes / Furações'],
    ['Friso', 'Recortes / Furações'], ['Furação de torneira', 'Serviços'],
    ['Corte de cuba oval', 'Recortes / Furações'], ['Recorte de cuba', 'Cubas / Itens'],
    ['Corte para Porcelanato', 'Serviços'], ['Ajuste especial', 'Recortes / Furações'],
  ])('mantém %s em recortes e cubas', (name, category) => expect(servicoDeRecorte({ name, category })).toBe(true));
  it.each(['Acabamento Polimento', 'Acabamento Jateado', 'Saia', 'Acabamento 45°', 'Entrega', 'Instalação'])('mantém %s fora dos recortes e cubas', (name) => expect(servicoDeRecorte({ name, category: 'Acabamentos' })).toBe(false));
  it.each(['Cuba Tramontina 40 x 34', 'Cuba Grande 56 x 34', 'Cuba Média 47 x 30', 'Cuba Esculpido', 'Cuba Oval Grande — Louça', 'Cuba Oval Pequena — Louça', 'Cuba de embutir', 'Tanque'])('oferece %s em valores e serviços, mesmo com categoria antiga', name => {
    for (const category of ['Cubas / Itens', 'Recortes / Furações', 'Preço deste orçamento']) expect(servicoDeRecorte({ name, category })).toBe(false);
  });
});
