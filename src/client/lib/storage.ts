/**
 * `localStorage`はプライベートウィンドウや容量超過で例外を投げる
 * 読み書きに失敗したら、諦めて既定の挙動にする
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 保存できない端末では、このタブを開いているあいだだけ値が残る
  }
}
