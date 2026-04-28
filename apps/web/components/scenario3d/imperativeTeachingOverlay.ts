/**
 * Imperative teaching-overlay controller.
 *
 * Packet E (renderer-polish, learning overlays).
 *
 * The production renderer mounts an imperative scene built by
 * `buildBasketballGroup` — JSX <MovementPath3D> children only render in the
 * legacy `?simple=0` path, so the production canvas was shipping with no
 * teaching overlays at all and the "Paths" toggle had nothing to control.
 *
 * This module builds the teaching layer imperatively:
 *   - offensive movement paths (curved tubes + arrowheads + destination
 *     marker on the headline movement)
 *   - defensive read cues (denial / closeout / rotation / stop_ball cones,
 *     pressure halos around the user's defender)
 *   - spacing labels for the offensive starts (slot / wing / corner / etc.)
 *
 * The whole overlay lives on a single THREE.Group attached to the scene
 * root. setVisible() flips the group's visibility so toggle is O(1) — no
 * teardown, no orphaned graphics. tick(now) animates dash offsets and
 * pulses without using R3F's useFrame; the canvas's existing parent rAF
 * loop drives it.
 */

import * as THREE from 'three'
import type { Scene3D, SceneMovement, ScenePlayer } from '@/lib/scenario3d/scene'
import type { MotionMode } from './imperativeScene'

const PATH_Y = 0.18
const ARROW_LENGTH = 1.6
const ARROW_RADIUS = 0.55

const USER_PATH_COLOR = '#46FFA8'
const OFFENSE_PATH_COLOR = '#3D9CFF'
const DEFENSE_PATH_COLOR = '#FF3F58'
const BALL_PATH_COLOR = '#FFB070'
const DENIAL_COLOR = '#FF3F58'
const PRESSURE_COLOR = '#FFCB44'
const ZONE_LABEL_COLOR = '#FFFFFF'
const ZONE_LABEL_SHADOW = 'rgba(0, 0, 0, 0.55)'

interface AnimatedTube {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  baseOpacity: number
  speed: number
}

interface AnimatedRing {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  speed: number
  baseScale: number
  amplitude: number
}

interface AnimatedHalo {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  baseOpacity: number
  speed: number
}

/**
 * Lightweight imperative teaching overlay. Owns its own THREE objects
 * and disposes them in dispose(). The scene root is the only thing the
 * caller touches; this controller registers `group` as a child of root
 * and removes it on dispose().
 */
export class TeachingOverlayController {
  readonly group: THREE.Group
  private root: THREE.Group | null
  private disposables: Array<{ dispose(): void }> = []
  private animatedTubes: AnimatedTube[] = []
  private animatedRings: AnimatedRing[] = []
  private animatedHalos: AnimatedHalo[] = []
  private reduced: boolean

  constructor(
    scene: Scene3D,
    mode: MotionMode,
    root: THREE.Group,
    options?: { reduced?: boolean },
  ) {
    this.reduced = !!options?.reduced
    this.root = root
    this.group = new THREE.Group()
    this.group.name = 'imperative-teaching-overlay'
    // Default off — the canvas flips visibility based on the showPaths
    // prop after construction so the overlay never flickers on at mount.
    this.group.visible = false

    const movements = resolveMovements(scene, mode)

    if (movements.length > 0) {
      this.buildMovementPaths(scene, movements)
      this.buildDefensiveCues(scene, movements)
    }
    this.buildSpacingLabels(scene)

    root.add(this.group)
  }

  /** Toggles visibility of the entire overlay group in O(1). */
  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /** Animates dash offsets, pulse rings, and pressure halos. Safe to
   *  call every frame; no allocation beyond `Math` ops. Skipped when the
   *  group is hidden so toggling Paths off also stops animation work.
   */
  tick(nowMs: number): void {
    if (!this.group.visible) return
    if (this.reduced) return
    const t = nowMs * 0.001
    for (const a of this.animatedTubes) {
      a.material.opacity =
        a.baseOpacity * (0.78 + 0.22 * Math.sin(t * a.speed))
    }
    for (const r of this.animatedRings) {
      const s = r.baseScale + r.amplitude * (0.5 + 0.5 * Math.sin(t * r.speed))
      r.mesh.scale.set(s, s, 1)
    }
    for (const h of this.animatedHalos) {
      h.material.opacity =
        h.baseOpacity * (0.6 + 0.4 * Math.sin(t * h.speed))
    }
  }

