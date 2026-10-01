import { planoDeProducao } from '@inova/domain';
import type { DraftItem } from '../componentes/orcamento/types';
import { criarId } from './id';

/**
 * "Duplicar projeto" (Orçamento Rápido): cópia fiel do projeto — pedra, peças, medidas, bordas,
 * recortes, serviços, valores aplicados, desenhos e plano de produção — com ids novos, para ajustar
 * só o que muda sem mexer no original. Os ids das peças, bordas e recortes também aparecem dentro
 * do drawingData (plano de produção); todos são trocados de uma vez pelo mapa antigo → novo.
 * Desenho técnico: cada projeto tem o seu. Com `desenho` (a cópia do desenho, feita por quem duplica),
 * a cópia do projeto fica ligada a ela, com o mesmo mapa de peças do original (a cópia do desenho tem
 * as mesmas peças); sem `desenho`, a cópia sai sem vínculo.
 */
export function duplicarProjeto(projeto: DraftItem, nome: string, novoId: () => string = criarId, desenho?: { designId: string; nome: string; versao: number }): DraftItem {
  const ids = new Map<string, string>();
  const trocar = (id?: string) => { if (id && !ids.has(id)) ids.set(id, novoId()); };
  for (const peca of projeto.components) { trocar(peca.id); peca.edges.forEach((borda) => trocar(borda.id)); }
  projeto.cutouts.forEach((recorte) => trocar(recorte.id));
  const plano = planoDeProducao(projeto.drawingData);
  plano?.pieces.forEach((peca) => trocar(peca.id));
  plano?.cutouts.forEach((recorte) => trocar(recorte.id));
  const copiar = (valor: unknown): unknown => {
    if (typeof valor === 'string') return ids.get(valor) ?? valor;
    if (Array.isArray(valor)) return valor.map(copiar);
    if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [ids.get(chave) ?? chave, copiar(item)]));
    return valor;
  };
  const copia = copiar(projeto) as DraftItem;
  const { desenhoTecnico: vinculo, ...drawingData } = copia.drawingData ?? {};
  const ligado = desenho && vinculo && typeof vinculo === 'object' ? { desenhoTecnico: { ...vinculo, ...desenho, aceitoEm: new Date().toISOString() } } : {};
  return { ...copia, id: novoId(), projectName: nome, drawingData: copia.drawingData ? { ...drawingData, ...ligado } : undefined };
}
