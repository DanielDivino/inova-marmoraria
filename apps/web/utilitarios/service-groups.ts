type ServiceInfo = { name: string; category: string };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Keep the same catalog item and price; only choose its editor section. */
export function servicoDeRecorte(service: ServiceInfo): boolean {
  const name = normalize(service.name);
  if (/\bcuba esculpida\b/.test(name)) return true;
  const operations = /\b(recortes?|cortes?|furos?|furacao|furacoes|frisos?)\b/;
  // A cut for a sink is a machining operation; the sink itself is an item.
  // Check the name first so older/misclassified catalog categories remain safe.
  if (operations.test(name)) return true;
  if (/\b(cubas?|tanques?|cooktops?|torneiras?)\b/.test(name)) return false;
  return operations.test(normalize(service.category));
}
