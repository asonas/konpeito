export const SETTINGS_TABS = [
  'display',
  'data',
  'storage',
  'health',
  'passkeys',
  'sessions',
  'tokens',
] as const

export type SettingsTabId = (typeof SETTINGS_TABS)[number]

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'display'

export function isSettingsTab(value: string): value is SettingsTabId {
  return SETTINGS_TABS.some((id) => id === value)
}

export function isReadOnlySettingsTab(value: string): boolean {
  return value === DEFAULT_SETTINGS_TAB
}
