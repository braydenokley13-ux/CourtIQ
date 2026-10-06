import * as THREE from 'three'
import type { PlayerId, WorldFrame } from '@/lib/defense-lab/types'
import type { CameraMode } from './types'

/** Director camera: frames the basketball problem (focus players + ball), not
 * the gym. Critically damped so playback never chases actors jerkily. */
export class DirectorCamera {
  readonly eye = new THREE.Vector3(9, 7, 15)
  readonly target = new THREE.Vector3(0, 0.9, 5)
  private goalEye = new THREE.Vector3()
  private goalTarget = new THREE.Vector3()
  private settled = false
  /** Broadcast heading: from the scorer's-table side, slightly behind the play. */
  /** Aspect of the visible safe region (defaults to the camera aspect). */
  fitAspect: number | null = null
  azimuth = 0.62
  elevation = 0.5

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Returns true while still moving. */
  step(mode: CameraMode, frame: WorldFrame, focus: PlayerId[], pov: PlayerId | null | undefined, dt: number, snap: boolean): boolean {
    if (mode === 'free') return false
    this.computeGoal(mode, frame, focus, pov)
    const k = snap ? 1 : 1 - Math.exp(-dt * (mode === 'player' ? 9 : 2.6))
    this.eye.lerp(this.goalEye, k); this.target.lerp(this.goalTarget, k)
    this.camera.position.copy(this.eye); this.camera.lookAt(this.target)
    const moving = this.eye.distanceToSquared(this.goalEye) > 1e-5 || this.target.distanceToSquared(this.goalTarget) > 1e-5
    this.settled = !moving
    return moving
  }

  get isSettled() { return this.settled }

  /** Adopt the camera's current pose (after free orbit) so director transitions start there. */
  adopt(target: THREE.Vector3) { this.eye.copy(this.camera.position); this.target.copy(target) }

  private computeGoal(mode: CameraMode, frame: WorldFrame, focus: PlayerId[], pov: PlayerId | null | undefined) {
    const cam = this.camera
    if (mode === 'overhead') {
      this.goalTarget.set(0, 0, 6.6); this.goalEye.set(0.001, 21 / Math.min(1.25, Math.max(0.65, cam.aspect)), 6.7); return
    }
    if (mode === 'baseline') {
      this.goalTarget.set(0, 1.0, 6.2); this.goalEye.set(0, 5.4, -3.2); return
    }
    if (mode === 'player') {
      const p = frame.players.find(q => q.id === pov) ?? frame.players.find(q => q.id === 'D3')!
      const ball = frame.ball
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw)
      // Look between facing and the ball, like a defender's peripheral read.
      const bx = ball.x - p.x, bz = ball.z - p.z, bl = Math.hypot(bx, bz) || 1
      const lx = fx * 0.45 + bx / bl * 0.55, lz = fz * 0.45 + bz / bl * 0.55
      this.goalEye.set(p.x - lx * 0.9, p.height * 0.98 + 0.25, p.z - lz * 0.9)
      this.goalTarget.set(p.x + lx * 6, 1.1, p.z + lz * 6)
      return
    }
    // Director: smallest circle around focus players + ball.
    const pts: { x: number; z: number }[] = []
    const ids = focus.length ? focus : frame.players.map(p => p.id)
    for (const id of ids) { const p = frame.players.find(q => q.id === id); if (p) pts.push(p) }
    pts.push({ x: frame.ball.x, z: frame.ball.z })
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
    // Always keep the rim in the composition: it is the reference of every decision.
    minZ = Math.min(minZ, 1.2)
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    const halfW = (maxX - minX) / 2 + 1.4, halfD = (maxZ - minZ) / 2 + 1.2
    const vfov = THREE.MathUtils.degToRad(cam.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (this.fitAspect ?? cam.aspect))
    // Depth foreshortens under elevation; width is the binding constraint on wide screens.
    const needW = halfW / Math.tan(hfov / 2)
    const needD = (halfD * Math.sin(this.elevation) + 1.1) / Math.tan(vfov / 2)
    const distance = THREE.MathUtils.clamp(Math.max(needW, needD) * 1.02, 8, 22)
    this.goalTarget.set(cx, 0.75, cz + 0.4)
    const az = this.azimuth, el = this.elevation
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    let dist = distance
    this.goalEye.copy(this.goalTarget).addScaledVector(dir, dist)
    // Refine with true perspective projection inside the safe region: bodies
    // (feet and heads) must fit, centred, whatever the overlay layout.
    const probe = this.probe
    probe.fov = cam.fov; probe.aspect = cam.aspect; probe.near = cam.near; probe.far = cam.far
    if (cam.view?.enabled) probe.setViewOffset(cam.view.fullWidth, cam.view.fullHeight, cam.view.offsetX, cam.view.offsetY, cam.view.width, cam.view.height); else probe.clearViewOffset()
    probe.updateProjectionMatrix()
    const safe = this.safe
    const sx = (safe.x0 + safe.x1) / 2, sy = (safe.y0 + safe.y1) / 2, sw = safe.x1 - safe.x0, sh = safe.y1 - safe.y0
    const v = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3()
    const samples: THREE.Vector3[] = []
    for (const p of pts) { samples.push(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, 2.15, p.z)) }
    // The rim and the paint anchor every composition.
    samples.push(new THREE.Vector3(0, 3.05, 1.575), new THREE.Vector3(-1.8, 0, 0.6), new THREE.Vector3(1.8, 0, 0.6))
    for (let i = 0; i < 5; i++) {
      probe.position.copy(this.goalEye); probe.lookAt(this.goalTarget); probe.updateMatrixWorld()
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const q of samples) { v.copy(q).project(probe); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y) }
      const need = Math.max((x1 - x0) / (sw * 0.86), (y1 - y0) / (sh * 0.84))
      const halfH = dist * Math.tan(vfov / 2)
      right.set(1, 0, 0).applyQuaternion(probe.quaternion); upv.set(0, 1, 0).applyQuaternion(probe.quaternion)
      const shift = right.multiplyScalar(((x0 + x1) / 2 - sx) * halfH * cam.aspect).add(upv.multiplyScalar(((y0 + y1) / 2 - sy) * halfH))
      this.goalTarget.add(shift)
      dist = THREE.MathUtils.clamp(dist * (0.35 + 0.65 * need), 9, 24)
      this.goalEye.copy(this.goalTarget).addScaledVector(dir, dist)
    }
  }
  private probe = new THREE.PerspectiveCamera()
  /** Safe region in NDC (after view offset). */
  safe = { x0: -1, x1: 1, y0: -1, y1: 1 }
}
