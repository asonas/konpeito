import { useEffect, useState } from 'react'

export type LayoutMode = 'three' | 'two' | 'one'

export function displayLayout(viewport: LayoutMode, sidebarDocked: boolean): LayoutMode {
  if (viewport === 'three' && !sidebarDocked) {
    return 'two'
  }
  return viewport
}

function layoutFromMatches(wide: boolean, medium: boolean): LayoutMode {
  if (wide) {
    return 'three'
  }
  if (medium) {
    return 'two'
  }
  return 'one'
}

export function useMediaQuery(query: string, whenUnavailable = false): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? whenUnavailable : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(query)
    function update() {
      setMatches(media.matches)
    }
    update()
    media.addEventListener('change', update)
    return () => {
      media.removeEventListener('change', update)
    }
  }, [query])
  return matches
}

export function useLayoutMode(): LayoutMode {
  const wide = useMediaQuery('(min-width: 1200px)', true)
  const medium = useMediaQuery('(min-width: 768px)', true)
  return layoutFromMatches(wide, medium)
}
