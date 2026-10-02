'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { edgeLength, formatMeasure, type Piece, type Feature } from '@inova/domain/technical';
import { Icone, ModalFiltros } from '../filtros/Filtros';
import { ROTULO_PERFIL, ROTULO_RECURSO, type TipoNoLado } from './tipos';
import { CampoMedida } from './CampoMedida';

/** Desenhos de traço de cada opção do lado (rodabanca, saia, emenda e os perfis de acabamento). */
const DESENHOS: Record<string, ReactNode> = {
  BACKSPLASH: <><path d="M3 9.5h18" /><path d="M3 14.5h18" /></>,
  SKIRT: <><path d="M6 18 12 6" /><path d="M12 18l6-12" /></>,
  SEAM: <path d="M3 12h4m3.5 0h3M17 12h4" />,
  SIMPLE: <path d="M3 12h18" />,
  MITER45: <><path d="M5 4v15h15" /><path d="M9 4v11h11" /></>,
  BEVEL: <path d="M4 19 19 5v14Z" />,
  ROUND: <path d="M5 19v-5a9 9 0 0 1 9-9h5" />,
};
function IconeLado({ tipo }: { tipo: string }) {
  return <svg className="tec-icone-lado" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{DESENHOS[tipo]}</svg>;
}
function Cadeado({ fechado }: { fechado: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" fill={fechado ? 'currentColor' : 'none'} /><path d={fechado ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.6-1.8'} />
  </svg>;
}

/**
 * Lado da peça, aberto pelo "+" do lado ou ao tocar no lado ou na cota. À esquerda, o que dá para
 * pôr no lado (rodabanca, saia, emenda e acabamentos; o que já está nele fica em verde); à direita,
 * o que já foi aplicado, um cartão por item, que recolhe; embaixo, a medida do lado (os vizinhos se
 * ajustam), o texto no lugar da medida ("medir no local") e a trava.
 */
export function EditorLado({ peca, ladoId, aoFechar, aoMudarMedida, aoMudarTexto, aoAlternarTrava, aoAdicionar, recursos, aoMudarRecurso, aoExcluirRecurso }: {
  recursos: Feature[]; aoMudarRecurso: (id: string, patch: Partial<Feature>) => void; aoExcluirRecurso: (id: string) => void;
  aoAdicionar: (tipo: TipoNoLado, perfil?: Feature['profile']) => void;
  peca: Piece | null; ladoId: string | null; aoFechar: () => void;
  /** Devolve o motivo quando a medida não pode ser aplicada. */
  aoMudarMedida: (mm: number) => string | null;
  aoMudarTexto: (texto: string) => void; aoAlternarTrava: () => void;
}) {
  const [erro, setErro] = useState('');
  const [texto, setTexto] = useState('');
  // Cartões recolhidos: ao abrir o lado, todos abertos; ao adicionar um item, só ele fica aberto.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const vistos = useRef<string[]>([]);
  const indice = peca && ladoId ? peca.contour.findIndex((vertice) => vertice.id === ladoId) : -1;
  useEffect(() => {
    setErro(''); setTexto(peca && ladoId ? peca.dimensionLabels[ladoId] ?? '' : '');
    setRecolhidos(new Set()); vistos.current = recursos.map((recurso) => recurso.id);
  }, [peca?.id, ladoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ids = recursos.map((recurso) => recurso.id);
    const anteriores = vistos.current;
    if (anteriores.length && ids.some((id) => !anteriores.includes(id))) setRecolhidos(new Set(anteriores));
    vistos.current = ids;
  }, [recursos]);
  const aberto = !!peca && indice >= 0;
  const travado = !!peca && !!ladoId && peca.lockedEdges.includes(ladoId);
  const curvo = aberto && Math.abs(peca!.contour[indice].bulge) > 1e-6;
  const aplicado = (tipo: TipoNoLado, perfil?: Feature['profile']) => recursos.some((recurso) => perfil ? recurso.type === 'EDGE_FINISH' && recurso.profile === perfil : recurso.type === tipo);
  const alternar = (id: string) => setRecolhidos((atual) => { const proximo = new Set(atual); if (proximo.has(id)) proximo.delete(id); else proximo.add(id); return proximo; });
  const opcao = (chave: string, rotulo: string, tipo: TipoNoLado, perfil?: Feature['profile']) => {
    const ja = aplicado(tipo, perfil);
    return <button type="button" key={chave} className={`tec-opcao-lado${chave === 'MITER45' ? ' larga' : ''}${ja ? ' aplicado' : ''}`} title={ja ? 'Já aplicado neste lado (toque para adicionar outro)' : undefined}
      onClick={() => aoAdicionar(tipo, perfil)}><IconeLado tipo={chave} />{rotulo}</button>;
  };
  return <ModalFiltros aberto={aberto} aoFechar={aoFechar} titulo={aberto ? `Lado ${indice + 1} · ${peca!.name}` : 'Lado'} rotuloFechar="Fechar" className="tec-janela tec-janela-lado" largura="grande"
    rodape={<button type="button" className="botao-destaque" onClick={aoFechar}>Pronto</button>}>
    {aberto && <>
      <div className="tec-lado-colunas">
        <fieldset disabled={peca!.locked} className="tec-opcoes-lado"><legend>Adicionar neste lado</legend>
          {(['BACKSPLASH', 'SKIRT', 'SEAM'] as const).map((tipo) => opcao(tipo, ROTULO_RECURSO[tipo], tipo))}
          {(Object.entries(ROTULO_PERFIL) as [Feature['profile'], string][]).map(([perfil, nome]) => opcao(perfil, `Acabamento · ${nome}`, 'EDGE_FINISH', perfil))}
        </fieldset>
        <section className="tec-aplicados-lado" aria-label="Aplicado neste lado">
          <h3>Aplicado neste lado</h3>
          {!recursos.length && <p className="tec-dica tec-aplicados-vazio">Nada aplicado ainda. Escolha uma opção ao lado para adicionar.</p>}
          {recursos.map((recurso) => {
            const tamanho = edgeLength(peca!, ladoId!);
            const nome = recurso.name || ROTULO_RECURSO[recurso.type];
            const titulo = `${nome}${recurso.type === 'EDGE_FINISH' ? ` · ${ROTULO_PERFIL[recurso.profile]}` : ''}`;
            const expandido = !recolhidos.has(recurso.id);
            const medida = (rotulo: string, campo: 'startMm' | 'extentMm' | 'heightMm' | 'thicknessMm', minimo: number, maximo: number) => <MedidaDoRecurso key={campo} rotulo={rotulo} nome={recurso.name} valor={recurso[campo]} minimo={minimo} maximo={maximo} aoMudar={(valor) => aoMudarRecurso(recurso.id, { [campo]: valor })} />;
            return <section key={recurso.id} className={`tec-recurso-do-lado${expandido ? ' aberto' : ''}`}>
              <button type="button" className="tec-recurso-cabeca" aria-expanded={expandido} aria-controls={`recurso-${recurso.id}`} onClick={() => alternar(recurso.id)}>
                <IconeLado tipo={recurso.type === 'EDGE_FINISH' ? recurso.profile : recurso.type} /><strong>{titulo}</strong>
                <svg className="tec-recurso-seta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
              </button>
              {expandido && <fieldset id={`recurso-${recurso.id}`} disabled={peca!.locked} className="tec-recurso-campos" aria-label={titulo}>
                <div className="tec-recurso-medidas">
                  {recurso.type === 'SEAM'
                    ? medida('Posição da emenda', 'startMm', 1, tamanho - 1)
                    : <>
                      {medida('Comprimento', 'extentMm', 1, tamanho - recurso.startMm)}
                      {recurso.type === 'EDGE_FINISH'
                        ? medida('Largura', 'thicknessMm', 1, 1000)
                        : medida('Largura', 'heightMm', 1, 10000)}
                    </>}
                </div>
                <div className="tec-recurso-perfil">
                  <button type="button" className="tec-remover-recurso" aria-label={`Remover ${nome}`} onClick={() => aoExcluirRecurso(recurso.id)}><Icone nome="lixeira" tamanho={16} />Remover</button>
                </div>
              </fieldset>}
            </section>;
          })}
        </section>
      </div>
      <div className="tec-lado-base">
        {curvo ? <p className="tec-aviso">Lado curvo: ajuste a curvatura no vértice ou as medidas da forma.</p>
          : <CampoMedida rotulo="Medida do lado" valorMm={edgeLength(peca!, ladoId!)} autoFocus onChange={(mm) => { const motivo = aoMudarMedida(mm); setErro(motivo ?? ''); return !motivo; }} />}
        <label className="tec-campo">Texto no lugar da medida
          <input type="text" maxLength={120} placeholder="ex.: medir no local, encosto na parede" value={texto}
            onChange={(evento) => setTexto(evento.target.value)} onBlur={() => aoMudarTexto(texto)} onKeyDown={(evento) => { if (evento.key === 'Enter') (evento.target as HTMLInputElement).blur(); }} />
        </label>
        <button type="button" className={`tec-trava${travado ? ' ativo' : ''}`} aria-pressed={travado} onClick={aoAlternarTrava}><Cadeado fechado={travado} />{travado ? 'Lado travado' : 'Travar este lado'}</button>
      </div>
      {erro && <p role="alert" className="form-error">{erro}</p>}
      <p className="tec-dica tec-dica-lado"><Icone nome="info" tamanho={14} />Ao alterar a medida, o final do lado se desloca na mesma direção e os lados adjacentes são ajustados. Lados travados não são alterados.</p>
    </>}
  </ModalFiltros>;
}

/** Ajuste de 1 cm por toque, com entrada direta para medidas precisas. */
function MedidaDoRecurso({ rotulo, nome, valor, minimo, maximo, aoMudar }: {
  rotulo: string; nome: string; valor: number; minimo: number; maximo: number; aoMudar: (valor: number) => void;
}) {
  const [erro, setErro] = useState('');
  useEffect(() => setErro(''), [valor, maximo]);
  const aplicar = (proximo: number) => {
    if (proximo < minimo || proximo > maximo) { setErro(`Use uma medida entre ${formatMeasure(minimo)} e ${formatMeasure(maximo)}.`); return false; }
    setErro(''); aoMudar(proximo); return true;
  };
  // O − e o + ficam dentro do campo, à direita: o rótulo usa a largura toda.
  return <div className="tec-ajuste-recurso">
    <div className="tec-ajuste-linha">
      <CampoMedida rotulo={rotulo} valorMm={valor} minimo={minimo} onChange={aplicar} />
      <div className="tec-ajuste-botoes">
        <button type="button" aria-label={`Diminuir ${rotulo.toLowerCase()} de ${nome}`} disabled={valor <= minimo} onClick={() => aplicar(Math.max(minimo, valor - 10))}>−</button>
        <button type="button" aria-label={`Aumentar ${rotulo.toLowerCase()} de ${nome}`} disabled={valor >= maximo} onClick={() => aplicar(Math.min(maximo, valor + 10))}>+</button>
      </div>
    </div>
    {erro && <small className="form-error" role="alert">{erro}</small>}
  </div>;
}
