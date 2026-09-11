import { Plus } from 'lucide-react'
import type { DragEvent } from 'react'
import { useState } from 'react'
import { insertBefore } from './order.ts'
import { cn } from './utils.ts'

type DragKind = 'feed' | 'tag'

function mime(kind: DragKind): string {
  return `application/x-reader-${kind}`
}

interface DragRowProps {
  draggable: true
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

export function useReorderDrag(
  kind: DragKind,
  ids: number[],
  onReorder: (ids: number[]) => void,
): { dropTarget: number | null; rowProps: (id: number) => DragRowProps } {
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const type = mime(kind)

  function rowProps(id: number): DragRowProps {
    return {
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.setData(type, String(id))
        event.dataTransfer.effectAllowed = 'move'
      },
      // Escでの中止はドロップもdragleaveも起こさないので、ここで線を消す
      onDragEnd: () => {
        setDropTarget(null)
      },
      onDragOver: (event) => {
        if (!event.dataTransfer.types.includes(type)) {
          return
        }
        event.preventDefault()
        setDropTarget(id)
      },
      onDragLeave: () => {
        setDropTarget((current) => (current === id ? null : current))
      },
      onDrop: (event) => {
        event.preventDefault()
        setDropTarget(null)
        const dragged = Number(event.dataTransfer.getData(type))
        if (!Number.isInteger(dragged) || dragged === id) {
          return
        }
        onReorder(insertBefore(ids, dragged, id))
      },
    }
  }

  return { dropTarget, rowProps }
}

export interface FeedDragData {
  feedId: number
  fromTagId: number | null
}

export interface FeedDropTarget {
  tagId: number | null
  beforeFeedId: number | null
}

function targetKey(target: FeedDropTarget): string {
  return `${target.tagId ?? 'none'}:${target.beforeFeedId ?? 'head'}`
}

function parseFeedDrag(raw: string): FeedDragData | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const { feedId, fromTagId } = value as Record<string, unknown>
  if (typeof feedId !== 'number' || !Number.isInteger(feedId)) {
    return null
  }
  if (fromTagId !== null && (typeof fromTagId !== 'number' || !Number.isInteger(fromTagId))) {
    return null
  }
  return { feedId, fromTagId }
}

interface FeedDropProps {
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

export function useFeedDrag(onMove: (data: FeedDragData, target: FeedDropTarget) => void): {
  dragging: boolean
  isOver: (target: FeedDropTarget) => boolean
  rowProps: (feedId: number, tagId: number | null) => DragRowProps
  sectionProps: (tagId: number | null) => FeedDropProps
} {
  const [dropKey, setDropKey] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const type = mime('feed')

  function sectionProps(tagId: number | null): FeedDropProps {
    return dropProps({ tagId, beforeFeedId: null })
  }

  function dropProps(target: FeedDropTarget): FeedDropProps {
    const key = targetKey(target)
    return {
      onDragOver: (event) => {
        if (!event.dataTransfer.types.includes(type)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        setDropKey(key)
      },
      onDragLeave: () => {
        setDropKey((current) => (current === key ? null : current))
      },
      onDrop: (event) => {
        if (!event.dataTransfer.types.includes(type)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        setDropKey(null)
        setDragging(false)
        const data = parseFeedDrag(event.dataTransfer.getData(type))
        if (data === null) {
          return
        }
        if (data.feedId === target.beforeFeedId && data.fromTagId === target.tagId) {
          return
        }
        onMove(data, target)
      },
    }
  }

  function rowProps(feedId: number, tagId: number | null): DragRowProps {
    return {
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.setData(type, JSON.stringify({ feedId, fromTagId: tagId }))
        event.dataTransfer.effectAllowed = 'move'
        setDragging(true)
      },
      onDragEnd: () => {
        setDragging(false)
        setDropKey(null)
      },
      ...dropProps({ tagId, beforeFeedId: feedId }),
    }
  }

  return {
    dragging,
    isOver: (target) => dropKey === targetKey(target),
    rowProps,
    sectionProps,
  }
}

/** 挿入されることを`+`で示す */
export function DropIndicator(props: { edge?: 'top' | 'bottom' }) {
  return (
    <span
      aria-hidden="true"
      // ドラッグ中にこの線自身が`dragleave`を起こすと点滅するので、当たり判定を外す
      className={cn(
        'pointer-events-none absolute inset-x-0 z-10 flex items-center gap-1 text-accent-mark',
        props.edge === 'bottom' ? 'bottom-0 translate-y-1/2' : 'top-0 -translate-y-1/2',
      )}
    >
      <Plus className="h-3 w-3 shrink-0" strokeWidth={3} />
      <span className="h-0.5 flex-1 rounded-full bg-current" />
    </span>
  )
}
