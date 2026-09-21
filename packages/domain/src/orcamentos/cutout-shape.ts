/** Shared by the piece editor, technical drawing and production PDF. */
export function formatoRecorte(type: string): 'ellipse' | 'rectangle' {
  return ['OVAL_SINK', 'FAUCET_HOLE', 'GENERIC_HOLE'].includes(type) ? 'ellipse' : 'rectangle';
}
