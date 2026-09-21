export type ManualM2Role = 'SUPER_ADMIN' | 'ADMIN';

export function podeUsarM2Manual(role: ManualM2Role, billedQuantity: number | undefined, justification: string | undefined) {
  return role === 'SUPER_ADMIN'
    && Number.isFinite(billedQuantity)
    && (billedQuantity ?? 0) > 0
    && Boolean(justification?.trim());
}