  /** Removes the overlay group from its parent and frees every GPU
   *  resource it owns. Safe to call multiple times. */
  dispose(): void {
    if (this.root && this.group.parent === this.root) {
      this.root.remove(this.group)
    }
    this.root = null
    for (const d of this.disposables) {
      try {
        d.dispose()
      } catch {
        // best-effort
      }
    }
    this.disposables = []
    this.animatedTubes = []
    this.animatedRings = []
    this.animatedHalos = []
  }

  // ----- builders -----

  private buildMovementPaths(scene: Scene3D, movements: SceneMovement[]): void {
    const ballStart = resolveBallStart(scene)
    const headlineId = pickHeadlineMovementId(scene, movements)

    for (const m of movements) {
      const isHeadline = m.id === headlineId
      let from: { x: number; z: number }
      let color: string
      let thickness: number

      if (m.playerId === 'ball') {
        from = ballStart
        color = BALL_PATH_COLOR
        thickness = 0.13
      } else {
        const player = scene.players.find((p) => p.id === m.playerId)
        if (!player) continue
        from = player.start
        color = player.isUser
          ? USER_PATH_COLOR
          : player.team === 'offense'
            ? OFFENSE_PATH_COLOR
            : DEFENSE_PATH_COLOR
        thickness = isHeadline ? 0.22 : 0.12
      }

      this.addPathTube(from, m.to, color, thickness, isHeadline)
      this.addArrowhead(from, m.to, color)
      if (isHeadline) {
        this.addDestinationMarker(m.to, color)
      }
    }
  }

  /**
   * Defender cues come from existing scenario data — any defense-team
   * movement whose kind is `closeout`, `rotation`, or `stop_ball` gets a
   * red pressure cone at the player's start, pointing at their target.
   * Additionally, the closest defender to the user's start gets a
   * pulsing pressure halo so the read is obvious before motion plays.
   */
  private buildDefensiveCues(
    scene: Scene3D,
    movements: SceneMovement[],
  ): void {
    const cued = new Set<string>()
    for (const m of movements) {
      if (m.playerId === 'ball') continue
      const player = scene.players.find((p) => p.id === m.playerId)
      if (!player || player.team !== 'defense') continue
      if (
        m.kind === 'closeout' ||
        m.kind === 'rotation' ||
        m.kind === 'stop_ball'
      ) {
        this.addPressureCone(player.start, m.to)
        cued.add(player.id)
      }
    }

    const user = scene.players.find((p) => p.isUser)
    if (user) {
      const guard = nearestDefender(scene, user)
      if (guard && !cued.has(guard.id)) {
        this.addPressureHalo(guard.start)
      }
    }
  }

  /**
   * Spot labels for the offensive starts. Uses canvas sprites so the
   * label always faces the camera. We label every offensive player by
   * the role's natural "spot name" (slot / wing / corner / dunker /
   * top), skipping defenders so the floor never looks crowded with
   * text.
   */
  private buildSpacingLabels(scene: Scene3D): void {
    for (const player of scene.players) {
      if (player.team !== 'offense') continue
      const label = spotLabelFor(player)
      if (!label) continue
      const sprite = this.buildLabelSprite(label)
      sprite.position.set(player.start.x, 0.06, player.start.z + 1.55)
      this.group.add(sprite)
    }
  }

  // ----- primitive builders -----

  private addPathTube(
    from: { x: number; z: number },
    to: { x: number; z: number },
    color: string,
    thickness: number,
    headline: boolean,
  ): void {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 0.05) return

