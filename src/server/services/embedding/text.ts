import { htmlToPlainText } from '../normalizer.ts'

export const EMBEDDING_BODY_CHARS = 1200

export type EmbeddingSource = {
  title: string
  content_html: string | null
  full_content_html: string | null
}

function clip(text: string, max: number): string {
  // サロゲートペアの前半だけが残ると、JSONにした時に不正な文字列になる
  return text.slice(0, max).replace(/[\uD800-\uDBFF]$/, '')
}

/** 埋め込めるテキストが無ければ`null` */
export function embeddingText(item: EmbeddingSource): string | null {
  const title = item.title.trim()
  const body = clip(
    htmlToPlainText(item.full_content_html ?? item.content_html ?? ''),
    EMBEDDING_BODY_CHARS,
  )
  if (title.length === 0 && body.length === 0) {
    return null
  }
  // embeddinggemmaが文書に指定する形式。類似の比較では全ての入力を同じ形式にする
  return `title: ${title.length > 0 ? title : 'none'} | text: ${body}`
}
