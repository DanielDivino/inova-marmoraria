import { describe, expect, it } from 'vitest';
import { compararPorPrazo, historySchema } from './quote.tracking.js';

const quote = (id: string, installation: string | null, delivery: string | null, createdAt: string) => ({
  id, installationDeadline: installation ? new Date(`${installation}T00:00:00Z`) : null, deliveryDeadline: delivery ? new Date(`${delivery}T00:00:00Z`) : null, createdAt: new Date(createdAt),
});

describe('Ordem da lista por prazo', () => {
  it('usa a montagem ou, sem ela, a data acordada; sem prazo vai para o fim e o empate fica com o mais recente', () => {
    const lista = [
      quote('sem-prazo', null, null, '2026-09-20T10:00:00Z'),
      quote('entrega-dia-5', null, '2026-10-05', '2026-09-01T10:00:00Z'),
      quote('montagem-dia-3', '2026-10-03', '2026-10-20', '2026-09-02T10:00:00Z'),
      quote('entrega-dia-5-novo', null, '2026-10-05', '2026-09-10T10:00:00Z'),
    ];
    expect([...lista].sort(compararPorPrazo).map((entrada) => entrada.id)).toEqual(['montagem-dia-3', 'entrega-dia-5-novo', 'entrega-dia-5', 'sem-prazo']);
  });
});

describe('Filtro de situação da lista', () => {
  it('aceita várias situações separadas por vírgula ("Aguardando entrega / montagem")', () => {
    expect(historySchema.parse({ workStatus: 'DELIVERY_PENDING,INSTALLATION_PENDING' }).workStatus).toEqual(['DELIVERY_PENDING', 'INSTALLATION_PENDING']);
    expect(historySchema.parse({ workStatus: 'READY' }).workStatus).toEqual(['READY']);
    expect(historySchema.parse({}).workStatus).toBeUndefined();
    expect(() => historySchema.parse({ workStatus: 'READY,QUALQUER' })).toThrow();
  });
});