    const start = new THREE.Vector3(from.x, PATH_Y, from.z)
    const end = new THREE.Vector3(to.x, PATH_Y, to.z)
    const perpX = -dz / length
    const perpZ = dx / length
    const offset = Math.min(length * 0.18, 6)
    const mid = new THREE.Vector3(
      (from.x + to.x) / 2 + perpX * offset,
      PATH_Y + 0.45,
      (from.z + to.z) / 2 + perpZ * offset,
    )
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)

    const tubeGeom = new THREE.TubeGeometry(curve, 48, thickness, 10, false)
    const haloGeom = new THREE.TubeGeometry(curve, 48, thickness * 2.1, 10, false)
    this.disposables.push(tubeGeom, haloGeom)

    const haloMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      toneMapped: false,
      depthWrite: false,
    })
    this.disposables.push(haloMat)
    const halo = new THREE.Mesh(haloGeom, haloMat)
    this.group.add(halo)

    const coreMat = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      transparent: true,
      opacity: 0.92,
    })
    this.disposables.push(coreMat)
    const core = new THREE.Mesh(tubeGeom, coreMat)
    this.group.add(core)

    if (headline) {
      this.animatedTubes.push({
        mesh: core,
        material: coreMat,
        baseOpacity: 0.92,
        speed: 3.4,
      })
    }
  }

  private addArrowhead(
    from: { x: number; z: number },
    to: { x: number; z: number },
    color: string,
  ): void {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 0.6) return

    const ux = dx / length
    const uz = dz / length

    const geom = new THREE.ConeGeometry(ARROW_RADIUS, ARROW_LENGTH, 16)
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false })
    this.disposables.push(geom, mat)
    const cone = new THREE.Mesh(geom, mat)
    cone.position.set(
      to.x - ux * ARROW_LENGTH * 0.4,
      PATH_Y + 0.25,
      to.z - uz * ARROW_LENGTH * 0.4,
    )
    const tangent = new THREE.Vector3(ux, 0, uz)
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
    this.group.add(cone)
  }

  private addDestinationMarker(
    pos: { x: number; z: number },
    color: string,
  ): void {
    const marker = new THREE.Group()
    marker.position.set(pos.x, 0, pos.z)

    const baseGeom = new THREE.RingGeometry(1.15, 1.4, 48)
    const baseMat = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    })
    this.disposables.push(baseGeom, baseMat)
    const baseRing = new THREE.Mesh(baseGeom, baseMat)
    baseRing.rotation.x = -Math.PI / 2
    baseRing.position.y = 0.2
    marker.add(baseRing)

    const pulseGeom = new THREE.RingGeometry(1.5, 1.78, 48)
    const pulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(pulseGeom, pulseMat)
    const pulse = new THREE.Mesh(pulseGeom, pulseMat)
    pulse.rotation.x = -Math.PI / 2
    pulse.position.y = 0.22
    marker.add(pulse)
    this.animatedRings.push({
      mesh: pulse,
      material: pulseMat,
      speed: 2.4,
      baseScale: 1,
      amplitude: 0.18,
    })

    const beamGeom = new THREE.CylinderGeometry(0.18, 0.5, 2.4, 16, 1, true)
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(beamGeom, beamMat)
    const beam = new THREE.Mesh(beamGeom, beamMat)
    beam.position.y = 1.4
    marker.add(beam)
    this.animatedHalos.push({
      mesh: beam,
      material: beamMat,
      baseOpacity: 0.42,
      speed: 3.0,
    })

    this.group.add(marker)
  }

  private addPressureCone(
    from: { x: number; z: number },
    to: { x: number; z: number },
  ): void {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)

    // Hatched denial bar, lifted above the floor and oriented from the
    // defender toward the threat.
    if (length > 0.2) {
      const ux = dx / length
      const uz = dz / length
      const barLen = Math.min(length * 0.85, 7)

      const geom = new THREE.PlaneGeometry(barLen, 0.6)
      const mat = new THREE.MeshBasicMaterial({
        color: DENIAL_COLOR,
        toneMapped: false,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      this.disposables.push(geom, mat)
      const bar = new THREE.Mesh(geom, mat)
      bar.position.set(
        from.x + ux * (barLen / 2 + 0.4),
        PATH_Y + 0.02,
        from.z + uz * (barLen / 2 + 0.4),
      )
      bar.rotation.x = -Math.PI / 2
      bar.rotation.z = -Math.atan2(uz, ux)
      this.group.add(bar)
    }

    // Cone sitting on the defender, tip pointing down — visible
    // pressure marker even before motion plays.
    const coneGeom = new THREE.ConeGeometry(0.65, 1.6, 18)
    const coneMat = new THREE.MeshBasicMaterial({
      color: DENIAL_COLOR,
      toneMapped: false,
      transparent: true,
      opacity: 0.85,
    })
    this.disposables.push(coneGeom, coneMat)
    const cone = new THREE.Mesh(coneGeom, coneMat)
    cone.position.set(from.x, PATH_Y + 7.4, from.z)
    cone.rotation.x = Math.PI
    this.group.add(cone)
  }

  private addPressureHalo(pos: { x: number; z: number }): void {
    const ringGeom = new THREE.RingGeometry(1.55, 1.85, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color: PRESSURE_COLOR,
      transparent: true,
      opacity: 0.55,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.disposables.push(ringGeom, ringMat)
    const ring = new THREE.Mesh(ringGeom, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(pos.x, PATH_Y + 0.04, pos.z)
    this.group.add(ring)
    this.animatedRings.push({
      mesh: ring,
      material: ringMat,
      speed: 3.2,
      baseScale: 1,
      amplitude: 0.22,
    })
    this.animatedHalos.push({
      mesh: ring,
      material: ringMat,
      baseOpacity: 0.55,
      speed: 3.2,
    })
  }

  private buildLabelSprite(text: string): THREE.Sprite {
    const canvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : null
    if (!canvas) {
      // SSR/Test fallback: empty 1x1 texture so the sprite still
      // disposes cleanly. The renderer never reaches this branch in
      // production (canvas is created in a useEffect that only runs in
      // the browser).
      const tex = new THREE.Texture()
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
      this.disposables.push(tex, mat)
      return new THREE.Sprite(mat)
    }
    const W = 256
    const H = 64
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = ZONE_LABEL_SHADOW
      roundedRect(ctx, 6, 6, W - 12, H - 12, 18)
      ctx.fill()
      ctx.font = 'bold 36px system-ui, sans-serif'
      ctx.fillStyle = ZONE_LABEL_COLOR
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text.toUpperCase(), W / 2, H / 2)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
    this.disposables.push(tex, mat)
    const sprite = new THREE.Sprite(mat)
    // World-space pixel scale tuned so labels read but never dominate.
    sprite.scale.set(4.2, 1.05, 1)
    return sprite
  }
}

function resolveMovements(scene: Scene3D, mode: MotionMode): SceneMovement[] {
  if (mode === 'answer') return scene.answerDemo ?? []
  if (mode === 'intro') return scene.movements ?? []
  return []
}

function resolveBallStart(scene: Scene3D): { x: number; z: number } {
  if (scene.ball.holderId) {
    const holder = scene.players.find((p) => p.id === scene.ball.holderId)
    if (holder) return holder.start
  }
  return scene.ball.start
}

function pickHeadlineMovementId(
  scene: Scene3D,
  movements: SceneMovement[],
): string | undefined {
  const user = scene.players.find((p) => p.isUser)
  if (user) {
    const userMove = movements.find((m) => m.playerId === user.id)
    if (userMove) return userMove.id
  }
  const firstNonBall = movements.find((m) => m.playerId !== 'ball')
  return firstNonBall?.id
}

function nearestDefender(scene: Scene3D, user: ScenePlayer): ScenePlayer | null {
  let best: ScenePlayer | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const p of scene.players) {
    if (p.team !== 'defense') continue
    const dx = p.start.x - user.start.x
    const dz = p.start.z - user.start.z
    const d = dx * dx + dz * dz
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

function spotLabelFor(player: ScenePlayer): string | null {
  const role = (player.role ?? '').toLowerCase()
  if (role.includes('corner')) return 'Corner'
  if (role.includes('wing') && !role.includes('_d')) return 'Wing'
  if (role.includes('slot')) return 'Slot'
  if (role.includes('top') || role.includes('point') || role.includes('handler'))
    return 'Top'
  if (role.includes('post') || role.includes('dunker') || role.includes('center'))
    return 'Dunker'
  return null
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}
