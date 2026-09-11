import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getConfig } from '@tanstack/router-plugin'

const require = createRequire(import.meta.resolve('@tanstack/router-plugin/package.json'))
const pkgRoot = dirname(require.resolve('@tanstack/router-generator/package.json'))
const { Generator } = await import(pathToFileURL(join(pkgRoot, 'dist/esm/index.js')).href)

const root = process.cwd()
const config = getConfig(
  {
    target: 'react',
    autoCodeSplitting: false,
    routesDirectory: './src/client/routes',
    generatedRouteTree: './src/client/routeTree.gen.ts',
  },
  root,
)

await new Generator({ config, root }).run()
