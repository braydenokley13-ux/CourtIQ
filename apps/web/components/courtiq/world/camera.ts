import * as THREE from 'three'
import type { PlayerId, WorldFrame } from '@/lib/defense-lab/types'
import type { CameraMode, WorldScene } from './types'

const RIM = new THREE.Vector3(0, 3.05, 1.575)
const ROOM_MIN_Z = -3.3
const FOV = { director: 30, overhead: 34, baseline: 48, player: 70 } as const

/** Director camera: frames the basketball problem (focus bodies + ball), not the
 * gym. Critically damped so playback never chases actors jerkily. Every framed
 * mode fits real samples (feet, heads, label headroom) inside the UI safe area by
 * projection, so the play dominates the visible region whatever panels are open. */
export class DirectorCamera {
  readonly eye = new THREE.Vector3(9, 7, 15)
  readonly target = new THREE.Vector3(0, 0.9, 5)
  private goalEye = new THREE.Vector3()
  private goalTarget = new THREE.Vector3()
  private goalFov: number = FOV.director
  private fov: number = FOV.director
  private settled = false
  private punch = 0
  /** Aspect of the visible safe region (defaults to the camera aspect). */
  fitAspect: number | null = null
  /** Broadcast heading: low-high angle from the scorer's-table side, telephoto. */
  azimuth = 0.42
  elevation = 0.36
  /** Optional per-scene override (Break staging etc.). */
  rig: WorldScene['rig'] = null

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** A beat of hit-stop: the camera pushes in and settles (decays ~250 ms). */
  kick(amount = 1) { this.punch = Math.max(this.punch, amount) }

  /** Returns true while still moving. */
  step(mode: CameraMode, frame: WorldFrame, focus: PlayerId[], pov: PlayerId | null | undefined, dt: number, snap: boolean): boolean {
    if (mode === 'free') return false
    this.computeGoal(mode, frame, focus, pov)
    const k = snap ? 1 : 1 - Math.exp(-dt * (mode === 'player' ? 9 : 2.6))
    this.eye.lerp(this.goalEye, k); this.target.lerp(this.goalTarget, k)
    this.fov += (this.goalFov - this.fov) * (snap ? 1 : 1 - Math.exp(-dt * 3.5))
    this.punch *= Math.exp(-dt * 8); if (this.punch < 0.01) this.punch = 0
    const fov = this.fov - this.punch * 3.2
    if (Math.abs(this.camera.fov - fov) > 0.005) { this.camera.fov = fov; this.camera.updateProjectionMatrix() }
    this.camera.position.copy(this.eye); this.camera.lookAt(this.target)
    const moving = this.eye.distanceToSquared(this.goalEye) > 1e-5 || this.target.distanceToSquared(this.goalTarget) > 1e-5 || Math.abs(this.fov - this.goalFov) > 0.02 || this.punch > 0
    this.settled = !moving
    return moving
  }

  get isSettled() { return this.settled }

  /** Adopt the camera's current pose (after free orbit) so director transitions start there. */
  adopt(target: THREE.Vector3) { this.eye.copy(this.camera.position); this.target.copy(target); this.fov = this.camera.fov }

