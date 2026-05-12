/* @vitest-environment jsdom */
/**
 * Pass-arrival camera shake is permanently disabled. Pins the
 * contract that `isCameraShakeEnabled()` always returns `false`,
 * regardless of URL flags, so no future packet accidentally
 * re-enables the jitter.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { isCameraShakeEnabled } from './feature'

function setSearch(search: string) {
  // jsdom exposes location as configurable on window.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search } as Location,
  })
}

describe('camera shake is permanently disabled', () => {
  beforeEach(() => {
    setSearch('')
  })

  it('returns false by default (no URL flag)', () => {
    expect(isCameraShakeEnabled()).toBe(false)
  })

  it('returns false for any unrelated URL params', () => {
    setSearch('?camera=tactical')
    expect(isCameraShakeEnabled()).toBe(false)
    setSearch('?debug3d=1')
    expect(isCameraShakeEnabled()).toBe(false)
  })

  it('returns false even when ?shake=1 is set (no opt-in path)', () => {
    setSearch('?shake=1')
    expect(isCameraShakeEnabled()).toBe(false)
  })

  it('returns false for anything other than ?shake=1', () => {
    setSearch('?shake=0')
    expect(isCameraShakeEnabled()).toBe(false)
    setSearch('?shake=true')
    expect(isCameraShakeEnabled()).toBe(false)
    setSearch('?shake=')
    expect(isCameraShakeEnabled()).toBe(false)
  })

  it('returns false when window.location.search throws (defensive)', () => {
    // Simulate a sandboxed iframe / locked-down location object.
    Object.defineProperty(window, 'location', {
      configurable: true,
      get() {
        throw new DOMException('Locked', 'SecurityError')
      },
    })
    expect(isCameraShakeEnabled()).toBe(false)
  })
})

// =====================================================================
// Structural regression — the rAF loop in Scenario3DCanvas wires the
// shake through `shakeEnabledRef` rather than enabling unconditionally.
// If a future packet accidentally re-enables the shake by default this
// test trips before it ships.
// =====================================================================

describe('V1 UX — Scenario3DCanvas only triggers shake when shakeEnabledRef.current is true', () => {
  it('the parent rAF loop guards consumePassArrival behind shakeEnabledRef.current', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../components/scenario3d/Scenario3DCanvas.tsx',
      ),
      'utf8',
    )
    // The shake-trigger condition must include the shakeEnabledRef
    // gate. We assert the literal predicate appears alongside the
    // motion.consumePassArrival() call inside the parent rAF tick.
    const triggerMatch = /motion\.consumePassArrival\(\)[\s\S]{0,200}shakeEnabledRef\.current/
    expect(
      triggerMatch.test(src),
      'shake trigger must be gated by shakeEnabledRef.current',
    ).toBe(true)
  })

  it('the shake amplitude is ≤ 0.20 ft (V1 reduced from 0.45)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../components/scenario3d/Scenario3DCanvas.tsx',
      ),
      'utf8',
    )
    // Find the literal `amplitude: <number>` assignment that drives
    // the shake. Must be ≤ 0.20 ft so the effect — even when opted
    // in — never reads as the pre-V1 jitter.
    const ampMatch = src.match(/amplitude:\s*([\d.]+)/)
    expect(ampMatch, 'amplitude assignment not found').not.toBeNull()
    const amp = parseFloat(ampMatch![1])
    expect(amp).toBeLessThanOrEqual(0.2)
  })
})
