import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEFAULT_SETTINGS_TAB, isReadOnlySettingsTab, isSettingsTab } from '../lib/settings-tabs.ts'

export const Route = createFileRoute('/_reader/settings/$tab')({
  beforeLoad: ({ params, context }) => {
    if (context.bootstrap.demo && !isReadOnlySettingsTab(params.tab)) {
      throw redirect({ to: '/settings/$tab', params: { tab: DEFAULT_SETTINGS_TAB } })
    }
    if (!isSettingsTab(params.tab)) {
      throw redirect({ to: '/settings/$tab', params: { tab: DEFAULT_SETTINGS_TAB } })
    }
  },
})
