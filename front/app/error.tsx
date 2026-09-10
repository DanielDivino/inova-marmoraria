'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="list-page"><section className="detail-card"><span>ERRO AO CARREGAR</span><strong>Não foi possível abrir esta página.</strong><small>Verifique sua conexão ou entre novamente.</small><div className="component-actions"><button type="button" onClick={reset}>Tentar novamente</button><a className="text-button" href="/login">Entrar</a></div></section></main>;
}
