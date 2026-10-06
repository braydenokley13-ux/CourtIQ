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
    this.goalEye.set(cx + Math.sin(az) * Math.cos(el) * distance, 0.75 + Math.sin(el) * distance, cz + 0.4 + Math.cos(az) * Math.cos(el) * distance)
  }
}
