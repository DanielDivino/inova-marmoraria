import Link from 'next/link';

/** Endereço que não existe (link antigo, digitado errado): volta para as telas principais. */
export default function NaoEncontrado() {
  return <main className="list-page pagina-nao-encontrada">
    <h1>Página não encontrada</h1>
    <p>O endereço acessado não existe ou foi alterado.</p>
    <p className="detail-actions"><Link className="botao-destaque" href="/orcamentos">Ver orçamentos</Link><Link className="secondary-button" href="/">Novo orçamento</Link><Link className="secondary-button" href="/fluxo">Fluxo de trabalho</Link></p>
  </main>;
}
