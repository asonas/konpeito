const TEXT_NODE = 3
const ELEMENT_NODE = 1

const SKIP_TAGS = new Set([
  'a',
  'pre',
  'code',
  'script',
  'style',
  'textarea',
  'kbd',
  'samp',
  'button',
])

const URL_RE = /(?:https?:\/\/|mailto:)[\w.~:/?#[\]@!$&'()*+,;=%-]+/gi

const TRAILING_PUNCT = new Set([
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  '。',
  '、',
  '」',
  '』',
  '）',
  ']',
  '}',
  "'",
  '"',
  '>',
])

export function applyArticleLinks(root: Element): void {
  linkifyBareUrls(root)
  decorateAnchors(root)
}

export function linkifyBareUrls(root: Element): void {
  const nodes: Text[] = []
  collectTextNodes(root, nodes)
  for (const node of nodes) {
    linkifyTextNode(node)
  }
}

function decorateAnchors(root: Element): void {
  for (const a of [...root.querySelectorAll('a[href]')]) {
    a.setAttribute('rel', 'noopener noreferrer')
    a.setAttribute('referrerpolicy', 'no-referrer')
    a.setAttribute('target', '_blank')
  }
}

function collectTextNodes(node: Node, out: Text[]): void {
  if (node.nodeType === TEXT_NODE) {
    out.push(node as Text)
    return
  }
  if (node.nodeType === ELEMENT_NODE) {
    const tag = (node as Element).tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) {
      return
    }
  }
  const children = node.childNodes
  for (let i = 0; i < children.length; i += 1) {
    const child = children.item(i)
    if (child !== null) {
      collectTextNodes(child, out)
    }
  }
}

function linkifyTextNode(node: Text): void {
  const text = node.nodeValue ?? ''
  const doc = node.ownerDocument
  if (doc === null || text.length === 0) {
    return
  }
  const parts: Array<{ type: 'text' | 'link'; value: string }> = []
  let last = 0
  let found = false
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0] ?? ''
    const start = match.index ?? 0
    const href = trimTrailing(raw)
    if (!isSafeHref(href)) {
      continue
    }
    found = true
    if (start > last) {
      parts.push({ type: 'text', value: text.slice(last, start) })
    }
    parts.push({ type: 'link', value: href })
    last = start + href.length
  }
  if (!found) {
    return
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) })
  }
  const frag = doc.createDocumentFragment()
  for (const part of parts) {
    if (part.type === 'text') {
      frag.appendChild(doc.createTextNode(part.value))
      continue
    }
    const a = doc.createElement('a')
    a.setAttribute('href', part.value)
    a.textContent = part.value
    frag.appendChild(a)
  }
  node.parentNode?.replaceChild(frag, node)
}

function trimTrailing(url: string): string {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1] ?? ''
    if (ch === ')') {
      const slice = url.slice(0, end)
      const open = (slice.match(/\(/g) ?? []).length
      const close = (slice.match(/\)/g) ?? []).length
      if (close > open) {
        end -= 1
        continue
      }
    }
    if (TRAILING_PUNCT.has(ch)) {
      end -= 1
      continue
    }
    break
  }
  return url.slice(0, end)
}

function isSafeHref(value: string): boolean {
  const lower = value.toLowerCase()
  if (lower.startsWith('mailto:')) {
    return lower.length > 'mailto:'.length
  }
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
