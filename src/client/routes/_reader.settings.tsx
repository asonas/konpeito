import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_reader/settings')({
  component: () => <Outlet />,
})
