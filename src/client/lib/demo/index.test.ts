import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/constants.ts'
import { LOCALE_STORAGE_KEY } from '../../i18n/locale.ts'
import type { Bootstrap } from '../queries.ts'
import { stubLocalStorage } from '../storage.test-helper.ts'
import { THEME_STORAGE_KEY } from '../theme.ts'
import { withDemoBootstrap } from './index.ts'

let memory = new Map<string, string>()

function bootstrapOf(demo: boolean): Bootstrap {
  return {
    demo,
    feeds: [],
    tags: [],
    unread_count: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      user_handle: '00000000-0000-4000-8000-000000000000',
    },
  }
}

describe('withDemoBootstrap', () => {
  beforeEach(() => {
    memory = stubLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leaves a normal bootstrap alone', () => {
    const bootstrap = bootstrapOf(false)
    expect(withDemoBootstrap(bootstrap)).toBe(bootstrap)
  })

  it('overlays locale and theme from this device', () => {
    memory.set(LOCALE_STORAGE_KEY, 'ja')
    memory.set(THEME_STORAGE_KEY, 'dark')
    const next = withDemoBootstrap(bootstrapOf(true))
    expect(next.settings.locale).toBe('ja')
    expect(next.settings.theme).toBe('dark')
  })
})
