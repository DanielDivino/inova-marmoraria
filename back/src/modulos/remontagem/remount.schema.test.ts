import { describe, expect, it } from 'vitest';
import { remountSchema } from './remount.schema.js';

describe('valores monetários de remontagem', () => {
  it('arredonda montagem, desmontagem e cartão no servidor antes de calcular', () => {
    const parsed = remountSchema.parse({ expectedVersion: 0, items: [], assembly: 1.005, disassembly: 2.005, cardOverride: 3.005 });
    expect(parsed).toMatchObject({ assembly: 1.01, disassembly: 2.01, cardOverride: 3.01 });
  });

  it('mantém validação para desconto Pix permitido e dinheiro negativo', () => {
    expect(remountSchema.safeParse({ expectedVersion: 0, items: [], pixPercent: 25 }).success).toBe(true);
    expect(remountSchema.safeParse({ expectedVersion: 0, items: [], pixPercent: 7 }).success).toBe(false);
    expect(remountSchema.safeParse({ expectedVersion: 0, items: [], assembly: -1 }).success).toBe(false);
  });
});
