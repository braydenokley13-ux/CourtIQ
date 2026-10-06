import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { frameAt, simulate } from '@courtiq/basketball/simulation'
import { analyze } from '@courtiq/basketball/analytics'
import { findTeachingMoment } from '@courtiq/basketball/explore'
import { DirectorCamera } from './camera'

const config = createDefaultConfig(), result = simulate(config)
const moment = findTeachingMoment(result, analyze(result))!

/** Mirror of WorldRuntime's safe-area wiring. */
function rig(W: number, H: number, inset: { left?: number; right?: number; top?: number; bottom?: number }) {
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.08, 120)
  const l = inset.left ?? 0, r = inset.right ?? 0, tp = inset.top ?? 0, b = inset.bottom ?? 0
  camera.setViewOffset(W, H, (r - l) / 2, (b - tp) / 2, W, H); camera.updateProjectionMatrix()
  const director = new DirectorCamera(camera)
  director.safe = { x0: -1 + 2 * l / W, x1: 1 - 2 * r / W, y0: -1 + 2 * b / H, y1: 1 - 2 * tp / H }
  director.fitAspect = Math.max(0.5, W - l - r) / Math.max(1, H - tp - b)
  return { camera, director, safe: director.safe }
}
const settle = (d: DirectorCamera, mode: Parameters<DirectorCamera['step']>[0], frame: ReturnType<typeof frameAt>, focus: string[], pov?: string) => { for (let i = 0; i < 3; i++) d.step(mode, frame, focus as never, pov as never, 1, true) }
function box(camera: THREE.PerspectiveCamera, pts: THREE.Vector3[]) {
  camera.updateMatrixWorld()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) { const v = p.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y) }
  return { x0, x1, y0, y1 }
}

describe('director composition keeps the play inside the UI safe area and large', () => {
  const frame = frameAt(result, moment.t)
  for (const [W, H, inset] of [[1440, 900, { right: 430, left: 0, top: 150, bottom: 80 }], [1280, 720, { right: 430, left: 0, top: 150, bottom: 80 }], [1440, 900, {}]] as const) {
    it(`${W}x${H} ${JSON.stringify(inset)}`, () => {
      const { camera, director, safe } = rig(W, H, inset)
      settle(director, 'director', frame, moment.involved)
      const bodies = moment.involved.flatMap(id => { const p = frame.players.find(q => q.id === id)!; return [new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, 2.05, p.z)] })
      const b = box(camera, bodies)
      const eps = 0.01
      expect(b.x0).toBeGreaterThanOrEqual(safe.x0 - eps); expect(b.x1).toBeLessThanOrEqual(safe.x1 + eps)
      expect(b.y0).toBeGreaterThanOrEqual(safe.y0 - eps); expect(b.y1).toBeLessThanOrEqual(safe.y1 + eps)
      // The play dominates: bodies span most of the safe width or height.
      const fill = Math.max((b.x1 - b.x0) / (safe.x1 - safe.x0), (b.y1 - b.y0) / (safe.y1 - safe.y0))
      expect(fill).toBeGreaterThan(0.7)
      // A single player is a hero, not a speck: head-to-feet at least ~13% of the safe height.
      const p0 = frame.players.find(q => q.id === moment.involved[0])!
      const one = box(camera, [new THREE.Vector3(p0.x, 0, p0.z), new THREE.Vector3(p0.x, 1.95, p0.z)])
      expect((one.y1 - one.y0) / (safe.y1 - safe.y0)).toBeGreaterThan(0.13)
      // eslint-disable-next-line no-console
      console.log(`${W}x${H}`, 'fill', fill.toFixed(2), 'hero', ((one.y1 - one.y0) / (safe.y1 - safe.y0)).toFixed(2), 'fov', camera.fov, 'dist', director.eye.distanceTo(director.target).toFixed(1))
    })
  }
  it('default (no focus) frames the ball and nearby bodies, not the whole gym', () => {
    const { camera, director, safe } = rig(1440, 900, { right: 190, top: 150, bottom: 80 })
    settle(director, 'director', frame, [])
    const ball = box(camera, [new THREE.Vector3(frame.ball.x, frame.ball.y, frame.ball.z)])
    expect(ball.x0).toBeGreaterThan(safe.x0); expect(ball.x1).toBeLessThan(safe.x1)
    expect(director.eye.distanceTo(director.target)).toBeLessThan(18)
  })
  it('overhead respects the safe area and sees every player', () => {
    const { camera, director, safe } = rig(1440, 900, { right: 430, top: 150, bottom: 80 })
    settle(director, 'overhead', frame, [])
    const b = box(camera, frame.players.map(p => new THREE.Vector3(p.x, 0, p.z)))
    expect(b.x0).toBeGreaterThanOrEqual(safe.x0 - 0.02); expect(b.x1).toBeLessThanOrEqual(safe.x1 + 0.02)
    expect(b.y0).toBeGreaterThanOrEqual(safe.y0 - 0.02); expect(b.y1).toBeLessThanOrEqual(safe.y1 + 0.02)
  })
  it('baseline eye sits beside the stanchion, not behind it', () => {
    const { director } = rig(1440, 900, {})
    settle(director, 'baseline', frame, moment.involved)
    expect(Math.abs(director.eye.x)).toBeGreaterThan(1.5)
    expect(director.eye.y).toBeGreaterThan(1.8)
  })
  it("defender's eyes: head height, wide fov, looks at his assignments", () => {
    const { camera, director } = rig(1440, 900, {})
    settle(director, 'player', frame, [], 'D3')
    expect(director.eye.y).toBeGreaterThan(1.6); expect(director.eye.y).toBeLessThan(1.9)
    expect(camera.fov).toBeGreaterThan(60)
  })
  it('behind-the-defense search camera stays inside the gym and keeps the nearest bodies in view', () => {
    const { camera, director, safe } = rig(1440, 900, { top: 120, bottom: 80 })
    director.rig = { azimuth: Math.PI + 0.6, elevation: 0.3, fov: 38, minDistance: 7 }
    const b = frame.ball
    const focus = [...frame.players].sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z)).slice(0, 7).map(p => p.id)
    settle(director, 'director', frame, focus)
    expect(director.eye.z).toBeGreaterThanOrEqual(-3.35)
    const bb = box(camera, focus.map(id => { const p = frame.players.find(q => q.id === id)!; return new THREE.Vector3(p.x, 1, p.z) }))
    expect(bb.x0).toBeGreaterThan(safe.x0 - 0.05); expect(bb.x1).toBeLessThan(safe.x1 + 0.05)
  })
  it("defender's eyes keep his top assignment in view", () => {
    const { camera, director } = rig(1440, 900, {})
    settle(director, 'player', frame, [], 'D3')
    camera.updateMatrixWorld()
    const jobs = frame.responsibilities.filter(r => r.defenderId === 'D3').sort((a, b) => b.priority - a.priority)
    const top = frame.players.find(p => p.id === jobs[0].offensivePlayerId)!
    const v = new THREE.Vector3(top.x, 1.2, top.z).project(camera)
    expect(Math.abs(v.x)).toBeLessThan(0.95); expect(v.z).toBeLessThan(1)
  })
})
