import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import type { Locale } from '../../shared/constants.ts'
import type { Messages } from './en.ts'
import { applyLocale, getMessages, initLocale, loadCatalog, subscribeLocale } from './locale.ts'

interface I18nValue {
  locale: Locale
  messages: Messages
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initLocale())

  useEffect(() => subscribeLocale(setLocaleState), [])

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      messages: getMessages(locale),
      setLocale: (next: Locale) => {
        void loadCatalog(next).then(() => {
          applyLocale(next)
        })
      },
    }),
    [locale],
  )

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (value === null) {
    throw new Error('useI18n requires I18nProvider')
  }
  return value
}

export function useMessages(): Messages {
  return useI18n().messages
}
