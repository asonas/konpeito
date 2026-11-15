import { createFileRoute, redirect } from '@tanstack/react-router'
import { READING_STATS_DAYS } from '../../shared/schemas.ts'
import { loadBootstrap } from '../lib/queries.ts'

type StatsSearch = {
  // 文字列で持つと、ルーターがURLに`?days="7"`と引用符を付けて書く
  days?: number
}

export const Route = createFileRoute('/stats')({
  validateSearch: (search: Record<string, unknown>): StatsSearch => {
    const days = READING_STATS_DAYS.find((value) => value === String(search.days))
    return days === undefined ? {} : { days: Number(days) }
  },
  beforeLoad: async ({ context }) => {
    const { bootstrap } = await loadBootstrap(context.queryClient)
    if (bootstrap.demo) {
      throw redirect({ to: '/' })
    }
  },
})
