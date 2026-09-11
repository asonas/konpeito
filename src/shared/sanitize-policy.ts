export const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'div',
  'span',
  'section',
  'aside',
  'figure',
  'figcaption',
  'details',
  'summary',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'sub',
  'sup',
  'abbr',
  'cite',
  'q',
  'dfn',
  'kbd',
  'samp',
  'var',
  'time',
  'wbr',
  'ruby',
  'rt',
  'rp',
  'rtc',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'col',
  'colgroup',
  'img',
  'picture',
  'source',
  'video',
  'audio',
  'track',
  'a',
  'math',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mfrac',
  'msup',
  'msub',
  'msubsup',
  'msqrt',
  'mroot',
  'mtable',
  'mtr',
  'mtd',
  'mtext',
  'mspace',
  'mstyle',
  'munder',
  'mover',
  'munderover',
  'semantics',
  'annotation',
  'button',
] as const

export const ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  '*': ['id', 'class', 'lang', 'dir', 'title'],
  a: ['href', 'rel', 'target', 'referrerpolicy'],
  img: ['src', 'srcset', 'alt', 'width', 'height', 'loading', 'decoding', 'sizes', 'fetchpriority'],
  source: ['src', 'srcset', 'type', 'media', 'sizes'],
  video: ['src', 'poster', 'controls', 'width', 'height', 'preload'],
  audio: ['src', 'controls', 'preload'],
  track: ['src', 'kind', 'srclang', 'label', 'default'],
  td: ['colspan', 'rowspan', 'scope'],
  th: ['colspan', 'rowspan', 'scope'],
  col: ['span'],
  colgroup: ['span'],
  time: ['datetime'],
  button: ['type', 'data-embed-url', 'data-embed-host', 'aria-label'],
  math: ['display', 'xmlns'],
}

const ALLOWED_URL_SCHEMES = ['http', 'https', 'mailto'] as const

const ALLOWED_DATA_URL_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/gif',
  'data:image/webp',
  'data:image/avif',
  'data:image/apng',
  'data:image/svg+xml',
] as const

export const IFRAME_HOSTS = [
  'youtube.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'player.twitch.tv',
  'open.spotify.com',
  'soundcloud.com',
  'w.soundcloud.com',
  'bandcamp.com',
  'dailymotion.com',
  'player.bilibili.com',
  'cdn.embedly.com',
] as const

export const EMBED_FRAME_SRC = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://player.twitch.tv',
  'https://open.spotify.com',
  'https://w.soundcloud.com',
  'https://bandcamp.com',
  'https://www.dailymotion.com',
  'https://player.bilibili.com',
  'https://cdn.embedly.com',
] as const

type SanitizerElement = string | { name: string; attributes: string[] }

interface SanitizerConfig {
  elements: SanitizerElement[]
  attributes: string[]
  dataAttributes: boolean
}

function withoutDataAttrs(attrs: readonly string[]): string[] {
  return attrs.filter((attr) => !attr.startsWith('data-'))
}

export function toSanitizerConfig(): SanitizerConfig {
  const globalAttrs = withoutDataAttrs(ALLOWED_ATTRIBUTES['*'] ?? [])
  const elements: SanitizerElement[] = []
  for (const tag of ALLOWED_TAGS) {
    const extra = ALLOWED_ATTRIBUTES[tag]
    if (extra !== undefined && extra.length > 0) {
      const attrs = withoutDataAttrs(extra)
      if (attrs.length > 0) {
        elements.push({ name: tag, attributes: attrs })
        continue
      }
    }
    elements.push(tag)
  }
  return {
    elements,
    attributes: globalAttrs,
    dataAttributes: true,
  }
}

interface SharedDOMPurifyConfig {
  ALLOWED_TAGS: string[]
  ALLOWED_ATTR: string[]
  ALLOW_DATA_ATTR: boolean
  ALLOWED_URI_REGEXP: RegExp
  KEEP_CONTENT: boolean
}

export function toDOMPurifyConfig(): SharedDOMPurifyConfig {
  const attrs = new Set<string>()
  for (const list of Object.values(ALLOWED_ATTRIBUTES)) {
    for (const attr of list) {
      attrs.add(attr)
    }
  }
  const scheme = ALLOWED_URL_SCHEMES.join('|')
  const data = ALLOWED_DATA_URL_PREFIXES.map((p) => p.replace(':', '\\:')).join('|')
  return {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...attrs],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: new RegExp(
      `^(?:(?:${scheme}):|${data}|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))`,
      'i',
    ),
    KEEP_CONTENT: true,
  }
}
