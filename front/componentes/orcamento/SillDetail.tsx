export function DetalhePeitoril({ measure, height, showEmpty = true }: { measure?: string; height?: string; showEmpty?: boolean }) {
  return <figure className="sill-detail"><figcaption>Detalhe do peitoril</figcaption><svg viewBox="0 0 210 112" role="img" aria-label="Detalhe do peitoril com medidas horizontal e vertical">
    <g fill="none" stroke="#6e5830" strokeWidth="1.5"><rect x="18" y="14" width="64" height="24" /><rect x="54" y="38" width="84" height="32" /></g>
    <g stroke="#8d816e" strokeWidth="1"><line x1="18" y1="84" x2="138" y2="84" /><line x1="18" y1="79" x2="18" y2="89" /><line x1="138" y1="79" x2="138" y2="89" /><line x1="94" y1="14" x2="94" y2="38" /><line x1="89" y1="14" x2="99" y2="14" /><line x1="89" y1="38" x2="99" y2="38" /></g>
    {(showEmpty || measure?.trim()) && <text x="78" y="103" textAnchor="middle" fill="#635948" fontSize="10">{measure?.trim() || '________'} cm</text>}
    {(showEmpty || height?.trim()) && <text x="104" y="29" fill="#635948" fontSize="10">{height?.trim() || '________'} cm</text>}
  </svg></figure>;
}
