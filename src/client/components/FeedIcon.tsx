import { cn } from '../lib/utils.ts'

export function FeedIcon(props: { title: string; iconUrl?: string | null; className?: string }) {
  const letter = props.title.trim().slice(0, 1) || '?'
  if (props.iconUrl) {
    return (
      <img
        src={props.iconUrl}
        alt=""
        className={cn('h-4 w-4 shrink-0 rounded-sm', props.className)}
        width={16}
        height={16}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-sunken text-[10px] font-semibold text-fg-muted',
        props.className,
      )}
    >
      {letter}
    </span>
  )
}
