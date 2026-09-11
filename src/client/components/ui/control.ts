/**
 * フォームコントロールの要素の高さ
 * テキストフィールド、セレクトボックス、ボタンを横に並べたときに高さが揃うようにする
 * 基本は36pxだが、例外としてアイコンだけのボタンは32pxで、ラベルのついたボタンと横に並べない
 */
export const CONTROL_SIZES = {
  default: 'h-9',
  sm: 'h-8',
} as const

export type ControlSize = keyof typeof CONTROL_SIZES
