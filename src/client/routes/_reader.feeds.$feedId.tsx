import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_reader/feeds/$feedId')({
  component: () => null,
})
