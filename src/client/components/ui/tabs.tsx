import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'

type TabsOrientation = 'horizontal' | 'vertical'

export function Tabs(props: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
  orientation?: TabsOrientation
}) {
  return (
    <BaseTabs.Root
      value={props.value}
      orientation={props.orientation ?? 'horizontal'}
      onValueChange={props.onValueChange}
      className={cn(
        'flex min-h-0',
        props.orientation === 'vertical' ? 'flex-row' : 'flex-col',
        props.className,
      )}
    >
      {props.children}
    </BaseTabs.Root>
  )
}

export function TabList(props: { children: ReactNode; className?: string }) {
  return (
    <BaseTabs.List className={cn('flex shrink-0', props.className)}>{props.children}</BaseTabs.List>
  )
}

export function Tab(props: {
  value: string
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  return (
    <BaseTabs.Tab
      value={props.value}
      disabled={props.disabled}
      className={cn(
        'rounded-md px-3 py-1.5 text-left text-sm text-fg-muted whitespace-nowrap hover:bg-state-hover hover:text-fg',
        'data-active:bg-state-pressed data-active:text-fg data-active:hover:bg-state-pressed',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        props.className,
      )}
    >
      {props.children}
    </BaseTabs.Tab>
  )
}

export function TabPanel(props: { value: string; children: ReactNode; className?: string }) {
  return (
    <BaseTabs.Panel value={props.value} className={cn('min-h-0', props.className)}>
      {props.children}
    </BaseTabs.Panel>
  )
}
