import type { Hono } from 'hono'
import { app } from './app.ts'
import { nowSec } from './lib/crypto.ts'
import type { AppEnv, FeedFetchMessage } from './types.ts'

let demoApp: Promise<Hono<AppEnv>> | undefined
function loadDemo(): Promise<Hono<AppEnv>> {
  demoApp ??= import('./demo/index.ts').then((m) => m.demo)
  return demoApp
}

export default {
  fetch(request, env, ctx) {
    if (env.DEMO_MODE === '1') {
      return loadDemo().then((demo) => demo.fetch(request, env, ctx))
    }
    return app.fetch(request, env, ctx)
  },
  async scheduled(controller, env) {
    if (env.DEMO_MODE === '1') {
      const { parseDemoFeeds } = await import('./demo/config.ts')
      const { refreshSnapshot } = await import('./demo/snapshot.ts')
      await refreshSnapshot(parseDemoFeeds(env.DEMO_FEEDS), env.IMAGE_PROXY_KEY, nowSec())
      return
    }
    // 取得パイプライン（feedsmith、linkedom、サニタイザー）はCronとQueueでしかいらないので、
    // 通常のリクエストで解析されないよう動的なimportにする
    const jobs = await import('./jobs.ts')
    const now = nowSec()
    if (controller.cron === '*/5 * * * *') {
      await jobs.dispatchDueFeeds(env, now)
      return
    }
    await jobs.backfillPublicIds(env.DB)
    await jobs.runDailyMaintenance(env, now)
  },
  async queue(batch, env) {
    if (env.DEMO_MODE === '1') {
      return
    }
    const jobs = await import('./jobs.ts')
    await jobs.handleFeedQueue(batch, env)
  },
} satisfies ExportedHandler<Env, FeedFetchMessage>
