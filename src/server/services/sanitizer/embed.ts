import { IFRAME_HOSTS } from '../../../shared/sanitize-policy.ts'
import { hostMatches, tryParseUrl } from './html.ts'

function iframeHostLabel(host: string): string {
  if (host.includes('youtube')) {
    return 'YouTube'
  }
  if (host.includes('vimeo')) {
    return 'Vimeo'
  }
  if (host.includes('twitch')) {
    return 'Twitch'
  }
  if (host.includes('spotify')) {
    return 'Spotify'
  }
  if (host.includes('soundcloud')) {
    return 'SoundCloud'
  }
  if (host.includes('bandcamp')) {
    return 'Bandcamp'
  }
  if (host.includes('dailymotion')) {
    return 'Dailymotion'
  }
  if (host.includes('bilibili')) {
    return 'Bilibili'
  }
  return 'Embed'
}

function rewriteEmbedUrl(url: URL): URL {
  if (
    hostMatches(url.hostname, 'youtube.com') ||
    hostMatches(url.hostname, 'youtube-nocookie.com')
  ) {
    url.hostname = 'www.youtube-nocookie.com'
    return url
  }
  if (hostMatches(url.hostname, 'player.vimeo.com')) {
    url.searchParams.set('dnt', '1')
    return url
  }
  return url
}

function allowedHost(hostname: string): string | null {
  for (const host of IFRAME_HOSTS) {
    if (hostMatches(hostname, host)) {
      return host
    }
  }
  return null
}

export function replaceEmbeds(document: Document, baseUrl: string): void {
  for (const iframe of [...document.querySelectorAll('iframe')]) {
    const src = iframe.getAttribute('src')
    if (src === null || src.length === 0) {
      iframe.remove()
      continue
    }
    const parsed = tryParseUrl(src, baseUrl)
    if (parsed === null) {
      iframe.remove()
      continue
    }
    const host = allowedHost(parsed.hostname)
    if (host === null) {
      iframe.remove()
      continue
    }
    const rewritten = rewriteEmbedUrl(parsed)
    const button = document.createElement('button')
    button.setAttribute('type', 'button')
    button.setAttribute('data-embed-url', rewritten.toString())
    button.setAttribute('data-embed-host', rewritten.hostname)
    button.setAttribute('aria-label', `Load ${iframeHostLabel(rewritten.hostname)} video`)
    iframe.replaceWith(button)
  }
}
