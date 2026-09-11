import { parseAtomFeed, parseJsonFeed, parseRdfFeed, parseRssFeed } from 'feedsmith'
import type { FeedFormat, ParsedFeed, ParsedItem } from './types.ts'
import { FeedParseError } from './types.ts'

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dateToRaw(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  return null
}

/** Dublin Coreは同じ値を単数と複数の両方の名前で置くので、どちらも見る */
const DC_TITLE = ['title', 'titles'] as const
const DC_CREATOR = ['creator', 'creators'] as const
const DC_DATE = ['date', 'dates'] as const
const DC_LANGUAGE = ['language', 'languages'] as const

function firstString(obj: unknown, keys: readonly string[]): string | null {
  if (obj === null || typeof obj !== 'object') {
    return null
  }
  for (const key of keys) {
    if (!Object.hasOwn(obj, key)) {
      continue
    }
    const value = Reflect.get(obj, key)
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
    if (Array.isArray(value)) {
      const first = value[0]
      const fromDate = dateToRaw(first)
      if (fromDate !== null) {
        return fromDate
      }
    }
  }
  return null
}

function mapItems<T>(raw: unknown, toItem: (entry: T) => ParsedItem): ParsedItem[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const items: ParsedItem[] = []
  for (const entry of raw) {
    if (entry !== undefined) {
      items.push(toItem(entry as T))
    }
  }
  return items
}

function personName(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (value !== null && typeof value === 'object' && Object.hasOwn(value, 'name')) {
    return asString(Reflect.get(value, 'name'))
  }
  return null
}

function firstPerson(authors: unknown): string | null {
  if (typeof authors === 'string') {
    return asString(authors)
  }
  if (!Array.isArray(authors)) {
    return null
  }
  for (const author of authors) {
    const name = personName(author)
    if (name !== null) {
      return name
    }
  }
  return null
}

function atomAlternateHref(links: unknown): string | null {
  if (!Array.isArray(links)) {
    return null
  }
  let fallback: string | null = null
  for (const link of links) {
    if (link === null || typeof link !== 'object' || !Object.hasOwn(link, 'href')) {
      continue
    }
    const href = asString(Reflect.get(link, 'href'))
    if (href === null) {
      continue
    }
    const relRaw = Object.hasOwn(link, 'rel') ? Reflect.get(link, 'rel') : undefined
    const rel = typeof relRaw === 'string' ? relRaw : 'alternate'
    if (rel === 'alternate') {
      return href
    }
    if (rel === 'enclosure') {
      continue
    }
    if (fallback === null) {
      fallback = href
    }
  }
  return fallback
}

function atomEnclosures(links: unknown): ParsedItem['enclosures'] {
  if (!Array.isArray(links)) {
    return []
  }
  const out: ParsedItem['enclosures'] = []
  for (const link of links) {
    if (link === null || typeof link !== 'object') {
      continue
    }
    const rel = Object.hasOwn(link, 'rel') ? Reflect.get(link, 'rel') : undefined
    if (rel !== 'enclosure') {
      continue
    }
    const href = asString(Reflect.get(link, 'href'))
    if (href === null) {
      continue
    }
    const mime = Object.hasOwn(link, 'type') ? asString(Reflect.get(link, 'type')) : null
    const length = Object.hasOwn(link, 'length') ? asNumber(Reflect.get(link, 'length')) : null
    out.push({ url: href, mime, length })
  }
  return out
}

/** RSSの`enclosure`とJSON Feedの`attachments`は、同じ3つの値を別の名前で持つ */
function mapEnclosures(
  list: unknown,
  keys: { mime: string; length: string },
): ParsedItem['enclosures'] {
  if (!Array.isArray(list)) {
    return []
  }
  const out: ParsedItem['enclosures'] = []
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') {
      continue
    }
    const url = asString(Reflect.get(entry, 'url'))
    if (url === null) {
      continue
    }
    out.push({
      url,
      mime: asString(Reflect.get(entry, keys.mime)),
      length: asNumber(Reflect.get(entry, keys.length)),
    })
  }
  return out
}

