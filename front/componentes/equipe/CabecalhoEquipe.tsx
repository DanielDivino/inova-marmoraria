'use client';

import { usePathname, useRouter } from 'next/navigation';
import { temPermissao } from '@inova/domain';
import { useSession } from '../ApplicationShell';
import { AtalhosCabecalho } from '../filtros/Filtros';

/**
 * "Funcionários" e "Usuários e vendedores" ficam no mesmo item do menu, em duas
 * abas. Cada aba só aparece para quem já tinha acesso àquela página.
 */
export function CabecalhoEquipe() {
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const secoes = [
    ...(user?.role === 'SUPER_ADMIN' ? [{ href: '/funcionarios', rotulo: 'Funcionários' }] : []),
    ...(user && temPermissao(user.role, 'administration') ? [{ href: '/usuarios', rotulo: 'Usuários e vendedores' }] : []),
  ];
  return <>
    <header className="list-header">
      <div className="titulo-no-topo"><span className="catalog-eyebrow">EQUIPE DA MARMORARIA</span><h1>Funcionários</h1></div>
      <AtalhosCabecalho />
    </header>
    {secoes.length > 1 && <div className="admin-tabs" role="tablist" aria-label="Seções da equipe">
      {secoes.map((secao) => {
        const ativa = pathname.startsWith(secao.href);
        return <button type="button" role="tab" key={secao.href} aria-selected={ativa} className={ativa ? 'selected' : ''} onClick={() => { if (!ativa) router.push(secao.href); }}>{secao.rotulo}</button>;
      })}
    </div>}
  </>;
}
