import { useEffect, useRef, useState } from 'react'
import { applyArticleLinks } from '../../shared/article-links.ts'
import { toDOMPurifyConfig, toSanitizerConfig } from '../../shared/sanitize-policy.ts'
import { getLocale, getMessages, subscribeLocale } from '../i18n/locale.ts'
import { applyEmbedLabels, autoloadEmbeds } from '../lib/embed.ts'
import { cn } from '../lib/utils.ts'

let purifyPromise: Promise<typeof import('dompurify')> | undefined
function loadPurify(): Promise<typeof import('dompurify')> {
  purifyPromise ??= import('dompurify')
  return purifyPromise
}

export function SafeHtml(props: { html: string; lang: string | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [locale, setLocale] = useState(getLocale)

  useEffect(() => subscribeLocale(setLocale), [])

  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const messages = getMessages(locale)
    function decorate(target: HTMLDivElement) {
      applyArticleLinks(target)
      applyEmbedLabels(target, messages)
      autoloadEmbeds(target)
    }
    const setHTML = Reflect.get(el, 'setHTML')
    const SanitizerCtor = Reflect.get(globalThis, 'Sanitizer')
    if (typeof setHTML === 'function' && typeof SanitizerCtor === 'function') {
      const sanitizer = Reflect.construct(SanitizerCtor, [toSanitizerConfig()])
      Reflect.apply(setHTML, el, [props.html, { sanitizer }])
      decorate(el)
      return
    }
    // 読み込みを待つあいだに`props.html`が変わることがあるので、
    // 古い内容を書かないよう中断できるようにする
    let cancelled = false
    void loadPurify().then(({ default: DOMPurify }) => {
      const current = ref.current
      if (cancelled || current === null) {
        return
      }
      const config = toDOMPurifyConfig()
      const clean = DOMPurify.sanitize(props.html, {
        ALLOWED_TAGS: config.ALLOWED_TAGS,
        ALLOWED_ATTR: config.ALLOWED_ATTR,
        ALLOW_DATA_ATTR: config.ALLOW_DATA_ATTR,
        ALLOWED_URI_REGEXP: config.ALLOWED_URI_REGEXP,
        KEEP_CONTENT: config.KEEP_CONTENT,
      })
      current.innerHTML = typeof clean === 'string' ? clean : ''
      decorate(current)
    })
    return () => {
      cancelled = true
    }
  }, [locale, props.html])

  return <div ref={ref} lang={props.lang ?? ''} className={cn(props.className)} />
}
