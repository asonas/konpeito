import type { Settings } from '../../shared/constants.ts'
import { THEMES, type Theme } from '../../shared/constants.ts'
import { readLocal, writeLocal } from './storage.ts'

export const THEME_STORAGE_KEY = 'reader:theme'

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value)
}

export function readStoredTheme(): Theme {
  const stored = readLocal(THEME_STORAGE_KEY)
  return stored !== null && isTheme(stored) ? stored : 'system'
}

export function writeStoredTheme(theme: Theme): void {
  writeLocal(THEME_STORAGE_KEY, theme)
}

export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  if (theme === 'system') {
    delete root.dataset.theme
    return
  }
  root.dataset.theme = theme
}
