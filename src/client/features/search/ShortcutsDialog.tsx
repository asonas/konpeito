import { AppDialog } from '../../components/ui/dialog.tsx'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { SHORTCUTS } from '../../lib/hotkeys.ts'

export function ShortcutsDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  readOnly: boolean
}) {
  const t = useMessages()
  const rows = props.readOnly
    ? SHORTCUTS.filter((row) => row.writes !== true || row.demoExplains === true)
    : SHORTCUTS
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} title={t.shortcuts.title}>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.descriptionId} className="border-b border-line">
              <th className="py-2 pr-3 text-left font-mono font-normal">
                {row.gThen !== undefined ? t.shortcuts.afterG(row.gThen) : row.label}
              </th>
              <td className="py-2">{t.shortcuts[row.descriptionId]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppDialog>
  )
}
