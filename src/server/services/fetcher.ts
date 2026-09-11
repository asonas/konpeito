import { sha256Hex } from '../lib/crypto.ts'
import type { FeedErrorKind } from './parser/types.ts'
import { decodeUtf8Lenient } from './sniffer.ts'

export { TRANSIENT_ERRORS } from './parser/types.ts'
export type { FeedErrorKind }

const USER_AGENT = 'konpeito/1.0 (+https://github.com/shikakun/konpeito)'
const ACCEPT =
  'application/atom+xml, application/rss+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1'
const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 15_000
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443'])

interface FetchInput {
  url: string
  etag: string | null
  lastModified: string | null
  bodyHash: string | null
  noCache: boolean
  force: boolean
}

type FetchOutcome =
  | { kind: 'not_modified'; lastModified: string | null }
  | { kind: 'unchanged' }
  | {
      kind: 'ok'
      body: Uint8Array
      bodyHash: string
      contentType: string | null
      etag: string | null
      lastModified: string | null
      noCache: boolean
      cacheControlMaxAgeSec: number | null
      expiresInSec: number | null
      finalUrl: string
      permanentRedirect: boolean
    }
  | {
      kind: 'error'
      errorKind: FeedErrorKind
      status: number | null
      message: string
      retryAfterSec: number | null
    }

export class UnsafeUrlError extends Error {
  readonly errorKind: FeedErrorKind = 'ssrf_blocked'
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'UnsafeUrlError'
    this.status = status
  }
}

class RedirectError extends Error {
  readonly errorKind: FeedErrorKind
  readonly status: number | null

  constructor(errorKind: 'redirect_loop' | 'network', message: string, status: number | null) {
    super(message)
    this.name = 'RedirectError'
    this.errorKind = errorKind
    this.status = status
  }
}

/**
 * `new URL()`は点4つの形に正規化するので普段は4つ組だが、
 * 生のホスト文字列を渡されても取りこぼさないよう、`127.1`のような短縮形も解く。
 * 最後の要素が残りのオクテットをまとめて表す（inet_atonの規則）。
 */
function parseIPv4(host: string): number | null {
  const parts = host.split('.')
  if (parts.length > 4) {
    return null
  }
  const nums: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null
    }
    nums.push(Number(part))
  }
  const tail = nums.pop()
  if (tail === undefined || tail > 2 ** ((4 - nums.length) * 8) - 1) {
    return null
  }
  let addr = tail
  for (const [index, value] of nums.entries()) {
    if (value > 255) {
      return null
    }
    addr += value * 2 ** ((3 - index) * 8)
  }
  return addr >>> 0
}

function isPrivateIPv4(addr: number): boolean {
  const a = (addr >>> 24) & 0xff
  const b = (addr >>> 16) & 0xff
  if (a === 0) {
    return true
  }
  if (a === 10) {
    return true
  }
  if (a === 127) {
    return true
  }
  if (a === 169 && b === 254) {
    return true
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true
  }
  if (a === 192 && b === 168) {
    return true
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true
  }
  return false
}

function parseIPv6Groups(host: string): number[] | null {
  let raw = host.toLowerCase()
  if (raw.startsWith('[') && raw.endsWith(']')) {
    raw = raw.slice(1, -1)
  }
  let ipv4Tail: number | null = null
  const lastColon = raw.lastIndexOf(':')
  const dotted = raw.lastIndexOf('.')
  if (dotted > lastColon) {
    const v4 = parseIPv4(raw.slice(lastColon + 1))
    if (v4 === null) {
      return null
    }
    ipv4Tail = v4
    raw = raw.slice(0, lastColon + 1)
  }
  const halves = raw.split('::')
  if (halves.length > 2) {
    return null
  }
  const parseHalf = (half: string): number[] | null => {
    if (half.length === 0) {
      return []
    }
    const out: number[] = []
    for (const part of half.split(':')) {
      if (part.length === 0 || part.length > 4 || !/^[0-9a-f]+$/i.test(part)) {
        return null
      }
      out.push(Number.parseInt(part, 16))
    }
    return out
  }
  const left = parseHalf(halves[0] ?? '')
  const right = halves.length === 2 ? parseHalf(halves[1] ?? '') : []
  if (left === null || right === null) {
    return null
  }
  const groups = [...left]
  if (ipv4Tail !== null) {
    right.push((ipv4Tail >>> 16) & 0xffff, ipv4Tail & 0xffff)
  }
  const missing = 8 - groups.length - right.length
  if (halves.length === 2) {
    if (missing < 0) {
      return null
    }
    for (let i = 0; i < missing; i += 1) {
      groups.push(0)
    }
  } else if (groups.length + right.length !== 8) {
    return null
  }
  groups.push(...right)
  if (groups.length !== 8) {
    return null
  }
  return groups
}

