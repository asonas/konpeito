import { generateOpml, parseOpml } from 'feedsmith'

export interface OpmlFeed {
  title: string
  xmlUrl: string
  htmlUrl: string | null
  tags: string[]
}

function walkOutlines(outlines: unknown, tags: string[], out: OpmlFeed[]): void {
  if (!Array.isArray(outlines)) {
    return
  }
  for (const outline of outlines) {
    if (outline === null || typeof outline !== 'object') {
      continue
    }
    const text = Reflect.get(outline, 'text')
    const title = Reflect.get(outline, 'title')
    const xmlUrl = Reflect.get(outline, 'xmlUrl')
    const htmlUrl = Reflect.get(outline, 'htmlUrl')
    const name = (
      typeof title === 'string' && title.length > 0 ? title : typeof text === 'string' ? text : ''
    ).trim()
    const children = Reflect.get(outline, 'outlines')
    if (typeof xmlUrl === 'string' && xmlUrl.length > 0) {
      out.push({
        title: name.length > 0 ? name : xmlUrl,
        xmlUrl,
        htmlUrl: typeof htmlUrl === 'string' && htmlUrl.length > 0 ? htmlUrl : null,
        tags: [...tags],
      })
      walkOutlines(children, tags, out)
      continue
    }
    const nextTags = name.length > 0 ? [...tags, name] : tags
    walkOutlines(children, nextTags, out)
  }
}

export function parseOpmlImport(xml: string): OpmlFeed[] {
  const doc = parseOpml(xml)
  const body = doc.body
  const outlines = body === undefined ? undefined : body.outlines
  const out: OpmlFeed[] = []
  walkOutlines(outlines, [], out)
  return out
}

export function generateOpmlExport(feeds: OpmlFeed[]): string {
  const byTag = new Map<string, OpmlFeed[]>()
  const untagged: OpmlFeed[] = []
  for (const feed of feeds) {
    if (feed.tags.length === 0) {
      untagged.push(feed)
      continue
    }
    for (const tag of feed.tags) {
      const list = byTag.get(tag) ?? []
      list.push(feed)
      byTag.set(tag, list)
    }
  }
  const outlines: {
    text: string
    title: string
    type?: string
    xmlUrl?: string
    htmlUrl?: string
    outlines?: {
      text: string
      title: string
      type: string
      xmlUrl: string
      htmlUrl?: string
    }[]
  }[] = []
  for (const [tag, list] of byTag) {
    outlines.push({
      text: tag,
      title: tag,
      outlines: list.map((feed) => ({
        text: feed.title,
        title: feed.title,
        type: 'rss',
        xmlUrl: feed.xmlUrl,
        ...(feed.htmlUrl !== null ? { htmlUrl: feed.htmlUrl } : {}),
      })),
    })
  }
  for (const feed of untagged) {
    outlines.push({
      text: feed.title,
      title: feed.title,
      type: 'rss',
      xmlUrl: feed.xmlUrl,
      ...(feed.htmlUrl !== null ? { htmlUrl: feed.htmlUrl } : {}),
    })
  }
  return generateOpml(
    {
      head: { title: 'konpeito' },
      body: { outlines },
    },
    { lenient: true },
  )
}
