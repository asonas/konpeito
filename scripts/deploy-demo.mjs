#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWrangler, withTempDir } from '../bin/wrangler.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'dist', 'konpeito')
const buildConfigPath = path.join(buildDir, 'wrangler.json')

const DEMO_WORKER = 'konpeito-sample'
const DEMO_DOMAIN = 'sample.konpeito.shikakun.com'

function buildDemoConfig() {
  if (!fs.existsSync(buildConfigPath)) {
    throw new Error(`Build output is missing (${buildConfigPath}). Run \`pnpm build\` first.`)
  }
  const config = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'))
  config.configPath = undefined
  config.userConfigPath = undefined
  config.name = DEMO_WORKER
  if ('topLevelName' in config) {
    config.topLevelName = DEMO_WORKER
  }
  config.main = path.resolve(buildDir, config.main)
  if (config.assets?.directory) {
    config.assets.directory = path.resolve(buildDir, config.assets.directory)
  }
  const first = config.assets?.run_worker_first
  if (Array.isArray(first) && !first.includes('/login')) {
    first.push('/login')
  }
  delete config.d1_databases
  delete config.queues
  delete config.ratelimits
  config.vars = { DEMO_MODE: '1' }
  config.triggers = { crons: ['*/30 * * * *'] }
  config.routes = [{ pattern: DEMO_DOMAIN, custom_domain: true }]
  config.workers_dev = true
  config.secrets = { required: ['IMAGE_PROXY_KEY'] }
  return config
}

async function workerExists() {
  const result = await runWrangler(['deployments', 'list', '--name', DEMO_WORKER], { cwd: root })
  return result.code === 0
}

const exists = await workerExists()
const code = await withTempDir('konpeito-demo-', async (dir) => {
  const configPath = path.join(dir, 'wrangler.json')
  fs.writeFileSync(configPath, `${JSON.stringify(buildDemoConfig(), null, 2)}\n`)
  const args = ['deploy', '-c', configPath]
  if (!exists) {
    const secretsPath = path.join(dir, 'secrets.env')
    fs.writeFileSync(secretsPath, `IMAGE_PROXY_KEY=${randomBytes(32).toString('hex')}\n`, {
      mode: 0o600,
    })
    args.push('--secrets-file', secretsPath)
    console.log(`Creating ${DEMO_WORKER} at https://${DEMO_DOMAIN}`)
  } else {
    console.log(`Updating ${DEMO_WORKER} at https://${DEMO_DOMAIN}`)
  }
  return (await runWrangler(args, { cwd: root, mode: 'inherit' })).code
})

if (code !== 0) {
  console.error(`
Deploy failed. The demo Worker needs IMAGE_PROXY_KEY and a custom domain on this Cloudflare account.
`)
  process.exit(code)
}

console.log(`\nDemo is at https://${DEMO_DOMAIN}`)
