import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'

export function Label(props: { htmlFor?: string; className?: string; children: ReactNode }) {
  const styles = cn('text-sm font-medium', props.className)
  if (props.htmlFor === undefined) {
    return <div className={styles}>{props.children}</div>
  }
  return (
    <label className={styles} htmlFor={props.htmlFor}>
      {props.children}
    </label>
  )
}

export function Field(props: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2', props.className)}>{props.children}</div>
}
