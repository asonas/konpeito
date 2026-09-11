import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_reader/items/$itemId')({
  component: () => null,
})
