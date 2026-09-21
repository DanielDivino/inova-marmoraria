'use client';
import { useParams } from 'next/navigation';
import EditorOrcamento from '../../../../componentes/orcamento/EditorOrcamento';
export default function PaginaEditarOrcamento() {
  const { id } = useParams<{ id: string }>();
  return <EditorOrcamento key={id} />;
}
