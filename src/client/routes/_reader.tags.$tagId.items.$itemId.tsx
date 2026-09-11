import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_reader/tags/$tagId/items/$itemId')({
  component: () => null,
})
