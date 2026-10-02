'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { temPermissao } from '@inova/domain';
import { useSession } from '../ApplicationShell';
import { AtalhosCabecalho } from '../filtros/Filtros';

/**
 * "Funcionários" e "Usuários e vendedores" ficam no mesmo item do menu, em duas
 * abas. Cada aba só aparece para quem já tinha acesso àquela página. As ações da
 * página (ex.: "Criar funcionário") ficam na mesma linha das abas.
 */
export function CabecalhoEquipe({ acoes }: { acoes?: ReactNode }) {
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
    <div className="faixa-abas">
      {secoes.length > 1 && <div className="admin-tabs" role="tablist" aria-label="Seções da equipe">
        {secoes.map((secao) => {
          const ativa = pathname.startsWith(secao.href);
          return <button type="button" role="tab" key={secao.href} aria-selected={ativa} className={ativa ? 'selected' : ''} onClick={() => { if (!ativa) router.push(secao.href); }}>{secao.rotulo}</button>;
        })}
      </div>}
      {acoes && <div className="barra-lista">{acoes}</div>}
    </div>
  </>;
}
