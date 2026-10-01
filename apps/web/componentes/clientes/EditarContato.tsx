'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../utilitarios/api';
import { Icone } from '../filtros/Filtros';
import { Janela } from '../Janela';
import { payloadCliente } from './SemCadastro';

type Cliente = { id: string; name: string; phone: string | null; isQuick?: boolean; document?: string | null; email?: string | null; address?: string | null; neighborhood?: string | null; city?: string | null; postalCode?: string | null; complement?: string | null; notes?: string | null };
const CAMPOS = ['name', 'phone', 'document', 'email', 'address', 'neighborhood', 'city', 'postalCode', 'complement', 'notes'] as const;
type Formulario = Record<(typeof CAMPOS)[number], string>;

/**
 * Janela para editar o contato do cliente (telefone, CPF, e-mail, endereço…) sem sair da tela.
 * `aoSalvar` recebe os dados já no formato do cadastro (vazio vira null).
 */
export function EditarContato({ clienteId, aoFechar, aoSalvar }: { clienteId: string; aoFechar: () => void; aoSalvar: (dados: Record<string, string | null>) => Promise<void> }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<Cliente>(`/customers/${clienteId}`, { signal: controller.signal }).then((dados) => {
      setCliente(dados);
      setForm(Object.fromEntries(CAMPOS.map((campo) => [campo, dados[campo] ?? ''])) as Formulario);
    }).catch((cause) => { if (!controller.signal.aborted) setErro(cause instanceof Error ? cause.message : 'Não foi possível abrir o contato.'); });
    return () => controller.abort();
  }, [clienteId]);
  const fechar = () => { if (!salvando) aoFechar(); };
  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (!form || salvando) return;
    setSalvando(true); setErro('');
    try { await aoSalvar(payloadCliente(form, false) as Record<string, string | null>); aoFechar(); }
    catch (cause) { setErro(cause instanceof Error ? cause.message : 'Não foi possível salvar o contato.'); }
    finally { setSalvando(false); }
  }
  const campo = (nome: keyof Formulario, rotulo: string, extra: { tipo?: string; largo?: boolean; dica?: string; modo?: 'tel' | 'email' | 'numeric' } = {}) =>
    <label className={extra.largo ? 'largo' : undefined}>{rotulo}<input type={extra.tipo ?? 'text'} inputMode={extra.modo} value={form?.[nome] ?? ''} placeholder={extra.dica} disabled={!form || salvando} onChange={(event) => setForm((atual) => atual && { ...atual, [nome]: event.target.value })} /></label>;
  return <Janela aberta aoFechar={fechar} ocupada={salvando} icone="pessoa" titulo="Editar contato" subtitulo={cliente ? cliente.name : 'Carregando…'} className="editar-contato" aoEnviar={salvar}
    dica="O contato atualizado será exibido neste orçamento e no PDF."
    rodape={<><button type="button" className="botao-contorno" disabled={salvando} onClick={fechar}>Cancelar</button><button className="botao-principal" disabled={!form || salvando}>{salvando ? 'Salvando…' : 'Salvar contato'}</button></>}>
    {cliente?.isQuick && <p className="editar-contato-aviso"><Icone nome="info" tamanho={14} />Cliente sem cadastro: ao informar o telefone, o cadastro será concluído.</p>}
    <div className="editar-contato-campos">
      {campo('name', 'Nome', { largo: true })}
      {campo('phone', 'Telefone', { tipo: 'tel', modo: 'tel', dica: '(92) 99999-9999' })}
      {campo('document', 'CPF / CNPJ', { modo: 'numeric' })}
      {campo('email', 'E-mail', { tipo: 'email', modo: 'email', largo: true })}
      {campo('address', 'Endereço da obra', { largo: true })}
      {campo('neighborhood', 'Bairro')}
      {campo('city', 'Cidade')}
      {campo('postalCode', 'CEP', { modo: 'numeric' })}
      {campo('complement', 'Complemento')}
      <label className="largo">Observações do cliente<textarea rows={2} value={form?.notes ?? ''} disabled={!form || salvando} onChange={(event) => setForm((atual) => atual && { ...atual, notes: event.target.value })} /></label>
    </div>
    {erro && <p role="alert" className="form-error">{erro}</p>}
  </Janela>;
}
