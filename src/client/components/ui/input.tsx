import { Input as BaseInput } from '@base-ui/react/input'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'
import { CONTROL_SIZES, type ControlSize } from './control.ts'

export function Input({
  className,
  size = 'default',
  ...props
}: Omit<ComponentProps<typeof BaseInput>, 'size'> & { size?: ControlSize }) {
  return (
    <BaseInput
      className={cn(
        'w-full rounded-md border border-field bg-canvas px-3 text-sm outline-none placeholder:text-fg-muted',
        'disabled:opacity-50',
        CONTROL_SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
