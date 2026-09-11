export function moveToFront(ids: number[], id: number): number[] {
  if (!ids.includes(id)) {
    return ids
  }
  return [id, ...ids.filter((item) => item !== id)]
}

export function insertBefore(ids: number[], dragged: number, target: number): number[] {
  const without = ids.filter((id) => id !== dragged)
  const at = without.indexOf(target)
  if (at < 0) {
    return ids
  }
  return [...without.slice(0, at), dragged, ...without.slice(at)]
}
