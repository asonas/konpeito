import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

function resolveWranglerBin() {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('wrangler/package.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.wrangler
  return path.join(path.dirname(manifestPath), bin)
}

export function runWrangler(args, { cwd, mode = 'capture', stdin = 'ignore' } = {}) {
  const piped = mode !== 'inherit'
  return new Promise((settle, fail) => {
    const child = spawn(process.execPath, [resolveWranglerBin(), ...args], {
      cwd,
      stdio: [stdin, piped ? 'pipe' : 'inherit', piped ? 'pipe' : 'inherit'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
      if (mode === 'tee') process.stdout.write(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
      if (mode === 'tee') process.stderr.write(chunk)
    })
    child.on('error', fail)
    child.on('close', (code) =>
      settle({ code: code ?? 1, stdout, stderr, output: stdout + stderr }),
    )
  })
}

export async function withTempDir(prefix, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return await run(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
