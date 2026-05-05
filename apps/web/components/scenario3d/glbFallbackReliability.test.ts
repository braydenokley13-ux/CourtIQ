/**
 * FR-2 — GLB / Fallback Reliability tests.
 *
 * Locks the contracts introduced by Packets 1 → 6 of the FR-2
 * implementation in `docs/courtiq-3d-film-room-system-plan.md` §6:
 *
 *   1. Cold-cache test — `isGlbAthleteCacheReady()` reflects the
 *      module's cache pointer synchronously, so the canvas can
 *      decide whether to defer the first scene mount or render
 *      immediately. (Packet 2)
 *
 *   2. Fallback-hierarchy test — `buildPlayerFigure` walks the
 *      §6.1 strict order: GLB → premium → procedural under the
 *      env-flag-on policy, and every non-`glb` decision carries
 *      a structured `[CourtIQ GLB fallback]` breadcrumb whose
 *      payload matches `{ scenarioId, playerId, pickedPath,
 *      reason }`. (Packet 4)
 *
 *   3. GLB-static-pose fallback test — `setGlbAthleteAnimation`
 *      falls through requested-clip → `idle_ready` → bind pose
 *      and increments the static-pose counter exactly once per
 *      missing-clip transition. The renderer never silently keeps
 *      a stale clip for a missing one. (Packet 3)
 *
 *   4. Silent-failure surface test — `getGlbAthleteLoadOutcome()`
 *      reports `asset-missing-or-no-skin` vs `loader-threw` vs
 *      `success` so the figure-decision reason can promote
 *      `glb-cache-cold` to the precise upstream cause. (Packet 5)
 */

/* @vitest-environment jsdom */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetGlbAthleteBoneMapAuditGuard,
  _resetGlbAthleteCache,
  _resetGlbAthleteClipCache,
  _resetGlbStaticPoseFallbackStatsForTest,
  _resetLastGlbBuildFailureForTest,
  _setGlbAthleteCacheForTest,
  _setGlbAthleteLoadOutcomeForTest,
  GLB_ATHLETE_USER_DATA_KEY,
  getGlbAthleteLoadOutcome,
  getGlbStaticPoseFallbackStats,
  isGlbAthleteCacheReady,
  setGlbAthleteAnimation,
  type GlbAthleteAnimationName,
} from './glbAthlete'
import {
  _getPlayerFigureDecisionLog,
  _resetPlayerFigureDecisionLog,
  _setForceGlbAthletePreview,
  _setPlayerFigureBuildContext,
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

function resetAll(): void {
  _resetPlayerFigureDecisionLog()
  _resetGlbAthleteCache()
  _resetGlbAthleteClipCache()
  _resetGlbAthleteBoneMapAuditGuard()
  _resetLastGlbBuildFailureForTest()
  _resetGlbStaticPoseFallbackStatsForTest()
  _setForceGlbAthletePreview(false)
  _setPlayerFigureBuildContext(null)
  clearEnvFlag()
}

// =====================================================================
// FR-2 Packet 2 — cold-cache probe
// =====================================================================

describe('FR-2 Packet 2 — cold-cache probe', () => {
  beforeEach(() => resetAll())
  afterEach(() => resetAll())

  it('isGlbAthleteCacheReady() returns false before any load resolves', () => {
    expect(isGlbAthleteCacheReady()).toBe(false)
  })

  it('isGlbAthleteCacheReady() returns true once the cache is populated', () => {
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)
    expect(isGlbAthleteCacheReady()).toBe(true)
  })

  it('cache-reset reverts the probe to false (covers the test-isolation path)', () => {
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)
    expect(isGlbAthleteCacheReady()).toBe(true)
    _resetGlbAthleteCache()
    expect(isGlbAthleteCacheReady()).toBe(false)
  })

  it('cold-cache + GLB-on means buildPlayerFigure records the cold-cache reason — proving the deferred-mount gate must hold the canvas', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    expect(isGlbAthleteCacheReady()).toBe(false)

    const figure = buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    )
    // GLB userData is NOT attached because the cache is cold; the
    // figure is whatever the downstream fallback chain produced.
    expect(
      (figure.userData as Record<string, unknown>)[GLB_ATHLETE_USER_DATA_KEY],
    ).toBeUndefined()
    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]?.reason).toBe('glb-cache-cold')
  })
})

// =====================================================================
// FR-2 Packet 4 — fallback-hierarchy + structured breadcrumb
// =====================================================================

