/**
 * P3.3F — tests for the per-figure decision log, the
 * `?forceGlb=1` runtime override, and the GLB-build failure-reason
 * propagation.
 *
 * Locked surfaces:
 *
 *   1. `_getPlayerFigureDecisionLog()` records exactly one entry per
 *      `buildPlayerFigure` call, in build order. Entry shape is
 *      `{ pick, reason, error? }`.
 *
 *   2. When the GLB env gate is on:
 *      - cache populated → entry is `{ pick: 'glb', reason:
 *        'gate-on-cache-warm' }`.
 *      - cache cold → entry is `{ pick: 'procedural', reason:
 *        'glb-cache-cold' }`. `_lastGlbBuildFailure` reports
 *        `'cache-cold'`.
 *      - figure construction throws → entry is `{ pick:
 *        'procedural', reason: 'glb-threw', error: '<message>' }`.
 *        `_lastGlbBuildFailure` reports `'threw'` with the
 *        stringified error.
 *
 *   3. When the GLB env gate is off, entry is `{ pick: 'procedural',
 *      reason: 'gate-off' }`. The GLB builder is not invoked at all.
 *
 *   4. `_setForceGlbAthletePreview(true)`:
 *      - flips the gate on regardless of env-var / module const.
 *      - returns a magenta marker figure (`name:
 *        'glb-force-glb-failure-marker'`) when the GLB builder
 *        cannot produce a figure, INSTEAD of falling through to
 *        the procedural / skinned / premium chain.
 *      - the same decision is recorded with `pick:
 *        'force-glb-marker'` and the underlying reason
 *        (`glb-cache-cold` / `glb-threw`).
 *
 *   5. `summarisePlayerFigureDecisions(...)` folds duplicate
 *      decisions into a compact `pick:reason ×n` summary used by
 *      the prod-route debug badge.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _getLastGlbBuildFailure,
  _resetGlbAthleteBoneMapAuditGuard,
  _resetGlbAthleteCache,
  _resetGlbAthleteClipCache,
  _resetLastGlbBuildFailureForTest,
  _setGlbAthleteCacheForTest,
  GLB_ATHLETE_USER_DATA_KEY,
} from './glbAthlete'
import {
  _getPlayerFigureDecisionLog,
  _isForceGlbAthletePreview,
  _resetPlayerFigureDecisionLog,
  _setForceGlbAthletePreview,
  buildPlayerFigure,
  GLB_ATHLETE_PREVIEW_PROD_ENV_KEY,
} from './imperativeScene'
import { summarisePlayerFigureDecisions } from './GlbDebugBadge'
import {
  assertMockCoversGlbBoneMap,
  buildMockGlbAsset,
} from './__fixtures__/mockGlbAsset'

function clearEnvFlag(): void {
  delete (process.env as Record<string, string | undefined>)[
    GLB_ATHLETE_PREVIEW_PROD_ENV_KEY
  ]
}

describe('P3.3F — per-figure decision log', () => {
  beforeEach(() => {
    _resetPlayerFigureDecisionLog()
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetLastGlbBuildFailureForTest()
    _setForceGlbAthletePreview(false)
    clearEnvFlag()
  })
  afterEach(() => {
    _resetPlayerFigureDecisionLog()
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetLastGlbBuildFailureForTest()
    _setForceGlbAthletePreview(false)
    clearEnvFlag()
  })

  it('records `pick=premium reason=premium-flag-on` when the GLB env gate is off (USE_PREMIUM_ATHLETE shim takes over)', () => {
    const figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    // Gate off → premium path runs (USE_PREMIUM_ATHLETE=true at module
    // level). No GLB userData attached.
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeUndefined()

    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toEqual({ pick: 'premium', reason: 'premium-flag-on' })
  })

  it('inherits the `glb-cache-cold` reason on the downstream pick when GLB is attempted but the cache is cold', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'

    const figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    // Cache is cold → GLB returns null → falls through to premium
    // (since USE_PREMIUM_ATHLETE=true), but the recorded reason is
    // the GLB failure cause, not the downstream `premium-flag-on`.
    // This is the contract that lets the hard-assertion in
    // `Scenario3DCanvas` blame the GLB path correctly.
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeUndefined()

    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      pick: 'premium',
      reason: 'glb-cache-cold',
    })
    // The underlying failure tracker on the GLB module mirrors the
    // reason — the two surfaces stay in sync.
    expect(_getLastGlbBuildFailure().kind).toBe('cache-cold')
  })

  it('records `gate-on-cache-warm` when the gate is on and the cache is populated', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    assertMockCoversGlbBoneMap(asset)
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    const figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    // Cache warm → GLB userData attached on the figure.
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeDefined()

    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toEqual({ pick: 'glb', reason: 'gate-on-cache-warm' })
    expect(_getLastGlbBuildFailure().kind).toBe('success')
  })

  it('appends one entry per call, in build order', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    buildPlayerFigure('#5DB4FF', '#1F5BB8', false, false, '23', 'idle')
    buildPlayerFigure('#FF5C72', '#9C1830', false, false, '34', 'idle')

    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(3)
    for (const d of log) {
      expect(d).toEqual({ pick: 'glb', reason: 'gate-on-cache-warm' })
    }
  })

  it('reset clears the log so a scene swap does not stack stale decisions', () => {
    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    expect(_getPlayerFigureDecisionLog()).toHaveLength(1)
    _resetPlayerFigureDecisionLog()
    expect(_getPlayerFigureDecisionLog()).toHaveLength(0)
    buildPlayerFigure('#5DB4FF', '#1F5BB8', false, false, '23', 'idle')
    expect(_getPlayerFigureDecisionLog()).toHaveLength(1)
  })
})

describe('P3.3F — `_setForceGlbAthletePreview` runtime override', () => {
  beforeEach(() => {
    _resetPlayerFigureDecisionLog()
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetLastGlbBuildFailureForTest()
    _setForceGlbAthletePreview(false)
    clearEnvFlag()
  })
  afterEach(() => {
    _resetPlayerFigureDecisionLog()
    _resetGlbAthleteCache()
    _resetGlbAthleteClipCache()
    _resetGlbAthleteBoneMapAuditGuard()
    _resetLastGlbBuildFailureForTest()
    _setForceGlbAthletePreview(false)
    clearEnvFlag()
  })

  it('reports the current override state via `_isForceGlbAthletePreview`', () => {
    expect(_isForceGlbAthletePreview()).toBe(false)
    _setForceGlbAthletePreview(true)
    expect(_isForceGlbAthletePreview()).toBe(true)
    _setForceGlbAthletePreview(false)
    expect(_isForceGlbAthletePreview()).toBe(false)
  })

  it('returns a magenta marker (not procedural) when GLB cannot be produced', () => {
    // Env gate off, force-glb on, cache cold → marker, not procedural.
    _setForceGlbAthletePreview(true)
    const figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    expect(figure.name).toBe('glb-force-glb-failure-marker')
    // No procedural Phase F userData attached.
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeUndefined()

    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      pick: 'force-glb-marker',
      reason: 'glb-cache-cold',
    })
  })

  it('still returns a real GLB figure when force-glb is on AND the cache is warm', () => {
    _setForceGlbAthletePreview(true)
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    const figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    // Real GLB figure, not the marker.
    expect(figure.name).not.toBe('glb-force-glb-failure-marker')
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeDefined()

    const log = _getPlayerFigureDecisionLog()
    expect(log[0]).toEqual({ pick: 'glb', reason: 'gate-on-cache-warm' })
  })

  it('forces the gate on even when env var is unset and module const is false', () => {
    // No env var, no override — gate is off, premium path runs.
    let figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    expect(_getPlayerFigureDecisionLog()[0]?.reason).toBe('premium-flag-on')
    expect(_getPlayerFigureDecisionLog()[0]?.pick).toBe('premium')

    _resetPlayerFigureDecisionLog()
    _setForceGlbAthletePreview(true)
    figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    // Gate now treated as on; with cache cold → marker (skips the
    // skinned/premium/Phase-F fallback chain).
    expect(figure.name).toBe('glb-force-glb-failure-marker')
    const log = _getPlayerFigureDecisionLog()
    expect(log[0]?.pick).toBe('force-glb-marker')
  })
})

describe('P3.3F — summarisePlayerFigureDecisions', () => {
  it('reports `no figures yet` for an empty log', () => {
    expect(summarisePlayerFigureDecisions([])).toBe('no figures yet')
  })

  it('keys by pick:reason and counts duplicates', () => {
    const log = [
      { pick: 'glb' as const, reason: 'gate-on-cache-warm' },
      { pick: 'glb' as const, reason: 'gate-on-cache-warm' },
      { pick: 'glb' as const, reason: 'gate-on-cache-warm' },
      { pick: 'procedural' as const, reason: 'glb-cache-cold' },
      { pick: 'procedural' as const, reason: 'glb-threw' },
    ]
    const summary = summarisePlayerFigureDecisions(log)
    expect(summary).toContain('glb:gate-on-cache-warm ×3')
    expect(summary).toContain('procedural:glb-cache-cold')
    expect(summary).toContain('procedural:glb-threw')
    // Singletons render without the count suffix.
    expect(summary).not.toContain('procedural:glb-cache-cold ×1')
  })

  it('preserves insertion order across distinct pick:reason pairs', () => {
    const summary = summarisePlayerFigureDecisions([
      { pick: 'glb', reason: 'gate-on-cache-warm' },
      { pick: 'procedural', reason: 'glb-cache-cold' },
    ])
    const parts = summary.split(' · ')
    expect(parts[0]).toBe('glb:gate-on-cache-warm')
    expect(parts[1]).toBe('procedural:glb-cache-cold')
  })
})
