import { createContext, type ReactNode, useContext, useRef, useState } from 'react'
import { cn } from '../../lib/utils.ts'

export type ToastTone = 'default' | 'destructive'

type ToastItem = {
  id: number
  message: string
  tone: ToastTone
}

type ToastFn = (message: string, tone?: ToastTone) => void

const TOAST_DURATION_MS = 4000

const ToastContext = createContext<ToastFn>(() => {})

export function ToastProvider(props: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const toast: ToastFn = (message, tone = 'default') => {
    const id = nextId.current
    nextId.current += 1
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, TOAST_DURATION_MS)
  }

  return (
    <ToastContext.Provider value={toast}>
      {props.children}
      <div className="pointer-events-none fixed top-14 right-4 z-[60] flex flex-col items-end gap-2">
        {/* 固定のヘッダーと重ならないように座標を調整 */}
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto max-w-sm rounded-md border border-line bg-overlay px-3 py-2 text-sm shadow-lg',
              item.tone === 'destructive' ? 'text-danger-text' : 'text-fg',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  return useContext(ToastContext)
}
