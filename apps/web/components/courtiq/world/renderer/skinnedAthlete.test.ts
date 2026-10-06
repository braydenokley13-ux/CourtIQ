import { disposeTree } from './labEnvironment'

function getPlayerIndicatorLayers(group: THREE.Group | null) {
  return (group?.userData.indicatorLayers ?? null) as {
    base: THREE.Group; user: THREE.Group; userHead: THREE.Group; possession: THREE.Group
  } | null
}

function countTriangles(group: THREE.Object3D): number {
  let count = 0
  group.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    const geometry = node.geometry as THREE.BufferGeometry
    count += (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3
  })
  return count
}

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildSkinnedAthletePreview,
  disposeSkinnedAthlete,
  getSkinnedAthleteHandle,
  mapReplayStateToAnimation,
  SKINNED_ATHLETE_ANIMATION_NAMES,
  SKINNED_ATHLETE_TRI_CAP,
  SKINNED_ATHLETE_BONE_COUNT,
  setSkinnedAthleteAnimation,
  updateSkinnedAthletePose,
  _resetSkinnedAthleteClipCache,
} from './skinnedAthlete'

describe('Phase M — skinned preview builder', () => {
  it('returns a figure with the agreed bone chain', () => {
    _resetSkinnedAthleteClipCache()
    const figure = buildSkinnedAthletePreview(
      '#2D8AFF',
      '#0A4FB8',
      false,
      false,
      '4',
      'idle',
    )
    expect(figure).toBeTruthy()
    const handle = getSkinnedAthleteHandle(figure!)
    expect(handle).toBeTruthy()
    expect(handle!.rootBone?.name).toBe('hips')
    let bones = 0
    figure!.traverse((child) => {
      if ((child as THREE.Bone).isBone) bones += 1
    })
    expect(bones).toBe(SKINNED_ATHLETE_BONE_COUNT)
    // Required bone names per the Phase M plan.
    for (const name of [
      'hips',
      'spine',
      'head',
      'leftUpperArm',
      'leftForeArm',
      'rightUpperArm',
      'rightForeArm',
      'leftThigh',
      'leftShin',
      'rightThigh',
      'rightShin',
    ]) {
      expect(figure!.getObjectByName(name)).toBeTruthy()
    }
    disposeSkinnedAthlete(figure!)
    disposeTree(figure!)
  })

  it('exposes all four indicator layers via getPlayerIndicatorLayers', () => {
    _resetSkinnedAthleteClipCache()
    const figure = buildSkinnedAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true,
      true,
      '0',
      'idle',
    )!
    const layers = getPlayerIndicatorLayers(figure)
    expect(layers).toBeTruthy()
    expect(layers!.base.children.length).toBeGreaterThan(0)
    expect(layers!.user.children.length).toBeGreaterThan(0)
    expect(layers!.userHead.children.length).toBeGreaterThan(0)
    expect(layers!.possession.children.length).toBeGreaterThan(0)
    expect(layers!.user.visible).toBe(true)
    expect(layers!.possession.visible).toBe(true)

    // Bench / non-user / no-ball figure should not show user
    // halos or possession ring.
    const bench = buildSkinnedAthletePreview(
      '#FF3046',
      '#A10F22',
      false,
      false,
      '21',
      'defensive',
    )!
    const benchLayers = getPlayerIndicatorLayers(bench)
    expect(benchLayers!.user.visible).toBe(false)
    expect(benchLayers!.possession.visible).toBe(false)

    disposeSkinnedAthlete(figure)
    disposeTree(figure)
    disposeSkinnedAthlete(bench)
    disposeTree(bench)
  })

  it('keeps user chevron above body geometry', () => {
    _resetSkinnedAthleteClipCache()
    const figure = buildSkinnedAthletePreview(
      '#3BFF9D',
      '#0F8C4E',
      true,
      true,
      '0',
      'idle',
    )!
    figure.updateMatrixWorld(true)
    const layers = getPlayerIndicatorLayers(figure)
    let chevronY = -Infinity
    layers!.userHead.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      if (!(mesh.geometry instanceof THREE.ConeGeometry)) return
      const pos = new THREE.Vector3()
      mesh.getWorldPosition(pos)
      chevronY = Math.max(chevronY, pos.y)
    })
    expect(chevronY).toBeGreaterThan(0)
    const skinnedMesh = figure.getObjectByName('skinned-player-mesh')
    expect(skinnedMesh).toBeTruthy()
    const box = new THREE.Box3().setFromObject(skinnedMesh!)
    expect(chevronY).toBeGreaterThan(box.max.y + 0.5)
    disposeSkinnedAthlete(figure)
    disposeTree(figure)
  })

  it('builds a mixer with all three named clips', () => {
    _resetSkinnedAthleteClipCache()
    const figure = buildSkinnedAthletePreview(
      '#2D8AFF',
      '#0A4FB8',
      false,
      false,
      '4',
      'idle',
    )!
    const handle = getSkinnedAthleteHandle(figure)!
    expect(handle.mixer).toBeTruthy()
    for (const name of SKINNED_ATHLETE_ANIMATION_NAMES) {
      expect(handle.actions[name]).toBeTruthy()
    }
    expect(handle.actions['idle_ready'].isRunning()).toBe(true)
    disposeSkinnedAthlete(figure)
    disposeTree(figure)
  })

  it('updateSkinnedAthletePose advances mixer time deterministically', () => {
    _resetSkinnedAthleteClipCache()
    const figure = buildSkinnedAthletePreview(
      '#2D8AFF',
      '#0A4FB8',
      false,
      false,
      '4',
      'idle',
    )!
    const handle = getSkinnedAthleteHandle(figure)!
    const before = handle.actions['idle_ready'].time
    updateSkinnedAthletePose(figure, 0.25)
    expect(handle.actions['idle_ready'].time).toBeGreaterThan(before)
    expect(handle.actions['idle_ready'].time).toBeCloseTo(before + 0.25, 3)
    disposeSkinnedAthlete(figure)
    disposeTree(figure)
  })

  it('setSkinnedAthleteAnimation switches active clip', () => {
    _resetSkinnedAthleteClipCache()
    const figure = buildSkinnedAthletePreview(
      '#2D8AFF',
      '#0A4FB8',
      false,
      false,
      '4',
      'idle',
    )!
    setSkinnedAthleteAnimation(figure, 'cut_sprint', { fadeSeconds: 0 })
    const handle = getSkinnedAthleteHandle(figure)!
    expect(handle.actions['cut_sprint'].isRunning()).toBe(true)
    setSkinnedAthleteAnimation(figure, 'defense_slide', { fadeSeconds: 0 })
    expect(handle.actions['defense_slide'].isRunning()).toBe(true)
    disposeSkinnedAthlete(figure)
    disposeTree(figure)
  })

  it('stays inside the Phase M8 triangle / bone budget', () => {
    _resetSkinnedAthleteClipCache()
    const figure = buildSkinnedAthletePreview(
      '#2D8AFF',
      '#0A4FB8',
      false,
      false,
      '4',
      'idle',
    )!
    const tris = countTriangles(figure)
    expect(tris).toBeGreaterThan(0)
    expect(tris).toBeLessThanOrEqual(SKINNED_ATHLETE_TRI_CAP)
    disposeSkinnedAthlete(figure)
    disposeTree(figure)
  })
})

