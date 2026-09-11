const SRC_ATTRS = [
  'data-src',
  'data-original',
  'data-orig',
  'data-url',
  'data-orig-file',
  'data-large-file',
  'data-medium-file',
  'data-original-mos',
  'data-2000src',
  'data-1000src',
  'data-800src',
  'data-655src',
  'data-500src',
  'data-380src',
]

function firstDataSrc(el: Element): string | null {
  for (const attr of SRC_ATTRS) {
    const value = el.getAttribute(attr)
    if (value !== null && value.length > 0) {
      return value
    }
  }
  return null
}

function promoteNoscriptImages(document: Document): void {
  const noscripts = [...document.querySelectorAll('noscript')]
  for (const noscript of noscripts) {
    const html = noscript.innerHTML
    if (!html.toLowerCase().includes('<img')) {
      continue
    }
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    const images = tmp.querySelectorAll('img')
    if (images.length !== 1) {
      continue
    }
    const img = images[0]
    if (img === undefined) {
      continue
    }
    noscript.replaceWith(img)
  }
}

export function restoreLazyImages(document: Document): void {
  const nodes = [...document.querySelectorAll('img, div, iframe')]
  for (const el of nodes) {
    const src = firstDataSrc(el)
    const srcset = el.getAttribute('data-srcset')
    if (src === null && (srcset === null || srcset.length === 0)) {
      continue
    }
    if (el.tagName.toLowerCase() === 'div') {
      const img = document.createElement('img')
      const alt = el.getAttribute('alt')
      if (alt !== null) {
        img.setAttribute('alt', alt)
      }
      if (src !== null) {
        img.setAttribute('src', src)
      }
      if (srcset !== null && srcset.length > 0) {
        img.setAttribute('srcset', srcset)
      }
      el.replaceWith(img)
      continue
    }
    if (src !== null) {
      el.setAttribute('src', src)
    }
    if (srcset !== null && srcset.length > 0) {
      el.setAttribute('srcset', srcset)
    }
  }
  promoteNoscriptImages(document)
}
