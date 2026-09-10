import { describe, expect, it } from 'vitest';
import { canUseManualM2 } from './manual-m2';

describe('modo manual de m²', () => {
  it('permite somente Super Admin com justificativa', () => {
    expect(canUseManualM2('SUPER_ADMIN', 1.25, 'Peça sem medida disponível')).toBe(true);
  });

  it('bloqueia administrador comum e justificativa ausente', () => {
    expect(canUseManualM2('ADMIN', 1.25, 'Peça sem medida disponível')).toBe(false);
    expect(canUseManualM2('SUPER_ADMIN', 1.25, '')).toBe(false);
  });
});
