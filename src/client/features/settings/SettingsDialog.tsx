import { Button } from '../../components/ui/button.tsx'
import { AppDialog } from '../../components/ui/dialog.tsx'
import { Tab, TabList, TabPanel, Tabs } from '../../components/ui/tabs.tsx'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { logout } from '../../lib/auth.ts'
import { useMediaQuery } from '../../lib/layout.ts'
import type { Feed, Settings } from '../../lib/queries.ts'
import {
  isReadOnlySettingsTab,
  isSettingsTab,
  SETTINGS_TABS,
  type SettingsTabId,
} from '../../lib/settings-tabs.ts'
import { cn } from '../../lib/utils.ts'
import { DataTab } from './tabs/DataTab.tsx'
import { DisplayTab } from './tabs/DisplayTab.tsx'
import { HealthTab } from './tabs/HealthTab.tsx'
import { PasskeysTab } from './tabs/PasskeysTab.tsx'
import { SessionsTab } from './tabs/SessionsTab.tsx'
import { StorageTab } from './tabs/StorageTab.tsx'
import { TokensTab } from './tabs/TokensTab.tsx'

const panelClassName = 'h-full min-h-0 overflow-y-auto px-6 py-5'

export function SettingsDialog(props: {
  settings: Settings
  feeds: Feed[]
  readOnly: boolean
  tab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
  onClose: () => void
}) {
  const t = useMessages()
  const vertical = useMediaQuery('(min-width: 40rem)')
  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          props.onClose()
        }
      }}
      title={t.settings.title}
      size="lg"
      bodyLayout="fill"
    >
      <Tabs
        value={props.tab}
        orientation={vertical ? 'vertical' : 'horizontal'}
        className="h-full flex-1"
        onValueChange={(value) => {
          if (isSettingsTab(value)) {
            props.onTabChange(value)
          }
        }}
      >
        <div
          className={cn(
            'flex shrink-0 bg-shell',
            vertical
              ? 'w-44 flex-col border-r border-line'
              : 'flex-row items-center gap-2 overflow-x-auto border-b border-line px-2',
          )}
        >
          <TabList className={cn(vertical ? 'flex-col p-2' : 'flex-row gap-1 py-2')}>
            <div className={cn('flex', vertical ? 'flex-col gap-0.5' : 'flex-row gap-1')}>
              {SETTINGS_TABS.map((tab) => (
                <Tab key={tab} value={tab} disabled={props.readOnly && !isReadOnlySettingsTab(tab)}>
                  {t.settings.tabs[tab]}
                </Tab>
              ))}
            </div>
          </TabList>
          {props.readOnly ? null : (
            <div className={cn(vertical ? 'mt-auto p-2' : 'ml-auto py-2')}>
              <Button
                variant="outline"
                size="sm"
                className={cn(vertical && 'w-full')}
                onClick={async () => {
                  await logout()
                  window.location.href = '/login'
                }}
              >
                {t.common.logout}
              </Button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <TabPanel value="display" className={panelClassName}>
            <DisplayTab settings={props.settings} readOnly={props.readOnly} />
          </TabPanel>
          {props.readOnly ? null : (
            <>
              <TabPanel value="data" className={panelClassName}>
                <DataTab feedCount={props.feeds.length} />
              </TabPanel>
              <TabPanel value="storage" className={panelClassName}>
                <StorageTab />
              </TabPanel>
              <TabPanel value="health" className={panelClassName}>
                <HealthTab />
              </TabPanel>
              <TabPanel value="passkeys" className={panelClassName}>
                <PasskeysTab userHandle={props.settings.user_handle} />
              </TabPanel>
              <TabPanel value="sessions" className={panelClassName}>
                <SessionsTab />
              </TabPanel>
              <TabPanel value="tokens" className={panelClassName}>
                <TokensTab />
              </TabPanel>
            </>
          )}
        </div>
      </Tabs>
    </AppDialog>
  )
}
