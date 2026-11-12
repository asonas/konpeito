import { describe, expect, it } from 'vitest'
import { scoreItems } from './jev.ts'

const ITEMS = [
  { feed: 'F', title: 'A', summary: '' },
  { feed: 'F', title: 'B', summary: '' },
]

function deps(respond: () => Response) {
  return { fetch: async () => respond(), apiKey: 'k', model: 'jev-1.14.0' }
}

describe('scoreItems', () => {
  it('rejects the whole batch when any answer is outside 0..1', async () => {
    const result = await scoreItems(
      ITEMS,
      'pref',
      deps(() =>
        Response.json({ answers: { i0: { noul: 0.4 }, i1: { noul: 1.2 } }, model: 'jev-1.14.0' }),
      ),
    )
    expect(result).toEqual({ kind: 'invalid_response', message: 'Invalid answer i1' })
  })

  it('reports HTTP errors without retrying', async () => {
    let calls = 0
    const result = await scoreItems(
      ITEMS,
      'pref',
      deps(() => {
        calls += 1
        return new Response('slow down', { status: 429 })
      }),
    )
    expect(result).toEqual({ kind: 'http_error', status: 429 })
    expect(calls).toBe(1)
  })
})
