import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { Check } from 'lucide-react'
import { type ComponentProps, type ReactNode, useId } from 'react'
import { cn } from '../../lib/utils.ts'

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-field bg-canvas shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-accent data-checked:bg-accent data-checked:text-on-solid',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <Check className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export function CheckboxField(props: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
  description?: string
  disabled?: boolean
}) {
  const id = useId()
  const descriptionId = `${id}-description`
  return (
    <div className="flex items-start gap-2 text-sm leading-5">
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={props.checked}
        disabled={props.disabled}
        aria-describedby={props.description === undefined ? undefined : descriptionId}
        onCheckedChange={(checked) => {
          if (typeof checked === 'boolean') {
            props.onCheckedChange(checked)
          }
        }}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block">
          {props.children}
        </label>
        {props.description === undefined ? null : (
          <p id={descriptionId} className="mt-0.5 text-fg-muted">
            {props.description}
          </p>
        )}
      </div>
    </div>
  )
}
