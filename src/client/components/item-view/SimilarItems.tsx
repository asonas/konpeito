import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { feedTitle } from '../../../shared/feed.ts'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { formatDate } from '../../lib/format.ts'
import { type Feed, fetchSimilarItems, queryKeys } from '../../lib/queries.ts'
import { itemRefOf } from '../../lib/refs.ts'

/** 読み込み中、取得の失敗、似ている記事が無い時は、欄ごと描画しない */
export function SimilarItems(props: { itemId: number; feeds: Feed[] }) {
  const t = useMessages()
  const headingId = useId()
  const query = useQuery({
    queryKey: queryKeys.similarItems(props.itemId),
    queryFn: () => fetchSimilarItems(props.itemId),
    // 埋め込みは5分ごとにしか増えないので、開き直すたびには取り直さない
    staleTime: 5 * 60_000,
    retry: false,
  })
  const items = query.data ?? []
  if (items.length === 0) {
    return null
  }
  return (
    <section aria-labelledby={headingId} className="mt-12 border-t border-line pt-6">
      <h2 id={headingId} className="text-sm font-semibold text-fg-muted">
        {t.article.similarArticles}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => {
          const feed = props.feeds.find((candidate) => candidate.id === item.feed_id)
          return (
            <li key={item.id}>
              {/* 似ている記事は今の一覧に入っているとは限らないので、すべての記事の経路で開く */}
              <Link
                to="/items/$itemId"
                params={{ itemId: itemRefOf(item) }}
                search={{}}
                className="font-medium text-inherit hover:underline"
              >
                {item.title || t.common.untitled}
              </Link>
              <p className="mt-0.5 text-sm text-fg-muted">
                {feed ? `${feedTitle(feed)} · ` : ''}
                {formatDate(item.published_at)}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
