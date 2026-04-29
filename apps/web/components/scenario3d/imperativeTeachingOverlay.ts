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
import type { OverlayPrimitive } from '@/lib/scenario3d/schema'
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

// --- Phase E: authored-overlay-primitive treatment ----------------------
// Color tokens follow Section 6.5's meaning-level guidance; the design
// system can re-skin without touching the renderer.
const VISION_CONE_COLOR = '#7BB6FF' // translucent cool tone
const HIP_ARROW_COLOR = '#FFE3A0' // white-amber
const FOOT_ARROW_COLOR = '#FFFFFF'
const CHEST_LINE_COLOR = '#FFFFFF'
const HAND_LANE_COLOR = '#FFCB44'
const LANE_OPEN_COLOR = '#46FFA8'
const LANE_BLOCKED_COLOR = '#FF7A40'
const OPEN_SPACE_COLOR = '#3BE383' // brand accent at low alpha
const DRIVE_PREVIEW_COLOR = '#46FFA8'
const HELP_PULSE_COLORS: Record<
  'tag' | 'low_man' | 'nail' | 'stunter' | 'overhelp',
  string
> = {
  tag: '#FFCB44',
  low_man: '#FF7A40',
  nail: '#7BB6FF',
  stunter: '#B083FF', // schema-valid; deferred per Section 6.7
  overhelp: '#FF3F58',
}

// Body-language anchor heights (court units, feet).
const HIP_HEIGHT = 1.2
const FOOT_HEIGHT = 0.05
const CHEST_HEIGHT = 1.5
const HAND_HEIGHT = 1.7
const VISION_CONE_HEIGHT = 1.6

// Animation timing per Section 6.5 (ms).
const FADE_DEFENDER_BODY_MS = 200
const FADE_LANE_OPEN_MS = 350
const FADE_LANE_BLOCKED_MS = 250
const FADE_OPEN_SPACE_MS = 400
const FADE_DRIVE_PREVIEW_MS = 600 // path build-out window (400–700 ms)
const HELP_PULSE_HZ = 1.0 // ~1 Hz pulse

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
 * Phase E — fade-in animation handle. The first time the parent group
 * becomes visible (`setPhase('pre' | 'post')`), the controller stamps
 * `startMs` on every fade-in entry inside that group; subsequent ticks
 * animate `material.opacity` from 0 → `targetOpacity` over `durationMs`.
 * Once `startMs + durationMs` has elapsed, the entry is left at
 * `targetOpacity` and the tick loop skips it.
 */
interface AnimatedFadeIn {
  material: THREE.Material & { opacity: number }
  targetOpacity: number
  durationMs: number
  startMs: number | null
  /** Which authored-overlay group this fade belongs to; set by
   *  `setPhase` so only the visible phase's animations animate. */
  phase: 'pre' | 'post'
}

/**
 * Phase E — drive_cut_preview build-out. The tube fades in like a
 * `AnimatedFadeIn` while the arrowhead stays hidden; the arrowhead
 * pops to its target opacity on completion. `startMs` is set by
 * `setPhase` the same way as a fade.
 */
interface AnimatedBuildOut {
  tubeMaterial: THREE.MeshBasicMaterial
  tubeTargetOpacity: number
  arrowhead: THREE.Mesh
  arrowheadMaterial: THREE.MeshBasicMaterial
  arrowheadTargetOpacity: number
  durationMs: number
  startMs: number | null
  phase: 'pre' | 'post'
}

