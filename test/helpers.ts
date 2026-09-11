import { env } from 'cloudflare:workers'
import { createSession, SESSION_COOKIE } from '../src/server/middleware/session.ts'

export const ORIGIN = 'https://konpeito.example'

/** `Uint8Array<ArrayBufferLike>`のままでは`Response`に渡せないので、ArrayBufferに写す */
export function toBody(value: string | Uint8Array): BodyInit {
  if (typeof value === 'string') {
    return value
  }
  const buffer = new ArrayBuffer(value.byteLength)
  new Uint8Array(buffer).set(value)
  return buffer
}

export async function sessionCookie(): Promise<string> {
  return `${SESSION_COOKIE}=${await createSession(env.DB, 'test')}`
}

export async function withFetch<T>(stub: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}
