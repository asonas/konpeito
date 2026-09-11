import { ContextMenu } from '@base-ui/react/context-menu'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'

const popupClassName = 'min-w-40 rounded-md border border-line bg-overlay p-1 text-fg shadow-md'

const itemClassName =
  'flex cursor-default items-center rounded-sm px-2 py-2 text-sm outline-none data-highlighted:bg-state-hover'

export function AppContextMenu(props: { children: ReactNode; menu: ReactNode }) {
  return (
    <ContextMenu.Root>
      {props.children}
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          className="z-[70]"
          align="start"
          collisionAvoidance={{ align: 'shift', fallbackAxisSide: 'none' }}
        >
          <ContextMenu.Popup className={popupClassName}>{props.menu}</ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

export function ContextMenuTrigger(props: { children: ReactNode; className?: string }) {
  return <ContextMenu.Trigger className={props.className}>{props.children}</ContextMenu.Trigger>
}

export function ContextMenuItem(props: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <ContextMenu.Item className={cn(itemClassName, props.className)} onClick={props.onClick}>
      {props.children}
    </ContextMenu.Item>
  )
}
