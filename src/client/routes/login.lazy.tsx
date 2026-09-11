import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { useMessages } from '../i18n/I18nProvider.tsx'
import {
  beginPasskeyLogin,
  beginPasskeyRegister,
  signalAllAcceptedCredentials,
  signalUnknownCredential,
} from '../lib/auth.ts'
import { errorMessage } from '../lib/http.ts'
import { fetchBootstrap, fetchCredentials } from '../lib/queries.ts'

export const Route = createLazyFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const t = useMessages()
  const navigate = useNavigate()
  const { bootstrap: bootstrapToken } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function afterAuth() {
    const bootstrap = await fetchBootstrap()
    const { credentials } = await fetchCredentials()
    await signalAllAcceptedCredentials(
      bootstrap.settings.user_handle,
      credentials.map((row) => row.id),
    )
    await navigate({ to: '/' })
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught, fallback))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-center text-xl font-semibold">Konpeito</h1>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (bootstrapToken !== undefined) {
              void run(async () => {
                await beginPasskeyRegister(bootstrapToken)
                await afterAuth()
              }, t.login.registerFailed)
              return
            }
            void run(async () => {
              const result = await beginPasskeyLogin()
              if ('unknownCredential' in result) {
                await signalUnknownCredential(result.credentialId)
                setError(t.login.unknownPasskey)
                return
              }
              await afterAuth()
            }, t.login.loginFailed)
          }}
        >
          {t.login.submit}
        </Button>
        {error ? (
          <p className="text-center text-sm text-danger-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}