const RSS_ENCLOSURE_KEYS = { mime: 'type', length: 'length' }
const JSON_ATTACHMENT_KEYS = { mime: 'mime_type', length: 'size_in_bytes' }

function collectMedia(media: unknown): {
  thumbnails: string[]
  contents: { url: string; mime: string | null }[]
} {
  const thumbnails: string[] = []
  const contents: { url: string; mime: string | null }[] = []
  if (media === null || typeof media !== 'object') {
    return { thumbnails, contents }
  }
  const pushThumbs = (thumbs: unknown) => {
    if (!Array.isArray(thumbs)) {
      return
    }
    for (const thumb of thumbs) {
      if (thumb !== null && typeof thumb === 'object' && Object.hasOwn(thumb, 'url')) {
        const url = asString(Reflect.get(thumb, 'url'))
        if (url !== null) {
          thumbnails.push(url)
        }
      }
    }
  }
  const pushContents = (list: unknown) => {
    if (!Array.isArray(list)) {
      return
    }
    for (const item of list) {
      if (item === null || typeof item !== 'object') {
        continue
      }
      const url = asString(Reflect.get(item, 'url'))
      if (url === null) {
        continue
      }
      contents.push({ url, mime: asString(Reflect.get(item, 'type')) })
      pushThumbs(Reflect.get(item, 'thumbnails'))
    }
  }
  pushThumbs(Reflect.get(media, 'thumbnails'))
  pushContents(Reflect.get(media, 'contents'))
  const groups = Reflect.get(media, 'groups')
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (group !== null && typeof group === 'object') {
        pushThumbs(Reflect.get(group, 'thumbnails'))
        pushContents(Reflect.get(group, 'contents'))
      }
    }
  }
  const group = Reflect.get(media, 'group')
  if (group !== null && typeof group === 'object') {
    pushThumbs(Reflect.get(group, 'thumbnails'))
    pushContents(Reflect.get(group, 'contents'))
  }
  return { thumbnails, contents }
}

function contentEncoded(content: unknown): string | null {
  if (content === null || typeof content !== 'object') {
    return null
  }
  return asString(Reflect.get(content, 'encoded'))
}

function pickContent(
  encoded: string | null,
  atomContent: string | null,
  description: string | null,
): string | null {
  return encoded ?? atomContent ?? description
}

function rssGuid(guid: unknown): { value: string | null; isPermalink: boolean } {
  if (guid === null || typeof guid !== 'object') {
    return { value: null, isPermalink: true }
  }
  const value = asString(Reflect.get(guid, 'value'))
  const flag = Reflect.get(guid, 'isPermaLink')
  return { value, isPermalink: flag !== false }
}

type RssItem = NonNullable<ReturnType<typeof parseRssFeed>['items']>[number]

function mapRss(feed: ReturnType<typeof parseRssFeed>): ParsedFeed {
  return {
    title: asString(feed.title) ?? firstString(feed.dc, DC_TITLE),
    siteUrl: asString(feed.link),
    description: asString(feed.description),
    language: asString(feed.language) ?? firstString(feed.dc, DC_LANGUAGE),
    ttlMinutes: asNumber(feed.ttl),
    items: mapItems<RssItem>(feed.items, (item) => {
      const guid = rssGuid(item.guid)
      const atom = item.atom
      const media = collectMedia(item.media)
      return {
        guid: guid.value,
        guidIsPermalink: guid.isPermalink,
        url: asString(item.link) ?? (atom !== undefined ? atomAlternateHref(atom.links) : null),
        title: asString(item.title) ?? firstString(item.dc, DC_TITLE),
        author:
          firstPerson(item.authors) ??
          firstString(item.dc, DC_CREATOR) ??
          (item.itunes !== undefined ? asString(item.itunes.author) : null),
        contentHtml: pickContent(
          contentEncoded(item.content),
          atom !== undefined ? asString(atom.content) : null,
          asString(item.description),
        ),
        summaryText: asString(item.description),
        publishedAt: dateToRaw(item.pubDate) ?? firstString(item.dc, DC_DATE),
        updatedAt: atom !== undefined ? dateToRaw(atom.updated) : null,
        enclosures: mapEnclosures(item.enclosures, RSS_ENCLOSURE_KEYS),
        mediaThumbnails: media.thumbnails,
        mediaContents: media.contents,
      }
    }),
  }
}

