export const STREAMS = ['unread', 'all', 'bookmarked', 'recently_read', 'updated'] as const
export type Stream = (typeof STREAMS)[number]

export const SORT_ORDERS = ['desc', 'asc'] as const
export type SortOrder = (typeof SORT_ORDERS)[number]

export const LOCALES = ['en', 'ja'] as const
export type Locale = (typeof LOCALES)[number]

export const FILTERS = [
  'unread',
  'all',
  'starred',
  'bookmarked',
  'recently-read',
  'updated',
] as const
export type Filter = (typeof FILTERS)[number]

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export type ReaderSearch = {
  filter?: Filter
  order?: SortOrder
  q?: string
}

export type Settings = {
  user_handle: string
  locale: Locale
  theme: Theme
  default_sort: SortOrder
  auto_mark_read: boolean
  unread_only_feeds: boolean
  initial_unread_count: number
}

type PatchableSettings = Omit<Settings, 'user_handle'>
export type SettingsPatch = {
  [K in keyof PatchableSettings]?: PatchableSettings[K] | undefined
}

export const DEFAULT_SETTINGS: Omit<Settings, 'user_handle'> = {
  locale: 'en',
  theme: 'system',
  default_sort: 'desc',
  auto_mark_read: true,
  unread_only_feeds: false,
  initial_unread_count: 100,
}
