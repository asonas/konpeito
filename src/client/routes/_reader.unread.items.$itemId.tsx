import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_reader/unread/items/$itemId')({
  component: () => null,
})
