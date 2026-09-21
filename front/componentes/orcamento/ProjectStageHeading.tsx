export function TituloEtapaProjeto({ number, title, description }: { number: number; title: string; description: string }) {
  return <div className="project-stage-heading">
    <span className="stage-badge" aria-hidden="true">{number}</span>
    <div><h2>{title}</h2><p>{description}</p></div>
  </div>;
}
