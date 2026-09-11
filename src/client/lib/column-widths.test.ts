import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARTICLE_MIN,
  columnDragMax,
  readSidebarDocked,
  readSidebarWidth,
  SIDEBAR_MIN,
  SIDEBAR_WIDTH_KEY,
  writeSidebarDocked,
} from './column-widths.ts'
import { stubLocalStorage } from './storage.test-helper.ts'

let memory = new Map<string, string>()

describe('sidebar docked preference', () => {
  beforeEach(() => {
    memory = stubLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to docked, and reads back what was written', () => {
    expect(readSidebarDocked()).toBe(true)
    writeSidebarDocked(false)
    expect(readSidebarDocked()).toBe(false)
    writeSidebarDocked(true)
    expect(readSidebarDocked()).toBe(true)
  })
})

describe('column widths', () => {
  beforeEach(() => {
    memory = stubLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the stored sidebar width as it is, however wide', () => {
    memory.set(SIDEBAR_WIDTH_KEY, '640')
    expect(readSidebarWidth()).toBe(640)
  })

  it('falls back when the stored sidebar width is below the minimum or not a number', () => {
    memory.set(SIDEBAR_WIDTH_KEY, '100')
    expect(readSidebarWidth()).toBe(280)
    memory.set(SIDEBAR_WIDTH_KEY, 'wide')
    expect(readSidebarWidth()).toBe(280)
  })

  it('never returns less than the column minimum, however narrow the frame', () => {
    expect(columnDragMax(400, 360 + ARTICLE_MIN, SIDEBAR_MIN)).toBe(SIDEBAR_MIN)
    expect(columnDragMax(1440, 360, SIDEBAR_MIN)).toBeGreaterThan(SIDEBAR_MIN)
  })
})
