import type { Locale } from '../../shared/constants.ts'
import type { Messages } from '../i18n/en.ts'
import { getLocale, getMessages } from '../i18n/locale.ts'

const DISPLAY_TIME_ZONE = 'Asia/Tokyo'

const dateFormats: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  ja: new Intl.DateTimeFormat('ja-JP', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }),
}

const timeFormats: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }),
  ja: new Intl.DateTimeFormat('ja-JP', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }),
}

export function formatDate(unixSec: number, locale: Locale = getLocale()): string {
  return dateFormats[locale].format(new Date(unixSec * 1000))
}

export function formatDateTime(unixSec: number, locale: Locale = getLocale()): string {
  const date = new Date(unixSec * 1000)
  return `${timeFormats[locale].format(date)} · ${dateFormats[locale].format(date)}`
}

export function formatRelative(
  unixSec: number,
  nowSec = Math.floor(Date.now() / 1000),
  locale: Locale = getLocale(),
): string {
  const t = getMessages(locale)
  const diff = nowSec - unixSec
  if (diff < 60) {
    return t.format.justNow
  }
  if (diff < 3600) {
    return t.format.minutesAgo(Math.floor(diff / 60))
  }
  if (diff < 86400) {
    return t.format.hoursAgo(Math.floor(diff / 3600))
  }
  if (diff < 86400 * 7) {
    return t.format.daysAgo(Math.floor(diff / 86400))
  }
  return formatDate(unixSec, locale)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function errorKindLabel(kind: string | null, messages: Messages = getMessages()): string {
  if (!kind) {
    return ''
  }
  const labels = messages.format.errorKinds
  if (Object.hasOwn(labels, kind)) {
    return labels[kind as keyof typeof labels]
  }
  return kind
}
