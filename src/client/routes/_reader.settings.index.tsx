import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEFAULT_SETTINGS_TAB } from '../lib/settings-tabs.ts'

export const Route = createFileRoute('/_reader/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/$tab', params: { tab: DEFAULT_SETTINGS_TAB } })
  },
})
