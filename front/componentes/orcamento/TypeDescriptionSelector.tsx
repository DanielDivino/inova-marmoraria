'use client';

import { useState, type FormEvent } from 'react';
import { componentTypeLabels } from '@inova/domain';
import type { ComponentType, DraftComponent } from './types';

type Props = {
  component: DraftComponent;
  descriptions: string[];
  ariaLabel: string;
  showLabel?: boolean;
  onChange: (patch: Partial<DraftComponent>) => void;
};

const horizontalTypes: ComponentType[] = ['TOP', 'COUNTER', 'BASE', 'VISTA', 'SILL', 'THRESHOLD', 'STEP'];
const orientationFor = (type: ComponentType): DraftComponent['orientation'] => horizontalTypes.includes(type) ? 'HORIZONTAL' : 'VERTICAL';

export function SeletorTipoDescricao({ component, descriptions, ariaLabel, showLabel = false, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const customDescriptions = [...new Set([component.label, ...descriptions].map((value) => value.trim()).filter(Boolean))];
  const selectedValue = component.label.trim() ? `description:${component.label.trim()}` : component.componentType;

  const select = (value: string) => {
    if (value === '__ADD_DESCRIPTION__') {
      setNewDescription('');
      setAdding(true);
      return;
    }
    if (value.startsWith('description:')) {
      onChange({ componentType: 'OTHER', label: value.slice('description:'.length), orientation: orientationFor('OTHER') });
      return;
    }
    const componentType = value as ComponentType;
    onChange({ componentType, label: '', orientation: orientationFor(componentType) });
  };

  const addDescription = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = newDescription.trim();
    if (!label) return;
    onChange({ componentType: 'OTHER', label, orientation: orientationFor('OTHER') });
    setAdding(false);
    setNewDescription('');
  };

  const content = <>
    <select aria-label={ariaLabel} value={selectedValue} onChange={(event) => select(event.target.value)}>
      {Object.entries(componentTypeLabels).map(([type, label]) => <option value={type} key={type}>{label}</option>)}
      {customDescriptions.map((description) => <option value={`description:${description}`} key={description}>{description}</option>)}
      <option value="__ADD_DESCRIPTION__">+ Tipo/descrição</option>
    </select>
    {adding && <form className="type-description-form" onSubmit={addDescription}>
      <input autoFocus aria-label="Novo tipo / descrição" maxLength={120} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="Ex.: Nicho, frontão, apoio" />
      <button type="submit" disabled={!newDescription.trim()}>Adicionar</button>
      <button type="button" aria-label="Cancelar novo tipo / descrição" onClick={() => setAdding(false)}>×</button>
    </form>}
  </>;

  return <div className="type-description-field">{showLabel && <span>Tipo / descrição</span>}{content}</div>;
}