function isPrivateIPv6(groups: number[]): boolean {
  const g0 = groups[0]
  const g1 = groups[1]
  if (g0 === undefined || g1 === undefined) {
    return false
  }
  const isLoopback = groups.every((g, i) => (i === 7 ? g === 1 : g === 0))
  if (isLoopback) {
    return true
  }
  if ((g0 & 0xfe00) === 0xfc00) {
    return true
  }
  if ((g0 & 0xffc0) === 0xfe80) {
    return true
  }
  const mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  if (mapped) {
    const hi = groups[6]
    const lo = groups[7]
    if (hi === undefined || lo === undefined) {
      return false
    }
    return isPrivateIPv4(((hi << 16) | lo) >>> 0)
  }
  return false
}

function hostnameLooksLocal(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost') {
    return true
  }
  return (
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa')
  )
}

export function assertSafeUrl(url: URL): void {
  const protocol = url.protocol
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new UnsafeUrlError(`blocked scheme: ${protocol}`)
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError(`blocked port: ${url.port}`)
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (hostnameLooksLocal(host)) {
    throw new UnsafeUrlError(`blocked host: ${host}`)
  }
  const v4 = parseIPv4(host)
  if (v4 !== null && isPrivateIPv4(v4)) {
    throw new UnsafeUrlError(`blocked private IPv4: ${host}`)
  }
  const v6 = parseIPv6Groups(host)
  if (v6 !== null && isPrivateIPv6(v6)) {
    throw new UnsafeUrlError(`blocked private IPv6: ${host}`)
  }
}

function errorOutcome(
  errorKind: FeedErrorKind,
  message: string,
  status: number | null,
  retryAfterSec: number | null,
): FetchOutcome {
  return { kind: 'error', errorKind, status, message, retryAfterSec }
}

function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null || header.length === 0) {
    return null
  }
  const asNumber = Number(header)
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.floor(asNumber)
  }
  const ms = Date.parse(header)
  if (Number.isNaN(ms)) {
    return null
  }
  return Math.max(0, Math.floor(ms / 1000) - now)
}

function parseMaxAge(header: string | null): number | null {
  if (header === null) {
    return null
  }
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(header)
  const digits = match?.[1]
  if (digits === undefined) {
    return null
  }
  return Number(digits)
}

function isExpiresZero(header: string | null): boolean {
  return header !== null && header.trim() === '0'
}

function parseExpiresIn(header: string | null, now: number): number | null {
  if (header === null || isExpiresZero(header)) {
    return null
  }
  const ms = Date.parse(header)
  if (Number.isNaN(ms)) {
    return null
  }
  return Math.floor(ms / 1000) - now
}

