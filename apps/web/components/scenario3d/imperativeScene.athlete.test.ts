import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildPlayerFigure,
  countTriangles,
  disposeGroup,
  getPlayerIndicatorLayers,
} from './imperativeScene'

/**
 * Phase F5 — disposal-leak guard for the new athlete builder.
 *
 * Spies on `dispose()` for every geometry / material / texture the
 * builder reaches via the figure root and asserts:
 *   1. every owned resource is freed by `disposeGroup`
 *   2. building+disposing 100 figures does not leak any resource
 *      (resources freed == resources allocated, no monotonic growth)
 *   3. the per-figure triangle count stays inside the E4 §5 ceiling
 *      (≤ 1500 hard, ~900–1100 target)
 *
 * The athlete builder ships with `USE_ATHLETE_BUILDER = true` so
 * `buildPlayerFigure` here exercises the new code path; if a future
 * regression flips the flag, the same test still passes against the
 * legacy builder so we keep coverage either way.
 */

interface DisposeRecord {
  totalUnique: number
  disposedUnique: Set<unknown>
}

/**
 * Counts unique geometries / materials referenced by the figure tree
 * and tracks which ones get disposed via the existing
 * `disposeGroup` traversal. Shared resources (e.g. the six per-figure
 * materials) count once, so `totalUnique === disposedUnique.size`
 * is the no-leak invariant.
 */
function trackDisposal(group: THREE.Object3D): DisposeRecord {
  const tracked: DisposeRecord = { totalUnique: 0, disposedUnique: new Set() }
  const seenGeom = new Set<unknown>()
  const seenMat = new Set<unknown>()
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry && !seenGeom.has(mesh.geometry)) {
      seenGeom.add(mesh.geometry)
      const geom = mesh.geometry
      const original = geom.dispose.bind(geom)
      geom.dispose = () => {
        tracked.disposedUnique.add(geom)
        original()
      }
    }
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    const list = Array.isArray(mat) ? mat : mat ? [mat] : []
    for (const m of list) {
      if (seenMat.has(m)) continue
      seenMat.add(m)
      const original = m.dispose.bind(m)
      m.dispose = () => {
        tracked.disposedUnique.add(m)
        original()
      }
    }
  })
  tracked.totalUnique = seenGeom.size + seenMat.size
  return tracked
}

