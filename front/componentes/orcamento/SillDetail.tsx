export function DetalhePeitoril({ measure, height, showEmpty = true }: { measure?: string; height?: string; showEmpty?: boolean }) {
  return <figure className="sill-detail"><figcaption>Detalhe do peitoril</figcaption><svg viewBox="0 0 210 112" role="img" aria-label="Detalhe do peitoril com medidas horizontal e vertical">
    <g fill="none" stroke="#6e5830" strokeWidth="1.5"><rect x="18" y="14" width="64" height="24" /><rect x="54" y="38" width="84" height="32" /></g>
    <g stroke="#8d816e" strokeWidth="1"><line x1="18" y1="84" x2="138" y2="84" /><line x1="18" y1="79" x2="18" y2="89" /><line x1="138" y1="79" x2="138" y2="89" /><line x1="94" y1="14" x2="94" y2="38" /><line x1="89" y1="14" x2="99" y2="14" /><line x1="89" y1="38" x2="99" y2="38" /></g>
    {(showEmpty || measure?.trim()) && <text x="78" y="103" textAnchor="middle" fill="#635948" fontSize="10">{measure?.trim() || '________'} cm</text>}
    {(showEmpty || height?.trim()) && <text x="104" y="29" fill="#635948" fontSize="10">{height?.trim() || '________'} cm</text>}
  </svg></figure>;
}

/** Peitoril de duas pedras sobrepostas (Orçamento Rápido) — desenho esquemático
 * fixo (não escalado pelos valores reais, só os textos mudam), em degrau: pedra
 * de cima à esquerda, pedra de baixo à direita, sobrepostas no meio. O
 * comprimento é o normal do componente (compartilhado pelas duas peças) — este
 * desenho mostra só a largura, que é onde a peça se divide em duas. */
export function DetalhePeitorilDuplo({ topWidth, bottomWidth, finalWidth, overlap, showEmpty = true }: {
  topWidth?: string; bottomWidth?: string; finalWidth?: string; overlap?: string; showEmpty?: boolean;
}) {
  const rotulo = (value?: string) => value?.trim() || '________';
  const mostrar = (value?: string) => showEmpty || value?.trim();
  return <figure className="sill-detail sill-detail-duplo">
    <figcaption>Detalhe do peitoril — duas pedras sobrepostas</figcaption>
    <svg viewBox="0 0 340 200" role="img" aria-label="Detalhe do peitoril com a largura das duas pedras, a sobreposição e a largura final">
      <g fill="#fff" stroke="#6e5830" strokeWidth="1.5"><rect x="40" y="40" width="150" height="50" /></g>
      <g fill="#e7ebe0" stroke="#6e5830" strokeWidth="1.5"><rect x="110" y="90" width="190" height="55" /></g>
      <g stroke="#8d816e" strokeWidth="1">
        <line x1="40" y1="30" x2="190" y2="30" /><line x1="40" y1="25" x2="40" y2="35" /><line x1="190" y1="25" x2="190" y2="35" />
        <line x1="110" y1="155" x2="300" y2="155" /><line x1="110" y1="150" x2="110" y2="160" /><line x1="300" y1="150" x2="300" y2="160" />
        <line x1="40" y1="180" x2="300" y2="180" /><line x1="40" y1="175" x2="40" y2="185" /><line x1="300" y1="175" x2="300" y2="185" />
      </g>
      {mostrar(topWidth) && <text x="115" y="22" textAnchor="middle" fill="#635948" fontSize="10">{rotulo(topWidth)} cm</text>}
      {mostrar(overlap) && <text x="115" y="107" fill="#7c531e" fontSize="9" fontWeight="700">{rotulo(overlap)} cm</text>}
      {mostrar(bottomWidth) && <text x="205" y="149" textAnchor="middle" fill="#635948" fontSize="10">{rotulo(bottomWidth)} cm</text>}
      {mostrar(finalWidth) && <text x="170" y="195" textAnchor="middle" fill="#635948" fontSize="10">{rotulo(finalWidth)} cm total</text>}
    </svg>
  </figure>;
}
