export function clickSelection(
  selected: string[],
  id: string,
  additive: boolean,
): string[] {
  if (additive)
    return selected.includes(id)
      ? selected.filter((current) => current !== id)
      : [...selected, id];
  return contextSelection(selected, id);
}
export function contextSelection(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected : [id];
}
