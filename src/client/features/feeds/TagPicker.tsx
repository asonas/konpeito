import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { CONTROL_SIZES } from '../../components/ui/control.ts'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import { errorMessage } from '../../lib/http.ts'
import { useNotify } from '../../lib/notify.ts'
import { createTag, queryKeys, type Tag } from '../../lib/queries.ts'
import { cn } from '../../lib/utils.ts'

const chip = `inline-flex ${CONTROL_SIZES.sm} shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`

export function TagPicker(props: {
  tags: Tag[]
  selected: number[]
  onChange: (ids: number[]) => void
}) {
  const t = useMessages()
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t.common.tags}</legend>
      <div className="flex flex-wrap gap-2">
        {props.tags.map((tag) => {
          const checked = props.selected.includes(tag.id)
          return (
            <CheckboxPrimitive.Root
              key={tag.id}
              checked={checked}
              className={cn(
                chip,
                checked
                  ? 'border-accent-line bg-accent-surface text-accent-text'
                  : 'border-border text-fg hover:bg-state-hover',
              )}
              onCheckedChange={(next) => {
                props.onChange(
                  next ? [...props.selected, tag.id] : props.selected.filter((id) => id !== tag.id),
                )
              }}
            >
              {checked ? <Check className="size-3.5" /> : null}
              {tag.name}
            </CheckboxPrimitive.Root>
          )
        })}
        <NewTagChip
          tags={props.tags}
          onPick={(id) => {
            if (!props.selected.includes(id)) {
              props.onChange([...props.selected, id])
            }
          }}
        />
      </div>
    </fieldset>
  )
}

function NewTagChip(props: { tags: Tag[]; onPick: (id: number) => void }) {
  const t = useMessages()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setOpen(false)
      return
    }
    const existing = props.tags.find((tag) => tag.name === trimmed)
    if (existing !== undefined) {
      props.onPick(existing.id)
      setName('')
      return
    }
    setBusy(true)
    try {
      const created = await createTag(trimmed)
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap })
      props.onPick(created.id)
      setName('')
    } catch (error) {
      notify(errorMessage(error, t.feedDialog.createTagFailed), 'destructive')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className={cn(chip, 'border-dashed border-border text-fg-muted hover:bg-state-hover')}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        {t.feedDialog.newTag}
      </button>
    )
  }

  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: タグをクリックして開いたテキストフィールドなので、そのまま入力できるほうが自然だから
      autoFocus
      value={name}
      disabled={busy}
      aria-label={t.feedDialog.newTag}
      placeholder={t.feedDialog.newTagPlaceholder}
      className={cn(chip, 'w-52 border-field bg-canvas placeholder:text-fg-muted')}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => {
        if (name.trim().length === 0) {
          setOpen(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          void submit()
          return
        }
        if (event.key === 'Escape') {
          // ダイアログが閉じないようにする
          event.stopPropagation()
          setName('')
          setOpen(false)
        }
      }}
    />
  )
}
