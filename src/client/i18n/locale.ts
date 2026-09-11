import type { Locale } from '../../shared/constants.ts'
import { readLocal, writeLocal } from '../lib/storage.ts'
import { en, type Messages } from './en.ts'

const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_STORAGE_KEY = 'reader:locale'

const catalogs = new Map<Locale, Messages>([['en', en]])
const loading = new Map<Locale, Promise<Messages>>()

async function importCatalog(locale: Locale): Promise<Messages> {
  if (locale === 'en') {
    return en
  }
  const { ja } = await import('./ja.ts')
  return ja
}

export function loadCatalog(locale: Locale): Promise<Messages> {
  const loaded = catalogs.get(locale)
  if (loaded !== undefined) {
    return Promise.resolve(loaded)
  }
  const pending = loading.get(locale)
  if (pending !== undefined) {
    return pending
  }
  const promise = importCatalog(locale).then((messages) => {
    catalogs.set(locale, messages)
    loading.delete(locale)
    return messages
  })
  loading.set(locale, promise)
  return promise
}

let currentLocale: Locale = DEFAULT_LOCALE
const listeners = new Set<(locale: Locale) => void>()

export function isLocale(value: string): value is Locale {
  return value === 'en' || value === 'ja'
}

export function getLocale(): Locale {
  return currentLocale
}

export function getMessages(locale: Locale = currentLocale): Messages {
  return catalogs.get(locale) ?? en
}

export function readStoredLocale(): Locale {
  const stored = readLocal(LOCALE_STORAGE_KEY)
  return stored !== null && isLocale(stored) ? stored : DEFAULT_LOCALE
}

export function applyLocale(locale: Locale): void {
  currentLocale = locale
  document.documentElement.lang = locale
  writeLocal(LOCALE_STORAGE_KEY, locale)
  for (const listener of listeners) {
    listener(locale)
  }
}

export function subscribeLocale(listener: (locale: Locale) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function initLocale(): Locale {
  const locale = readStoredLocale()
  currentLocale = locale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
  return locale
}
