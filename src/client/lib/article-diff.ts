const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr', 'source', 'track', 'col'])
const ATOMIC_TAGS = new Set(['pre', 'table', 'picture', 'video', 'audio', 'math'])
const MAX_DP_CELLS = 1_500_000

type TokenKind = 'tag' | 'text'

interface Token {
  kind: TokenKind
  value: string
}

type OpType = 'eq' | 'del' | 'ins'

interface Op<T> {
  type: OpType
  item: T
}

interface Block {
  html: string
  key: string
  tag: string | null
}

const TEXT_SPLIT_RE = /(\s+)|([A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*)|([^\sA-Za-z0-9]+)/gu

export function diffArticleHtml(before: string, after: string): string {
  if (before === after) {
    return after
  }
  return renderBlockOps(lcs(getBlocks(before), getBlocks(after), blockKey))
}

function blockKey(block: Block): string {
  return block.key
}

function getBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: Block[] = []
  const children = doc.body.childNodes
  for (let i = 0; i < children.length; i += 1) {
    const node = children.item(i)
    if (node === null) {
      continue
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? ''
      if (text.trim().length === 0) {
        continue
      }
      blocks.push({ html: escapeHtml(text), key: `t:${text}`, tag: null })
      continue
    }
    if (!(node instanceof Element)) {
      continue
    }
    const tag = node.tagName.toLowerCase()
    blocks.push({ html: node.outerHTML, key: node.outerHTML, tag })
  }
  return blocks
}

function renderBlockOps(ops: Op<Block>[]): string {
  let html = ''
  let i = 0
  while (i < ops.length) {
    const current = ops[i]
    if (current === undefined) {
      break
    }
    if (current.type === 'eq') {
      html += current.item.html
      i += 1
      continue
    }
    const next = ops[i + 1]
    if (
      current.type === 'del' &&
      next !== undefined &&
      next.type === 'ins' &&
      current.item.tag === next.item.tag
    ) {
      html += diffInner(current.item, next.item)
      i += 2
      continue
    }
    if (current.type === 'del') {
      html += wrapChanged('del', current.item.html)
    } else {
      html += wrapChanged('ins', current.item.html)
    }
    i += 1
  }
  return html
}

function diffInner(before: Block, after: Block): string {
  const inner = renderTokenOps(lcs(tokenizeInner(before), tokenizeInner(after), tokenKey))
  if (after.tag === null) {
    return inner
  }
  const start = startTagOf(after.html)
  if (start === null) {
    return wrapChanged('del', before.html) + wrapChanged('ins', after.html)
  }
  return `${start}${inner}</${after.tag}>`
}

function tokenizeInner(block: Block): Token[] {
  if (block.tag === null) {
    const tokens: Token[] = []
    pushText(block.html, tokens)
    return tokens
  }
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const el = doc.body.firstElementChild
  if (el === null) {
    return tokenizeHtml(block.html)
  }
  const tokens: Token[] = []
  const children = el.childNodes
  for (let i = 0; i < children.length; i += 1) {
    const child = children.item(i)
    if (child !== null) {
      walk(child, tokens)
    }
  }
  return tokens
}

function startTagOf(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const el = doc.body.firstElementChild
  if (el === null) {
    return null
  }
  return serializeStartTag(el)
}

function tokenizeHtml(html: string): Token[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tokens: Token[] = []
  const children = doc.body.childNodes
  for (let i = 0; i < children.length; i += 1) {
    const child = children.item(i)
    if (child !== null) {
      walk(child, tokens)
    }
  }
  return tokens
}

function walk(node: Node, tokens: Token[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    pushText(node.nodeValue ?? '', tokens)
    return
  }
  if (!(node instanceof Element)) {
    return
  }
  const name = node.tagName.toLowerCase()
  if (ATOMIC_TAGS.has(name)) {
    tokens.push({ kind: 'tag', value: node.outerHTML })
    return
  }
  if (VOID_TAGS.has(name)) {
    tokens.push({ kind: 'tag', value: serializeStartTag(node) })
    return
  }
  tokens.push({ kind: 'tag', value: serializeStartTag(node) })
  const children = node.childNodes
  for (let i = 0; i < children.length; i += 1) {
    const child = children.item(i)
    if (child !== null) {
      walk(child, tokens)
    }
  }
  tokens.push({ kind: 'tag', value: `</${name}>` })
}

function serializeStartTag(el: Element): string {
  const name = el.tagName.toLowerCase()
  let out = `<${name}`
  const attrs = el.attributes
  for (let i = 0; i < attrs.length; i += 1) {
    const attr = attrs.item(i)
    if (attr === null) {
      continue
    }
    out += ` ${attr.name}="${escapeHtml(attr.value)}"`
  }
  return `${out}>`
}

