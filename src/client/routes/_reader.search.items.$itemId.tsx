import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_reader/search/items/$itemId')({
  component: () => null,
})
