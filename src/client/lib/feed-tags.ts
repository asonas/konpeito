export function replaceFeedTag(tagIds: number[], from: number | null, to: number | null): number[] {
  const rest = tagIds.filter((id) => id !== from)
  if (to === null || rest.includes(to)) {
    return rest
  }
  return [...rest, to]
}