type AtomEntry = NonNullable<ReturnType<typeof parseAtomFeed>['entries']>[number]

function mapAtom(feed: ReturnType<typeof parseAtomFeed>): ParsedFeed {
  return {
    title: asString(feed.title),
    siteUrl: atomAlternateHref(feed.links),
    description: asString(feed.subtitle),
    language: firstString(feed.dc, DC_LANGUAGE),
    ttlMinutes: null,
    items: mapItems<AtomEntry>(feed.entries, (entry) => {
      const media = collectMedia(entry.media)
      return {
        guid: asString(entry.id),
        guidIsPermalink: false,
        url: atomAlternateHref(entry.links),
        title: asString(entry.title),
        author: firstPerson(entry.authors) ?? firstString(entry.dc, DC_CREATOR),
        contentHtml: pickContent(null, asString(entry.content), asString(entry.summary)),
        summaryText: asString(entry.summary),
        publishedAt:
          dateToRaw(entry.published) ?? dateToRaw(entry.updated) ?? firstString(entry.dc, DC_DATE),
        updatedAt: dateToRaw(entry.updated),
        enclosures: atomEnclosures(entry.links),
        mediaThumbnails: media.thumbnails,
        mediaContents: media.contents,
      }
    }),
  }
}

type RdfItem = NonNullable<ReturnType<typeof parseRdfFeed>['items']>[number]

function mapRdf(feed: ReturnType<typeof parseRdfFeed>): ParsedFeed {
  return {
    title: asString(feed.title),
    siteUrl: asString(feed.link),
    description: asString(feed.description),
    language: firstString(feed.dc, DC_LANGUAGE),
    ttlMinutes: null,
    items: mapItems<RdfItem>(feed.items, (item) => {
      const media = collectMedia(item.media)
      return {
        guid: item.rdf?.about === undefined ? null : asString(item.rdf.about),
        guidIsPermalink: false,
        url: asString(item.link),
        title: asString(item.title),
        author: firstString(item.dc, DC_CREATOR),
        contentHtml: pickContent(contentEncoded(item.content), null, asString(item.description)),
        summaryText: asString(item.description),
        publishedAt: firstString(item.dc, DC_DATE),
        updatedAt: null,
        enclosures: [],
        mediaThumbnails: media.thumbnails,
        mediaContents: media.contents,
      }
    }),
  }
}

type JsonItem = NonNullable<ReturnType<typeof parseJsonFeed>['items']>[number]

function mapJson(feed: ReturnType<typeof parseJsonFeed>): ParsedFeed {
  return {
    title: asString(feed.title),
    siteUrl: asString(feed.home_page_url),
    description: asString(feed.description),
    language: asString(feed.language),
    ttlMinutes: null,
    items: mapItems<JsonItem>(feed.items, (item) => ({
      guid: asString(item.id),
      guidIsPermalink: false,
      url: asString(item.url) ?? asString(item.external_url),
      title: asString(item.title),
      author: firstPerson(item.authors),
      contentHtml: asString(item.content_html) ?? asString(item.content_text),
      summaryText: asString(item.summary) ?? asString(item.content_text),
      publishedAt: dateToRaw(item.date_published),
      updatedAt: dateToRaw(item.date_modified),
      enclosures: mapEnclosures(item.attachments, JSON_ATTACHMENT_KEYS),
      mediaThumbnails: [asString(item.image), asString(item.banner_image)].filter(
        (url) => url !== null,
      ),
      mediaContents: [],
    })),
  }
}

export function parseFeed(text: string, format: FeedFormat): ParsedFeed {
  try {
    if (format === 'rss') {
      return mapRss(parseRssFeed(text))
    }
    if (format === 'atom') {
      return mapAtom(parseAtomFeed(text))
    }
    if (format === 'rdf') {
      return mapRdf(parseRdfFeed(text))
    }
    return mapJson(parseJsonFeed(text))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'parse failed'
    throw new FeedParseError(message)
  }
}
