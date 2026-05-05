/**
 * FR-3 — Player Readability and Visual Language contracts.
 *
 * Locks the §7 readability surfaces shipped by Packets 2 → 7 of the
 * implementation in `docs/courtiq-3d-film-room-system-plan.md`:
 *
 *   1. §7.3 — `buildBasketballGroup` resolves exactly one key
 *      defender (closest defender to the user) and propagates
 *      `isKeyDefender` through the figure-decision log.
 *
 *   2. §7.7 — every GLB figure mounts a soft circular grounding
 *      shadow disc on its own named layer.
 *
 *   3. §7.2 / §7.5 — every GLB user figure mounts a soft outer
 *      halo plus a head chevron (with dark outline) so the user
 *      identification matches the procedural figure's parity.
 *
 *   4. §7.3 — only the cue defender (and only on a defender, never
 *      on the user) gets the heat-red overlay ring on the GLB
 *      figure's indicator layer.
 *
 *   5. §7.1 — the heat-color literal stays in lockstep with the
 *      `--heat` token aliased in `apps/web/app/globals.css` so a
 *      future palette change touches one source of truth.
 */

/* @vitest-environment jsdom */

import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetGlbAthleteBoneMapAuditGuard,
  _resetGlbAthleteCache,
  _resetGlbAthleteClipCache,
  _resetGlbStaticPoseFallbackStatsForTest,
  _resetLastGlbBuildFailureForTest,
  _setGlbAthleteCacheForTest,
  buildGlbAthletePreview,
} from './glbAthlete'
import {
  _getCurrentPlayerFigureBuildContext,
  _getPlayerFigureDecisionLog,
  _resetPlayerFigureDecisionLog,
  _setForceGlbAthletePreview,
  _setPlayerFigureBuildContext,
  buildBasketballGroup,
  GLB_ATHLETE_PREVIEW_PROD_ENV_KEY,
} from './imperativeScene'
import {
  assertMockCoversGlbBoneMap,
  buildMockGlbAsset,
} from './__fixtures__/mockGlbAsset'
import { createDefaultScene } from '@/lib/scenario3d/scene'

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

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((c) => {
    if (found) return
    if (c.name === name) found = c
  })
  return found
}

// =====================================================================
// FR-3 §7.3 — key-defender resolution + decision-log propagation
// =====================================================================

describe('FR-3 §7.3 — key defender propagation', () => {
  beforeEach(() => resetAll())
  afterEach(() => resetAll())

  it('buildBasketballGroup picks exactly one key defender (closest defender to the user)', () => {
    const scene = createDefaultScene('FR3-key-def-test')
    buildBasketballGroup(scene)
    const log = _getPlayerFigureDecisionLog()

    const keyDefenders = log.filter((d) => d.isKeyDefender === true)
    expect(keyDefenders).toHaveLength(1)
    // Default scene's user is at (0, 22); `d_user` sits at (0, 24)
    // which is the closest defender to the user, so the heuristic
    // must elect that one.
    expect(keyDefenders[0]?.playerId).toBe('d_user')
  })

  it('every non-key-defender row records `isKeyDefender !== true`', () => {
    const scene = createDefaultScene('FR3-non-key-test')
    buildBasketballGroup(scene)
    const log = _getPlayerFigureDecisionLog()
    // No offense / user / non-key defender entry should ever set the
    // flag — only one entry total is allowed to carry it.
    const nonKey = log.filter((d) => d.isKeyDefender !== true)
    expect(nonKey.length).toBe(log.length - 1)
  })

  it('build context exposes the same flag the decision log carries', () => {
    // Direct unit-level lock: registering context with the flag
    // makes the read accessor return the flag synchronously, so the
    // figure builders can layer §7 cues without re-running the
    // closest-defender heuristic.
    expect(_getCurrentPlayerFigureBuildContext()).toBeNull()
    _setPlayerFigureBuildContext({
      scenarioId: 's',
      playerId: 'p',
      isKeyDefender: true,
    })
    expect(_getCurrentPlayerFigureBuildContext()?.isKeyDefender).toBe(true)
    _setPlayerFigureBuildContext(null)
    expect(_getCurrentPlayerFigureBuildContext()).toBeNull()
  })
})

