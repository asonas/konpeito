import { ExternalLink } from 'lucide-react'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { DEMO_INSTALL_URL } from '../../lib/demo/index.ts'

export function DemoAbout() {
  const t = useMessages()
  return (
    <div>
      <p className="text-fg-muted">{t.demo.banner}</p>
      <a
        href={DEMO_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
      >
        {t.demo.repo}
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </div>
  )
}
