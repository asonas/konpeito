import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadCatalog, readStoredLocale } from './i18n/locale.ts'
import { createQueryClient } from './lib/query.ts'
import { routeTree } from './routeTree.gen.ts'
import './styles/globals.css'

const queryClient = createQueryClient()

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

void loadCatalog(readStoredLocale()).then(() => {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
})
