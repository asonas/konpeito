import { Select } from '@base-ui/react/select'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils.ts'
import { CONTROL_SIZES, type ControlSize } from './control.ts'

export function AppSelect<Value extends string>(props: {
  value: Value
  ariaLabel: string
  items: ReadonlyArray<{ value: Value; label: string }>
  onValueChange: (value: Value) => void
  size?: ControlSize
  className?: string
  disabled?: boolean
}) {
  const labels = Object.fromEntries(props.items.map((item) => [item.value, item.label]))
  return (
    <div className="w-full min-w-0">
      <Select.Root
        value={props.value}
        items={labels}
        disabled={props.disabled}
        onValueChange={(value) => {
          if (value === null) {
            return
          }
          const match = props.items.find((item) => item.value === value)
          if (!match) {
            return
          }
          props.onValueChange(match.value)
        }}
      >
        <Select.Trigger
          aria-label={props.ariaLabel}
          className={cn(
            'flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border border-field bg-canvas px-3 text-left text-sm transition-colors hover:bg-sunken',
            'disabled:pointer-events-none disabled:opacity-50',
            CONTROL_SIZES[props.size ?? 'default'],
            props.className,
          )}
        >
          <Select.Value className="min-w-0 truncate" />
          <Select.Icon className="shrink-0">
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} className="z-[70]">
            <Select.Popup className="min-w-40 rounded-md border border-line bg-overlay p-1 text-fg shadow-md">
              {props.items.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  className="flex cursor-default items-center rounded-sm px-2 py-2 text-sm outline-none data-highlighted:bg-state-hover"
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
