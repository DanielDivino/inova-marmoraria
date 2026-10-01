/** Compartilha a abertura e o download de PDFs entre orçamento e histórico do cliente. */
export function abrirPdf(arquivo: Blob, nome: string) {
  const url = URL.createObjectURL(arquivo);
  const aba = window.open(url, '_blank', 'noopener,noreferrer');
  if (!aba) {
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
