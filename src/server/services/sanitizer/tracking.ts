const BLOCKED_URL_PARTS = [
  'api.flattr.com',
  'feeds.feedburner.com',
  'feedsportal.com',
  'stats.wordpress.com',
  'www.facebook.com/sharer.php',
  'linkedin.com/shareArticle',
  'pinterest.com/pin/create/button/',
  'twitter.com/intent/tweet',
  'twitter.com/share',
  'x.com/intent/tweet',
  'x.com/share',
]

function isBlockedUrl(value: string | null): boolean {
  if (value === null || value.length === 0) {
    return false
  }
  const lower = value.toLowerCase()
  for (const part of BLOCKED_URL_PARTS) {
    if (lower.includes(part)) {
      return true
    }
  }
  return false
}

function pixelSize(value: string | null): boolean {
  if (value === null) {
    return false
  }
  const n = Number(value)
  return n === 0 || n === 1
}

export function removeTracking(document: Document): void {
  for (const el of [...document.querySelectorAll('[hidden]')]) {
    el.remove()
  }
  for (const img of [...document.querySelectorAll('img')]) {
    if (pixelSize(img.getAttribute('width')) && pixelSize(img.getAttribute('height'))) {
      img.remove()
    }
  }
  for (const el of [...document.querySelectorAll('img, iframe, a')]) {
    const url = el.getAttribute('src') ?? el.getAttribute('href')
    if (isBlockedUrl(url)) {
      el.remove()
    }
  }
}
