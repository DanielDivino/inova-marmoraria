'use client';

import { servicoSugerido, type CatalogoEstimativa, type EstimativaDesenho, type LinhaEstimativa, type OpcoesEstimativa, type TechnicalDocument } from '@inova/domain/technical';
import { formatarMoeda } from '../../utilitarios/formatadores';

const numero = (valor: number, casas = 2) => valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const quantidade = (linha: LinhaEstimativa) => `${numero(linha.quantidade, linha.unidade === 'm²' ? 3 : 2)} ${linha.unidade}`;

/** Total da estimativa em uma linha (barra do rodapé no celular e cabeçalho do painel). */
export function ResumoEstimativa({ estimativa, aberto, aoAlternar }: { estimativa: EstimativaDesenho | null; aberto: boolean; aoAlternar: () => void }) {
  return <button type="button" className="tec-resumo-estimativa" aria-expanded={aberto} onClick={aoAlternar}>
    <span>Estimativa</span>
    <strong>{estimativa ? formatarMoeda(estimativa.total) : '…'}</strong>
    {estimativa && estimativa.itensSemPreco > 0 && <small>{estimativa.itensSemPreco} sem preço</small>}
    <i aria-hidden="true">{aberto ? '▾' : '▴'}</i>
  </button>;
}

/**
 * Valor pelo desenho, com as regras do orçamento (domínio `estimarDesenho`,
 * sobre o mesmo projeto que vai para o orçamento). Linhas por peça e serviço,
 * "sem preço" quando falta e o total à vista (Pix) e no cartão. Aberto do Novo
 * orçamento, é esse o valor que vai para o resumo ao usar o desenho.
 */
