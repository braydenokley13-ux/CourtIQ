/**
 * Athlete-rendering reliability pass — tests for the diagnostic-mode
 * pipeline that runs when `?forceGlb=1`, `?debugGlb=1`, or
 * `?glbDebug=1` is set on the URL.
 *
 * These cover the gaps the production magenta-proxy bug exposed:
 *
 *   1. `isGlbDebugBadgeEnabled` accepts `?debugGlb=1` (the spelling QA
 *      reaches for first because it groups with `forceGlb`) AND is
 *      auto-on when `?forceGlb=1` is present, so a tester running
 *      forceGlb always gets the diagnostic surface back too.
 *
 *   2. `isForceGlbUrlActive` returns true synchronously when the URL
 *      param is set, so the canvas's GLB asset loader can fire on
 *      mount without depending on React state.
 *
 *   3. `glbDebugLog` is silent unless the badge gate is on. No prod
 *      console pollution; full breadcrumbs for testers.
 *
 *   4. `summariseGlbAssetDetail` walks a GLTF scene and returns
 *      mesh / skinned-mesh / bone / material counts so the debug
 *      overlay surfaces them without re-traversing on every render.
 */

/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  glbDebugLog,
  isForceGlbUrlActive,
  isGlbDebugBadgeEnabled,
  summariseGlbAssetDetail,
  summarisePlayerFigureDecisions,
} from './GlbDebugBadge'

function clearWindowOverride(): void {
  if (typeof window === 'undefined') return
  delete (window as unknown as Record<string, unknown>).__COURTIQ_GLB_DEBUG__
}

function setUrl(search: string): void {
  const next = `${window.location.pathname}${search}`
  window.history.replaceState({}, '', next)
}

describe('isGlbDebugBadgeEnabled — debugGlb / forceGlb aliases', () => {
  beforeEach(() => {
    clearWindowOverride()
    setUrl('')
  })
  afterEach(() => {
    clearWindowOverride()
    setUrl('')
  })

  it('accepts `?debugGlb=1` as an alias for the historical `?glbDebug=1`', () => {
    setUrl('?debugGlb=1')
    expect(isGlbDebugBadgeEnabled()).toBe(true)
  })

  it('accepts `?forceGlb=1` so a tester running forceGlb sees diagnostics too', () => {
    setUrl('?forceGlb=1')
    expect(isGlbDebugBadgeEnabled()).toBe(true)
  })

  it('still accepts the original `?glbDebug=1`', () => {
    setUrl('?glbDebug=1')
    expect(isGlbDebugBadgeEnabled()).toBe(true)
  })

  it('rejects non-`1` values for every alias', () => {
    for (const v of ['0', 'true', 'on', 'yes', '']) {
      setUrl(`?debugGlb=${encodeURIComponent(v)}`)
      expect(isGlbDebugBadgeEnabled()).toBe(false)
      setUrl(`?forceGlb=${encodeURIComponent(v)}`)
      expect(isGlbDebugBadgeEnabled()).toBe(false)
    }
  })

  it('treats any of the three params as sufficient', () => {
    setUrl('?something=else&forceGlb=1&unrelated=ok')
    expect(isGlbDebugBadgeEnabled()).toBe(true)
    setUrl('?other=foo&debugGlb=1')
    expect(isGlbDebugBadgeEnabled()).toBe(true)
  })
})

describe('isForceGlbUrlActive', () => {
  beforeEach(() => {
    setUrl('')
  })
  afterEach(() => {
    setUrl('')
  })

  it('returns false when the param is absent', () => {
    expect(isForceGlbUrlActive()).toBe(false)
  })

  it('returns true when `?forceGlb=1` is present', () => {
    setUrl('?forceGlb=1')
    expect(isForceGlbUrlActive()).toBe(true)
  })

  it('only matches the literal `1` (the env / URL-param contract)', () => {
    for (const v of ['', '0', 'true', 'on', 'yes', ' 1 ']) {
      setUrl(`?forceGlb=${encodeURIComponent(v)}`)
      expect(isForceGlbUrlActive()).toBe(false)
    }
    setUrl('?forceGlb=1')
    expect(isForceGlbUrlActive()).toBe(true)
  })

  it('co-exists with other URL params', () => {
    setUrl('?scenario=foo&forceGlb=1&debugGlb=1')
    expect(isForceGlbUrlActive()).toBe(true)
  })
})

