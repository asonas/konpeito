import { X } from 'lucide-react'
import { useState } from 'react'
import { DemoAbout } from '../../features/demo/DemoAbout.tsx'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { IconButton } from '../ui/icon-button.tsx'

export function DemoNotice() {
  const t = useMessages()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) {
    return null
  }
  return (
    <aside
      aria-label={t.demo.label}
      className="fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 z-10 flex max-w-sm items-start gap-2 rounded-lg border border-line bg-overlay px-3 py-2.5 text-sm shadow-lg sm:right-auto"
    >
      <div className="min-w-0 flex-1">
        <DemoAbout />
      </div>
      <IconButton
        label={t.common.close}
        className="-mt-1 -mr-1.5 shrink-0 text-fg-muted"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </IconButton>
    </aside>
  )
}
