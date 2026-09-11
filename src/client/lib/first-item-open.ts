import type { LayoutMode } from './layout.ts'

type FirstItemOpen = 'wait' | 'ignore' | 'select' | 'open'

export function resolveFirstItemOpen(input: {
  initialized: boolean
  sourceChanged: boolean
  forced: boolean
  isLoading: boolean
  hasFirstItem: boolean
  itemAlreadyInList: boolean
  itemRefSet: boolean
  layout: LayoutMode
}): FirstItemOpen {
  if (!input.initialized) {
    return 'ignore'
  }
  // サイドバーのクリックは先に届き、リンクの遷移でitemRefが外れるのを待つ
  if (input.forced && input.itemRefSet && !input.sourceChanged) {
    return 'wait'
  }
  if (!input.sourceChanged && !input.forced) {
    return 'ignore'
  }
  if (input.isLoading) {
    return 'wait'
  }
  if (!input.forced && input.itemAlreadyInList) {
    return 'ignore'
  }
  if (!input.hasFirstItem) {
    return 'ignore'
  }
  if (input.layout === 'one') {
    return 'select'
  }
  return 'open'
}
