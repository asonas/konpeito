import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils.ts'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger aria-invalid:ring-danger/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-on-solid [a&]:hover:bg-accent-hover',
        secondary: 'border-transparent bg-sunken text-fg',
        destructive: 'border-transparent bg-danger text-on-solid [a&]:hover:bg-danger-hover',
        outline: 'border-border text-fg [a&]:hover:bg-state-hover',
        info: 'border-accent-line bg-accent-surface text-accent-text',
      },
      size: {
        default: 'px-2 py-0.5 text-xs',
        sm: 'px-1.5 py-0 text-[10px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type BadgeProps = useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, size, render = <span />, ...props }: BadgeProps) {
  return useRender({
    render,
    props: {
      'data-slot': 'badge',
      className: cn(badgeVariants({ variant, size, className })),
      ...props,
    },
  })
}
