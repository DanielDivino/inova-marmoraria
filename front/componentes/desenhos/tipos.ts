import type { Diagnostic, Feature, TechnicalDocument } from '@inova/domain/technical';

export type Revisao = {
  id: string; number: number; status: 'IN_REVIEW' | 'APPROVED' | 'RETURNED' | 'RELEASED' | 'SUPERSEDED'; contentHash: string; createdAt: string;
  createdBy: { name: string }; document?: unknown;
  decisions: { decision: string; note?: string | null; decidedBy: { name: string }; decidedAt: string }[]; releases: { id: string; releasedAt: string }[];
};
export type RascunhoResposta = {
  design: { id: string; name: string; project: { id: string; name: string; job: { customer: { name: string; phone: string } } } };
  draft: { id: string; version: number; document: TechnicalDocument; updatedAt: string };
  diagnostics: Diagnostic[];
};
export type MaterialVisual = { id: string; name: string; category: string; imageUrl: string | null };

/** Desenho livre (dedo, caneta, mouse) ou manual (formas prontas e medidas digitadas). */
export type Modo = 'LIVRE' | 'MANUAL';
export type Ferramenta = 'SELECIONAR' | 'TEXTO' | 'COTA' | 'TRACO_PECA' | 'TRACO_RECORTE';
export type TipoBorda = 'SKIRT' | 'BACKSPLASH' | 'EDGE_FINISH';
export type TipoCorpo = 'SINK' | 'SCULPTED_SINK' | 'CUTOUT' | 'HOLE';
export type Selecao =
  | { tipo: 'peca'; id: string }
  | { tipo: 'recurso'; id: string }
  | { tipo: 'vertice'; pecaId: string; verticeId: string }
  | { tipo: 'texto'; id: string }
  | null;
/** Lado aberto para digitar a medida (toque no lado ou na cota). */
export type LadoEmEdicao = { pecaId: string; ladoId: string } | null;

export const ROTULO_RECURSO: Record<Feature['type'], string> = { SINK: 'Cuba', SCULPTED_SINK: 'Cuba esculpida', CUTOUT: 'Recorte / cooktop', HOLE: 'Furo', SKIRT: 'Saia', BACKSPLASH: 'Rodabanca', EDGE_FINISH: 'Acabamento de borda' };
export const ROTULO_PERFIL: Record<Feature['profile'], string> = { SIMPLE: 'Simples', MITER45: 'Meia-esquadria 45°', BEVEL: 'Chanfro', ROUND: 'Boleado' };
export const ROTULO_REVISAO: Record<Revisao['status'], string> = { IN_REVIEW: 'Em conferência', APPROVED: 'Aprovada', RETURNED: 'Devolvida', RELEASED: 'Liberada', SUPERSEDED: 'Substituída' };
export const RECURSOS_DE_BORDA: Feature['type'][] = ['SKIRT', 'BACKSPLASH', 'EDGE_FINISH'];
/** Tamanho padrão dos textos livres no desenho (mm), quando o texto não define o seu. */
export const FONTE_TEXTO_PADRAO_MM = 120;
