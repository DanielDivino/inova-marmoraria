'use client';

import { useParams, useSearchParams } from 'next/navigation';
import EditorTecnico from '../../../../../componentes/desenhos/EditorTecnico';
import { enderecoOrcamento, lerOrigem } from '../../../../../utilitarios/rotas';

export default function PaginaDesenhoTecnico() {
  const { designId } = useParams<{ id: string; designId: string }>();
  // Aberto pelo botão "Desenho técnico" do orçamento: o voltar leva a ele (e, dele, para onde foi aberto).
  const parametros = useSearchParams();
  const orcamento = parametros.get('orcamento');
  const voltar = orcamento ? { href: enderecoOrcamento(orcamento, lerOrigem(parametros)), rotulo: `Orçamento ${parametros.get('numero') ?? ''}`.trim() } : undefined;
  return <EditorTecnico designId={designId} voltar={voltar} />;
}
