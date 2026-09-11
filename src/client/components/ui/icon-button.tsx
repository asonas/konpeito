import { createLink, type LinkComponent } from '@tanstack/react-router'
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'
import { Button, type ButtonProps, buttonVariants } from './button.tsx'
import { AppTooltip } from './tooltip.tsx'

const iconClassName = buttonVariants({ variant: 'ghost', size: 'icon' })

export function IconButton({
  label,
  className,
  children,
  ...props
}: Omit<ButtonProps, 'variant' | 'size' | 'aria-label'> & { label: string }) {
  return (
    <AppTooltip label={label}>
      <Button variant="ghost" size="icon" aria-label={label} className={cn(className)} {...props}>
        {children}
      </Button>
    </AppTooltip>
  )
}

interface IconAnchorProps extends ComponentPropsWithRef<'a'> {
  label: string
}

function IconAnchor({ label, href, className, children, ...props }: IconAnchorProps) {
  return (
    <AppTooltip label={label}>
      <a href={href} aria-label={label} className={cn(iconClassName, className)} {...props}>
        {children}
      </a>
    </AppTooltip>
  )
}

const RouterIconLink = createLink(IconAnchor)

export const IconLink: LinkComponent<typeof IconAnchor> = (props) => <RouterIconLink {...props} />

export function ExternalIconLink(props: { label: string; href: string; children: ReactNode }) {
  return (
    <IconAnchor label={props.label} href={props.href} target="_blank" rel="noopener noreferrer">
      {props.children}
    </IconAnchor>
  )
}