function isHtmlResponse(headers: Headers, body: Uint8Array | null): boolean {
  const ct = headers.get('content-type') ?? ''
  if (ct.toLowerCase().includes('text/html')) {
    return true
  }
  if (body === null) {
    return false
  }
  const head = decodeUtf8Lenient(body, 256).trim().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

function classifyHttpError(
  status: number,
  headers: Headers,
  body: Uint8Array | null,
  now: number,
): FetchOutcome {
  const retryAfterSec = parseRetryAfter(headers.get('retry-after'), now)
  if (status === 429 || (status === 503 && retryAfterSec !== null)) {
    return errorOutcome('rate_limited', `HTTP ${status}`, status, retryAfterSec)
  }
  if (status === 410) {
    return errorOutcome('gone', 'HTTP 410 Gone', status, null)
  }
  if (status === 404) {
    return errorOutcome('not_found', 'HTTP 404', status, null)
  }
  if (status === 401) {
    return errorOutcome('forbidden', 'HTTP 401', status, null)
  }
  if (status === 403) {
    const mitigated = headers.get('cf-mitigated')
    if (
      mitigated !== null &&
      mitigated.toLowerCase() === 'challenge' &&
      isHtmlResponse(headers, body)
    ) {
      return errorOutcome('cf_challenge', 'Cloudflare challenge', status, null)
    }
    return errorOutcome('forbidden', 'HTTP 403', status, null)
  }
  if (status >= 500 && status <= 599) {
    return errorOutcome('http_5xx', `HTTP ${status}`, status, retryAfterSec)
  }
  if (status >= 400 && status <= 499) {
    return errorOutcome('http_4xx', `HTTP ${status}`, status, null)
  }
  return errorOutcome('http_4xx', `HTTP ${status}`, status, null)
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.name === 'TimeoutError' || error.name === 'AbortError'
}

async function readBodyLimited(
  response: Response,
  maxBytes = MAX_BYTES,
): Promise<Uint8Array | 'too_large'> {
  const lengthHeader = response.headers.get('content-length')
  if (lengthHeader !== null) {
    const n = Number(lengthHeader)
    if (Number.isFinite(n) && n > maxBytes) {
      return 'too_large'
    }
  }
  if (response.body === null) {
    return new Uint8Array()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return 'too_large'
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

interface FetchBytesOk {
  body: Uint8Array
  contentType: string | null
  finalUrl: string
  status: number
}

/** Workers の native `fetch` は `this` が globalThis でないと Illegal invocation になる */
function invokeFetch(fetchFn: typeof fetch, input: string, init: RequestInit): Promise<Response> {
  return Reflect.apply(fetchFn, globalThis, [input, init])
}

interface RedirectOutcome {
  response: Response
  finalUrl: URL
  permanentRedirect: boolean
}

async function followRedirects(
  start: URL,
  init: RequestInit,
  deps: { fetch: typeof fetch },
): Promise<RedirectOutcome> {
  let current = start
  let hops = 0
  let permanentRedirect = false
  const visited = new Set<string>([current.href])
  while (true) {
    const response = await invokeFetch(deps.fetch, current.href, { ...init, redirect: 'manual' })
    if (response.status === 304 || response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current, permanentRedirect }
    }
    hops += 1
    if (hops > MAX_REDIRECTS) {
      throw new RedirectError('redirect_loop', 'redirect limit exceeded', response.status)
    }
    if (response.status === 301 || response.status === 308) {
      permanentRedirect = true
    }
    const location = response.headers.get('location')
    if (location === null || location.length === 0) {
      throw new RedirectError('network', 'redirect without Location', response.status)
    }
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      throw new RedirectError('network', 'invalid redirect URL', response.status)
    }
    try {
      assertSafeUrl(next)
    } catch (error) {
      if (error instanceof UnsafeUrlError) {
        throw new UnsafeUrlError(error.message, response.status)
      }
      throw error
    }
    if (visited.has(next.href)) {
      throw new RedirectError('redirect_loop', 'redirect loop detected', response.status)
    }
    visited.add(next.href)
    current = next
  }
}

export async function fetchBytes(
  url: string,
  deps: { fetch: typeof fetch; now: () => number },
  opts?: { maxBytes?: number; timeoutMs?: number; headers?: Readonly<Record<string, string>> },
): Promise<FetchBytesOk> {
  const start = new URL(url)
  assertSafeUrl(start)
  const { response, finalUrl } = await followRedirects(
    start,
    {
      method: 'GET',
      signal: AbortSignal.timeout(opts?.timeoutMs ?? TIMEOUT_MS),
      headers: opts?.headers ?? { 'User-Agent': USER_AGENT, Accept: ACCEPT },
    },
    deps,
  )
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const body = await readBodyLimited(response, opts?.maxBytes ?? MAX_BYTES)
  if (body === 'too_large') {
    throw new Error('too_large')
  }
  return {
    body,
    contentType: response.headers.get('content-type'),
    finalUrl: finalUrl.href,
    status: response.status,
  }
}

export async function fetchFeed(
  input: FetchInput,
  deps: { fetch: typeof fetch; now: () => number },
): Promise<FetchOutcome> {
  let start: URL
  try {
    start = new URL(input.url)
  } catch {
    return errorOutcome('network', 'invalid URL', null, null)
  }
  try {
    assertSafeUrl(start)
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return errorOutcome('ssrf_blocked', error.message, null, null)
    }
    throw error
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const headers = new Headers()
  headers.set('User-Agent', USER_AGENT)
  headers.set('Accept', ACCEPT)
  if (!input.force && !input.noCache) {
    if (input.etag !== null) {
      headers.set('If-None-Match', input.etag)
    }
    if (input.lastModified !== null) {
      headers.set('If-Modified-Since', input.lastModified)
    }
  }

  const now = deps.now()

  try {
    const { response, finalUrl, permanentRedirect } = await followRedirects(
      start,
      { method: 'GET', signal, headers },
      deps,
    )

    if (response.status === 304) {
      return { kind: 'not_modified', lastModified: response.headers.get('last-modified') }
    }

    if (response.status < 200 || response.status >= 300) {
      let peek: Uint8Array | null = null
      if (response.status === 403) {
        const body = await readBodyLimited(response)
        peek = body === 'too_large' ? null : body
      }
      return classifyHttpError(response.status, response.headers, peek, now)
    }

    const lengthHeader = response.headers.get('content-length')
    if (lengthHeader !== null && Number(lengthHeader) === 0) {
      return errorOutcome('empty_body', 'Content-Length: 0', response.status, null)
    }

    const body = await readBodyLimited(response)
    if (body === 'too_large') {
      return errorOutcome('too_large', 'response exceeds 5MB', response.status, null)
    }
    if (body.byteLength === 0) {
      return errorOutcome('empty_body', 'empty body', response.status, null)
    }

    const etag = response.headers.get('etag')
    const lastModified = response.headers.get('last-modified')
    const expires = response.headers.get('expires')
    const noCache = isExpiresZero(expires)
    const bodyHash = sha256Hex(body)

    if (!input.force) {
      if (!noCache && !input.noCache) {
        if (etag !== null && input.etag !== null && etag === input.etag) {
          return { kind: 'unchanged' }
        }
        if (
          etag === null &&
          lastModified !== null &&
          input.lastModified !== null &&
          lastModified === input.lastModified
        ) {
          return { kind: 'unchanged' }
        }
      }
      if (input.bodyHash !== null && bodyHash === input.bodyHash) {
        return { kind: 'unchanged' }
      }
    }

    return {
      kind: 'ok',
      body,
      bodyHash,
      contentType: response.headers.get('content-type'),
      etag: noCache ? null : etag,
      lastModified: noCache ? null : lastModified,
      noCache,
      cacheControlMaxAgeSec: parseMaxAge(response.headers.get('cache-control')),
      expiresInSec: parseExpiresIn(expires, now),
      finalUrl: finalUrl.href,
      permanentRedirect,
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return errorOutcome('ssrf_blocked', error.message, error.status, null)
    }
    if (error instanceof RedirectError) {
      return errorOutcome(error.errorKind, error.message, error.status, null)
    }
    if (isTimeoutError(error)) {
      return errorOutcome('timeout', 'request timed out', null, null)
    }
    const message = error instanceof Error ? error.message : 'network error'
    return errorOutcome('network', message, null, null)
  }
}