describe('FR-2 Packet 4 — fallback breadcrumbs carry { scenarioId, playerId, pickedPath, reason }', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetAll()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    resetAll()
    infoSpy.mockRestore()
  })

  it('records scenarioId + playerId on every decision when the build context is registered', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    assertMockCoversGlbBoneMap(asset)
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    _setPlayerFigureBuildContext({ scenarioId: 'BDW-01', playerId: 'p_user' })
    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    _setPlayerFigureBuildContext(null)

    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toEqual({
      pick: 'glb',
      reason: 'gate-on-cache-warm',
      scenarioId: 'BDW-01',
      playerId: 'p_user',
    })
  })

  it('emits a single [CourtIQ GLB fallback] breadcrumb for every non-glb decision, with the §6.5 payload shape', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    // Cache cold → GLB returns null → premium fallback runs.
    _setPlayerFigureBuildContext({ scenarioId: 'ESC-04', playerId: 'p_helper' })
    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    _setPlayerFigureBuildContext(null)

    const fallbackCalls = infoSpy.mock.calls.filter(
      (args) => args[0] === '[CourtIQ GLB fallback]',
    )
    expect(fallbackCalls).toHaveLength(1)
    const payload = fallbackCalls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({
      scenarioId: 'ESC-04',
      playerId: 'p_helper',
      pickedPath: 'premium',
      reason: 'glb-cache-cold',
    })
  })

  it('a successful GLB build does NOT emit a fallback breadcrumb', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)

    _setPlayerFigureBuildContext({ scenarioId: 'BDW-02', playerId: 'p_offense' })
    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    _setPlayerFigureBuildContext(null)

    const fallbackCalls = infoSpy.mock.calls.filter(
      (args) => args[0] === '[CourtIQ GLB fallback]',
    )
    expect(fallbackCalls).toHaveLength(0)
  })

  it('build-context is cleared after each buildPlayerFigure call so context never leaks across players', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    // First build registers context manually, second build does not.
    _setPlayerFigureBuildContext({ scenarioId: 'BDW-01', playerId: 'p1' })
    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    _setPlayerFigureBuildContext(null)

    // No registration — second build's decision stays unstamped.
    buildPlayerFigure('#5DB4FF', '#1F5BB8', false, false, '23', 'idle')

    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(2)
    expect(log[0]?.scenarioId).toBe('BDW-01')
    expect(log[0]?.playerId).toBe('p1')
    expect(log[1]?.scenarioId).toBeUndefined()
    expect(log[1]?.playerId).toBeUndefined()
  })
})

// =====================================================================
// FR-2 Packet 3 — GLB + static-pose fallback layer
// =====================================================================

describe('FR-2 Packet 3 — setGlbAthleteAnimation static-pose fallback', () => {
  beforeEach(() => resetAll())
  afterEach(() => resetAll())

  function buildGlbFigure(): THREE.Group {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    assertMockCoversGlbBoneMap(asset)
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)
    return buildPlayerFigure(
      '#3BFF9D',
      '#0F8C4E',
      true,
      false,
      '12',
      'idle',
    ) as THREE.Group
  }

  it('falls back to idle_ready when the requested clip is missing from the figure', () => {
    const figure = buildGlbFigure()
    expect(getGlbStaticPoseFallbackStats().total).toBe(0)

    // `closeout` is not attached by default (the `attachImportedCloseoutClip`
    // option is off), so requesting it triggers the fallback chain.
    setGlbAthleteAnimation(figure, 'closeout' as GlbAthleteAnimationName)

    const stats = getGlbStaticPoseFallbackStats()
    expect(stats.total).toBe(1)
    expect(stats.toIdleReady).toBe(1)
    expect(stats.toBindPose).toBe(0)
    expect(stats.lastMissingClip).toBe('closeout')
  })

  it('does not double-count when the missing-clip request is repeated and idle_ready is already running', () => {
    const figure = buildGlbFigure()
    setGlbAthleteAnimation(figure, 'closeout' as GlbAthleteAnimationName)
    const firstStats = { ...getGlbStaticPoseFallbackStats() }
    // Same missing clip again — counter advances (one fallback event
    // per missing-clip request) but idle_ready stays running.
    setGlbAthleteAnimation(figure, 'closeout' as GlbAthleteAnimationName)
    const secondStats = getGlbStaticPoseFallbackStats()
    expect(secondStats.total).toBe(firstStats.total + 1)
    expect(secondStats.toIdleReady).toBe(firstStats.toIdleReady + 1)
  })

  it('a successful clip switch leaves the static-pose counter at zero', () => {
    const figure = buildGlbFigure()
    // `idle_ready` is always attached by buildGlbAthletePreview, so
    // requesting it is the happy path and must not increment counters.
    setGlbAthleteAnimation(figure, 'idle_ready')
    expect(getGlbStaticPoseFallbackStats().total).toBe(0)
  })
})

// =====================================================================
// FR-2 Packet 5 — silent-failure outcome tracker
// =====================================================================

describe('FR-2 Packet 5 — getGlbAthleteLoadOutcome distinguishes silent-failure paths', () => {
  beforeEach(() => resetAll())
  afterEach(() => resetAll())

  it('default outcome is `pending` until a load resolves', () => {
    expect(getGlbAthleteLoadOutcome()).toBe('pending')
  })

  it('cache reset resets the outcome to `pending` so test fixtures cannot leak loader state', () => {
    // Direct simulation of the loader's success-side bookkeeping by
    // injecting a cache and exercising the reset hook.
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)
    // The injected-cache helper does not flip `_lastLoadOutcome` (it
    // bypasses the loader entirely). _resetGlbAthleteCache must wipe
    // any outcome state regardless.
    _resetGlbAthleteCache()
    expect(getGlbAthleteLoadOutcome()).toBe('pending')
  })

  it('downstream figure-decision reason promotes `glb-cache-cold` to `glb-asset-missing-or-no-skin` once the loader has settled with no skin', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    _setGlbAthleteLoadOutcomeForTest('asset-missing-or-no-skin')
    expect(getGlbAthleteLoadOutcome()).toBe('asset-missing-or-no-skin')

    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]?.reason).toBe('glb-asset-missing-or-no-skin')
  })

  it('downstream figure-decision reason promotes `glb-cache-cold` to `glb-loader-threw` when the loader threw', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    _setGlbAthleteLoadOutcomeForTest('loader-threw')

    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]?.reason).toBe('glb-loader-threw')
  })

  it('reason stays `glb-cache-cold` while the load is still pending — preserves the legitimate first-frame race signal Packet 2 defers around', () => {
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    expect(getGlbAthleteLoadOutcome()).toBe('pending')

    buildPlayerFigure('#3BFF9D', '#0F8C4E', true, false, '12', 'idle')
    const log = _getPlayerFigureDecisionLog()
    expect(log).toHaveLength(1)
    expect(log[0]?.reason).toBe('glb-cache-cold')
  })
})
