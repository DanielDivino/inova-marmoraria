type Step = { number: number; label: string; detail?: string };

const steps: Step[] = [
  { number: 1, label: 'Componentes', detail: 'e medidas' },
  { number: 2, label: 'Valores', detail: 'e serviços' },
  { number: 3, label: 'Desenho', detail: 'técnico' },
];

export function EtapasProjeto({ current, completed = [], onSelect }: { current: number; completed?: number[]; onSelect: (step: number) => void }) {
  return <nav className="project-stepper" aria-label="Etapas do orçamento">
    {steps.map((step, index) => <div className={`project-step ${completed.includes(step.number) ? 'completed' : ''} ${step.number === current ? 'current' : ''}`} key={step.number}>
      <button type="button" aria-current={step.number === current ? 'step' : undefined} onClick={() => onSelect(step.number)}>
        <span className="project-step-number" aria-hidden="true">{step.number}</span>
        <span className="project-step-label">{step.label}{step.detail && <small>{step.detail}</small>}</span>
      </button>
      {index < steps.length - 1 && <i aria-hidden="true" />}
    </div>)}
  </nav>;
}
