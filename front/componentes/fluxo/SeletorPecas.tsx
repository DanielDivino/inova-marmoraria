'use client';

import './seletor-pecas.css';

/** Peça que dá para escolher: `max` é quantas unidades podem ser marcadas. */
export type OpcaoPeca = { key: string; name: string; detail?: string; max: number };
export type QuantidadesPecas = Record<string, number>;

export const somaQuantidades = (valores: QuantidadesPecas) => Object.values(valores).reduce((total, quantidade) => total + quantidade, 0);

/**
 * Lista de peças com quantas unidades de cada uma: caixa de marcar quando só há
 * uma, − n + quando há várias. "Todas" e "Nenhuma" preenchem de uma vez.
 */
export function SeletorPecas({ pecas, valores, aoMudar, rotulo }: { pecas: OpcaoPeca[]; valores: QuantidadesPecas; aoMudar: (valores: QuantidadesPecas) => void; rotulo: string }) {
  const definir = (peca: OpcaoPeca, quantidade: number) => aoMudar({ ...valores, [peca.key]: Math.max(0, Math.min(peca.max, quantidade)) });
  const escolhidas = somaQuantidades(valores);
  const total = pecas.reduce((soma, peca) => soma + peca.max, 0);
  return <div className="seletor-pecas">
    <div className="seletor-pecas-atalhos">
      <span>{escolhidas} de {total} {total === 1 ? 'peça' : 'peças'}</span>
      <button type="button" className="text-button" disabled={escolhidas === total} onClick={() => aoMudar(Object.fromEntries(pecas.map((peca) => [peca.key, peca.max])))}>Todas</button>
      <button type="button" className="text-button" disabled={!escolhidas} onClick={() => aoMudar(Object.fromEntries(pecas.map((peca) => [peca.key, 0])))}>Nenhuma</button>
    </div>
    <ul aria-label={rotulo}>
      {pecas.map((peca) => {
        const valor = valores[peca.key] ?? 0;
        return <li key={peca.key} className={valor ? 'marcada' : undefined}>
          {peca.max === 1
            ? <label className="seletor-pecas-nome"><input type="checkbox" checked={valor === 1} onChange={(event) => definir(peca, event.target.checked ? 1 : 0)} /><span><strong>{peca.name}</strong>{peca.detail && <small>{peca.detail}</small>}</span></label>
            : <>
              <span className="seletor-pecas-nome"><span><strong>{peca.name}</strong>{peca.detail && <small>{peca.detail}</small>}</span></span>
              <span className="seletor-pecas-quantidade" role="group" aria-label={`Quantidade de ${peca.name}`}>
                <button type="button" aria-label={`Uma a menos de ${peca.name}`} disabled={valor <= 0} onClick={() => definir(peca, valor - 1)}>−</button>
                <output aria-live="polite">{valor}</output>
                <small>de {peca.max}</small>
                <button type="button" aria-label={`Uma a mais de ${peca.name}`} disabled={valor >= peca.max} onClick={() => definir(peca, valor + 1)}>+</button>
              </span>
            </>}
        </li>;
      })}
    </ul>
  </div>;
}
