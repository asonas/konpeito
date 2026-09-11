import { type ReactNode, type UIEvent, useState } from 'react'
import { cn } from '../../lib/utils.ts'

export function useScrolled(onScroll?: (top: number) => void) {
  const [scrolled, setScrolled] = useState(false)
  return {
    scrolled,
    onScroll: (event: UIEvent<HTMLElement>) => {
      const top = event.currentTarget.scrollTop
      setScrolled(top > 0)
      onScroll?.(top)
    },
  }
}

export function ColumnHeader(props: {
  scrolled: boolean
  children: ReactNode
  className?: string
  as?: 'div' | 'header'
}) {
  const Tag = props.as ?? 'div'
  return (
    <Tag
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 px-3',
        'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-px',
        props.scrolled ? 'after:bg-line' : 'after:bg-transparent',
        props.className,
      )}
    >
      {props.children}
    </Tag>
  )
}
