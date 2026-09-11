import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { SettingsPatch } from '../../../../shared/constants.ts'
import { CheckboxField } from '../../../components/ui/checkbox.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { AppSelect } from '../../../components/ui/select.tsx'
import { useI18n } from '../../../i18n/I18nProvider.tsx'
import { isLocale } from '../../../i18n/locale.ts'
import { errorMessage } from '../../../lib/http.ts'
import { useNotify } from '../../../lib/notify.ts'
import { type Bootstrap, queryKeys, type Settings, updateSettings } from '../../../lib/queries.ts'
import { applyTheme, isTheme, writeStoredTheme } from '../../../lib/theme.ts'
import { SettingsChecks, SettingsPanel, SettingsRow, SettingsRows } from '../SettingsPanel.tsx'

export function DisplayTab(props: { settings: Settings; readOnly: boolean }) {
  const queryClient = useQueryClient()
  const notify = useNotify()
  const { locale, messages: t, setLocale } = useI18n()
  const [theme, setTheme] = useState(props.settings.theme)
  const [sort, setSort] = useState(props.settings.default_sort)
  const [autoRead, setAutoRead] = useState(props.settings.auto_mark_read)
  const [unreadOnly, setUnreadOnly] = useState(props.settings.unread_only_feeds)
  const [initialUnread, setInitialUnread] = useState(String(props.settings.initial_unread_count))
  const unreadTimer = useRef<number>(0)

  useEffect(() => {
    setTheme(props.settings.theme)
    setSort(props.settings.default_sort)
    setAutoRead(props.settings.auto_mark_read)
    setUnreadOnly(props.settings.unread_only_feeds)
    setInitialUnread(String(props.settings.initial_unread_count))
  }, [props.settings])

  useEffect(() => {
    return () => {
      window.clearTimeout(unreadTimer.current)
    }
  }, [])

  function patchBootstrapSettings(patch: Pick<Settings, 'locale' | 'theme'>) {
    queryClient.setQueryData(queryKeys.bootstrap, (current: Bootstrap | undefined) => {
      if (current === undefined) {
        return current
      }
      return {
        ...current,
        settings: {
          ...current.settings,
          ...patch,
        },
      }
    })
  }

  function persistLocally(patch: SettingsPatch) {
    if (patch.theme !== undefined) {
      writeStoredTheme(patch.theme)
    }
    patchBootstrapSettings({ locale: patch.locale ?? locale, theme: patch.theme ?? theme })
  }

  async function persist(patch: SettingsPatch, revert?: () => void) {
    if (props.readOnly) {
      persistLocally(patch)
      return
    }
    try {
      const next = await updateSettings(patch)
      applyTheme(next.theme)
      setLocale(next.locale)
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
    } catch (error) {
      revert?.()
      notify(errorMessage(error, t.common.saveFailed), 'destructive')
    }
  }

  function persistUnreadCount(value: string) {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0 || n > 200) {
      return
    }
    if (n === props.settings.initial_unread_count) {
      return
    }
    void persist({ initial_unread_count: n }, () => {
      setInitialUnread(String(props.settings.initial_unread_count))
    })
  }

  return (
    <SettingsPanel title={t.settings.display.title}>
      <SettingsRows>
        <SettingsRow label={t.language.label}>
          <AppSelect
            ariaLabel={t.language.label}
            value={locale}
            items={[
              { value: 'en', label: t.language.en },
              { value: 'ja', label: t.language.ja },
            ]}
            onValueChange={(value) => {
              if (!isLocale(value)) {
                return
              }
              const previous = locale
              setLocale(value)
              void persist({ locale: value }, () => setLocale(previous))
            }}
          />
        </SettingsRow>
        <SettingsRow label={t.settings.display.theme}>
          <AppSelect
            ariaLabel={t.settings.display.theme}
            value={theme}
            items={[
              { value: 'system', label: t.settings.display.themeSystem },
              { value: 'light', label: t.settings.display.themeLight },
              { value: 'dark', label: t.settings.display.themeDark },
            ]}
            onValueChange={(value) => {
              if (!isTheme(value)) {
                return
              }
              const previous = theme
              setTheme(value)
              applyTheme(value)
              void persist({ theme: value }, () => {
                setTheme(previous)
                applyTheme(previous)
              })
            }}
          />
        </SettingsRow>
        <SettingsRow label={t.settings.display.sort}>
          <AppSelect
            ariaLabel={t.settings.display.sort}
            value={sort}
            disabled={props.readOnly}
            items={[
              { value: 'desc', label: t.list.newestFirst },
              { value: 'asc', label: t.list.oldestFirst },
            ]}
            onValueChange={(value) => {
              const previous = sort
              setSort(value)
              void persist({ default_sort: value }, () => setSort(previous))
            }}
          />
        </SettingsRow>
        <SettingsRow label={t.settings.display.initialUnread} htmlFor="initial-unread-count">
          <Input
            id="initial-unread-count"
            type="number"
            min={0}
            max={200}
            disabled={props.readOnly}
            value={initialUnread}
            onChange={(event) => {
              const value = event.target.value
              setInitialUnread(value)
              window.clearTimeout(unreadTimer.current)
              unreadTimer.current = window.setTimeout(() => persistUnreadCount(value), 400)
            }}
            onBlur={() => persistUnreadCount(initialUnread)}
          />
        </SettingsRow>
      </SettingsRows>
      <SettingsChecks>
        <CheckboxField
          checked={autoRead}
          disabled={props.readOnly}
          onCheckedChange={(checked) => {
            const previous = autoRead
            setAutoRead(checked)
            void persist({ auto_mark_read: checked }, () => setAutoRead(previous))
          }}
        >
          {t.settings.display.autoMarkRead}
        </CheckboxField>
        <CheckboxField
          checked={unreadOnly}
          disabled={props.readOnly}
          onCheckedChange={(checked) => {
            const previous = unreadOnly
            setUnreadOnly(checked)
            void persist({ unread_only_feeds: checked }, () => setUnreadOnly(previous))
          }}
        >
          {t.settings.display.unreadOnlyFeeds}
        </CheckboxField>
      </SettingsChecks>
    </SettingsPanel>
  )
}
