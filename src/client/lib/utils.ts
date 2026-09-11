import { type ClassValue, clsx } from 'clsx'

/**
 * `tailwind-merge`は使わないので、同じ系統のクラスを部品の既定と呼び出し側の両方に書くと
 * 詳細度は勝敗はCSSの定義順で決まって管理が難しい
 * 部品の既定は細くし、呼び出し側が上書きしたい値はプロパティで受ける
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
