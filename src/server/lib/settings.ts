import { isRecord } from '../../shared/records.ts'
import { DEFAULT_SETTINGS, type Settings, settingsSchema } from '../../shared/schemas.ts'

function isSettingRow(value: unknown): value is { key: string; value: string } {
  return isRecord(value) && typeof value.key === 'string' && typeof value.value === 'string'
}

export function settingsStatement(db: D1Database): D1PreparedStatement {
  return db.prepare('SELECT key, value FROM settings')
}

export function parseSettingsRows(rows: unknown[]): Settings {
  const raw: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (isSettingRow(row)) {
      raw[row.key] = JSON.parse(row.value)
    }
  }
  return settingsSchema.parse(raw)
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const rows = await settingsStatement(db).all()
  return parseSettingsRows(rows.results)
}

/**
 * この端末が管理者であることを表すID
 * WebAuthnのuser.idに使う
 * 最初のパスキーを登録するときに作り、以後は変えない
 */
export async function requireUserHandle(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = 'user_handle'")
    .first<{ value: string }>()
  const stored = row === null ? null : (JSON.parse(row.value) as unknown)
  if (typeof stored === 'string' && stored.length > 0) {
    return stored
  }
  const handle = crypto.randomUUID()
  await db
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('user_handle', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    )
    .bind(JSON.stringify(handle))
    .run()
  return handle
}
