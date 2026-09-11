import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useState } from 'react'
import { clampWidth } from '../../lib/column-widths.ts'

export function ColumnSplitter(props: {
  label: string
  controls: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onBelowMin?: () => void
  onExpandPastMin?: (value: number) => void
}) {
  const [dragging, setDragging] = useState(false)

  function applyWidth(raw: number, start: number) {
    if (props.onBelowMin && raw < props.min) {
      props.onBelowMin()
      return
    }
    if (props.onExpandPastMin && raw > start && raw >= props.min) {
      props.onExpandPastMin(clampWidth(raw, props.min, props.max))
      return
    }
    props.onChange(clampWidth(raw, props.min, props.max))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLHRElement>) {
    event.preventDefault()
    setDragging(true)
    const target = event.currentTarget
    const pointerId = event.pointerId
    target.setPointerCapture(pointerId)
    const startX = event.clientX
    const startWidth = props.value

    function onMove(move: PointerEvent) {
      applyWidth(startWidth + (move.clientX - startX), startWidth)
    }
    function onUp() {
      setDragging(false)
      target.releasePointerCapture(pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }

  function onKeyDown(event: KeyboardEvent<HTMLHRElement>) {
    const step = event.shiftKey ? 64 : 16
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      applyWidth(props.value - step, props.value)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      applyWidth(props.value + step, props.value)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      props.onChange(props.min)
    }
    if (event.key === 'End') {
      event.preventDefault()
      applyWidth(props.max, props.value)
    }
  }

  return (
    <div className="relative z-10 h-full min-h-0 w-full">
      <hr
        aria-orientation="vertical"
        aria-label={props.label}
        aria-controls={props.controls}
        aria-valuenow={Math.round(props.value)}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        tabIndex={0}
        data-dragging={dragging ? 'true' : undefined}
        className="absolute inset-y-0 left-1/2 z-10 m-0 box-border h-full w-2 -translate-x-1/2 cursor-col-resize touch-none appearance-none border-0 bg-transparent p-0 outline-none after:pointer-events-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:w-0.5 hover:after:bg-accent-mark focus-visible:after:w-0.5 focus-visible:after:bg-accent-mark data-[dragging=true]:after:w-0.5 data-[dragging=true]:after:bg-accent-mark"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
