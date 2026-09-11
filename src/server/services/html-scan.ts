import { assertSafeUrl } from './fetcher.ts'

/**
 * HTMLから特定の要素の属性だけを拾う
 * WorkersではHTMLRewriterを使い、無い環境（テストのjsdomなど）ではlinkedomに落とす
 * どちらもDOMを組み立てず、必要な属性だけを見る
 */
export async function scanElements(
  html: string,
  tag: 'link' | 'a',
  visit: (attribute: (name: string) => string | null) => void,
): Promise<void> {
  if ('HTMLRewriter' in globalThis) {
    const rewriter = new HTMLRewriter().on(tag, {
      element(el) {
        visit((name) => el.getAttribute(name))
      },
    })
    await rewriter.transform(new Response(html)).text()
    return
  }
  const { parseHTML } = await import('linkedom')
  for (const el of parseHTML(html).document.querySelectorAll(tag)) {
    visit((name) => el.getAttribute(name))
  }
}

export async function collectLinkedUrls(
  html: string,
  baseUrl: string,
  tag: 'link' | 'a',
  pick: (attribute: (name: string) => string | null) => number | null,
): Promise<string[]> {
  const found: { url: string; weight: number }[] = []
  await scanElements(html, tag, (attribute) => {
    const href = attribute('href')
    if (href === null) {
      return
    }
    const weight = pick(attribute)
    if (weight === null) {
      return
    }
    try {
      const abs = new URL(href, baseUrl)
      assertSafeUrl(abs)
      found.push({ url: abs.toString(), weight })
    } catch {
      // 安全でないURLと組み立てられないURLは候補にしない
    }
  })
  found.sort((left, right) => left.weight - right.weight)
  const urls: string[] = []
  const seen = new Set<string>()
  for (const entry of found) {
    if (!seen.has(entry.url)) {
      seen.add(entry.url)
      urls.push(entry.url)
    }
  }
  return urls
}
