import { describe, expect, it } from 'vitest'
import { FEED_FIXTURES } from '../../../test/fixtures/synthetic/catalog.ts'
import { decodeFeedBody, sniffFormat } from './sniffer.ts'

function fixtureBytes(name: string): Uint8Array {
  const fixture = FEED_FIXTURES.find((row) => row.name === name)
  if (fixture === undefined) {
    throw new Error(`missing fixture ${name}`)
  }
  const binary = atob(fixture.body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('sniffFormat', () => {
  it('detects RSS, RDF, Atom, and JSON Feed', () => {
    expect(sniffFormat(bytes('  \n<?xml version="1.0"?><rss version="2.0"></rss>'))).toBe('rss')
    expect(
      sniffFormat(
        bytes('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>'),
      ),
    ).toBe('rdf')
    expect(
      sniffFormat(bytes('<RDF xmlns="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></RDF>')),
    ).toBe('rdf')
    expect(
      sniffFormat(bytes('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>')),
    ).toBe('atom')
    expect(sniffFormat(bytes('{"version":"https://jsonfeed.org/version/1.1"}'))).toBe('jsonfeed')
  })

  it('skips UTF-8 BOM and comments', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('<!-- hi --><rss></rss>')])
    expect(sniffFormat(bom)).toBe('rss')
  })

  it('returns null for HTML', () => {
    expect(sniffFormat(bytes('<!DOCTYPE html><html></html>'))).toBeNull()
  })
})

describe('decodeFeedBody', () => {
  it('keeps valid UTF-8 even when prolog says Shift_JIS', () => {
    const text = decodeFeedBody(
      fixtureBytes('shift-jis-mismatch.xml'),
      'application/xml; charset=shift_jis',
      'rss',
    )
    expect(text).toContain('日本語タイトル')
    expect(text).not.toContain('<!DOCTYPE')
  })

  it('strips illegal XML control characters and DOCTYPE', () => {
    const text = decodeFeedBody(fixtureBytes('control-chars.xml'), 'application/xml', 'rss')
    expect(text).not.toContain('<!DOCTYPE')
    expect(text).not.toContain('\u0008')
    expect(text).toContain('Badchars')
  })

  it('decodes Shift_JIS when UTF-8 is invalid', () => {
    const text = decodeFeedBody(
      fixtureBytes('shift-jis.xml'),
      'application/xml; charset=shift_jis',
      'rss',
    )
    expect(text).toContain('あ')
  })
})
