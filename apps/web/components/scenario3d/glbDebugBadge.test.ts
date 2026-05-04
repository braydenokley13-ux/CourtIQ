/**
 * P3.3C — tests for the production-route GLB debug badge.
 *
 * Two pure helpers carry the gating logic:
 *
 *   1. `computeGlbDebugPick({ gateGlb, loader })` — given the runtime
 *      gate boolean and the asset loader status, returns the renderer
 *      selection (`'glb' | 'procedural'`) and a one-token reason. The
 *      test matrix below pins each branch so the badge cannot drift
 *      from the figure builder's actual fallback chain.
 *
 *   2. `isGlbDebugBadgeEnabled()` — reads `?glbDebug=1` and the
 *      `window.__COURTIQ_GLB_DEBUG__` global to decide whether to
 *      mount the badge. The default must be `false` (production users
 *      pay zero cost when neither gate is set).
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeGlbDebugPick,
  isGlbDebugBadgeEnabled,
} from './GlbDebugBadge'

function clearWindowOverride(): void {
  if (typeof window === 'undefined') return
  delete (window as unknown as Record<string, unknown>)
    .__COURTIQ_GLB_DEBUG__
}

function setUrl(search: string): void {
  // Replace just the search portion of the URL so the rest of the
  // origin stays intact across tests.
  const next = `${window.location.pathname}${search}`
  window.history.replaceState({}, '', next)
}

describe('P3.3C — computeGlbDebugPick', () => {
  it('returns procedural when the env gate is off', () => {
    expect(computeGlbDebugPick({ gateGlb: false, loader: 'ok' })).toEqual({
      pick: 'procedural',
      reason: 'env-flag-off',
    })
    // Loader state must NOT win over the gate — even a populated
    // cache with the gate off renders procedural.
    expect(computeGlbDebugPick({ gateGlb: false, loader: 'pending' })).toEqual({
      pick: 'procedural',
      reason: 'env-flag-off',
    })
  })

  it('returns procedural with `loader-cold-cache` while the loader is in flight', () => {
    expect(
      computeGlbDebugPick({ gateGlb: true, loader: 'pending' }),
    ).toEqual({ pick: 'procedural', reason: 'loader-cold-cache' })
  })

  it('returns procedural with `asset-missing-or-no-skin` when the loader resolves to null', () => {
    // `loader: 'null'` matches `loadGlbAthleteAsset()` resolving with
    // `null` — asset 404, parse failure, or no SkinnedMesh in the GLB.
    expect(computeGlbDebugPick({ gateGlb: true, loader: 'null' })).toEqual({
      pick: 'procedural',
      reason: 'asset-missing-or-no-skin',
    })
  })

  it('returns procedural with `loader-threw` when the loader rejected', () => {
    expect(computeGlbDebugPick({ gateGlb: true, loader: 'error' })).toEqual({
      pick: 'procedural',
      reason: 'loader-threw',
    })
  })

  it('returns glb only when the gate is on and the loader populated the cache', () => {
    expect(computeGlbDebugPick({ gateGlb: true, loader: 'ok' })).toEqual({
      pick: 'glb',
      reason: 'gate-on-cache-warm',
    })
  })
})

describe('P3.3C — isGlbDebugBadgeEnabled', () => {
  beforeEach(() => {
    clearWindowOverride()
    setUrl('')
  })
  afterEach(() => {
    clearWindowOverride()
    setUrl('')
  })

  it('returns false by default — no URL param, no window global', () => {
    expect(isGlbDebugBadgeEnabled()).toBe(false)
  })

  it('returns true when `?glbDebug=1` is on the URL', () => {
    setUrl('?glbDebug=1')
    expect(isGlbDebugBadgeEnabled()).toBe(true)
  })

  it('returns false for any non-`1` glbDebug query value', () => {
    for (const v of ['', '0', 'true', 'on', 'yes']) {
      setUrl(`?glbDebug=${encodeURIComponent(v)}`)
      expect(isGlbDebugBadgeEnabled()).toBe(false)
    }
  })

  it('returns true when `window.__COURTIQ_GLB_DEBUG__` is exactly `true`', () => {
    ;(window as unknown as Record<string, unknown>)
      .__COURTIQ_GLB_DEBUG__ = true
    expect(isGlbDebugBadgeEnabled()).toBe(true)
  })

  it('returns false for truthy-but-not-`true` window global values', () => {
    // The contract is the literal `true`. `'1'`, `1`, `{}` are all
    // common accidental sets and must NOT enable the badge — keeps
    // the prod-zero-cost guarantee tight.
    for (const v of [1, '1', 'true', {}, [], 'yes']) {
      ;(window as unknown as Record<string, unknown>)
        .__COURTIQ_GLB_DEBUG__ = v
      expect(isGlbDebugBadgeEnabled()).toBe(false)
    }
  })

  it('URL param wins over a missing window global, and vice versa', () => {
    setUrl('?glbDebug=1')
    expect(isGlbDebugBadgeEnabled()).toBe(true)
    clearWindowOverride()
    expect(isGlbDebugBadgeEnabled()).toBe(true)

    setUrl('')
    ;(window as unknown as Record<string, unknown>)
      .__COURTIQ_GLB_DEBUG__ = true
    expect(isGlbDebugBadgeEnabled()).toBe(true)
  })
})
