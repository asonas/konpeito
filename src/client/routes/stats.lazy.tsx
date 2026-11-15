import { createLazyFileRoute } from '@tanstack/react-router'
import { DEFAULT_READING_STATS_DAYS, READING_STATS_DAYS } from '../../shared/schemas.ts'
import { ReadingStatsPage } from '../features/stats/ReadingStats.tsx'

export const Route = createLazyFileRoute('/stats')({
  component: StatsRoute,
})

function StatsRoute() {
  const search = Route.useSearch()
  const days =
    READING_STATS_DAYS.find((value) => value === String(search.days)) ?? DEFAULT_READING_STATS_DAYS
  return <ReadingStatsPage days={days} />
}
