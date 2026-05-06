/**
 * V3 P2 — dismiss intro helper contract tests.
 *
 * The Intro modal trusts these helpers to never throw and to no-op when
 * window/localStorage is unavailable (SSR, private mode, denied
 * permissions). These tests pin those guarantees.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  INTRO_DISMISS_KEY,
  clearIntroDismissal,
  dismissIntro,
  hasDismissedIntro,
} from './dismissIntro'

const ORIGINAL_WINDOW = (globalThis as Record<string, unknown>).window

interface FakeStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function makeStorage(): FakeStorage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

function makeBrokenStorage(): FakeStorage {
  return {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('SecurityError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
  }
}

function setWindow(storage: FakeStorage | null) {
  if (storage === null) {
    ;(globalThis as Record<string, unknown>).window = undefined
    return
  }
  ;(globalThis as Record<string, unknown>).window = { localStorage: storage }
}

describe('dismissIntro helpers', () => {
  beforeEach(() => {
    setWindow(makeStorage())
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>).window = ORIGINAL_WINDOW
  })

  it('round-trips dismissal through localStorage under the versioned key', () => {
    expect(hasDismissedIntro()).toBe(false)
    dismissIntro()
    expect(hasDismissedIntro()).toBe(true)
    clearIntroDismissal()
    expect(hasDismissedIntro()).toBe(false)
  })

  it('exposes the namespaced versioned key for replay flows', () => {
    expect(INTRO_DISMISS_KEY).toBe('courtiq:intro-dismissed-v1')
  })

  it('treats SSR (no window) as not dismissed and never throws', () => {
    setWindow(null)
    expect(hasDismissedIntro()).toBe(false)
    expect(() => dismissIntro()).not.toThrow()
    expect(() => clearIntroDismissal()).not.toThrow()
  })

  it('swallows storage errors so private-mode users never crash the modal', () => {
    setWindow(makeBrokenStorage())
    expect(() => dismissIntro()).not.toThrow()
    expect(() => clearIntroDismissal()).not.toThrow()
    expect(hasDismissedIntro()).toBe(false)
  })
})