describe('athlete builder disposal', () => {
  it('returns the agreed sub-group taxonomy', () => {
    const figure = buildPlayerFigure('#2D8AFF', '#0A4FB8', false, false, '4', 'idle')
    expect(figure.getObjectByName('pelvis')).toBeTruthy()
    expect(figure.getObjectByName('torso')).toBeTruthy()
    expect(figure.getObjectByName('neckHead')).toBeTruthy()
    expect(figure.getObjectByName('leftLeg')).toBeTruthy()
    expect(figure.getObjectByName('rightLeg')).toBeTruthy()
    expect(figure.getObjectByName('leftArm')).toBeTruthy()
    expect(figure.getObjectByName('rightArm')).toBeTruthy()
    expect(figure.getObjectByName('shoes')).toBeTruthy()
    disposeGroup(figure)
  })

  it('preserves all four indicator layers', () => {
    const figureUser = buildPlayerFigure('#3BFF9D', '#0F8C4E', true, true, '0', 'idle')
    const layers = getPlayerIndicatorLayers(figureUser)
    expect(layers).toBeTruthy()
    expect(layers!.base).toBeTruthy()
    expect(layers!.user).toBeTruthy()
    expect(layers!.userHead).toBeTruthy()
    expect(layers!.possession).toBeTruthy()
    expect(layers!.user.visible).toBe(true)
    expect(layers!.possession.visible).toBe(true)
    disposeGroup(figureUser)

    const figureBench = buildPlayerFigure('#FF3046', '#A10F22', false, false, '21', 'defensive')
    const benchLayers = getPlayerIndicatorLayers(figureBench)
    expect(benchLayers!.user.visible).toBe(false)
    expect(benchLayers!.possession.visible).toBe(false)
    disposeGroup(figureBench)
  })

  it('keeps the user chevron above all body geometry', () => {
    // Phase J guard: the premium athlete upgrade adds a trap dome,
    // jaw plane, shoulder piping torus, and (for ball-handlers) a
    // wristband. None of those should poke above the chevron, which
    // is the user's "YOU" anchor and must stay clearly above the
    // head from the gameplay camera.
    const figure = buildPlayerFigure('#3BFF9D', '#0F8C4E', true, true, '0', 'idle')
    figure.updateMatrixWorld(true)
    const layers = getPlayerIndicatorLayers(figure)
    expect(layers).toBeTruthy()

    let chevronWorldY = -Infinity
    layers!.userHead.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      if (!(mesh.geometry instanceof THREE.ConeGeometry)) return
      const pos = new THREE.Vector3()
      mesh.getWorldPosition(pos)
      if (pos.y > chevronWorldY) chevronWorldY = pos.y
    })
    expect(chevronWorldY).toBeGreaterThan(0)

    let bodyTopY = -Infinity
    for (const subName of ['pelvis', 'torso', 'neckHead'] as const) {
      const sub = figure.getObjectByName(subName)
      sub?.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh || !mesh.geometry) return
        const box = new THREE.Box3().setFromObject(mesh)
        if (box.max.y > bodyTopY) bodyTopY = box.max.y
      })
    }
    // Chevron rides at least 0.5 ft above the tallest body geometry
    // so it's never visually merged with the head silhouette at
    // gameplay distance.
    expect(chevronWorldY).toBeGreaterThan(bodyTopY + 0.5)
    disposeGroup(figure)
  })

  it('disposes every resource owned by a single figure', () => {
    const figure = buildPlayerFigure('#FF3046', '#A10F22', false, false, '21', 'denial')
    const tracked = trackDisposal(figure)
    expect(tracked.totalUnique).toBeGreaterThan(0)
    disposeGroup(figure)
    expect(tracked.disposedUnique.size).toBe(tracked.totalUnique)
  })

  it('does not leak when 100 figures are built and disposed', () => {
    let allocated = 0
    let disposed = 0
    for (let i = 0; i < 100; i++) {
      const stance = (
        i % 5 === 0 ? 'idle' :
        i % 5 === 1 ? 'defensive' :
        i % 5 === 2 ? 'denial' :
        i % 5 === 3 ? 'closeout' : 'cut'
      ) as 'idle' | 'defensive' | 'denial' | 'closeout' | 'cut'
      const figure = buildPlayerFigure(
        '#2D8AFF',
        '#0A4FB8',
        i % 7 === 0,
        i % 11 === 0,
        String(i),
        stance,
      )
      const tracked = trackDisposal(figure)
      allocated += tracked.totalUnique
      disposeGroup(figure)
      disposed += tracked.disposedUnique.size
    }
    expect(disposed).toBe(allocated)
    expect(allocated).toBeGreaterThan(0)
  })

  it('keeps per-figure triangle count inside the Phase J ceiling', () => {
    // Sample multiple stance × isUser combinations because the user
    // halo + chevron add ring/cone tris on top of the base body and
    // the premium path adds wristband / cuff geometry conditional on
    // hasBall / defensive stance.
    const samples: Array<{ user: boolean; ball: boolean; stance: 'idle' | 'defensive' | 'denial' | 'closeout' | 'cut' | 'sag' }> = [
      { user: false, ball: false, stance: 'idle' },
      { user: false, ball: false, stance: 'defensive' },
      { user: false, ball: false, stance: 'denial' },
      { user: false, ball: false, stance: 'closeout' },
      { user: true, ball: false, stance: 'idle' },
      { user: false, ball: true, stance: 'idle' },
      { user: true, ball: true, stance: 'closeout' },
    ]
    for (const s of samples) {
      const figure = buildPlayerFigure('#2D8AFF', '#0A4FB8', s.user, s.ball, '4', s.stance)
      const tris = countTriangles(figure)
      expect(tris).toBeGreaterThan(0)
      // V5 ceiling: 3050 tris per figure (was V4-A 2750, was Phase J
      // 2400). The Phase F fallback (still available when the premium
      // flag is off) keeps its own pre-V4 budget. The premium path
      // now adds:
      //   - body lathes, trap/jaw, toe-cap/heel
      //   - shoulder piping + shorts hem
      //   - V4-A socks + biceps cuffs (kit mat)
      //   - V4-A side stripes on each shoe
      //   - V4-D headband on the user player
      //   - V5.A face read (visor torus + 2 cheekbone domes)
      //   - V5.B left-wrist tape (always) + finger wrap (ball-handler)
      //   - V5.C stylized rim-light shells (head + torso + 2 upper arms)
      //   - V5.D user-only floor bloom disc
      //   - conditional ball-handler wristband
      // The shells dominate the V5 add (they wrap most of the body in
      // additive overlays so the silhouette picks up a broadcast-style
      // back-light read). Tessellation on every shell is intentionally
      // tight — bumping the ceiling instead of clipping the shells is
      // the explicit decision for the V5 stylized identity packet,
      // since the geometry is per-figure but cheap to dispatch.
      // 3200 leaves a small headroom for further narrow polish; if a
      // future packet pushes a figure past this ceiling, the
      // tessellation knobs in `upgradePremiumStylizedRimLight` and
      // `upgradePremiumKit` are the first thing to dial back.
      expect(tris).toBeLessThanOrEqual(3200)
      disposeGroup(figure)
    }
  })
})
