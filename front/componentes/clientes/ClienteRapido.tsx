'use client';

/** Cliente com o mínimo para exibir o contato; o cliente rápido pode não ter telefone. */
export type ContatoCliente = { phone: string | null; document?: string | null; isQuick?: boolean };

/** Telefone (e CPF) para as listas; o cliente rápido sem telefone aparece como tal. */
export function contatoCliente(cliente: ContatoCliente) {
  const partes = [cliente.phone || (cliente.isQuick ? 'Cliente rápido · sem telefone' : 'Sem telefone'), cliente.document ? `CPF ${cliente.document}` : ''];
  return partes.filter(Boolean).join(' · ');
}

/** Corpo do cadastro: campos vazios viram null; no cliente rápido vai `quick` e nada é exigido. */
export function payloadCliente(form: Record<string, string>, rapido: boolean) {
  return { ...Object.fromEntries(Object.entries(form).map(([campo, valor]) => [campo, valor.trim() || null])), ...(rapido ? { quick: true } : {}) };
}

/**
 * Opção do cadastro de novo cliente: cliente rápido, sem exigir nenhum dado
 * para já fazer os projetos. Sem nome, o sistema numera ("Cliente rápido 3");
 * o cadastro é completado depois, em Clientes.
 */
export function OpcaoClienteRapido({ ativo, aoMudar }: { ativo: boolean; aoMudar: (ativo: boolean) => void }) {
  return <label className={`cliente-rapido-opcao${ativo ? ' ativo' : ''}`}>
    <input type="checkbox" checked={ativo} onChange={(evento) => aoMudar(evento.target.checked)} />
    <span><strong>Cliente rápido</strong><small>Sem exigir nenhum dado: faça os projetos agora e complete o cadastro depois.</small></span>
  </label>;
}
