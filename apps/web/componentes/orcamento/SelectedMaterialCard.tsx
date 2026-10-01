import { componentMaterialImage, materialImageSrc, type ComponentMaterial } from './ComponentMaterialPicker';

export function CartaoMaterialSelecionado({ material }: { material?: ComponentMaterial }) {
  if (!material) return null;
  const image = componentMaterialImage(material);
  return <article className="selected-stone-card" aria-label="Pedra selecionada">
    <div className="selected-stone-image-frame">{materialImageSrc(image) ? <img className="material-sample-image" src={materialImageSrc(image)} alt={material.name} /> : <div className="selected-stone-placeholder">Sem imagem</div>}</div>
    <strong>{material.name}</strong>
    <small>{material.category}</small>
  </article>;
}
