import { z } from 'zod'
import { DEFAULT_DEMO_FEEDS } from './feeds.ts'

const demoFeedSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
})

export type DemoFeedConfig = z.infer<typeof demoFeedSchema>

const demoFeedsSchema = z.array(demoFeedSchema).min(1).max(40)

class DemoConfigError extends Error {}

export function parseDemoFeeds(raw: string | undefined): DemoFeedConfig[] {
  if (raw === undefined || raw.trim().length === 0) {
    const parsed = demoFeedsSchema.safeParse(DEFAULT_DEMO_FEEDS)
    if (!parsed.success) {
      throw new DemoConfigError('built-in DEMO_FEEDS does not match the expected shape')
    }
    return parsed.data
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new DemoConfigError('DEMO_FEEDS is not valid JSON')
  }
  const parsed = demoFeedsSchema.safeParse(json)
  if (!parsed.success) {
    throw new DemoConfigError('DEMO_FEEDS does not match the expected shape')
  }
  return parsed.data
}

export function isDemoMode(env: Env): boolean {
  return env.DEMO_MODE === '1'
}
