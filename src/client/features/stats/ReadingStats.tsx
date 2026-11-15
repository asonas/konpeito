import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useId } from 'react'
import { feedTitle } from '../../../shared/feed.ts'
import { DEFAULT_READING_STATS_DAYS, READING_STATS_DAYS } from '../../../shared/schemas.ts'
import { buttonVariants } from '../../components/ui/button.tsx'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { formatDuration } from '../../lib/format.ts'
import {
  fetchReadingStats,
  queryKeys,
  type ReadingStats,
  type ReadingStatsDays,
} from '../../lib/queries.ts'
import { cn } from '../../lib/utils.ts'

type Counts = ReadingStats['totals']

export function ReadingStatsPage(props: { days: ReadingStatsDays }) {
  const t = useMessages()
  const query = useQuery({
    queryKey: queryKeys.readingStats(props.days),
    queryFn: () => fetchReadingStats(props.days),
  })
  const data = query.data

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 bg-canvas p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label={t.stats.back}
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold">{t.stats.title}</h1>
        </div>
        <nav aria-label={t.stats.period} className="flex gap-1">
          {READING_STATS_DAYS.map((days) => (
            <Link
              key={days}
              to="/stats"
              search={days === DEFAULT_READING_STATS_DAYS ? {} : { days: Number(days) }}
              aria-current={days === props.days ? 'page' : undefined}
              className={buttonVariants({
                variant: days === props.days ? 'toggle' : 'ghost',
                size: 'sm',
              })}
            >
              {t.stats.lastDays(days)}
            </Link>
          ))}
        </nav>
      </header>
      {query.isError ? <p className="text-sm text-danger-text">{t.stats.loadFailed}</p> : null}
      {data ? (
        <>
          <Totals totals={data.totals} />
          <FeedTable feeds={data.feeds} />
        </>
      ) : query.isError ? null : (
        <p className="text-sm text-fg-muted">{t.common.loading}</p>
      )}
    </main>
  )
}

function Totals(props: { totals: Counts }) {
  const t = useMessages()
  const tiles: [string, string][] = [
    [t.stats.dwell, formatDuration(props.totals.dwell_ms)],
    [t.stats.opens, String(props.totals.opens)],
    [t.stats.impressions, String(props.totals.impressions)],
    [t.stats.originalOpens, String(props.totals.original_opens)],
    [t.stats.linkClicks, String(props.totals.link_clicks)],
    [t.stats.likes, String(props.totals.likes)],
    [t.stats.dislikes, String(props.totals.dislikes)],
  ]
  return (
    <section aria-label={t.stats.totals}>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-md border border-line p-3">
            <dt className="text-sm text-fg-muted">{label}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function FeedTable(props: { feeds: ReadingStats['feeds'] }) {
  const t = useMessages()
  const captionId = useId()
  if (props.feeds.length === 0) {
    return <p className="text-sm text-fg-muted">{t.stats.empty}</p>
  }
  const longest = Math.max(...props.feeds.map((feed) => feed.dwell_ms), 1)
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: スクロールする領域はキーボードで操作できる必要がある
    <section tabIndex={0} aria-labelledby={captionId} className="stats-table-wrapper">
      <table className="stats-table">
        <caption id={captionId}>{t.stats.perFeed}</caption>
        <thead>
          <tr>
            <th scope="col">{t.stats.feed}</th>
            <th scope="col">{t.stats.dwell}</th>
            <th scope="col">{t.stats.opens}</th>
            <th scope="col">{t.stats.impressions}</th>
            <th scope="col">{t.stats.originalOpens}</th>
            <th scope="col">{t.stats.linkClicks}</th>
            <th scope="col">{t.stats.likes}</th>
            <th scope="col">{t.stats.dislikes}</th>
          </tr>
        </thead>
        <tbody>
          {props.feeds.map((feed) => (
            <tr key={feed.feed_id}>
              <th scope="row">{feedTitle(feed)}</th>
              <td data-label={t.stats.dwell}>
                {formatDuration(feed.dwell_ms)}
                <span
                  aria-hidden="true"
                  className={cn('stats-bar', feed.dwell_ms === 0 && 'invisible')}
                  style={{ inlineSize: `${(feed.dwell_ms / longest) * 100}%` }}
                />
              </td>
              <td data-label={t.stats.opens}>{feed.opens}</td>
              <td data-label={t.stats.impressions}>{feed.impressions}</td>
              <td data-label={t.stats.originalOpens}>{feed.original_opens}</td>
              <td data-label={t.stats.linkClicks}>{feed.link_clicks}</td>
              <td data-label={t.stats.likes}>{feed.likes}</td>
              <td data-label={t.stats.dislikes}>{feed.dislikes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
