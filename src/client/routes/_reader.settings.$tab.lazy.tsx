import { createLazyFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { SettingsDialog } from '../features/settings/SettingsDialog.tsx'
import { useLiveBootstrap } from '../lib/bootstrap.ts'
import { DEFAULT_SETTINGS_TAB, isSettingsTab } from '../lib/settings-tabs.ts'
import { useSettingsReturn } from './_reader.tsx'

export const Route = createLazyFileRoute('/_reader/settings/$tab')({
  component: SettingsRoute,
})

function SettingsRoute() {
  const bootstrap = useLiveBootstrap()
  const { tab } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const returnTo = useSettingsReturn()
  return (
    <SettingsDialog
      settings={bootstrap.settings}
      feeds={bootstrap.feeds}
      readOnly={bootstrap.demo}
      tab={isSettingsTab(tab) ? tab : DEFAULT_SETTINGS_TAB}
      onTabChange={(next) => {
        void navigate({ to: '/settings/$tab', params: { tab: next } })
      }}
      onClose={() => {
        router.history.push(returnTo)
      }}
    />
  )
}