function pushText(text: string, tokens: Token[]): void {
  if (text.length === 0) {
    return
  }
  TEXT_SPLIT_RE.lastIndex = 0
  let match = TEXT_SPLIT_RE.exec(text)
  while (match !== null) {
    const space = match[1]
    const word = match[2]
    const other = match[3]
    if (space !== undefined) {
      tokens.push({ kind: 'text', value: space })
    } else if (word !== undefined) {
      tokens.push({ kind: 'text', value: word })
    } else if (other !== undefined) {
      for (const sentence of splitCjk(other)) {
        tokens.push({ kind: 'text', value: sentence })
      }
    }
    match = TEXT_SPLIT_RE.exec(text)
  }
}

function splitCjk(text: string): string[] {
  return text.split(/(?<=[。．！？!?])/).filter((part) => part.length > 0)
}

function tokenKey(token: Token): string {
  return token.kind === 'tag' ? `#${token.value}` : token.value
}

function lcs<T>(a: T[], b: T[], keyOf: (item: T) => string): Op<T>[] {
  const n = a.length
  const m = b.length
  if (n === 0) {
    return b.map((item) => ({ type: 'ins', item }))
  }
  if (m === 0) {
    return a.map((item) => ({ type: 'del', item }))
  }
  if ((n + 1) * (m + 1) > MAX_DP_CELLS) {
    return [
      ...a.map((item) => ({ type: 'del' as const, item })),
      ...b.map((item) => ({ type: 'ins' as const, item })),
    ]
  }

  const cols = m + 1
  const dp = new Uint16Array((n + 1) * cols)
  const at = (i: number, j: number) => i * cols + j
  for (let i = 1; i <= n; i += 1) {
    const prev = a[i - 1]
    if (prev === undefined) {
      continue
    }
    const prevKey = keyOf(prev)
    for (let j = 1; j <= m; j += 1) {
      const next = b[j - 1]
      if (next === undefined) {
        continue
      }
      const match = prevKey === keyOf(next)
      const diag = dp[at(i - 1, j - 1)] ?? 0
      const up = dp[at(i - 1, j)] ?? 0
      const left = dp[at(i, j - 1)] ?? 0
      dp[at(i, j)] = match ? diag + 1 : Math.max(up, left)
    }
  }

  const ops: Op<T>[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const prev = a[i - 1]
    const next = b[j - 1]
    if (prev !== undefined && next !== undefined && keyOf(prev) === keyOf(next)) {
      ops.push({ type: 'eq', item: prev })
      i -= 1
      j -= 1
      continue
    }
    if ((dp[at(i, j - 1)] ?? 0) >= (dp[at(i - 1, j)] ?? 0)) {
      if (next !== undefined) {
        ops.push({ type: 'ins', item: next })
      }
      j -= 1
    } else {
      if (prev !== undefined) {
        ops.push({ type: 'del', item: prev })
      }
      i -= 1
    }
  }
  while (i > 0) {
    const prev = a[i - 1]
    if (prev !== undefined) {
      ops.push({ type: 'del', item: prev })
    }
    i -= 1
  }
  while (j > 0) {
    const next = b[j - 1]
    if (next !== undefined) {
      ops.push({ type: 'ins', item: next })
    }
    j -= 1
  }
  ops.reverse()
  return ops
}

function renderTokenOps(ops: Op<Token>[]): string {
  let html = ''
  let i = 0
  while (i < ops.length) {
    const current = ops[i]
    if (current === undefined) {
      break
    }
    if (current.type === 'eq') {
      html += emitToken(current.item)
      i += 1
      continue
    }
    const chunk: Token[] = []
    const type = current.type
    while (i < ops.length) {
      const op = ops[i]
      if (op === undefined || op.type !== type) {
        break
      }
      chunk.push(op.item)
      i += 1
    }
    const inner = chunk.map(emitToken).join('')
    if (inner.length === 0) {
      continue
    }
    html += wrapChanged(type, inner)
  }
  return html
}

function wrapChanged(type: 'del' | 'ins', inner: string): string {
  if (inner.length === 0) {
    return ''
  }
  if (type === 'del') {
    return `<del class="article-diff-del">${inner}</del>`
  }
  return `<ins class="article-diff-add">${inner}</ins>`
}

function emitToken(token: Token): string {
  return token.kind === 'tag' ? token.value : escapeHtml(token.value)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
