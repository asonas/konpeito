import { createContext, type ReactNode, useContext, useState } from 'react'

type AnnounceFn = (message: string) => void

const AnnounceContext = createContext<AnnounceFn>(() => {})

export function LiveRegionProvider(props: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  return (
    <AnnounceContext.Provider value={setMessage}>
      {props.children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </AnnounceContext.Provider>
  )
}

export function useAnnounce(): AnnounceFn {
  return useContext(AnnounceContext)
}
