/** Nome compartilhado entre API e interface, seguro para arquivos e cabeçalhos HTTP. */
export function nomeArquivoPdf(nomeCliente: string | null | undefined, numeroOrcamento: string): string {
  const limpar = (valor: string) => valor.normalize('NFC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${limpar(nomeCliente ?? '') || 'Cliente'} - ${limpar(numeroOrcamento) || 'Orçamento'}.pdf`;
}

export function disposicaoArquivoPdf(nome: string): string {
  const simples = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_');
  const codificado = encodeURIComponent(nome).replace(/['()*]/g, caractere => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${simples}"; filename*=UTF-8''${codificado}`;
}
