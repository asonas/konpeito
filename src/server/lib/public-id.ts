import { hexToBytes, sha256Hex, toBase32Lower } from './crypto.ts'

const ALL_DIGITS = /^[0-9]+$/
const MAX_ATTEMPTS = 4

export class PublicIdError extends Error {
  readonly code = 'internal_error' as const

  constructor() {
    super('failed to allocate public id')
    this.name = 'PublicIdError'
  }
}

export function publicIdOf(source: string, bytes: number): string {
  return toBase32Lower(hexToBytes(sha256Hex(source)).slice(0, bytes))
}

export function feedPublicId(feedUrl: string, attempt: number): string {
  return publicIdOf(feedUrl, 5 + attempt)
}

export function itemPublicId(feedPublicIdValue: string, guidHash: string, attempt: number): string {
  return publicIdOf(`${feedPublicIdValue}\n${guidHash}`, 6 + attempt)
}

export function tagPublicId(name: string, createdAt: number, attempt: number): string {
  return publicIdOf(`${name}\n${createdAt}`, 4 + attempt)
}

function isAllDigits(value: string): boolean {
  return ALL_DIGITS.test(value)
}

function isPublicIdUniqueError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes('unique') && message.includes('public_id')
}

export async function insertWithPublicId<T>(
  generate: (attempt: number) => string,
  insert: (publicId: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const publicId = generate(attempt)
    if (isAllDigits(publicId)) {
      continue
    }
    try {
      return await insert(publicId)
    } catch (error) {
      if (isPublicIdUniqueError(error)) {
        lastError = error
        continue
      }
      throw error
    }
  }
  if (lastError instanceof Error) {
    throw lastError
  }
  throw new PublicIdError()
}

export function allocatePublicId(
  generate: (attempt: number) => string,
  used: Set<string> = new Set(),
): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const publicId = generate(attempt)
    if (!isAllDigits(publicId) && !used.has(publicId)) {
      used.add(publicId)
      return publicId
    }
  }
  throw new PublicIdError()
}
