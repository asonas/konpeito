import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_reader/recommended/items/$itemId')({
  component: () => null,
})
