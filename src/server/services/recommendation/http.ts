export type ApiDeps = {
  fetch: typeof fetch
  apiKey: string
}

export type ApiFailure =
  | { kind: 'http_error'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network'; message: string }
  | { kind: 'invalid_response'; message: string }

export type PostJsonResult = { kind: 'ok'; body: unknown } | ApiFailure

/** Workers の native `fetch` は `this` が globalThis でないと Illegal invocation になる */
function invokeFetch(fetchFn: typeof fetch, input: string, init: RequestInit): Promise<Response> {
  return Reflect.apply(fetchFn, globalThis, [input, init])
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

/** 有料APIなので、失敗しても再試行しない。次のcronで拾い直す */
export async function postJson(
  url: string,
  body: unknown,
  deps: ApiDeps,
  timeoutMs: number,
): Promise<PostJsonResult> {
  let response: Response
  try {
    response = await invokeFetch(deps.fetch, url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (isTimeoutError(error)) {
      return { kind: 'timeout' }
    }
    return { kind: 'network', message: error instanceof Error ? error.message : String(error) }
  }
  if (!response.ok) {
    await response.body?.cancel()
    return { kind: 'http_error', status: response.status }
  }
  try {
    return { kind: 'ok', body: await response.json() }
  } catch {
    return { kind: 'invalid_response', message: 'Response body is not JSON' }
  }
}
