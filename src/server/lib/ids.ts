export function parsePositiveInt(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) {
    return null
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    return null
  }
  return n
}

export type IdRef = { kind: 'id'; id: number } | { kind: 'public'; publicId: string }

export function parseRef(raw: string): IdRef | null {
  if (/^[0-9]+$/.test(raw)) {
    const id = parsePositiveInt(raw)
    if (id === null) {
      return null
    }
    return { kind: 'id', id }
  }
  if (/^[a-z2-7]{6,12}$/.test(raw)) {
    return { kind: 'public', publicId: raw }
  }
  return null
}

export async function resolveId(
  db: D1Database,
  table: 'feeds' | 'items' | 'tags',
  ref: IdRef,
): Promise<number | null> {
  if (ref.kind === 'id') {
    return ref.id
  }
  const row = await db
    .prepare(`SELECT id FROM ${table} WHERE public_id = ?`)
    .bind(ref.publicId)
    .first<{ id: number }>()
  return row?.id ?? null
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}
