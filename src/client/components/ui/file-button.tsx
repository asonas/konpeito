import { useRef } from 'react'
import { Button } from './button.tsx'

export function FileButton(props: {
  accept: string
  children: string
  onFile: (file: File) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        tabIndex={-1}
        aria-label={props.children}
        accept={props.accept}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) {
            return
          }
          props.onFile(file)
          event.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={props.className}
        onClick={() => inputRef.current?.click()}
      >
        {props.children}
      </Button>
    </>
  )
}
