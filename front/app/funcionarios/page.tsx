'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../../utilitarios/api';
import { CabecalhoEquipe } from '../../componentes/equipe/CabecalhoEquipe';
import { Janela } from '../../componentes/Janela';
import { AbasFiltro, Icone } from '../../componentes/filtros/Filtros';

type Worker = { id: string; name: string | null; cpf: string | null; phone: string | null; workColor: string; isActive: boolean };
const emptyWorker = { name: '', cpf: '', phone: '', workColor: '#607453', isActive: true };
type Situacao = 'active' | 'incomplete' | 'inactive';
/** Sem nome o cadastro está incompleto; inativo vale mais que incompleto. */
const situacao = (worker: Worker): Situacao => !worker.isActive ? 'inactive' : worker.name?.trim() ? 'active' : 'incomplete';
const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
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
  const [aba, setAba] = useState<'TODOS' | Situacao>('TODOS');
  const [busca, setBusca] = useState('');
  const visiveis = useMemo(() => workers.filter((worker) => (aba === 'TODOS' || situacao(worker) === aba)
    && normalizar([worker.name, worker.cpf, worker.phone].filter(Boolean).join(' ')).includes(normalizar(busca.trim()))), [workers, aba, busca]);
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
    <CabecalhoEquipe acoes={<button className="botao-destaque" type="button" onClick={() => { setWorkerForm(emptyWorker); setEditingWorker(''); }}><Icone nome="mais" />Criar funcionário</button>} />

    <div className="barra-filtros" role="search" aria-label="Buscar funcionários">
      <label className="barra-filtros-busca"><Icone nome="buscar" tamanho={20} /><input type="search" aria-label="Buscar funcionários" placeholder="Nome, CPF ou telefone" value={busca} onChange={(event) => setBusca(event.target.value)} /></label>
      {/* Abas e "Limpar" juntos: se não couberem ao lado da busca, descem para a linha de baixo. */}
      <div className="barra-filtros-abas">
        <AbasFiltro rotulo="Filtrar funcionários" valor={aba} aoEscolher={(valor) => setAba(valor === aba ? 'TODOS' : valor)} grupos={[{ opcoes: [
          { valor: 'TODOS', rotulo: 'Todos', icone: 'todos', total: workers.length },
          { valor: 'active', rotulo: 'Ativos', icone: 'aprovado', total: workers.filter((worker) => situacao(worker) === 'active').length },
          { valor: 'incomplete', rotulo: 'Cadastro incompleto', icone: 'incompleto', total: workers.filter((worker) => situacao(worker) === 'incomplete').length },
          { valor: 'inactive', rotulo: 'Inativos', icone: 'inativo', total: workers.filter((worker) => situacao(worker) === 'inactive').length },
        ] }]} />
        <i className="barra-filtros-separador" aria-hidden="true" />
        <button type="button" className="botao-contorno" disabled={aba === 'TODOS' && !busca} onClick={() => { setAba('TODOS'); setBusca(''); }}><Icone nome="limpar" />Limpar</button>
      </div>
    </div>

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="catalog-notice" role="status">{notice}</p>}

    <div className="worker-admin-rows">
      {visiveis.map(worker => {
        const status = situacao(worker);
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
      {!!workers.length && !visiveis.length && <p className="catalog-empty">Nenhum funcionário com esses filtros.</p>}
    </div>

    {editingWorker !== null && <Janela aberta aoFechar={closeWorkerForm} className="catalog-modal" icone="equipe" titulo={editingWorker ? 'Editar funcionário' : 'Novo funcionário'} aoEnviar={submitWorker}
      rodape={<><button type="button" className="botao-contorno" onClick={closeWorkerForm}>Cancelar</button><button className="botao-principal">{editingWorker ? 'Salvar alterações' : 'Criar cadastro'}</button></>}>
        <div className="admin-form">
          <label>Nome<input value={workerForm.name} onChange={event => setWorkerForm({ ...workerForm, name: event.target.value })} placeholder="Opcional" /></label>
          <label>CPF<input value={workerForm.cpf} onChange={event => setWorkerForm({ ...workerForm, cpf: event.target.value })} placeholder="Opcional" /></label>
          <label>Telefone<input value={workerForm.phone} onChange={event => setWorkerForm({ ...workerForm, phone: event.target.value })} placeholder="Opcional" /></label>
          <label>Cor de identificação<input type="color" value={workerForm.workColor} onChange={event => setWorkerForm({ ...workerForm, workColor: event.target.value })} /></label>
          <label className="active-toggle"><input type="checkbox" checked={workerForm.isActive} onChange={event => setWorkerForm({ ...workerForm, isActive: event.target.checked })} /> Ativo</label>
        </div>
    </Janela>}
  </main>;
}
