import { describe, expect, it, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { renderizarNotaEntregaGeralPdf, renderizarNotaEntregaPdf, type NotaEntregaGeralPdf, type NotaEntregaPdf } from './entrega.pdf.js';

const linha = (name: string, quantity: number) => ({ name, material: 'Branco Itaúnas', lengthMm: 450, widthMm: 40, quantity });
const quote = { number: 'SET-2026-18', customerNameSnapshot: 'Enza', customerPhoneSnapshot: '(92) 98117-2290', workAddressSnapshot: null };

async function textos(document: NotaEntregaPdf['document'] | NotaEntregaGeralPdf['document']) {
  const pdf = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
  const escrito = vi.spyOn(pdf, 'text');
  const fim = new Promise<void>((resolve) => { pdf.on('data', () => undefined); pdf.on('end', resolve); });
  const nota = { number: 'ENT-2026-18.1', createdAt: '2026-09-28T23:30:00Z', quote };
  if ('tipo' in document) renderizarNotaEntregaGeralPdf(pdf, { ...nota, document }); else renderizarNotaEntregaPdf(pdf, { ...nota, document });
  const paginas = pdf.bufferedPageRange().count;
  pdf.end(); await fim;
  return { paginas, textos: escrito.mock.calls.map(([texto]) => String(texto)) };
}

describe('Nota de entrega', () => {
  it('entrega final: dados em colunas, faixa de destaque, itens numerados, total, assinaturas e rodapé', async () => {
    const { paginas, textos: t } = await textos({ projectName: 'Moldura para nicho de banheiro', deliveredBefore: 0, delivered: [linha('Componente', 2), linha('Componente', 2)], remaining: [] });
    expect(paginas).toBe(1);
    for (const trecho of ['Enza', 'Moldura para nicho de banheiro', 'SET-2026-18', '28/09/2026', 'Não informado', 'Entrega final', ' — 4 peças nesta nota. Com ela, todas as peças do projeto foram entregues.',
      '01', '02', '0,45 × 0,04 m', 'Total de peças', '4', 'Cliente / recebedor', 'Responsável pela entrega', 'Inova Marmoraria · CNPJ 32.298.601/0001-19', 'ENT-2026-18.1 · Página 1 de 1']) expect(t).toContain(trecho);
    expect(t).not.toContain('Peças que ainda faltam entregar');
  });
  it('entrega parcial: lista o que falta e a declaração cita as peças pendentes', async () => {
    const { textos: t } = await textos({ projectName: 'Cozinha', deliveredBefore: 1, delivered: [linha('Bancada', 1)], remaining: [linha('Soleira', 3)] });
    for (const trecho of ['Entrega parcial', ' — 1 peça nesta nota, 1 peça já entregue antes. Ainda faltam 3 peças, listadas abaixo.', 'Peças que ainda faltam entregar', 'Soleira', 'Total que falta']) expect(t).toContain(trecho);
    expect(t.some((texto) => texto.includes('ciente das que ainda faltam entregar'))).toBe(true);
  });
  it('lista longa continua em outras folhas, com o cabeçalho da tabela e a página em cada rodapé', async () => {
    const { paginas, textos: t } = await textos({ projectName: 'Prédio', deliveredBefore: 0, delivered: Array.from({ length: 40 }, (_, i) => linha(`Degrau ${i + 1}`, 1)), remaining: [] });
    expect(paginas).toBeGreaterThan(1);
    expect(t).toContain('ENT-2026-18.1 · Continuação');
    expect(t.filter((texto) => texto === 'Conferido').length).toBeGreaterThanOrEqual(2);
    expect(t).toContain(`ENT-2026-18.1 · Página ${paginas} de ${paginas}`);
  });
  it('nota geral: todos os projetos, cada um com o entregue nesta nota, o já entregue e o que falta', async () => {
    const { textos: t } = await textos({ tipo: 'geral', projects: [
      { projectName: 'Cozinha', delivered: [linha('Bancada', 1)], deliveredBefore: [linha('Saia', 1)], remaining: [linha('Rodabanca', 2)] },
      { projectName: 'Peitoris', delivered: [], deliveredBefore: [], remaining: [linha('Peitoril', 6)] },
    ] });
    for (const trecho of ['NOTA DE ENTREGA GERAL E CONFERÊNCIA', '2 projetos', 'Entrega parcial', ' — 1 peça nesta nota, 1 peça já entregue antes. Ainda faltam 8 peças, listadas em cada projeto.',
      '01. Cozinha  —  1 peça nesta nota · 1 peça já entregue · faltam 2 peças', 'Entregues nesta nota', 'Já entregues antes', 'Ainda faltam entregar', '02. Peitoris  —  faltam 6 peças', 'Faltam']) expect(t).toContain(trecho);
    expect(t.some((texto) => texto.includes('ciente das que ainda faltam entregar'))).toBe(true);
  });
});
