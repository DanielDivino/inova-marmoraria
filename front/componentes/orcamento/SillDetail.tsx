export function DetalhePeitoril({ measure, height, showEmpty = true }: { measure?: string; height?: string; showEmpty?: boolean }) {
  return <figure className="sill-detail"><figcaption>Detalhe do peitoril</figcaption><svg viewBox="0 0 210 112" role="img" aria-label="Detalhe do peitoril com medidas horizontal e vertical">
    <g fill="none" stroke="#6e5830" strokeWidth="1.5"><rect x="18" y="14" width="64" height="24" /><rect x="54" y="38" width="84" height="32" /></g>
    <g stroke="#8d816e" strokeWidth="1"><line x1="18" y1="84" x2="138" y2="84" /><line x1="18" y1="79" x2="18" y2="89" /><line x1="138" y1="79" x2="138" y2="89" /><line x1="94" y1="14" x2="94" y2="38" /><line x1="89" y1="14" x2="99" y2="14" /><line x1="89" y1="38" x2="99" y2="38" /></g>
    {(showEmpty || measure?.trim()) && <text x="78" y="103" textAnchor="middle" fill="#635948" fontSize="10">{measure?.trim() || '________'} cm</text>}
    {(showEmpty || height?.trim()) && <text x="104" y="29" fill="#635948" fontSize="10">{height?.trim() || '________'} cm</text>}
  </svg></figure>;
}

/** Peitoril de duas pedras sobrepostas (Orçamento Rápido) — desenho esquemático
 * fixo (não escalado pelos valores reais, só os textos mudam), vista em corte. */
export function DetalhePeitorilDuplo({ topLength, topWidth, bottomLength, bottomWidth, finalWidth, overlap, showEmpty = true }: {
  topLength?: string; topWidth?: string; bottomLength?: string; bottomWidth?: string; finalWidth?: string; overlap?: string; showEmpty?: boolean;
}) {
  const rotulo = (value?: string) => value?.trim() || '________';
  const mostrar = (value?: string) => showEmpty || value?.trim();
  return <figure className="sill-detail sill-detail-duplo">
    <figcaption>Detalhe do peitoril — duas pedras sobrepostas</figcaption>
    <svg viewBox="0 0 360 176" role="img" aria-label="Detalhe do peitoril com as medidas das duas pedras, a sobreposição e a largura final">
      <g fill="#fffaf0" stroke="#6e5830" strokeWidth="1.5"><rect x="30" y="82" width="190" height="46" /></g>
      <g fill="#fff" stroke="#6e5830" strokeWidth="1.5"><rect x="50" y="40" width="140" height="46" /></g>
      <rect x="50" y="82" width="140" height="4" fill="#c9973b" opacity="0.6" />
      <g stroke="#8d816e" strokeWidth="1">
        <line x1="50" y1="30" x2="190" y2="30" /><line x1="50" y1="25" x2="50" y2="35" /><line x1="190" y1="25" x2="190" y2="35" />
        <line x1="30" y1="140" x2="220" y2="140" /><line x1="30" y1="135" x2="30" y2="145" /><line x1="220" y1="135" x2="220" y2="145" />
        <line x1="40" y1="40" x2="40" y2="86" /><line x1="35" y1="40" x2="45" y2="40" /><line x1="35" y1="86" x2="45" y2="86" />
        <line x1="234" y1="82" x2="234" y2="128" /><line x1="229" y1="82" x2="239" y2="82" /><line x1="229" y1="128" x2="239" y2="128" />
        <line x1="262" y1="40" x2="262" y2="128" /><line x1="257" y1="40" x2="267" y2="40" /><line x1="257" y1="128" x2="267" y2="128" />
      </g>
      {mostrar(topLength) && <text x="120" y="22" textAnchor="middle" fill="#635948" fontSize="9">Comp. cima {rotulo(topLength)} cm</text>}
      {mostrar(bottomLength) && <text x="125" y="153" textAnchor="middle" fill="#635948" fontSize="9">Comp. baixo {rotulo(bottomLength)} cm</text>}
      {mostrar(topWidth) && <text x="4" y="64" fill="#635948" fontSize="9">Larg.{' '}cima{' '}{rotulo(topWidth)}{' '}cm</text>}
      {mostrar(bottomWidth) && <text x="238" y="107" fill="#635948" fontSize="9">Larg. baixo {rotulo(bottomWidth)} cm</text>}
      {mostrar(overlap) && <text x="118" y="94" textAnchor="middle" fill="#7c531e" fontSize="9" fontWeight="700">Sobrep. {rotulo(overlap)} cm</text>}
      {mostrar(finalWidth) && <text x="266" y="84" fill="#635948" fontSize="9">Larg.{' '}final{' '}{rotulo(finalWidth)}{' '}cm</text>}
    </svg>
  </figure>;
}
