'use client';
import { useParams } from 'next/navigation';
import QuoteBuilder from '../../../page';
export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  return <QuoteBuilder key={id} />;
}
