import { readStoredLocale } from '../../i18n/locale.ts'
import type { Bootstrap } from '../queries.ts'
import { readStoredTheme } from '../theme.ts'
import { withDemoUnread } from './read-store.ts'

export const DEMO_INSTALL_URL = 'https://github.com/shikakun/konpeito'

function withDemoClientSettings(bootstrap: Bootstrap): Bootstrap {
  if (!bootstrap.demo) {
    return bootstrap
  }
  return {
    ...bootstrap,
    settings: {
      ...bootstrap.settings,
      locale: readStoredLocale(),
      theme: readStoredTheme(),
    },
  }
}

export function withDemoBootstrap(bootstrap: Bootstrap): Bootstrap {
  return withDemoUnread(withDemoClientSettings(bootstrap))
}