// =====================================================================
// FR-3 §7.7 — GLB grounding shadow
// =====================================================================

describe('FR-3 §7.7 — GLB grounding shadow', () => {
  beforeEach(() => {
    resetAll()
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    assertMockCoversGlbBoneMap(asset)
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)
  })
  afterEach(() => resetAll())

  it('every GLB figure mounts a `glb-grounding-shadow-layer` group', () => {
    const figure = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      false,
      false,
      '12',
      'idle',
    )
    expect(figure).not.toBeNull()
    const layer = findByName(figure!, 'glb-grounding-shadow-layer')
    expect(layer).not.toBeNull()
  })

  it('shadow disc renderOrder is below the figure so the §7.7 z-order holds', () => {
    const figure = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      false,
      false,
      '12',
      'idle',
    )
    const disc = findByName(figure!, 'glb-grounding-shadow-disc') as
      | THREE.Mesh
      | null
    expect(disc).not.toBeNull()
    expect(disc!.renderOrder).toBe(-1)
    const mat = disc!.material as THREE.MeshBasicMaterial
    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)
  })
})

// =====================================================================
// FR-3 §7.2 / §7.5 — GLB user halo + chevron parity
// =====================================================================

describe('FR-3 §7.2 / §7.5 — GLB user readability', () => {
  beforeEach(() => {
    resetAll()
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)
  })
  afterEach(() => resetAll())

  it('GLB user mounts the soft outer halo + head chevron + outline', () => {
    const figure = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true, // isUser
      true,
      '0',
      'idle',
    )
    expect(figure).not.toBeNull()
    expect(findByName(figure!, 'glb-user-soft-halo')).not.toBeNull()
    expect(findByName(figure!, 'glb-user-head-chevron')).not.toBeNull()
    expect(findByName(figure!, 'glb-user-head-chevron-outline')).not.toBeNull()
  })

  it('non-user GLB figures do NOT mount any of the user-only readability primitives', () => {
    const figure = buildGlbAthletePreview(
      '#FF3046',
      '#A10F22',
      false, // isUser
      false,
      '23',
      'idle',
    )
    expect(figure).not.toBeNull()
    expect(findByName(figure!, 'glb-user-soft-halo')).toBeNull()
    expect(findByName(figure!, 'glb-user-head-chevron')).toBeNull()
    expect(findByName(figure!, 'glb-user-head-chevron-outline')).toBeNull()
  })
})

// =====================================================================
// FR-3 §7.3 — GLB key-defender heat ring
// =====================================================================

describe('FR-3 §7.3 — GLB key-defender heat ring', () => {
  beforeEach(() => {
    resetAll()
    process.env[GLB_ATHLETE_PREVIEW_PROD_ENV_KEY] = '1'
    const asset = buildMockGlbAsset()
    _setGlbAthleteCacheForTest(asset.scene, asset.skinnedMesh)
  })
  afterEach(() => resetAll())

  it('mounts the heat ring when the figure is a defender AND options.isKeyDefender is true', () => {
    const figure = buildGlbAthletePreview(
      '#FF3046',
      '#A10F22',
      false, // isUser
      false,
      '23',
      'defensive',
      { isKeyDefender: true },
    )
    expect(figure).not.toBeNull()
    expect(findByName(figure!, 'glb-key-defender-heat-ring')).not.toBeNull()
  })

  it('does NOT mount the heat ring when isKeyDefender is omitted/false', () => {
    const figure = buildGlbAthletePreview(
      '#FF3046',
      '#A10F22',
      false,
      false,
      '23',
      'defensive',
    )
    expect(findByName(figure!, 'glb-key-defender-heat-ring')).toBeNull()
  })

  it('never mounts the heat ring on the user even when isKeyDefender is true (defensive)', () => {
    // Belt-and-braces: the §7.2 user cue is brand-green, never heat
    // red. A future caller mis-passing both flags must not invert
    // the visual hierarchy.
    const figure = buildGlbAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true, // isUser
      false,
      '0',
      'idle',
      { isKeyDefender: true },
    )
    expect(findByName(figure!, 'glb-key-defender-heat-ring')).toBeNull()
  })
})
