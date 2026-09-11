/**
 * デモモードの2つの変数
 * デモのWorkerにしか設定しないので、`wrangler types`が生成する`Env`には現れない
 * ここで省略可能な値として足す
 */
interface Env {
  DEMO_MODE?: string
  DEMO_FEEDS?: string
}
