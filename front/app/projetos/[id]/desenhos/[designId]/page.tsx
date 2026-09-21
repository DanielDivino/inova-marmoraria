'use client';

import { useParams } from 'next/navigation';
import EditorTecnico from '../../../../../componentes/desenhos/TechnicalEditor';

export default function PaginaDesenhoTecnico() {
  const { designId } = useParams<{ id: string; designId: string }>();
  return <EditorTecnico designId={designId} />;
}
