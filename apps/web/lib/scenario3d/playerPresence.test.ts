/* @vitest-environment jsdom */
/**
 * V2-A — Player presence helper tests.
 *
 * The presence helpers depend on the browser canvas 2D API. jsdom
 * does not ship a canvas backend by default, so the helpers' SSR-safe
 * fall-through (returning null when getContext is unavailable) is the
 * code path actually exercised here. The contract we lock:
 *
 *  1. SSR-safe: every helper returns null when `document` is undefined.
 *  2. Browser-without-canvas: every helper returns null gracefully
 *     (rather than throwing), so callers can fall back to the legacy
 *     unlit material without a try/catch.
 *  3. The function signatures stay stable so the imperative scene
 *     can call them with no special-casing.
 */

import { describe, it, expect } from 'vitest'
import {
  buildPlayerShadowTexture,
  buildPlayerSheenTexture,
} from './playerPresence'

describe('buildPlayerShadowTexture', () => {
  it('returns null on SSR (no document)', () => {
    const original = (globalThis as unknown as { document?: unknown }).document
    delete (globalThis as unknown as { document?: unknown }).document
    try {
      expect(buildPlayerShadowTexture()).toBeNull()
    } finally {
      if (original !== undefined) {
        ;(globalThis as unknown as { document: unknown }).document = original
      }
    }
  })

  it('does not throw when canvas getContext is unavailable', () => {
    expect(() => buildPlayerShadowTexture()).not.toThrow()
    expect(() => buildPlayerShadowTexture({ size: 64 })).not.toThrow()
    expect(() => buildPlayerShadowTexture({ ink: 'not-a-hex' })).not.toThrow()
  })
})

describe('buildPlayerSheenTexture', () => {
  it('returns null on SSR (no document)', () => {
    const original = (globalThis as unknown as { document?: unknown }).document
    delete (globalThis as unknown as { document?: unknown }).document
    try {
      expect(buildPlayerSheenTexture()).toBeNull()
    } finally {
      if (original !== undefined) {
        ;(globalThis as unknown as { document: unknown }).document = original
      }
    }
  })

  it('does not throw when canvas getContext is unavailable', () => {
    expect(() => buildPlayerSheenTexture()).not.toThrow()
    expect(() => buildPlayerSheenTexture({ tint: '#ABCDEF' })).not.toThrow()
  })
})
