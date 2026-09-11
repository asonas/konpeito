export function isNumericRef(value: string): boolean {
  return /^[0-9]+$/.test(value)
}

export function resolveRef<T extends { id: number; public_id: string | null }>(
  rows: T[],
  ref: string,
): T | undefined {
  if (isNumericRef(ref)) {
    const id = Number(ref)
    return rows.find((row) => row.id === id)
  }
  return rows.find((row) => row.public_id === ref)
}

export function publicIdOf(value: { public_id?: string | null }): string | undefined {
  if (typeof value.public_id !== 'string' || value.public_id.length === 0) {
    return undefined
  }
  return value.public_id
}

export function itemRefOf(item: { id: number; public_id?: string | null }): string {
  return publicIdOf(item) ?? String(item.id)
}

export function itemMatches(
  item: { id: number; public_id?: string | null },
  ref: string | undefined,
): boolean {
  if (ref === undefined) {
    return false
  }
  if (item.public_id === ref) {
    return true
  }
  return isNumericRef(ref) && String(item.id) === ref
}