export function PainelEstimativa({ documento, catalogo, estimativa, opcoes, erro, aoMudarOpcoes, m2Fechado = false, noOrcamento = false }: {
  documento: TechnicalDocument; catalogo: CatalogoEstimativa | null; estimativa: EstimativaDesenho | null; opcoes: OpcoesEstimativa; erro: string;
  aoMudarOpcoes: (opcoes: OpcoesEstimativa) => void; m2Fechado?: boolean; noOrcamento?: boolean;
}) {
  if (erro) return <section className="tec-estimativa"><p className="tec-aviso">{erro}</p></section>;
  if (!catalogo || !estimativa) return <section className="tec-estimativa"><p className="tec-dica">Calculando a estimativa…</p></section>;
  const servicoDoRecurso = opcoes.servicoDoRecurso ?? {};
  const gerais = opcoes.servicosGerais ?? [];
  const escolherServico = (recursoId: string, serviceId: string) => aoMudarOpcoes({ ...opcoes, servicoDoRecurso: { ...servicoDoRecurso, [recursoId]: serviceId } });
  const seletor = (linha: LinhaEstimativa) => {
    const recurso = documento.features.find((entrada) => entrada.id === linha.id);
    if (!recurso || recurso.type === 'SKIRT' || recurso.type === 'BACKSPLASH') return null;
    const deBorda = recurso.type === 'EDGE_FINISH';
    const opcoesServico = catalogo.services.filter((servico) => deBorda ? servico.billingUnit === 'LINEAR_METER' : servico.billingUnit !== 'LINEAR_METER');
    const atual = servicoDoRecurso[recurso.id] ?? servicoSugerido(recurso, catalogo.services)?.id ?? '';
    return <select aria-label={`Serviço de ${recurso.name}`} value={atual} onChange={(evento) => escolherServico(recurso.id, evento.target.value)}>
      {!atual && <option value="">Escolha o serviço</option>}
      {opcoesServico.map((servico) => <option key={servico.id} value={servico.id}>{servico.name} · {formatarMoeda(servico.currentPrice)}</option>)}
    </select>;
  };
  const linhaHtml = (linha: LinhaEstimativa) => <li key={linha.id} className={linha.subtotal === null ? 'sem-preco' : undefined}>
    <div><span>{linha.descricao}</span><small>{quantidade(linha)}{linha.precoUnitario !== null ? ` × ${formatarMoeda(linha.precoUnitario)}` : ''}</small>{linha.detalhe && <small className="tec-detalhe">{linha.detalhe}</small>}{seletor(linha)}</div>
    <strong>{linha.subtotal === null ? 'sem preço' : formatarMoeda(linha.subtotal)}</strong>
    {linha.semPreco && <small className="tec-motivo">{linha.semPreco}</small>}
  </li>;
  const porPeca = documento.pieces.map((peca) => ({ peca, linhas: estimativa.linhas.filter((linha) => linha.pieceId === peca.id) }));
  const linhasGerais = estimativa.linhas.filter((linha) => !linha.pieceId);

  return <section className="tec-estimativa" aria-label="Estimativa de valor">
    <p className="tec-dica">{noOrcamento ? 'Valor com as regras do orçamento. Vai para o resumo quando você usar o desenho no orçamento.' : 'Estimativa com as regras do orçamento. Não muda o valor de nenhum orçamento.'}{m2Fechado ? ' Pedra com M² fechado (medidas arredondadas de 5 em 5 cm).' : ''}</p>
    <p className="tec-area-total">Área total <strong>{numero(estimativa.areaTotalM2, 3)} m²</strong>{estimativa.areaCobradaM2 !== estimativa.areaTotalM2 && <> · cobrada <strong>{numero(estimativa.areaCobradaM2, 3)} m²</strong> (M² fechado)</>}</p>
    {porPeca.map(({ peca, linhas }) => <div key={peca.id} className="tec-estimativa-grupo"><h4>{peca.name}</h4><ul>{linhas.map(linhaHtml)}</ul></div>)}
    <div className="tec-estimativa-grupo">
      <h4>Serviços do projeto</h4>
      {linhasGerais.length > 0 && <ul>{linhasGerais.map((linha) => {
        // Um serviço por projeto, como no orçamento: a linha é do serviço (geral-<id>).
        const serviceId = linha.id.slice('geral-'.length);
        const servico = catalogo.services.find((entrada) => entrada.id === serviceId);
        const quantidadeAtual = estimativa.item.servicos.find((entrada) => entrada.serviceId === serviceId)?.quantidade ?? 1;
        return <li key={linha.id} className={linha.subtotal === null ? 'sem-preco' : undefined}>
          <div><span>{linha.descricao}</span><small>{quantidade(linha)}</small>
            {servico?.billingUnit === 'UNIT' && <input type="number" min="1" inputMode="numeric" aria-label={`Quantidade de ${linha.descricao}`} value={quantidadeAtual}
              onChange={(evento) => aoMudarOpcoes({ ...opcoes, servicosGerais: [...gerais.filter((geral) => geral.serviceId !== serviceId), { serviceId, quantidade: Math.max(1, Number(evento.target.value) || 1) }] })} />}
          </div>
          <strong>{linha.subtotal === null ? 'sem preço' : formatarMoeda(linha.subtotal)}</strong>
          <button type="button" className="text-button" aria-label={`Tirar ${linha.descricao}`} onClick={() => aoMudarOpcoes({ ...opcoes, servicosGerais: gerais.filter((geral) => geral.serviceId !== serviceId) })}>tirar</button>
        </li>;
      })}</ul>}
      <select aria-label="Adicionar serviço do projeto" value="" onChange={(evento) => { if (evento.target.value) aoMudarOpcoes({ ...opcoes, servicosGerais: [...gerais, { serviceId: evento.target.value, quantidade: 1 }] }); }}>
        <option value="">+ Serviço (jateado, instalação…)</option>
        {servicosDoProjeto(catalogo).filter((servico) => !gerais.some((geral) => geral.serviceId === servico.id)).map((servico) => <option key={servico.id} value={servico.id}>{servico.name} · {formatarMoeda(servico.currentPrice)}</option>)}
      </select>
    </div>
    {estimativa.itensSemPreco > 0 && <p className="tec-aviso">{estimativa.itensSemPreco === 1 ? '1 item sem preço não entra' : `${estimativa.itensSemPreco} itens sem preço não entram`} no total.</p>}
    <dl className="tec-totais">
      <div><dt>Total no Pix (à vista)</dt><dd>{formatarMoeda(estimativa.totalPix)}</dd></div>
      <div><dt>No cartão (+10%)</dt><dd>{formatarMoeda(estimativa.totalCartao)}</dd></div>
    </dl>
  </section>;
}

/** Serviços que fazem sentido para o projeto inteiro (os de borda por metro linear ficam nas peças). */
const servicosDoProjeto = (catalogo: CatalogoEstimativa) => catalogo.services.filter((servico) => servico.billingUnit !== 'LINEAR_METER');
