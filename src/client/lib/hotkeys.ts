import { useEffect, useRef } from 'react'

type HotkeyAction =
  | 'nextAndOpen'
  | 'prevAndOpen'
  | 'selectNext'
  | 'selectPrev'
  | 'toggleOpen'
  | 'openOriginal'
  | 'toggleRead'
  | 'toggleBookmark'
  | 'toggleFullContent'
  | 'markAllRead'
  | 'refreshFeed'
  | 'focusSearch'
  | 'goUnread'
  | 'goBookmarks'
  | 'goAll'
  | 'focusPrevColumn'
  | 'focusNextColumn'
  | 'openShortcuts'
  | 'escape'

export type HotkeyHandlers = Record<HotkeyAction, () => void>

interface Binding {
  key: string
  action: HotkeyAction
  shift?: boolean
  afterG?: boolean
  inInputs?: boolean
}

type ShortcutMessageId = Exclude<
  keyof import('../i18n/en.ts').Messages['shortcuts'],
  'title' | 'afterG'
>

interface Shortcut {
  label: string
  gThen?: string
  descriptionId: ShortcutMessageId
  bindings: readonly Binding[]
  writes?: true
  demoExplains?: true
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    label: 'j / k',
    descriptionId: 'nextAndOpen',
    bindings: [
      { key: 'j', action: 'nextAndOpen' },
      { key: 'k', action: 'prevAndOpen' },
    ],
  },
  {
    label: 'n / p',
    descriptionId: 'selectOnly',
    bindings: [
      { key: 'n', action: 'selectNext' },
      { key: 'p', action: 'selectPrev' },
    ],
  },
  {
    label: 'o / Enter',
    descriptionId: 'toggleOpen',
    bindings: [
      { key: 'o', action: 'toggleOpen' },
      { key: 'Enter', action: 'toggleOpen' },
    ],
  },
  {
    label: 'v',
    descriptionId: 'openOriginal',
    bindings: [{ key: 'v', action: 'openOriginal' }],
  },
  {
    label: 'm',
    descriptionId: 'toggleRead',
    bindings: [{ key: 'm', action: 'toggleRead' }],
  },
  {
    label: 's',
    descriptionId: 'toggleBookmark',
    writes: true,
    demoExplains: true,
    bindings: [{ key: 's', action: 'toggleBookmark' }],
  },
  {
    label: 'f',
    descriptionId: 'toggleFullContent',
    bindings: [{ key: 'f', action: 'toggleFullContent' }],
  },
  {
    label: 'Shift + A',
    descriptionId: 'markAllRead',
    bindings: [{ key: 'A', shift: true, action: 'markAllRead' }],
  },
  {
    label: 'r',
    descriptionId: 'refreshFeed',
    writes: true,
    bindings: [{ key: 'r', action: 'refreshFeed' }],
  },
  { label: '/', descriptionId: 'focusSearch', bindings: [{ key: '/', action: 'focusSearch' }] },
  {
    label: 'u',
    gThen: 'u',
    descriptionId: 'goUnread',
    bindings: [{ key: 'u', afterG: true, action: 'goUnread' }],
  },
  {
    label: 's',
    gThen: 's',
    descriptionId: 'goBookmarks',
    bindings: [{ key: 's', afterG: true, action: 'goBookmarks' }],
  },
  {
    label: 'a',
    gThen: 'a',
    descriptionId: 'goAll',
    bindings: [{ key: 'a', afterG: true, action: 'goAll' }],
  },
  {
    label: '← / →',
    descriptionId: 'focusColumn',
    bindings: [
      { key: 'ArrowLeft', action: 'focusPrevColumn' },
      { key: 'ArrowRight', action: 'focusNextColumn' },
    ],
  },
  {
    label: '?',
    descriptionId: 'openShortcuts',
    bindings: [{ key: '?', action: 'openShortcuts' }],
  },
  {
    label: 'Esc',
    descriptionId: 'escape',
    bindings: [{ key: 'Escape', action: 'escape', inInputs: true }],
  },
]

const G_TIMEOUT_MS = 800

function bindingKey(key: string, shift: boolean): string {
  return shift ? `Shift+${key}` : key
}

function buildTables(): { plain: Map<string, Binding>; afterG: Map<string, Binding> } {
  const plain = new Map<string, Binding>()
  const afterG = new Map<string, Binding>()
  for (const shortcut of SHORTCUTS) {
    for (const binding of shortcut.bindings) {
      const table = binding.afterG ? afterG : plain
      table.set(bindingKey(binding.key, binding.shift === true), binding)
    }
  }
  return { plain, afterG }
}

const TABLES = buildTables()

const WRITE_ACTIONS = new Set(
  SHORTCUTS.flatMap((shortcut) =>
    shortcut.writes === true && shortcut.demoExplains !== true
      ? shortcut.bindings.map((binding) => binding.action)
      : [],
  ),
)

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** ボタンやリンクの上では`Enter`と`Space`をブラウザ既定の操作に任せる */
function isActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.closest(
      'button, a[href], summary, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="combobox"]',
    ) !== null
  )
}

/** 開いているメニューやリストボックスの中では、その部品自身に`Escape`を処理させる */
function isInsidePopup(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return target.closest('[role="menu"], [role="listbox"], [aria-expanded="true"]') !== null
}

export function useHotkeys(handlers: HotkeyHandlers, enabled: boolean, readOnly = false): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) {
      return
    }
    let gTimer = 0
    let pendingG = false

    function clearG() {
      pendingG = false
      if (gTimer !== 0) {
        window.clearTimeout(gTimer)
        gTimer = 0
      }
    }

    function run(binding: Binding, event: KeyboardEvent) {
      event.preventDefault()
      if (readOnly && WRITE_ACTIONS.has(binding.action)) {
        return
      }
      handlersRef.current[binding.action]()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      const typing = isTypingTarget(event.target)
      const key = bindingKey(event.key, event.shiftKey && event.key.length === 1)

      if (event.key === 'Escape') {
        clearG()
        if (isInsidePopup(event.target)) {
          return
        }
        const binding = TABLES.plain.get('Escape')
        if (binding) {
          run(binding, event)
        }
        return
      }
      if (typing) {
        return
      }
      if ((event.key === 'Enter' || event.key === ' ') && isActivationTarget(event.target)) {
        return
      }
      if (pendingG) {
        const binding = TABLES.afterG.get(key)
        clearG()
        if (binding) {
          run(binding, event)
          return
        }
      }
      if (event.key === 'g') {
        event.preventDefault()
        pendingG = true
        gTimer = window.setTimeout(clearG, G_TIMEOUT_MS)
        return
      }
      const binding = TABLES.plain.get(key)
      if (binding && !binding.inInputs) {
        run(binding, event)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearG()
    }
  }, [enabled, readOnly])
}
