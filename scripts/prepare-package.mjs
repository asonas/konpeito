import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const required = [
  'bin/konpeito.mjs',
  'bin/wrangler.mjs',
  'dist/client/index.html',
  'dist/konpeito/index.js',
  'dist/konpeito/wrangler.json',
  'migrations',
]
const localOnly = ['dist/konpeito/.dev.vars', 'dist/konpeito/.vite']

for (const entry of localOnly) {
  const target = join(root, entry)
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
    console.log(`Removed ${entry} from the build output.`)
  }
}

const missing = required.filter((entry) => !existsSync(join(root, entry)))
if (missing.length > 0) {
  console.error(`The package is missing: ${missing.join(', ')}. Run \`pnpm build\` first.`)
  process.exit(1)
}
