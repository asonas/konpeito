import { describe, expect, it } from 'vitest'
import { ARTICLE_BODY_CLASS, classifyArticleClick, isBackgroundOpenKey } from './reading-events.ts'

const ITEM_URL = 'https://example.com/post'

function article(): HTMLElement {
  const root = document.createElement('article')
  root.innerHTML = `
    <a id="back" href="/unread">Back</a>
    <h1><a id="title" href="${ITEM_URL}" target="_blank">Title</a></h1>
    <div class="${ARTICLE_BODY_CLASS}">
      <a id="text" href="https://example.com/other"><em id="inner">link</em></a>
      <a id="self" href="${ITEM_URL}">permalink</a>
      <a id="image" href="https://example.com/large.png"><img id="img" src="https://example.com/small.png"></a>
      <p id="plain">text</p>
    </div>`
  return root
}

function target(root: HTMLElement, id: string): Element {
  const el = root.querySelector(`#${id}`)
  if (el === null) {
    throw new Error(`missing #${id}`)
  }
  return el
}

describe('classifyArticleClick', () => {
  it('本文の中のリンクは、内側の要素を押してもリンクのクリックと数える', () => {
    const root = article()
    expect(classifyArticleClick(target(root, 'inner'), 0, ITEM_URL)).toBe('link_click')
    expect(classifyArticleClick(target(root, 'text'), 1, ITEM_URL)).toBe('link_click')
  })

  it('本文の中にある元記事と同じURLのリンクは、リンクのクリックと数える', () => {
    expect(classifyArticleClick(target(article(), 'self'), 0, ITEM_URL)).toBe('link_click')
  })

  it('画像を含むリンクは、ライトボックスが開く通常のクリックでは数えず、中クリックでは数える', () => {
    const root = article()
    expect(classifyArticleClick(target(root, 'img'), 0, ITEM_URL)).toBeNull()
    expect(classifyArticleClick(target(root, 'img'), 1, ITEM_URL)).toBe('link_click')
  })

  it('本文の外では、元記事へのリンクだけを元記事を開いた記録にする', () => {
    const root = article()
    expect(classifyArticleClick(target(root, 'title'), 0, ITEM_URL)).toBe('open_original')
    expect(classifyArticleClick(target(root, 'title'), 1, ITEM_URL)).toBe('open_original')
    expect(classifyArticleClick(target(root, 'back'), 0, ITEM_URL)).toBeNull()
  })

  it('リンク以外と、右クリックは数えない', () => {
    const root = article()
    expect(classifyArticleClick(target(root, 'plain'), 0, ITEM_URL)).toBeNull()
    expect(classifyArticleClick(target(root, 'text'), 2, ITEM_URL)).toBeNull()
  })
})

describe('isBackgroundOpenKey', () => {
  const key = (overrides: Partial<Parameters<typeof isBackgroundOpenKey>[0]> = {}) => ({
    key: ';',
    altKey: false,
    ctrlKey: false,
    target: document.createElement('article'),
    ...overrides,
  })

  it('セミコロンの入力を、元記事を開いた記録にする', () => {
    expect(isBackgroundOpenKey(key())).toBe(true)
  })

  it('入力欄の中のセミコロンは数えない', () => {
    expect(isBackgroundOpenKey(key({ target: document.createElement('input') }))).toBe(false)
    expect(isBackgroundOpenKey(key({ target: document.createElement('textarea') }))).toBe(false)
  })

  it('AltかCtrlを伴う入力と、他のキーは数えない', () => {
    expect(isBackgroundOpenKey(key({ altKey: true }))).toBe(false)
    expect(isBackgroundOpenKey(key({ ctrlKey: true }))).toBe(false)
    expect(isBackgroundOpenKey(key({ key: 'v' }))).toBe(false)
  })
})