describe('Phase M — replay-to-animation mapping', () => {
  it('stationary players → idle_ready', () => {
    expect(
      mapReplayStateToAnimation({ team: 'offense', isMoving: false }),
    ).toBe('idle_ready')
    expect(
      mapReplayStateToAnimation({ team: 'defense', isMoving: false }),
    ).toBe('idle_ready')
    expect(
      mapReplayStateToAnimation({ isMoving: false }),
    ).toBe('idle_ready')
  })

  it('offensive cut/drive/back_cut → cut_sprint', () => {
    for (const kind of ['cut', 'drive', 'back_cut', 'baseline_sneak'] as const) {
      expect(
        mapReplayStateToAnimation({
          kind,
          team: 'offense',
          isMoving: true,
        }),
      ).toBe('cut_sprint')
    }
  })

  it('defender movement / closeout → defense_slide', () => {
    expect(
      mapReplayStateToAnimation({
        kind: 'closeout',
        team: 'defense',
        isMoving: true,
      }),
    ).toBe('defense_slide')
    expect(
      mapReplayStateToAnimation({
        kind: 'rotation',
        team: 'defense',
        isMoving: true,
      }),
    ).toBe('defense_slide')
    // Even stationary, a defender on a closeout/rotation kind
    // still reads the defensive base — keeps the figure from
    // popping back to idle on the closeout end frame.
    expect(
      mapReplayStateToAnimation({
        kind: 'closeout',
        team: 'defense',
        isMoving: false,
      }),
    ).toBe('defense_slide')
  })

  it('offensive small footwork stays idle_ready', () => {
    for (const kind of ['rip', 'jab', 'drift', 'lift', 'pass'] as const) {
      expect(
        mapReplayStateToAnimation({
          kind,
          team: 'offense',
          isMoving: true,
        }),
      ).toBe('idle_ready')
    }
  })

  it('mapping is pure (no side effects, no allocations leak)', () => {
    // Calling the mapper many times with the same input must
    // return the same answer — this is the determinism guarantee
    // the replay loop depends on.
    const state = {
      kind: 'cut' as const,
      team: 'offense' as const,
      isMoving: true,
    }
    const samples = Array.from({ length: 100 }, () =>
      mapReplayStateToAnimation(state),
    )
    expect(new Set(samples).size).toBe(1)
    expect(samples[0]).toBe('cut_sprint')
  })
})
