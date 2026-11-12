/**
 * おすすめ機能の任意の設定。`wrangler secret put`で入れる
 * `secrets.required`に入れると設定していないサーバーのデプロイが止まるので、ここで省略可能な値として足す
 */
interface Env {
  JEV_API_KEY?: string
  JEV_MODEL?: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
}