  private computeGoal(mode: CameraMode, frame: WorldFrame, focus: PlayerId[], pov: PlayerId | null | undefined) {
    if (mode === 'baseline') {
      // From beside the stanchion, looking out past the post at the play.
      const c = this.centroid(frame, focus)
      this.goalFov = FOV.baseline
      this.goalEye.set(4.4, 2.5, -2.2)
      this.goalTarget.set(THREE.MathUtils.clamp(c.x * 0.5 - 0.4, -2.5, 2.5), 1.1, THREE.MathUtils.clamp(c.z, 4.5, 9))
      return
    }
    if (mode === 'player') {
      const p = frame.players.find(q => q.id === pov) ?? frame.players.find(q => q.id === 'D3') ?? frame.players[0]
      // A helper's job is two assignments plus the ball: look at the middle of all three.
      const jobs = frame.responsibilities.filter(r => r.defenderId === p.id).sort((a, b) => b.priority - a.priority)
      const seen = new Set<string>(), spots: { x: number; z: number }[] = []
      for (const r of jobs) {
        if (seen.has(r.offensivePlayerId) || spots.length >= 2) continue
        seen.add(r.offensivePlayerId)
        const o = frame.players.find(q => q.id === r.offensivePlayerId)
        if (o) spots.push({ x: o.x, z: o.z })
      }
      spots.push({ x: frame.ball.x, z: frame.ball.z })
      // Aim at the middle of the angular span of everything he owes (his two men and the ball),
      // so both assignments sit inside the frustum rather than the average point sitting between them.
      const ang = spots.map(sp => Math.atan2(sp.x - p.x, sp.z - p.z))
      const ref = ang[0]
      const rel = ang.map(a => Math.atan2(Math.sin(a - ref), Math.cos(a - ref)))
      const lo = Math.min(...rel), hi = Math.max(...rel)
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV.player) / 2) * (this.fitAspect ?? this.camera.aspect))
      let mid = (lo + hi) / 2
      // Wider than the lens: lean toward his first job so it is never lost.
      if (hi - lo > hfov * 0.92) mid = rel[0] + (mid - rel[0]) * 0.55
      const heading = ref + mid
      const far = Math.max(...spots.map(sp => Math.hypot(sp.x - p.x, sp.z - p.z)), 3)
      const wx = p.x + Math.sin(heading) * Math.min(far, 6), wz = p.z + Math.cos(heading) * Math.min(far, 6)
      let dx = Math.sin(heading), dz = Math.cos(heading)
      if (!Number.isFinite(dx)) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw) }
      const eyeY = Math.min(1.78, p.height * 0.955)
      this.goalFov = FOV.player
      this.goalEye.set(p.x + dx * 0.1, eyeY, p.z + dz * 0.1)
      this.goalTarget.set(wx, 1.2, wz)
      return
    }
    if (mode === 'overhead') {
      const samples: THREE.Vector3[] = []
      for (const p of frame.players) samples.push(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, 1.9, p.z))
      samples.push(new THREE.Vector3(frame.ball.x, frame.ball.y, frame.ball.z), new THREE.Vector3(0, 0, 1.575), new THREE.Vector3(0, 3.05, 1.575))
      this.goalFov = FOV.overhead
      const c = new THREE.Vector3(0, 0, 6.2)
      this.fit(c, 0, THREE.MathUtils.degToRad(78), samples, 9, 30, FOV.overhead, 0.9, 0.88)
      return
    }
    // Director: smallest framing of the focus bodies + ball.
    const rig = this.rig ?? {}
    const az = rig.azimuth ?? this.azimuth, el = rig.elevation ?? this.elevation, fov = rig.fov ?? FOV.director
    this.goalFov = fov
    const pts = this.focusPoints(frame, focus)
    const samples: THREE.Vector3[] = []
    // Heads carry labels: keep headroom above them as well as the feet.
    for (const p of pts) samples.push(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, 2.55, p.z))
    let cx = 0, cz = 0
    for (const p of pts) { cx += p.x; cz += p.z }
    cx /= pts.length; cz /= pts.length
    // The rim joins the composition only when the play is near it, and lightly.
    const nearRim = pts.some(p => Math.hypot(p.x, p.z - 1.575) < 5.2)
    if (rig.rim || nearRim) { cx += (RIM.x - cx) * 0.18; cz += (RIM.z - cz) * 0.18 }
    this.fit(new THREE.Vector3(cx, 0.8, cz), az, el, samples, rig.minDistance ?? 6.5, 24, fov, 0.9, 0.88)
  }

  private centroid(frame: WorldFrame, focus: PlayerId[]) {
    const pts = this.focusPoints(frame, focus)
    let x = 0, z = 0
    for (const p of pts) { x += p.x; z += p.z }
    return { x: x / pts.length, z: z / pts.length }
  }

  /** Bodies the camera must hold: the focus (up to 4 closest to the ball) and the ball;
   * without a focus, the ball and the four nearest bodies. */
  private focusPoints(frame: WorldFrame, focus: PlayerId[]): { x: number; z: number }[] {
    const ball = { x: frame.ball.x, z: frame.ball.z }
    const dist = (p: { x: number; z: number }) => Math.hypot(p.x - ball.x, p.z - ball.z)
    let list = focus.length ? focus.map(id => frame.players.find(q => q.id === id)).filter(Boolean) as { x: number; z: number }[] : [...frame.players]
    list = [...list].sort((a, b) => dist(a) - dist(b))
    return [...(focus.length ? list : list.slice(0, 4)), ball]
  }

  /** Place the eye so every sample lands inside the safe region, centred, by true projection. */
  private fit(aim: THREE.Vector3, az: number, el: number, samples: THREE.Vector3[], minD: number, maxD: number, fovDeg: number, fillX: number, fillY: number) {
    const cam = this.camera
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    const vfov = THREE.MathUtils.degToRad(fovDeg)
    const target = this.goalTarget.copy(aim)
    let dist = THREE.MathUtils.clamp(10, minD, maxD)
    this.goalEye.copy(target).addScaledVector(dir, dist)
    const probe = this.probe
    probe.fov = fovDeg; probe.aspect = cam.aspect; probe.near = cam.near; probe.far = cam.far
    if (cam.view?.enabled) probe.setViewOffset(cam.view.fullWidth, cam.view.fullHeight, cam.view.offsetX, cam.view.offsetY, cam.view.width, cam.view.height); else probe.clearViewOffset()
    probe.updateProjectionMatrix()
    const safe = this.safe
    const sx = (safe.x0 + safe.x1) / 2, sy = (safe.y0 + safe.y1) / 2, sw = safe.x1 - safe.x0, sh = safe.y1 - safe.y0
    const v = this.v, right = this.right, upv = this.upv
    // The eye must stay inside the gym: behind-the-defense angles are limited by the end wall.
    const clampEye = () => {
      const e = this.goalEye
      if (dir.z < -0.05 && e.z < ROOM_MIN_Z) { dist = (ROOM_MIN_Z - target.z) / dir.z; e.copy(target).addScaledVector(dir, dist); return true }
      return false
    }
    let need = 1, clamped = false
    for (let i = 0; i < 6; i++) {
      probe.position.copy(this.goalEye); probe.lookAt(target); probe.updateMatrixWorld()
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const q of samples) { v.copy(q).project(probe); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y) }
      need = Math.max((x1 - x0) / (sw * fillX), (y1 - y0) / (sh * fillY))
      const halfH = dist * Math.tan(vfov / 2)
      right.set(1, 0, 0).applyQuaternion(probe.quaternion); upv.set(0, 1, 0).applyQuaternion(probe.quaternion)
      const shift = right.multiplyScalar(((x0 + x1) / 2 - sx) * halfH * cam.aspect).add(upv.multiplyScalar(((y0 + y1) / 2 - sy) * halfH))
      target.add(shift)
      dist = THREE.MathUtils.clamp(dist * (0.35 + 0.65 * need), minD, maxD)
      this.goalEye.copy(target).addScaledVector(dir, dist)
      clamped = clampEye()
    }
    // Pinned against the wall and still too big: open the lens instead of leaving the room.
    if (clamped && need > 1.02) this.goalFov = Math.min(48, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(vfov / 2) * need)))
  }
  private probe = new THREE.PerspectiveCamera()
  private v = new THREE.Vector3()
  private right = new THREE.Vector3()
  private upv = new THREE.Vector3()
  /** Safe region in NDC (after view offset). */
  safe = { x0: -1, x1: 1, y0: -1, y1: 1 }
}
