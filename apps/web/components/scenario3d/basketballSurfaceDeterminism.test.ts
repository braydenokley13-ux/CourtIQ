/**
 * Replay-1 — basketball surface texture determinism guard.
 *
 * `generateBasketballSurfaceTexture` previously used unseeded
 * `Math.random()`, so every scene rebuild produced a slightly
 * different pebble layout. That made any visual regression baseline
 * (preview snapshots, golden frames) inherently noisy because two
 * back-to-back captures of the same scenario would not match.
 *
 * The fix routes a seed derived from `Scene3D.id` through
 * `buildBasketballGroup → buildBasketball → generateBasketballSurfaceTexture`,
 * and the canvas painter consumes a deterministic spec produced by
 * `computeBasketballPebbleSpec`. This test pins that contract:
 *
 *   1. The same seed produces a byte-identical pebble spec twice — so
 *      the canvas paint operations are byte-identical, and so is the
 *      resulting texture. (We assert on the spec rather than rasterised
 *      pixels because the test runs in `node` env with no canvas
 *      backend; the spec is the only nondeterministic input to the
 *      painter, which is otherwise pure.)
 *   2. Different seeds produce different specs — so the determinism
 *      didn't collapse to a single hard-coded layout.
 *   3. The seed derived from `scene.id` is stable across calls — so a
 *      scenario rebuild reuses the same seed.
 */

import { describe, it, expect } from 'vitest'
import {
  basketballTextureSeedFromSceneId,
  computeBasketballPebbleSpec,
} from './imperativeScene'

describe('computeBasketballPebbleSpec', () => {
  it('produces byte-identical pebble layout for the same seed', () => {
    const a = computeBasketballPebbleSpec(384, 0xdeadbeef)
    const b = computeBasketballPebbleSpec(384, 0xdeadbeef)
    expect(a).toEqual(b)
    // Stringify guards against any object-identity-based equality
    // shortcut hiding a subtle drift in numeric values.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('uses the documented dot counts (visual style preserved)', () => {
    const size = 384
    const spec = computeBasketballPebbleSpec(size, 1)
    expect(spec.dark).toHaveLength(Math.floor(size * size * 0.018))
    expect(spec.light).toHaveLength(Math.floor(size * size * 0.012))
  })

  it('places dots inside the canvas and inside the documented rgba ranges', () => {
    const size = 256
    const spec = computeBasketballPebbleSpec(size, 42)
    for (const d of spec.dark) {
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.x).toBeLessThan(size)
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.y).toBeLessThan(size)
      expect(d.r).toBeGreaterThanOrEqual(0.7)
      expect(d.r).toBeLessThan(2.0)
      expect(d.a).toBeGreaterThanOrEqual(0.18)
      expect(d.a).toBeLessThan(0.4)
    }
    for (const d of spec.light) {
      expect(d.r).toBeGreaterThanOrEqual(0.5)
      expect(d.r).toBeLessThan(1.5)
      expect(d.a).toBeGreaterThanOrEqual(0.08)
      expect(d.a).toBeLessThan(0.22)
    }
  })

  it('produces different layouts for different seeds', () => {
    const a = computeBasketballPebbleSpec(128, 1)
    const b = computeBasketballPebbleSpec(128, 2)
    // The seeded PRNG is independent per seed — the two specs must
    // differ on at least one dot.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

describe('basketballTextureSeedFromSceneId', () => {
  it('returns a stable 32-bit unsigned seed for a given scene id', () => {
    const a = basketballTextureSeedFromSceneId('scene_demo_42')
    const b = basketballTextureSeedFromSceneId('scene_demo_42')
    expect(a).toBe(b)
    expect(Number.isInteger(a)).toBe(true)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(0xffffffff)
  })

  it('returns different seeds for different scene ids', () => {
    const a = basketballTextureSeedFromSceneId('scene_a')
    const b = basketballTextureSeedFromSceneId('scene_b')
    expect(a).not.toBe(b)
  })

  it('handles the empty-string scene id without throwing', () => {
    expect(() => basketballTextureSeedFromSceneId('')).not.toThrow()
  })
})
