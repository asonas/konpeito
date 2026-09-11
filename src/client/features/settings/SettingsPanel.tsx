import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'

export function SettingsPanel(props: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base leading-tight font-semibold">{props.title}</h3>
          {props.description === undefined ? null : (
            <p className="mt-1 text-sm text-fg-muted">{props.description}</p>
          )}
        </div>
        {props.actions === undefined ? null : <div className="shrink-0">{props.actions}</div>}
      </header>
      {props.children}
    </div>
  )
}

export function SettingsSection(props: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', props.className)}>
      {props.title === undefined && props.description === undefined ? null : (
        <div>
          {props.title === undefined ? null : (
            <h4 className="text-sm font-semibold">{props.title}</h4>
          )}
          {props.description === undefined ? null : (
            <p className="mt-0.5 text-sm text-fg-muted">{props.description}</p>
          )}
        </div>
      )}
      {props.children}
    </section>
  )
}

export function SettingsChecks(props: { children: ReactNode }) {
  return <div className="mt-2 flex flex-col gap-3">{props.children}</div>
}

export function SettingsRows(props: { children: ReactNode }) {
  return <div>{props.children}</div>
}

export function SettingsRow(props: {
  label: string
  description?: string
  htmlFor?: string
  children: ReactNode
}) {
  const labelClassName = 'block text-sm font-medium'
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        {props.htmlFor === undefined ? (
          <span className={labelClassName}>{props.label}</span>
        ) : (
          <label htmlFor={props.htmlFor} className={labelClassName}>
            {props.label}
          </label>
        )}
        {props.description === undefined ? null : (
          <p className="mt-0.5 text-sm text-fg-muted">{props.description}</p>
        )}
      </div>
      <div className="w-40 shrink-0">{props.children}</div>
    </div>
  )
}

export function SettingsListItem(props: { children: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">{props.children}</div>
      {props.actions === undefined ? null : <div className="shrink-0">{props.actions}</div>}
    </li>
  )
}

export function SettingsList(props: { children: ReactNode; empty?: string; count: number }) {
  if (props.count === 0 && props.empty !== undefined) {
    return <p className="text-sm text-fg-muted">{props.empty}</p>
  }
  return <ul className="divide-y divide-line">{props.children}</ul>
}

export function Badge(props: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-sunken px-2 py-0.5 text-xs font-medium whitespace-nowrap text-fg">
      {props.children}
    </span>
  )
}