export type OverlayPhase = 'pre' | 'post' | 'hidden'

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
  // Phase E — authored-overlay sub-groups. Both default hidden; the
  // canvas calls setPhase('pre' | 'post' | 'hidden') to flip which set
  // is visible. Visibility-flip rather than teardown keeps GPU
  // allocations stable across the freeze → consequence → replaying
  // legs of the state machine.
  private preAnswerGroup: THREE.Group
  private postAnswerGroup: THREE.Group
  private animatedFades: AnimatedFadeIn[] = []
  private animatedBuilds: AnimatedBuildOut[] = []
  // Phase E — per-help-pulse handles. Pulse a halo + a label sprite at
  // the help defender; the label only renders post-answer.
  private animatedHelpPulses: Array<{
    halo: THREE.Mesh
    haloMaterial: THREE.MeshBasicMaterial
    baseOpacity: number
  }> = []
  private scene: Scene3D
  private phase: OverlayPhase = 'hidden'

  constructor(
    scene: Scene3D,
    mode: MotionMode,
    root: THREE.Group,
    options?: { reduced?: boolean; heuristic?: boolean },
  ) {
    this.reduced = !!options?.reduced
    // Phase H — authored-only mode. The JSX path mounts a separate
    // overlay bridge that only needs the authored pre/post groups
    // (movement paths and spacing labels are already drawn by the
    // declarative `<MovementPath3D>` tree). Defaults to true so the
    // imperative simple-mode path keeps rendering its full overlay
    // surface unchanged.
    const buildHeuristic = options?.heuristic !== false
    this.root = root
    this.scene = scene
    this.group = new THREE.Group()
    this.group.name = 'imperative-teaching-overlay'
    // Default off — the canvas flips visibility based on the showPaths
    // prop after construction so the overlay never flickers on at mount.
    this.group.visible = false

    // Phase E — authored-overlay containers. Both children of `group`
    // so the existing `setVisible(false)` toggle still hides everything.
    // Independent visibility lets `setPhase()` flip pre vs post without
    // touching the heuristic-derived overlays above.
    this.preAnswerGroup = new THREE.Group()
    this.preAnswerGroup.name = 'authored-pre-answer-overlays'
    this.preAnswerGroup.visible = false
    this.postAnswerGroup = new THREE.Group()
    this.postAnswerGroup.name = 'authored-post-answer-overlays'
    this.postAnswerGroup.visible = false
    this.group.add(this.preAnswerGroup)
    this.group.add(this.postAnswerGroup)

    if (buildHeuristic) {
      const movements = resolveMovements(scene, mode)
      if (movements.length > 0) {
        this.buildMovementPaths(scene, movements)
        this.buildDefensiveCues(scene, movements)
      }
      this.buildSpacingLabels(scene)
    }

    root.add(this.group)
  }

  /** Toggles visibility of the entire overlay group in O(1). */
  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /**
   * Phase E — replaces the authored-overlay set. Disposes any previously
   * mounted authored primitives (heuristic overlays in the parent group
   * are untouched) and rebuilds both sub-groups in a single pass. Call
   * once per scene mount; the controller does not introspect the scene
   * to discover overlays — the caller (Scenario3DCanvas / state machine)
   * supplies the validated arrays it owns.
   */
  setAuthoredOverlays(
    preAnswer: readonly OverlayPrimitive[],
    postAnswer: readonly OverlayPrimitive[],
  ): void {
    this.disposeAuthored()
    for (const primitive of preAnswer) {
      this.buildAuthoredPrimitive(this.preAnswerGroup, 'pre', primitive)
    }
    for (const primitive of postAnswer) {
      this.buildAuthoredPrimitive(this.postAnswerGroup, 'post', primitive)
    }
  }

  /**
   * Phase E — visibility-flip between the pre-answer and post-answer
   * authored overlays. `'hidden'` parks both. The first time a sub-group
   * becomes visible after construction, fade-in animations stamp their
   * `startMs` so the next tick begins the fade from t=0 → 1 over the
   * primitive's authored duration.
   */
  setPhase(phase: OverlayPhase, nowMs: number = performance.now()): void {
    if (phase === this.phase) return
    this.phase = phase
    this.preAnswerGroup.visible = phase === 'pre'
    this.postAnswerGroup.visible = phase === 'post'
    if (phase === 'pre' || phase === 'post') {
      this.startFadesForPhase(phase, nowMs)
    }
  }

  getPhase(): OverlayPhase {
    return this.phase
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

    // Phase E — authored-overlay animations only run for the active
    // phase. Fades stamp their startMs in setPhase(); subsequent ticks
    // ramp opacity from 0 → target. Once complete, opacity stays
    // pinned at target so `setPhase('hidden')` + a re-show still
    // displays the primitive at full strength rather than restarting
    // the fade.
    for (const f of this.animatedFades) {
      if (f.phase !== this.phase) continue
      if (f.startMs === null) continue
      const elapsed = nowMs - f.startMs
      if (elapsed >= f.durationMs) {
        f.material.opacity = f.targetOpacity
      } else {
        const u = clamp01(elapsed / Math.max(1, f.durationMs))
        f.material.opacity = f.targetOpacity * easeOutCubic(u)
      }
    }
    for (const b of this.animatedBuilds) {
      if (b.phase !== this.phase) continue
      if (b.startMs === null) continue
      const elapsed = nowMs - b.startMs
      const u = clamp01(elapsed / Math.max(1, b.durationMs))
      b.tubeMaterial.opacity = b.tubeTargetOpacity * easeOutCubic(u)
      // Arrowhead pops in once the path build-out completes.
      if (u >= 1) {
        b.arrowhead.visible = true
        b.arrowheadMaterial.opacity = b.arrowheadTargetOpacity
      } else {
        b.arrowhead.visible = false
      }
    }
    // Help pulse (≈1 Hz). Driven independently of fade-ins so the
    // halo continues to pulse after the fade-in finishes.
    if (this.animatedHelpPulses.length > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * HELP_PULSE_HZ)
      for (const p of this.animatedHelpPulses) {
        p.haloMaterial.opacity = p.baseOpacity * pulse
      }
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
    this.animatedFades = []
    this.animatedBuilds = []
    this.animatedHelpPulses = []
  }

  /** Phase E — clears the authored-overlay sub-groups and frees any
   *  per-primitive GPU resources. Used by `setAuthoredOverlays` to
   *  swap arrays without leaking. The heuristic-derived overlays in
   *  the parent group are left intact. */
  private disposeAuthored(): void {
    for (const grp of [this.preAnswerGroup, this.postAnswerGroup]) {
      grp.traverse((obj) => {
        const mesh = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry }
        if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
          mesh.geometry.dispose()
        }
        const material = (obj as THREE.Mesh).material
        if (material) {
          const list = Array.isArray(material) ? material : [material]
          for (const m of list) {
            const tex = (m as THREE.MeshBasicMaterial).map
            if (tex && typeof tex.dispose === 'function') tex.dispose()
            if (typeof m.dispose === 'function') m.dispose()
          }
        }
      })
      while (grp.children.length > 0) grp.remove(grp.children[0]!)
    }
    this.animatedFades = []
    this.animatedBuilds = []
    this.animatedHelpPulses = []
  }

  /** Phase E — stamps `startMs` on every fade-in / build-out animation
   *  belonging to the active phase. Called by `setPhase` so the next
   *  tick begins the primitives' fade-in timing from t=0. */
  private startFadesForPhase(phase: 'pre' | 'post', nowMs: number): void {
    for (const f of this.animatedFades) {
      if (f.phase === phase && f.startMs === null) f.startMs = nowMs
    }
    for (const b of this.animatedBuilds) {
      if (b.phase === phase && b.startMs === null) b.startMs = nowMs
    }
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

  // ----- Phase E: authored overlay primitive builders -----

  /**
   * Routes an authored OverlayPrimitive to its renderer. All builders
   * push their meshes into `target` (a phase-tagged sub-group) and
   * register fade-in / pulse animation handles tagged to the same
   * phase so `setPhase` only animates the visible set.
   */
  private buildAuthoredPrimitive(
    target: THREE.Group,
    phase: 'pre' | 'post',
    primitive: OverlayPrimitive,
  ): void {
    switch (primitive.kind) {
      case 'defender_vision_cone':
        this.buildVisionCone(target, phase, primitive.playerId, primitive.targetId)
        return
      case 'defender_hip_arrow':
        this.buildBodyArrow(target, phase, primitive.playerId, HIP_HEIGHT, HIP_ARROW_COLOR, 1.6)
        return
      case 'defender_foot_arrow':
        this.buildBodyArrow(target, phase, primitive.playerId, FOOT_HEIGHT, FOOT_ARROW_COLOR, 1.0)
        return
      case 'defender_chest_line':
        this.buildChestLine(target, phase, primitive.playerId)
        return
      case 'defender_hand_in_lane':
        this.buildHandInLane(target, phase, primitive.playerId)
        return
      case 'open_space_region':
        this.buildOpenSpaceRegion(target, phase, primitive.anchor, primitive.radiusFt ?? 4)
        return
      case 'help_pulse':
        this.buildHelpPulse(target, phase, primitive.playerId, primitive.role)
        return
      case 'drive_cut_preview':
        this.buildDriveCutPreview(target, phase, primitive.playerId, primitive.path)
        return
      case 'passing_lane_open':
        this.buildPassingLane(target, phase, primitive.from, primitive.to, LANE_OPEN_COLOR, FADE_LANE_OPEN_MS, 0.85)
        return
      case 'passing_lane_blocked':
        this.buildPassingLane(target, phase, primitive.from, primitive.to, LANE_BLOCKED_COLOR, FADE_LANE_BLOCKED_MS, 0.85)
        return
      case 'label':
        this.buildAuthoredLabel(target, phase, primitive.anchor, primitive.text)
        return
      case 'timing_pulse':
        // Section 6.7: timing_pulse is deferred for v0. Schema-valid;
        // intentionally silent until a later phase wires its visual
        // treatment (one-shot outward ripple at window close).
        return
    }
  }

  /** Looks up an authored playerId against the controller's scene.
   *  Returns null if the id has no match — caller no-ops in that case. */
  private playerById(id: string): ScenePlayer | null {
    return this.scene.players.find((p) => p.id === id) ?? null
  }

  /** Returns an authored overlay endpoint as a court point. Accepts
   *  either a real player id or the literal `'ball'`; falls back to
   *  the scene's resolved ball start. */
  private endpointPoint(id: string): { x: number; z: number } | null {
    if (id === 'ball') return resolveBallStart(this.scene)
    const player = this.playerById(id)
    return player ? player.start : null
  }

  /** Default body-language facing direction: pointing at the closest
   *  offensive player (defender) or the closest defensive player
   *  (offensive primitive, e.g. hand_in_lane on an offensive cutter).
   *  Falls back to "toward the basket" (z=0). */
  private inferFacing(player: ScenePlayer): { x: number; z: number } {
    const otherTeam = player.team === 'defense' ? 'offense' : 'defense'
    let target: ScenePlayer | null = null
    let best = Number.POSITIVE_INFINITY
    for (const p of this.scene.players) {
      if (p.team !== otherTeam) continue
      const dx = p.start.x - player.start.x
      const dz = p.start.z - player.start.z
      const d = dx * dx + dz * dz
      if (d < best) {
        best = d
        target = p
      }
    }
    if (!target) return { x: player.start.x, z: 0 }
    return target.start
  }

  /** defender_vision_cone — translucent cool-tone ~30° wedge anchored at
   *  the defender, pointing at the optional targetId (or the inferred
   *  offensive nearest neighbour). Static; tick adds no continuous
   *  pulse beyond the existing animatedRings layer. */
  private buildVisionCone(
    target: THREE.Group,
    phase: 'pre' | 'post',
    playerId: string,
    targetId?: string,
  ): void {
    const player = this.playerById(playerId)
    if (!player) return
    const facing =
      (targetId !== undefined ? this.endpointPoint(targetId) : null) ??
      this.inferFacing(player)
    const dx = facing.x - player.start.x
    const dz = facing.z - player.start.z
    const len = Math.hypot(dx, dz)
    const ux = len > 1e-3 ? dx / len : 0
    const uz = len > 1e-3 ? dz / len : 1

    const radius = 5.5
    const spread = Math.PI / 6 // ≈30°
    // CircleGeometry with a partial thetaLength gives us a flat pie
    // slice; we lift it to chest height and rotate to lie flat.
    const geom = new THREE.CircleGeometry(radius, 24, -spread / 2, spread)
    const mat = new THREE.MeshBasicMaterial({
      color: VISION_CONE_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.z = -Math.atan2(uz, ux) - Math.PI / 2
    mesh.position.set(player.start.x, VISION_CONE_HEIGHT, player.start.z)
    target.add(mesh)
    this.animatedFades.push({
      material: mat,
      targetOpacity: 0.32,
      durationMs: FADE_DEFENDER_BODY_MS,
      startMs: null,
      phase,
    })
  }

  /** defender_hip_arrow / defender_foot_arrow — short directional
   *  arrow at hip / foot height. `length` controls the visible size so
   *  the foot arrow reads as smaller. */
  private buildBodyArrow(
    target: THREE.Group,
    phase: 'pre' | 'post',
    playerId: string,
    height: number,
    color: string,
    length: number,
  ): void {
    const player = this.playerById(playerId)
    if (!player) return
    const facing = this.inferFacing(player)
    const dx = facing.x - player.start.x
    const dz = facing.z - player.start.z
    const lenAbs = Math.hypot(dx, dz)
    const ux = lenAbs > 1e-3 ? dx / lenAbs : 0
    const uz = lenAbs > 1e-3 ? dz / lenAbs : 1

    const shaftLen = length * 0.7
    const tipLen = length * 0.3
    const shaftGeom = new THREE.CylinderGeometry(0.07, 0.07, shaftLen, 10)
    const shaftMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    })
    const shaft = new THREE.Mesh(shaftGeom, shaftMat)
    shaft.position.set(
      player.start.x + ux * (shaftLen / 2 + 0.4),
      height,
      player.start.z + uz * (shaftLen / 2 + 0.4),
    )
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz))
    target.add(shaft)

    const tipGeom = new THREE.ConeGeometry(0.18, tipLen, 12)
    const tipMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    })
    const tip = new THREE.Mesh(tipGeom, tipMat)
    tip.position.set(
      player.start.x + ux * (shaftLen + tipLen * 0.5 + 0.4),
      height,
      player.start.z + uz * (shaftLen + tipLen * 0.5 + 0.4),
    )
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz))
    target.add(tip)

    for (const m of [shaftMat, tipMat]) {
      this.animatedFades.push({
        material: m,
        targetOpacity: 0.95,
        durationMs: FADE_DEFENDER_BODY_MS,
        startMs: null,
        phase,
      })
    }
  }

  /** defender_chest_line — thin horizontal line in front of the
   *  defender at chest height, indicating the chest plane. */
  private buildChestLine(
    target: THREE.Group,
    phase: 'pre' | 'post',
    playerId: string,
  ): void {
    const player = this.playerById(playerId)
    if (!player) return
    const facing = this.inferFacing(player)
    const dx = facing.x - player.start.x
    const dz = facing.z - player.start.z
    const lenAbs = Math.hypot(dx, dz)
    const ux = lenAbs > 1e-3 ? dx / lenAbs : 0
    const uz = lenAbs > 1e-3 ? dz / lenAbs : 1
    // Perpendicular to the facing direction.
    const px = -uz
    const pz = ux

    const lineWidth = 2.4
    const geom = new THREE.PlaneGeometry(lineWidth, 0.12)
    const mat = new THREE.MeshBasicMaterial({
      color: CHEST_LINE_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const line = new THREE.Mesh(geom, mat)
    line.position.set(
      player.start.x + ux * 0.6,
      CHEST_HEIGHT,
      player.start.z + uz * 0.6,
    )
    line.rotation.y = Math.atan2(pz, px)
    target.add(line)
    this.animatedFades.push({
      material: mat,
      targetOpacity: 0.85,
      durationMs: FADE_DEFENDER_BODY_MS,
      startMs: null,
      phase,
    })
  }

  /** defender_hand_in_lane — small bracket marker at the defender's
   *  hand height intruding into a passing lane. Visualised as a short
   *  vertical bar plus a horizontal arc piece. */
  private buildHandInLane(
    target: THREE.Group,
    phase: 'pre' | 'post',
    playerId: string,
  ): void {
    const player = this.playerById(playerId)
    if (!player) return
    const facing = this.inferFacing(player)
    const dx = facing.x - player.start.x
    const dz = facing.z - player.start.z
    const lenAbs = Math.hypot(dx, dz)
    const ux = lenAbs > 1e-3 ? dx / lenAbs : 0
    const uz = lenAbs > 1e-3 ? dz / lenAbs : 1
    const offset = 0.9 // hand reaches forward

    const barGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8)
    const barMat = new THREE.MeshBasicMaterial({
      color: HAND_LANE_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    })
    const bar = new THREE.Mesh(barGeom, barMat)
    bar.position.set(
      player.start.x + ux * offset,
      HAND_HEIGHT,
      player.start.z + uz * offset,
    )
    target.add(bar)

    const arcGeom = new THREE.RingGeometry(0.45, 0.55, 12, 1, -Math.PI / 4, Math.PI / 2)
    const arcMat = new THREE.MeshBasicMaterial({
      color: HAND_LANE_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const arc = new THREE.Mesh(arcGeom, arcMat)
    arc.position.set(
      player.start.x + ux * (offset + 0.3),
      HAND_HEIGHT,
      player.start.z + uz * (offset + 0.3),
    )
    arc.rotation.x = -Math.PI / 2
    arc.rotation.z = -Math.atan2(uz, ux)
    target.add(arc)

    for (const m of [barMat, arcMat]) {
      this.animatedFades.push({
        material: m,
        targetOpacity: 0.92,
        durationMs: FADE_DEFENDER_BODY_MS,
        startMs: null,
        phase,
      })
    }
  }

  /** open_space_region — translucent radial glow on the floor at the
   *  authored anchor. Subtle, brand-accent low alpha. */
  private buildOpenSpaceRegion(
    target: THREE.Group,
    phase: 'pre' | 'post',
    anchor: { x: number; z: number },
    radiusFt: number,
  ): void {
    const innerRadius = Math.max(0.2, radiusFt * 0.35)
    const outerRadius = Math.max(innerRadius + 0.5, radiusFt)
    const geom = new THREE.RingGeometry(innerRadius, outerRadius, 48)
    const mat = new THREE.MeshBasicMaterial({
      color: OPEN_SPACE_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(geom, mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(anchor.x, PATH_Y - 0.06, anchor.z)
    target.add(ring)

    const fillGeom = new THREE.CircleGeometry(innerRadius, 32)
    const fillMat = new THREE.MeshBasicMaterial({
      color: OPEN_SPACE_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const fill = new THREE.Mesh(fillGeom, fillMat)
    fill.rotation.x = -Math.PI / 2
    fill.position.set(anchor.x, PATH_Y - 0.05, anchor.z)
    target.add(fill)

    this.animatedFades.push({
      material: mat,
      targetOpacity: 0.55,
      durationMs: FADE_OPEN_SPACE_MS,
      startMs: null,
      phase,
    })
    this.animatedFades.push({
      material: fillMat,
      targetOpacity: 0.18,
      durationMs: FADE_OPEN_SPACE_MS,
      startMs: null,
      phase,
    })
  }

  /** help_pulse — pulsing halo around the named helper plus a label
   *  sprite (post-answer only). Pulse runs at ~1 Hz independently of
   *  the per-phase fade. The role color is tunable at the constants
   *  table above. */
  private buildHelpPulse(
    target: THREE.Group,
    phase: 'pre' | 'post',
    playerId: string,
    role: 'tag' | 'low_man' | 'nail' | 'stunter' | 'overhelp',
  ): void {
    const player = this.playerById(playerId)
    if (!player) return
    const color = HELP_PULSE_COLORS[role]

    const ringGeom = new THREE.RingGeometry(1.45, 1.75, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeom, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(player.start.x, PATH_Y + 0.02, player.start.z)
    target.add(ring)

    // Pre-answer is gentler (lower base opacity); post-answer carries
    // the full role label and a stronger pulse.
    const baseOpacity = phase === 'post' ? 0.7 : 0.4
    this.animatedFades.push({
      material: ringMat,
      targetOpacity: baseOpacity,
      durationMs: FADE_DEFENDER_BODY_MS,
      startMs: null,
      phase,
    })
    this.animatedHelpPulses.push({
      halo: ring,
      haloMaterial: ringMat,
      baseOpacity,
    })

    if (phase === 'post') {
      const sprite = this.buildLabelSprite(role.replace('_', ' '))
      sprite.position.set(player.start.x, 1.9, player.start.z)
      target.add(sprite)
      const mat = sprite.material as THREE.SpriteMaterial
      mat.transparent = true
      mat.opacity = 0
      this.animatedFades.push({
        material: mat,
        targetOpacity: 1,
        durationMs: FADE_DEFENDER_BODY_MS,
        startMs: null,
        phase,
      })
    }
  }

  /** drive_cut_preview — dashed-feel tube along the authored path
   *  that "builds out" via opacity ramp; an arrowhead pops at the end
   *  point on completion. */
  private buildDriveCutPreview(
    target: THREE.Group,
    phase: 'pre' | 'post',
    playerId: string,
    path: ReadonlyArray<{ x: number; z: number }>,
  ): void {
    if (path.length < 2) return
    const player = this.playerById(playerId)
    if (!player) return

    const points = path.map((p) => new THREE.Vector3(p.x, PATH_Y + 0.05, p.z))
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    const tubeGeom = new THREE.TubeGeometry(curve, Math.max(32, points.length * 16), 0.13, 12, false)
    const tubeMat = new THREE.MeshBasicMaterial({
      color: DRIVE_PREVIEW_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    })
    const tube = new THREE.Mesh(tubeGeom, tubeMat)
    target.add(tube)

    // Arrowhead at the final segment.
    const last = points[points.length - 1]!
    const prev = points[points.length - 2]!
    const dx = last.x - prev.x
    const dz = last.z - prev.z
    const len = Math.hypot(dx, dz)
    const ux = len > 1e-3 ? dx / len : 0
    const uz = len > 1e-3 ? dz / len : 1
    const arrowGeom = new THREE.ConeGeometry(0.45, 1.2, 16)
    const arrowMat = new THREE.MeshBasicMaterial({
      color: DRIVE_PREVIEW_COLOR,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    })
    const arrow = new THREE.Mesh(arrowGeom, arrowMat)
    arrow.position.set(last.x, PATH_Y + 0.3, last.z)
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz))
    arrow.visible = false
    target.add(arrow)

    this.animatedBuilds.push({
      tubeMaterial: tubeMat,
      tubeTargetOpacity: 0.95,
      arrowhead: arrow,
      arrowheadMaterial: arrowMat,
      arrowheadTargetOpacity: 1,
      durationMs: FADE_DRIVE_PREVIEW_MS,
      startMs: null,
      phase,
    })
  }

  /** passing_lane_open / passing_lane_blocked — fade-in tube between
   *  two endpoints (player ids or the literal `'ball'`). */
  private buildPassingLane(
    target: THREE.Group,
    phase: 'pre' | 'post',
    fromId: string,
    toId: string,
    color: string,
    durationMs: number,
    targetOpacity: number,
  ): void {
    const from = this.endpointPoint(fromId)
    const to = this.endpointPoint(toId)
    if (!from || !to) return
    const start = new THREE.Vector3(from.x, PATH_Y + 0.05, from.z)
    const end = new THREE.Vector3(to.x, PATH_Y + 0.05, to.z)
    const geom = new THREE.TubeGeometry(
      new THREE.LineCurve3(start, end),
      32,
      0.11,
      10,
      false,
    )
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    })
    const tube = new THREE.Mesh(geom, mat)
    target.add(tube)
    this.animatedFades.push({
      material: mat,
      targetOpacity,
      durationMs,
      startMs: null,
      phase,
    })
  }

  /** label — small text caption at a court spot. Reuses the existing
   *  canvas-sprite renderer; opacity fades in like any defender cue. */
  private buildAuthoredLabel(
    target: THREE.Group,
    phase: 'pre' | 'post',
    anchor: { x: number; z: number },
    text: string,
  ): void {
    const sprite = this.buildLabelSprite(text)
    sprite.position.set(anchor.x, 0.06, anchor.z)
    const mat = sprite.material as THREE.SpriteMaterial
    mat.transparent = true
    mat.opacity = 0
    target.add(sprite)
    this.animatedFades.push({
      material: mat,
      targetOpacity: 1,
      durationMs: FADE_DEFENDER_BODY_MS,
      startMs: null,
      phase,
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

function clamp01(v: number): number {
  if (v <= 0) return 0
  if (v >= 1) return 1
  return v
}

function easeOutCubic(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const inv = 1 - u
  return 1 - inv * inv * inv
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
