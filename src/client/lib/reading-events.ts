import { type ItemEventKind, postItemEvent } from './queries.ts'

export const ARTICLE_BODY_CLASS = 'article-body'

/** 記録は推薦の学習と統計にだけ使うので、失敗しても読書の操作は止めない */
export function recordItemEvent(id: number, kind: ItemEventKind, dwellMs?: number): void {
  postItemEvent(id, kind, dwellMs).catch(() => {})
}

export function openOriginal(item: { id: number; url: string | null }, record: boolean): void {
  if (!item.url) {
    return
  }
  window.open(item.url, '_blank', 'noopener,noreferrer')
  if (record) {
    recordItemEvent(item.id, 'open_original')
  }
}

/**
 * 記事ペインの中のクリックが、どの記録に当たるかを返す
 * `button`は`MouseEvent.button`。0は通常のクリック、1は中クリック
 */
export function classifyArticleClick(
  target: EventTarget | null,
  button: number,
  itemUrl: string | null,
): 'link_click' | 'open_original' | null {
  if (!(target instanceof Element) || (button !== 0 && button !== 1)) {
    return null
  }
  const anchor = target.closest('a[href]')
  if (anchor === null) {
    return null
  }
  if (anchor.closest(`.${ARTICLE_BODY_CLASS}`) !== null) {
    // 画像を含むリンクの通常のクリックは、ライトボックスが開くだけでリンク先へ移動しない
    if (button === 0 && target.closest('img') !== null) {
      return null
    }
    return 'link_click'
  }
  if (itemUrl !== null && anchor.getAttribute('href') === itemUrl) {
    return 'open_original'
  }
  return null
}

/**
 * ブラウザー拡張機能のFeedly Background Tabが、元記事を裏のタブで開くキー入力かどうかを返す
 * 拡張機能は記事タイトルのリンクからURLを読むだけで、ページにはclickが起きないので、同じキー入力を見て記録する
 * 条件は拡張機能の`keypress`ハンドラーに揃えている。拡張機能側でキーを変えている場合は記録されない
 */
export function isBackgroundOpenKey(event: {
  key: string
  altKey: boolean
  ctrlKey: boolean
  target: EventTarget | null
}): boolean {
  if (event.key !== ';' || event.altKey || event.ctrlKey) {
    return false
  }
  if (event.target instanceof Element) {
    const tag = event.target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea') {
      return false
    }
  }
  return true
}
