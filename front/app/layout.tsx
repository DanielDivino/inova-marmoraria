import type { Metadata, Viewport } from 'next';
import './globals.css';
import './components.css';
import './application.css';
import './stone-theme.css';
import './dark-theme.css';
import './mobile.css';
import './janelas.css';
import './mobile-design.css';
import { EstruturaAplicacao } from '../componentes/ApplicationShell';

export const metadata: Metadata = {
  title: 'Inova | Novo orçamento',
  description: 'Orçamentos rápidos para marmoraria'
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{if(localStorage.getItem('inova-theme')==='dark')document.documentElement.classList.add('inova-dark')}catch(e){}})()`;
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body className="inova-theme"><EstruturaAplicacao>{children}</EstruturaAplicacao></body></html>;
}
