import { useAnnounce } from '../components/LiveRegion.tsx'
import { type ToastTone, useToast } from '../components/ui/toast.tsx'

type NotifyFn = (message: string, tone?: ToastTone) => void

export function useNotify(): NotifyFn {
  const announce = useAnnounce()
  const toast = useToast()
  return (message, tone) => {
    announce(message)
    toast(message, tone)
  }
}
