const TZ_ABBREV: Readonly<Record<string, string>> = {
  UT: 'GMT',
  GMT: 'GMT',
  UTC: 'GMT',
  EST: '-0500',
  EDT: '-0400',
  CST: '-0600',
  CDT: '-0500',
  MST: '-0700',
  MDT: '-0600',
  PST: '-0800',
  PDT: '-0700',
  JST: '+0900',
}

function normalizeDateString(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ')
  s = s.replace(/,/g, ', ')
  s = s.replace(/\s+,/g, ',')
  s = s.replace(/,\s+/g, ', ')
  s = s.replace(/\s+/g, ' ')
  s = s.replace(/\bUT\b/g, 'GMT')
  for (const [abbr, offset] of Object.entries(TZ_ABBREV)) {
    if (abbr === 'UT' || abbr === 'GMT' || abbr === 'UTC') {
      continue
    }
    const re = new RegExp(`\\b${abbr}\\b`, 'g')
    s = s.replace(re, offset)
  }
  return s
}

function unixFromDate(date: Date): number | null {
  const ms = date.getTime()
  if (Number.isNaN(ms)) {
    return null
  }
  return Math.floor(ms / 1000)
}

function tryNumeric(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null
  }
  if (raw.length === 10) {
    const sec = Number(raw)
    return Number.isFinite(sec) && sec > 0 ? sec : null
  }
  if (raw.length === 13) {
    const ms = Number(raw)
    return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null
  }
  return null
}

const MANUAL_PATTERNS: readonly { re: RegExp; toIso: (m: RegExpExecArray) => string | null }[] = [
  {
    re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    toIso: (m) => {
      const y = m[1]
      const mo = m[2]
      const d = m[3]
      if (y === undefined || mo === undefined || d === undefined) {
        return null
      }
      const hh = m[4] ?? '00'
      const mm = m[5] ?? '00'
      const ss = m[6] ?? '00'
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:${ss}Z`
    },
  },
  {
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    toIso: (m) => {
      const mo = m[1]
      const d = m[2]
      const y = m[3]
      if (y === undefined || mo === undefined || d === undefined) {
        return null
      }
      const hh = m[4] ?? '00'
      const mm = m[5] ?? '00'
      const ss = m[6] ?? '00'
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:${ss}Z`
    },
  },
]

export function parseFeedDate(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  const numeric = tryNumeric(trimmed)
  if (numeric !== null) {
    return numeric
  }
  for (const { re, toIso } of MANUAL_PATTERNS) {
    const m = re.exec(trimmed)
    if (!m) {
      continue
    }
    const iso = toIso(m)
    if (iso === null) {
      continue
    }
    const fromIso = Date.parse(iso)
    if (!Number.isNaN(fromIso)) {
      return Math.floor(fromIso / 1000)
    }
  }
  const normalized = normalizeDateString(trimmed)
  const parsed = Date.parse(normalized)
  if (!Number.isNaN(parsed)) {
    return Math.floor(parsed / 1000)
  }
  const rfc850 = Date.parse(trimmed)
  if (!Number.isNaN(rfc850)) {
    return Math.floor(rfc850 / 1000)
  }
  return unixFromDate(new Date(trimmed))
}
