import type { ErrorCode } from '../../shared/errors.ts'
import { isRecord } from '../../shared/records.ts'

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export class ApiError extends Error {
  readonly code: ErrorCode | string
  readonly status: number
  readonly errorKind: string | null

  constructor(
    status: number,
    code: ErrorCode | string,
    message: string,
    errorKind: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.errorKind = errorKind
  }
}

function errorKindOf(body: { error: Record<string, unknown> }): string | null {
  const kind = body.error.error_kind
  return typeof kind === 'string' ? kind : null
}

export function isApiError(
  value: unknown,
): value is { error: { code: string; message: string } & Record<string, unknown> } {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false
  }
  return typeof value.error.code === 'string' && typeof value.error.message === 'string'
}

export async function throwIfNotOk(res: {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}): Promise<void> {
  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (res.ok) {
    return
  }
  const body: unknown = await res.json().catch(() => null)
  if (isApiError(body)) {
    throw new ApiError(res.status, body.error.code, body.error.message, errorKindOf(body))
  }
  throw new ApiError(res.status, 'internal_error', `HTTP ${res.status}`)
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }
  return fallback
}
