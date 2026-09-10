import type { Metadata } from 'next';
import './globals.css';
import './components.css';
import './application.css';
import { ApplicationShell } from '../components/ApplicationShell';

export const metadata: Metadata = {
  title: 'Inova | Novo orçamento',
  description: 'Orçamentos rápidos para marmoraria'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><ApplicationShell>{children}</ApplicationShell></body></html>;
}
