import { Tooltip } from '@base-ui/react/tooltip'
import type { ReactNode } from 'react'

export function TooltipProvider(props: { children: ReactNode }) {
  return <Tooltip.Provider>{props.children}</Tooltip.Provider>
}

export function AppTooltip(props: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={200} render={<span className="inline-flex" />}>
        {props.children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="rounded-md border border-line bg-overlay px-2 py-1 text-xs text-fg shadow-md">
            {props.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
