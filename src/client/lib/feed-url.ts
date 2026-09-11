export function normalizeFeedInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  const withScheme = /^feed:\/\//i.test(trimmed)
    ? trimmed.replace(/^feed:\/\//i, 'https://')
    : /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  if (parsed.hostname.length === 0 || !parsed.hostname.includes('.')) {
    return null
  }
  return parsed.toString()
}
