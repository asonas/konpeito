import { bytesToBase64Url, hmacSha256Prefix } from './crypto.ts'

/**
 * `/img`は署名付きのクエリでしか引けない
 * 署名するのは記事の画像URL（`u`）かフィードのID（`i`）で、鍵は`IMAGE_PROXY_KEY`
 */
export function signedProxyQuery(url: string, key: string): { u: string; s: string } {
  return {
    u: bytesToBase64Url(new TextEncoder().encode(url)),
    s: hmacSha256Prefix(key, url),
  }
}

export function signedIconQuery(feedId: number, key: string): { i: string; s: string } {
  const i = String(feedId)
  return { i, s: hmacSha256Prefix(key, i) }
}

export function imageProxyUrl(key: string): (url: string) => string {
  return (url) => {
    const { u, s } = signedProxyQuery(url, key)
    return `/img?u=${u}&s=${s}`
  }
}
