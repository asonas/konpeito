import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-md border border-field bg-canvas px-3 py-2 text-sm outline-none placeholder:text-fg-muted',
        className,
      )}
      {...props}
    />
  )
}
