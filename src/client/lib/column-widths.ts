import { readLocal, writeLocal } from './storage.ts'

export const SIDEBAR_WIDTH_KEY = 'reader:layout:sidebar-width'
const LIST_WIDTH_KEY = 'reader:layout:list-width'
const SIDEBAR_DOCKED_KEY = 'reader:layout:sidebar-docked'
export const SIDEBAR_MIN = 220
const SIDEBAR_DEFAULT = 280
export const LIST_MIN = 280
export const ARTICLE_MIN = 280
const SPLITTER_TRACKS_PX = 2

function defaultListWidth(): number {
  if (typeof window === 'undefined') {
    return 360
  }
  return Math.min(420, Math.max(320, Math.round(window.innerWidth * 0.3)))
}

function readStoredWidth(key: string, min: number, fallback: number): number {
  const raw = readLocal(key)
  if (raw === null) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) && value >= min ? value : fallback
}

export function readSidebarWidth(): number {
  return readStoredWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_MIN, SIDEBAR_DEFAULT)
}

export function readListWidth(): number {
  return readStoredWidth(LIST_WIDTH_KEY, LIST_MIN, defaultListWidth())
}

export function writeSidebarWidth(value: number): void {
  writeLocal(SIDEBAR_WIDTH_KEY, String(value))
}

export function writeListWidth(value: number): void {
  writeLocal(LIST_WIDTH_KEY, String(value))
}

export function readSidebarDocked(): boolean {
  return readLocal(SIDEBAR_DOCKED_KEY) !== '0'
}

export function writeSidebarDocked(docked: boolean): void {
  writeLocal(SIDEBAR_DOCKED_KEY, docked ? '1' : '0')
}

export function clampWidth(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

export function columnDragMax(
  frameWidth: number,
  reservedWidth: number,
  min: number,
  tracksPx: number = SPLITTER_TRACKS_PX,
): number {
  return Math.max(min, Math.floor(frameWidth - reservedWidth - tracksPx))
}
