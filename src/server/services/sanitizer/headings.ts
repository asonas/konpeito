import { linkifyBareUrls } from '../../../shared/article-links.ts'
import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS } from '../../../shared/sanitize-policy.ts'

const HEADING = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const ALLOWED_TAG_SET = new Set<string>([...ALLOWED_TAGS])
const GLOBAL_ATTRS: readonly string[] = ALLOWED_ATTRIBUTES['*'] ?? []
const GLOBAL_ATTR_SET: ReadonlySet<string> = new Set<string>(GLOBAL_ATTRS)
const ATTRS_BY_TAG = new Map<string, ReadonlySet<string>>(
  ALLOWED_TAGS.map((tag) => [
    tag,
    new Set<string>([...GLOBAL_ATTRS, ...(ALLOWED_ATTRIBUTES[tag] ?? [])]),
  ]),
)
const REMOVE_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'object',
  'embed',
  'form',
  'input',
  'select',
  'textarea',
  'link',
  'meta',
  'base',
  'iframe',
])

function unwrap(el: Element): void {
  const parent = el.parentNode
  if (parent === null) {
    el.remove()
    return
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el)
  }
  el.remove()
}

export function applyAllowlist(document: Document): void {
  const nodes = [...document.querySelectorAll('*')]
  for (const el of nodes) {
    const tag = el.tagName.toLowerCase()
    if (REMOVE_TAGS.has(tag)) {
      el.remove()
      continue
    }
    if (!ALLOWED_TAG_SET.has(tag) && tag !== 'html' && tag !== 'body' && tag !== 'head') {
      unwrap(el)
      continue
    }
    // 許可リストに無い属性は落とす。on*のイベントハンドラもここで消える
    const allowed = ATTRS_BY_TAG.get(tag) ?? GLOBAL_ATTR_SET
    const toRemove: string[] = []
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase()
      // data-*は埋め込みのプレースホルダが使う。共有ポリシーもALLOW_DATA_ATTRで許している
      if (name.startsWith('data-')) {
        continue
      }
      if (!allowed.has(name)) {
        toRemove.push(attr.name)
      }
    }
    for (const name of toRemove) {
      el.removeAttribute(name)
    }
  }
}

function headingLevel(tag: string): number | null {
  if (!HEADING.has(tag)) {
    return null
  }
  const n = Number(tag.slice(1))
  return Number.isFinite(n) ? n : null
}

export function normalizeHeadings(document: Document): void {
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
  if (headings.length === 0) {
    return
  }
  const levels: number[] = []
  for (const el of headings) {
    const raw = headingLevel(el.tagName.toLowerCase())
    if (raw === null) {
      continue
    }
    const level = raw === 1 ? 2 : raw
    if (!levels.includes(level)) {
      levels.push(level)
    }
  }
  levels.sort((a, b) => a - b)
  const map = new Map<number, number>()
  let next = 2
  for (const level of levels) {
    map.set(level, next)
    next += 1
  }
  for (const el of headings) {
    const raw = headingLevel(el.tagName.toLowerCase())
    if (raw === null) {
      continue
    }
    const from = raw === 1 ? 2 : raw
    const to = map.get(from)
    if (to === undefined || to === raw) {
      continue
    }
    const replacement = document.createElement(`h${to}`)
    replacement.innerHTML = el.innerHTML
    for (const attr of el.attributes) {
      replacement.setAttribute(attr.name, attr.value)
    }
    el.replaceWith(replacement)
  }
}

export function decorateMediaAndLinks(document: Document): void {
  linkifyBareUrls(document.body ?? document.documentElement)
  for (const a of [...document.querySelectorAll('a')]) {
    const href = a.getAttribute('href')
    if (href === null || href.length === 0) {
      const parent = a.parentNode
      if (parent !== null) {
        while (a.firstChild) {
          parent.insertBefore(a.firstChild, a)
        }
      }
      a.remove()
      continue
    }
    a.setAttribute('rel', 'noopener noreferrer')
    a.setAttribute('referrerpolicy', 'no-referrer')
    a.setAttribute('target', '_blank')
    const text = a.textContent?.trim() ?? ''
    const hasAltImage = [...a.querySelectorAll('img')].some((img) => {
      const alt = img.getAttribute('alt')
      return alt !== null && alt.length > 0
    })
    if (text.length === 0 && !hasAltImage) {
      a.remove()
    }
  }
  for (const img of [...document.querySelectorAll('img')]) {
    const src = img.getAttribute('src')
    const srcset = img.getAttribute('srcset')
    if ((src === null || src.length === 0) && (srcset === null || srcset.length === 0)) {
      const parent = img.parentNode
      if (parent !== null) {
        while (img.firstChild) {
          parent.insertBefore(img.firstChild, img)
        }
      }
      img.remove()
      continue
    }
    if (!img.hasAttribute('alt')) {
      img.setAttribute('alt', '')
    }
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')
    const width = img.getAttribute('width')
    const height = img.getAttribute('height')
    if (width !== null && (!/^\d+$/.test(width) || Number(width) <= 0)) {
      img.removeAttribute('width')
    }
    if (height !== null && (!/^\d+$/.test(height) || Number(height) <= 0)) {
      img.removeAttribute('height')
    }
    const decoding = img.getAttribute('decoding')
    if (decoding !== null && decoding !== 'sync' && decoding !== 'async' && decoding !== 'auto') {
      img.setAttribute('decoding', 'async')
    }
    const fetchpriority = img.getAttribute('fetchpriority')
    if (
      fetchpriority !== null &&
      fetchpriority !== 'high' &&
      fetchpriority !== 'low' &&
      fetchpriority !== 'auto'
    ) {
      img.removeAttribute('fetchpriority')
    }
  }
  for (const source of [...document.querySelectorAll('source')]) {
    const src = source.getAttribute('src')
    const srcset = source.getAttribute('srcset')
    if ((src === null || src.length === 0) && (srcset === null || srcset.length === 0)) {
      const parent = source.parentNode
      if (parent !== null) {
        while (source.firstChild) {
          parent.insertBefore(source.firstChild, source)
        }
      }
      source.remove()
    }
  }
  for (const media of [...document.querySelectorAll('video, audio')]) {
    media.setAttribute('controls', '')
  }
}
