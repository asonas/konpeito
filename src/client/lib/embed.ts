import { IFRAME_HOSTS } from '../../shared/sanitize-policy.ts'
import type { Messages } from '../i18n/en.ts'
import { getMessages } from '../i18n/locale.ts'

function embedLabel(host: string, messages: Messages = getMessages()): string {
  return messages.embed.loadVideo(host)
}

export function loadEmbedButton(button: HTMLButtonElement): void {
  const url = button.getAttribute('data-embed-url')
  const host = button.getAttribute('data-embed-host') ?? ''
  if (!url) {
    return
  }
  const allowed = IFRAME_HOSTS.some(
    (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`),
  )
  if (!allowed && host.length > 0) {
    return
  }
  const iframe = document.createElement('iframe')
  iframe.src = url
  iframe.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
  )
  iframe.setAttribute('loading', 'lazy')
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  iframe.setAttribute(
    'title',
    embedLabel(host.length > 0 ? host : getMessages().embed.fallbackHost),
  )
  iframe.className = 'aspect-video w-full'
  button.replaceWith(iframe)
}

export function applyEmbedLabels(root: Element, messages: Messages = getMessages()): void {
  for (const node of root.querySelectorAll('button[data-embed-host]')) {
    if (!(node instanceof HTMLButtonElement)) {
      continue
    }
    const host = node.getAttribute('data-embed-host') ?? ''
    node.setAttribute(
      'aria-label',
      embedLabel(host.length > 0 ? host : messages.embed.fallbackHost, messages),
    )
  }
}

export function autoloadEmbeds(root: Element): void {
  for (const node of [...root.querySelectorAll('button[data-embed-url]')]) {
    if (node instanceof HTMLButtonElement) {
      loadEmbedButton(node)
    }
  }
}
