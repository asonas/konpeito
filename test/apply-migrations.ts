import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

const migrations = env.TEST_MIGRATIONS
if (migrations === undefined) {
  throw new Error('TEST_MIGRATIONS binding is missing')
}

await applyD1Migrations(env.DB, migrations)
