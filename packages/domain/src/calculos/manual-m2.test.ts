import { describe, expect, it } from 'vitest';
import { podeUsarM2Manual } from './manual-m2';

describe('modo manual de m²', () => {
  it('permite somente Super Admin com justificativa', () => {
    expect(podeUsarM2Manual('SUPER_ADMIN', 1.25, 'Peça sem medida disponível')).toBe(true);
  });

  it('bloqueia administrador comum e justificativa ausente', () => {
    expect(podeUsarM2Manual('ADMIN', 1.25, 'Peça sem medida disponível')).toBe(false);
    expect(podeUsarM2Manual('SUPER_ADMIN', 1.25, '')).toBe(false);
  });
});
