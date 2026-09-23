'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '../../utilitarios/api';

type Worker = { id: string; name: string | null; cpf: string | null; phone: string | null; workColor: string; isActive: boolean };
const emptyWorker = { name: '', cpf: '', phone: '', workColor: '#607453', isActive: true };
const iniciais = (name: string | null) => {
  const palavras = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!palavras.length) return null;
  return (palavras[0][0] + (palavras.length > 1 ? palavras[palavras.length - 1][0] : '')).toUpperCase();
};

export default function FuncionariosPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerForm, setWorkerForm] = useState(emptyWorker);
  const [editingWorker, setEditingWorker] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestVersion = useRef(0);

  const load = async () => {
    const version = ++requestVersion.current;
    try {
      const loaded = await api<Worker[]>('/workers?active=all');
      if (version === requestVersion.current) setWorkers(loaded);
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : 'Acesso administrativo não disponível.');
    }
  };
  useEffect(() => { void load(); }, []);

  const closeWorkerForm = () => { setEditingWorker(null); setWorkerForm(emptyWorker); };
  const editWorker = (worker: Worker) => {
    setEditingWorker(worker.id);
    setWorkerForm({ name: worker.name ?? '', cpf: worker.cpf ?? '', phone: worker.phone ?? '', workColor: worker.workColor, isActive: worker.isActive });
  };

  async function submitWorker(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    const body = { name: workerForm.name || undefined, cpf: workerForm.cpf || undefined, phone: workerForm.phone || undefined, workColor: workerForm.workColor, isActive: workerForm.isActive };
    try {
      if (editingWorker) await api(`/workers/${editingWorker}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/workers', { method: 'POST', body: JSON.stringify(body) });
      await load();
      closeWorkerForm();
      setNotice(editingWorker ? 'Funcionário atualizado.' : 'Funcionário cadastrado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o funcionário.');
    }
  }

  return <main className="list-page catalog-admin-page">
    <header className="list-header">
      <Link href="/">← Orçamento</Link>
      <div><span className="catalog-eyebrow">EQUIPE DA MARMORARIA</span><h1>Funcionários</h1></div>
      <Link href="/orcamentos">Orçamentos</Link>
    </header>

    <div className="catalog-toolbar">
      <span className="catalog-toolbar-hint">Nenhuma informação é obrigatória — cadastre aos poucos.</span>
      <button className="primary-button" type="button" onClick={() => { setWorkerForm(emptyWorker); setEditingWorker(''); }}>+ Criar funcionário</button>
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}

    <div className="worker-admin-rows">
      {workers.map(worker => {
        const completo = Boolean(worker.name?.trim());
        const status = !worker.isActive ? 'inactive' : completo ? 'active' : 'incomplete';
        return <article className="worker-row" key={worker.id}>
          <span className="worker-avatar" style={{ backgroundColor: `color-mix(in srgb, ${worker.workColor} 20%, white)`, color: worker.workColor }}>
            {iniciais(worker.name) ?? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>}
            <i className={`worker-status-dot worker-status-dot-${status}`} aria-hidden="true" />
          </span>
          <div className="worker-row-info"><strong>{worker.name || 'Funcionário sem nome'}</strong><small>{[worker.cpf, worker.phone].filter(Boolean).join(' · ') || 'Sem CPF ou telefone cadastrado'}</small></div>
          <i className="worker-row-divider" aria-hidden="true" />
          <span className={`worker-status-badge worker-status-badge-${status}`}><i aria-hidden="true" />{status === 'active' ? 'Ativo' : status === 'inactive' ? 'Inativo' : 'Cadastro incompleto'}</span>
          <button className="worker-edit-button" type="button" onClick={() => editWorker(worker)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>Editar</button>
        </article>;
      })}
      {!workers.length && <p className="catalog-empty">Nenhum funcionário cadastrado ainda.</p>}
    </div>

    {editingWorker !== null && <div className="catalog-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeWorkerForm(); }}>
      <section className="catalog-modal" role="dialog" aria-modal="true" aria-label={editingWorker ? 'Editar funcionário' : 'Novo funcionário'}>
        <header><div><span className="catalog-eyebrow">{editingWorker ? 'EDITAR' : 'NOVO CADASTRO'}</span><h2>Funcionário</h2></div><button type="button" aria-label="Fechar" onClick={closeWorkerForm}>×</button></header>
        <form className="admin-form" onSubmit={submitWorker}>
          <label>Nome<input value={workerForm.name} onChange={event => setWorkerForm({ ...workerForm, name: event.target.value })} placeholder="Opcional" /></label>
          <label>CPF<input value={workerForm.cpf} onChange={event => setWorkerForm({ ...workerForm, cpf: event.target.value })} placeholder="Opcional" /></label>
          <label>Telefone<input value={workerForm.phone} onChange={event => setWorkerForm({ ...workerForm, phone: event.target.value })} placeholder="Opcional" /></label>
          <label>Cor de identificação<input type="color" value={workerForm.workColor} onChange={event => setWorkerForm({ ...workerForm, workColor: event.target.value })} /></label>
          <label className="active-toggle"><input type="checkbox" checked={workerForm.isActive} onChange={event => setWorkerForm({ ...workerForm, isActive: event.target.checked })} /> Ativo</label>
          <button className="primary-button">{editingWorker ? 'Salvar alterações' : 'Criar cadastro'}</button>
        </form>
      </section>
    </div>}
  </main>;
}
