import type { SessionRow } from './middleware/session.ts'

export type AppEnv = {
  Bindings: Env
  Variables: {
    session: SessionRow
    rowId: number
  }
}

export type FeedFetchMessage = {
  feedId: number
  reason: 'scheduled' | 'manual' | 'subscribe'
  enqueuedAt: number
}
