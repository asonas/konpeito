import { Menu } from '@base-ui/react/menu'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'
import { buttonVariants } from './button.tsx'

export function DropdownMenu(props: {
  trigger: ReactNode
  children: ReactNode
  label: string
  triggerClassName?: string
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={props.triggerClassName ?? buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label={props.label}
      >
        {props.trigger}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-[70]"
          collisionAvoidance={{ align: 'shift', fallbackAxisSide: 'none' }}
        >
          <Menu.Popup className="min-w-40 rounded-md border border-line bg-overlay p-1 text-fg shadow-md">
            {props.children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

export function DropdownItem(props: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'danger'
  className?: string
}) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-default items-center rounded-sm px-2 py-2 text-sm outline-none',
        props.variant === 'danger'
          ? 'text-danger-text data-highlighted:bg-danger-surface'
          : 'data-highlighted:bg-state-hover',
        props.className,
      )}
      onClick={props.onClick}
    >
      {props.children}
    </Menu.Item>
  )
}
