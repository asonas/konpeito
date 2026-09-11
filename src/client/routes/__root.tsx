import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { LiveRegionProvider } from '../components/LiveRegion.tsx'
import { DialogOpenProvider } from '../components/ui/dialog.tsx'
import { ToastProvider } from '../components/ui/toast.tsx'
import { TooltipProvider } from '../components/ui/tooltip.tsx'
import { I18nProvider } from '../i18n/I18nProvider.tsx'
import { UnauthorizedError } from '../lib/http.ts'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const router = useRouter()
  const { queryClient } = Route.useRouteContext()

  useEffect(() => {
    const unsubQuery = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.error instanceof UnauthorizedError) {
        void router.navigate({ to: '/login' })
      }
    })
    const unsubMutation = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation.state.error instanceof UnauthorizedError) {
        void router.navigate({ to: '/login' })
      }
    })
    return () => {
      unsubQuery()
      unsubMutation()
    }
  }, [queryClient, router])

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <LiveRegionProvider>
          <ToastProvider>
            <DialogOpenProvider>
              <TooltipProvider>
                <Outlet />
              </TooltipProvider>
            </DialogOpenProvider>
          </ToastProvider>
        </LiveRegionProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}
