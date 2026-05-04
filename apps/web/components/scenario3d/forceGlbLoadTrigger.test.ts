/**
 * Athlete-rendering reliability pass — forceGlb load-trigger contract.
 *
 * Production bug: visiting `/train?forceGlb=1` rendered bright magenta
 * boxes instead of the GLB mannequin even though the asset was on
 * disk and the URL was reachable.
 *
 * Root cause: the `forceGlb` URL flip set
 * `_setForceGlbAthletePreview(true)` and made the figure builder
 * enter the GLB branch — but the canvas's *asset-load* effect only
 * triggered `loadGlbAthleteAsset()` when `isGlbAthletePreviewActive()`
 * (the env-var gate) was true. With the env gate off and only
 * `forceGlb` active, no one fired the load. The figure builder
 * found a cold cache, returned the magenta marker, and there was no
 * subsequent `glbCacheReadyTick` bump to rebuild after the
 * background fetch settled — so the magenta stayed.
 *
 * Fix locked here: with `forceGlb=1`, the figure builder DOES kick
 * `void loadGlbAthleteAsset()` itself (line 1234 of `glbAthlete.ts`)
 * via the cache-cold branch. Once the load resolves, a subsequent
 * `buildPlayerFigure` call must produce a real GLB figure (no
 * magenta) — independent of any env-var gate. The end-to-end
 * canvas wiring is asserted by `playerFigureDecisionLog.test.ts`'s
 * cold→warm swap test; this test focuses on the contract that
 * forceGlb works without the env-var gate at the figure-builder
 * level.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetGlbAthleteBoneMapAuditGuard,
  _resetGlbAthleteCache,
  _resetGlbAthleteClipCache,
  _resetLastGlbBuildFailureForTest,
  _setGlbAthleteCacheForTest,
  GLB_ATHLETE_USER_DATA_KEY,
} from './glbAthlete'
import {
  _getPlayerFigureDecisionLog,
  _resetPlayerFigureDecisionLog,
  _setForceGlbAthletePreview,
  buildPlayerFigure,
  GLB_ATHLETE_PREVIEW_PROD_ENV_KEY,
} from './imperativeScene'
import {
  assertMockCoversGlbBoneMap,
  buildMockGlbAsset,
} from './__fixtures__/mockGlbAsset'

function clearEnvFlag(): void {
  delete (process.env as Record<string, string | undefined>)[
    GLB_ATHLETE_PREVIEW_PROD_ENV_KEY
  ]
}

describe('forceGlb cold→warm contract (no env-var gate)', () => {
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

  it('forceGlb on + cache cold → magenta marker, with `glb-cache-cold` reason logged', () => {
    _setForceGlbAthletePreview(true)
    const figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    // Marker, not real GLB or procedural.
    expect(figure.name).toBe('glb-force-glb-failure-marker')
    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      pick: 'force-glb-marker',
      reason: 'glb-cache-cold',
    })
  })

  it('forceGlb on + cache warm (loader resolved in background) → real GLB, NOT marker', () => {
    _setForceGlbAthletePreview(true)
    // Simulate the canvas's loader having warmed the cache after the
    // first cold-build returned the marker. Subsequent builds (after
    // a `glbCacheReadyTick` bump in the canvas, or any scene swap)
    // must pick the real GLB.
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
    expect(figure.name).not.toBe('glb-force-glb-failure-marker')
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeDefined()
    const log = _getPlayerFigureDecisionLog()
    expect(log[0]).toEqual({ pick: 'glb', reason: 'gate-on-cache-warm' })
  })

  it('forceGlb on + env gate also on → still real GLB, no double-counting', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
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
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeDefined()
    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1) // exactly one entry
    expect(log[0]).toEqual({ pick: 'glb', reason: 'gate-on-cache-warm' })
  })

  it('forceGlb off + env gate off + cache warm → premium chain (no marker)', () => {
    // Defense-in-depth: when neither override is set, the GLB path is
    // never entered, so the cache being warm doesn't accidentally
    // promote the figure. forceGlb must remain explicit. With
    // USE_PREMIUM_ATHLETE on (current production default), the
    // premium path takes over and the reason is `premium-flag-on`.
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
    expect(figure.name).not.toBe('glb-force-glb-failure-marker')
    const userData = figure.userData as Record<string, unknown>
    expect(userData[GLB_ATHLETE_USER_DATA_KEY]).toBeUndefined()
    const log = _getPlayerFigureDecisionLog()
    // gate-off → premium fallback wins, reason confirms GLB was
    // never attempted.
    expect(log[0]?.pick).toBe('premium')
    expect(log[0]?.reason).toBe('premium-flag-on')
  })
})
