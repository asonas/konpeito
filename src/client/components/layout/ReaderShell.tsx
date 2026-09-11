import { Activity, type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { useMessages } from '../../i18n/I18nProvider.tsx'
import {
  ARTICLE_MIN,
  clampWidth,
  columnDragMax,
  LIST_MIN,
  readListWidth,
  readSidebarWidth,
  SIDEBAR_MIN,
  writeListWidth,
  writeSidebarWidth,
} from '../../lib/column-widths.ts'
import type { LayoutMode } from '../../lib/layout.ts'
import { ColumnSplitter } from './ColumnSplitter.tsx'

type ShellVars = CSSProperties & {
  '--sidebar-width'?: string
  '--list-width'?: string
  '--article-min': string
}

export function ReaderShell(props: {
  layout: LayoutMode
  sidebar: ReactNode
  list: ReactNode
  article: ReactNode
  sidebarVisible: boolean
  listVisible: boolean
  articleVisible: boolean
  drawerOpen: boolean
  canDockSidebar: boolean
  onDrawerClose: () => void
  onSidebarCollapse: () => void
  onSidebarDock: () => void
}) {
  const t = useMessages()
  const shellRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [listWidth, setListWidth] = useState(readListWidth)

  useEffect(() => {
    const node = shellRef.current
    if (!node) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width === undefined) {
        return
      }
      setFrameWidth(width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  function changeSidebar(value: number) {
    setSidebarWidth(value)
    writeSidebarWidth(value)
  }
  function changeList(value: number) {
    setListWidth(value)
    writeListWidth(value)
  }
  function dockSidebar(value: number) {
    changeSidebar(value)
    props.onSidebarDock()
  }

  const three = props.layout === 'three'
  const two = props.layout === 'two'
  const overlayMax = Math.max(SIDEBAR_MIN, Math.floor(frameWidth * 0.85))
  const overlayWidth = clampWidth(sidebarWidth, SIDEBAR_MIN, overlayMax)
  const sidebarMax = columnDragMax(frameWidth, listWidth + ARTICLE_MIN, SIDEBAR_MIN)
  const listMax = three
    ? columnDragMax(frameWidth, sidebarWidth + ARTICLE_MIN, LIST_MIN)
    : columnDragMax(frameWidth, ARTICLE_MIN, LIST_MIN, 1)
  const articleMin: ShellVars = { '--article-min': `${ARTICLE_MIN}px` }
  const threeStyle: ShellVars = {
    ...articleMin,
    gridTemplateColumns:
      'var(--sidebar-width) 1px var(--list-width) 1px minmax(var(--article-min), 1fr)',
    '--sidebar-width': `${sidebarWidth}px`,
    '--list-width': `${listWidth}px`,
  }
  const twoStyle: ShellVars = {
    ...articleMin,
    gridTemplateColumns: 'var(--list-width) 1px minmax(var(--article-min), 1fr)',
    '--list-width': `${listWidth}px`,
  }

  const listPane = <Activity mode={props.listVisible ? 'visible' : 'hidden'}>{props.list}</Activity>
  const articlePane = (
    <Activity mode={props.articleVisible ? 'visible' : 'hidden'}>{props.article}</Activity>
  )

  return (
    <div ref={shellRef} className="relative flex h-dvh flex-col bg-canvas">
      {props.layout !== 'three' && props.drawerOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-20 scrim"
          aria-label={t.common.close}
          onClick={props.onDrawerClose}
        />
      ) : null}
      {three ? (
        <main className="grid min-h-0 min-w-0 flex-1 overflow-hidden" style={threeStyle}>
          <div
            id="reader-sidebar"
            className="relative z-[1] min-h-0 min-w-0 overflow-hidden bg-shell"
          >
            <Activity mode={props.sidebarVisible ? 'visible' : 'hidden'}>{props.sidebar}</Activity>
          </div>
          <ColumnSplitter
            label={t.common.sidebarWidth}
            controls="reader-sidebar"
            value={sidebarWidth}
            min={SIDEBAR_MIN}
            max={sidebarMax}
            onChange={changeSidebar}
            onBelowMin={props.onSidebarCollapse}
          />
          <div id="reader-list" className="relative z-[1] min-h-0 min-w-0 overflow-hidden">
            {listPane}
          </div>
          <ColumnSplitter
            label={t.common.listWidth}
            controls="reader-list"
            value={listWidth}
            min={LIST_MIN}
            max={listMax}
            onChange={changeList}
          />
          <div id="reader-article" className="relative z-[1] min-h-0 min-w-0 overflow-hidden">
            {articlePane}
          </div>
        </main>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <div
            className={
              props.drawerOpen
                ? 'fixed inset-y-0 left-0 z-30 shadow-lg'
                : 'pointer-events-none invisible fixed inset-y-0 left-0 z-30 w-0 overflow-hidden'
            }
            style={props.drawerOpen ? { width: `${overlayWidth}px` } : undefined}
          >
            <div id="reader-sidebar" className="h-full min-h-0 min-w-0 overflow-hidden bg-shell">
              <Activity mode={props.sidebarVisible ? 'visible' : 'hidden'}>
                {props.sidebar}
              </Activity>
            </div>
            {props.drawerOpen ? (
              <div className="absolute inset-y-0 right-0 z-10 w-px">
                <ColumnSplitter
                  label={t.common.sidebarWidth}
                  controls="reader-sidebar"
                  value={overlayWidth}
                  min={SIDEBAR_MIN}
                  max={props.canDockSidebar ? sidebarMax : overlayMax}
                  onChange={changeSidebar}
                  onBelowMin={props.onDrawerClose}
                  {...(props.canDockSidebar ? { onExpandPastMin: dockSidebar } : {})}
                />
              </div>
            ) : null}
          </div>
          {two ? (
            <main className="grid min-h-0 min-w-0 flex-1 overflow-hidden" style={twoStyle}>
              <div id="reader-list" className="relative z-[1] min-h-0 min-w-0 overflow-hidden">
                {listPane}
              </div>
              <ColumnSplitter
                label={t.common.listWidth}
                controls="reader-list"
                value={listWidth}
                min={LIST_MIN}
                max={listMax}
                onChange={changeList}
              />
              <div id="reader-article" className="relative z-[1] min-h-0 min-w-0 overflow-hidden">
                {articlePane}
              </div>
            </main>
          ) : (
            <main className="flex min-h-0 min-w-0 flex-1">
              <Activity mode={props.listVisible ? 'visible' : 'hidden'}>
                <div id="reader-list" className="h-full min-h-0 min-w-0 w-full overflow-hidden">
                  {props.list}
                </div>
              </Activity>
              <Activity mode={props.articleVisible ? 'visible' : 'hidden'}>
                <div id="reader-article" className="h-full min-h-0 min-w-0 w-full overflow-hidden">
                  {props.article}
                </div>
              </Activity>
            </main>
          )}
        </div>
      )}
    </div>
  )
}
