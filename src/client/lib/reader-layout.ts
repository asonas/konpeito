import { useLayoutEffect, useState } from 'react'
import { readSidebarDocked, writeSidebarDocked } from './column-widths.ts'
import { displayLayout, type LayoutMode, useLayoutMode } from './layout.ts'

interface ReaderLayoutState {
  layout: LayoutMode
  viewportLayout: LayoutMode
  canDockSidebar: boolean
  drawerOpen: boolean
  sidebarVisible: boolean
  openSidebar: () => void
  closeDrawer: () => void
  dockSidebar: () => void
  collapseSidebar: () => void
}

export function useReaderLayout(): ReaderLayoutState {
  const viewportLayout = useLayoutMode()
  const [docked, setDocked] = useState(readSidebarDocked)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const canDockSidebar = viewportLayout === 'three'

  function setDockedPersistent(next: boolean) {
    setDocked(next)
    writeSidebarDocked(next)
    setDrawerOpen(false)
  }

  useLayoutEffect(() => {
    if (canDockSidebar && drawerOpen) {
      setDocked(true)
      writeSidebarDocked(true)
      setDrawerOpen(false)
    }
  }, [canDockSidebar, drawerOpen])

  const layout = displayLayout(viewportLayout, docked || (canDockSidebar && drawerOpen))

  return {
    layout,
    viewportLayout,
    canDockSidebar,
    drawerOpen,
    sidebarVisible: layout === 'three' || drawerOpen,
    openSidebar: () => {
      if (canDockSidebar) {
        setDockedPersistent(true)
        return
      }
      setDrawerOpen(true)
    },
    closeDrawer: () => setDrawerOpen(false),
    dockSidebar: () => setDockedPersistent(true),
    collapseSidebar: () => setDockedPersistent(false),
  }
}
