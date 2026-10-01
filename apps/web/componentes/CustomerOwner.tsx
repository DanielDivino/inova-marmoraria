'use client';

import { useEffect, useState } from 'react';
import { api } from '../utilitarios/api';
import { useSession } from './ApplicationShell';

export function CustomerOwner({ customerId, owner }: { customerId: string; owner?: { id: string; name: string } | null }) {
  const user = useSession();
  const [users, setUsers] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [ownerId, setOwnerId] = useState(owner?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isSuper = user?.role === 'SUPER_ADMIN';
  useEffect(() => { if (isSuper) api<typeof users>('/users').then(setUsers).catch(cause => setError(cause.message)); }, [isSuper]);
  if (!isSuper) return null;
  return <section className="detail-card"><h2 className="section-title">Responsável pelo cliente</h2><form className="inline-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await api(`/customers/${customerId}/owner`, { method: 'PATCH', body: JSON.stringify({ ownerId: ownerId || null }) }); setNotice('Responsável atualizado.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atribuir o cliente.'); }
    finally { setBusy(false); }
  }}><label>Vendedor / responsável<select aria-label="Vendedor responsável pelo cliente" value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">Sem responsável · acesso administrativo</option>{users.filter(entry => entry.isActive || entry.id === ownerId).map(entry => <option key={entry.id} value={entry.id}>{entry.name}{entry.isActive ? '' : ' (inativo)'}</option>)}</select></label><button className="secondary-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar responsável'}</button></form><p className="customer-help">Define quem pode consultar este cliente e registrar novos orçamentos para ele. Os orçamentos anteriores permanecem vinculados a quem os criou.</p>{error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="catalog-notice">{notice}</p>}</section>;
}