describe('glbDebugLog — silent unless debug gate is on', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    clearWindowOverride()
    setUrl('')
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    clearWindowOverride()
    setUrl('')
    infoSpy.mockRestore()
  })

  it('does not log when no debug param is set', () => {
    glbDebugLog('should not appear', { secret: 'data' })
    expect(infoSpy).not.toHaveBeenCalled()
  })

  it('logs with the [GLB_DEBUG] prefix when debugGlb=1 is on', () => {
    setUrl('?debugGlb=1')
    glbDebugLog('asset load resolved', { url: '/athlete/mannequin.glb' })
    expect(infoSpy).toHaveBeenCalledTimes(1)
    const [first, second] = infoSpy.mock.calls[0]
    expect(first).toBe('[GLB_DEBUG] asset load resolved')
    expect(second).toEqual({ url: '/athlete/mannequin.glb' })
  })

  it('logs with the [GLB_DEBUG] prefix when forceGlb=1 is on (auto-enabling diagnostics)', () => {
    setUrl('?forceGlb=1')
    glbDebugLog('forceGlb kicked load')
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls[0][0]).toBe('[GLB_DEBUG] forceGlb kicked load')
  })

  it('elides the second arg when none was provided', () => {
    setUrl('?glbDebug=1')
    glbDebugLog('plain message')
    // Only the first arg gets passed.
    expect(infoSpy.mock.calls[0]).toHaveLength(1)
    expect(infoSpy.mock.calls[0][0]).toBe('[GLB_DEBUG] plain message')
  })
})

describe('summariseGlbAssetDetail', () => {
  it('counts meshes, skinned meshes, bones, and materials on a synthetic scene', () => {
    const root = new THREE.Object3D()
    // 1 SkinnedMesh + 2 Bones
    const bone1 = new THREE.Bone()
    bone1.name = 'pelvis'
    const bone2 = new THREE.Bone()
    bone2.name = 'spine_02'
    bone1.add(bone2)
    const skinned = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ name: 'skin' }),
    )
    root.add(bone1)
    root.add(skinned)
    // 1 plain mesh
    const plain = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ name: 'other' }),
    )
    root.add(plain)

    const detail = summariseGlbAssetDetail(root, [
      new THREE.AnimationClip('idle', 1, []),
    ])
    expect(detail.meshCount).toBe(2) // skinned + plain (SkinnedMesh.isMesh === true)
    expect(detail.skinnedMeshCount).toBe(1)
    expect(detail.boneCount).toBe(2)
    expect(detail.materialCount).toBe(2)
    expect(detail.materialNames).toEqual(['other', 'skin'])
    expect(detail.embeddedClipNames).toEqual(['idle'])
  })

  it('handles missing animations gracefully', () => {
    const root = new THREE.Object3D()
    const detail = summariseGlbAssetDetail(root, null)
    expect(detail.meshCount).toBe(0)
    expect(detail.skinnedMeshCount).toBe(0)
    expect(detail.boneCount).toBe(0)
    expect(detail.embeddedClipNames).toEqual([])
  })

  it('deduplicates material names across multiple meshes', () => {
    const root = new THREE.Object3D()
    const sharedMat = new THREE.MeshBasicMaterial({ name: 'jersey' })
    for (let i = 0; i < 3; i += 1) {
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedMat))
    }
    const detail = summariseGlbAssetDetail(root, [])
    expect(detail.meshCount).toBe(3)
    expect(detail.materialCount).toBe(1)
    expect(detail.materialNames).toEqual(['jersey'])
  })

  it('handles arrays of materials per mesh (multi-material)', () => {
    const root = new THREE.Object3D()
    const matA = new THREE.MeshBasicMaterial({ name: 'a' })
    const matB = new THREE.MeshBasicMaterial({ name: 'b' })
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), [matA, matB]))
    const detail = summariseGlbAssetDetail(root, [])
    expect(detail.materialNames).toEqual(['a', 'b'])
  })
})

describe('summarisePlayerFigureDecisions — already covered in playerFigureDecisionLog.test.ts', () => {
  it('still folds duplicates correctly (sanity check across this file)', () => {
    expect(
      summarisePlayerFigureDecisions([
        { pick: 'glb', reason: 'gate-on-cache-warm' },
        { pick: 'glb', reason: 'gate-on-cache-warm' },
      ]),
    ).toContain('glb:gate-on-cache-warm ×2')
  })
})
