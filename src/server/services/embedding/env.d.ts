/**
 * 埋め込みの任意のバインディング。デプロイ用のCLIがインデックスを用意できた時だけ足す
 * Workers AIとVectorizeにはローカルの模擬環境が無いので、`wrangler.jsonc`には書かない
 */
interface Env {
  AI?: Ai
  VECTORIZE?: Vectorize
}
