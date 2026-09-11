import { Button as BaseButton } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'
import { CONTROL_SIZES } from './control.ts'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-accent text-on-solid hover:bg-accent-hover',
        destructive: 'bg-danger text-on-solid hover:bg-danger-hover focus-visible:ring-danger/40',
        outline: 'border border-border bg-transparent shadow-xs hover:bg-state-hover',
        'destructive-outline':
          'border border-border bg-transparent text-danger-text shadow-xs hover:bg-danger-surface focus-visible:ring-danger/40',
        secondary: 'bg-sunken text-fg hover:shadow-[inset_0_0_0_999px_var(--state-hover)]',
        toggle:
          'bg-accent-surface text-accent-text hover:shadow-[inset_0_0_0_999px_var(--state-hover)]',
        ghost: 'hover:bg-state-hover hover:text-fg',
        link: 'text-accent-text underline-offset-4 hover:underline',
      },
      size: {
        default: `${CONTROL_SIZES.default} px-4 py-2 has-[>svg]:px-3`,
        sm: `${CONTROL_SIZES.sm} gap-1.5 rounded-md px-3 has-[>svg]:px-2.5`,
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = ComponentProps<typeof BaseButton> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <BaseButton
      data-slot="button"
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { buttonVariants }
