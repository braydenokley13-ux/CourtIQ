/**
 * Normalised in-memory representation of a scenario scene that the 3D
 * components consume. Sourced either from an authored `scene` block or
 * synthesised from the legacy 2D `court_state`.
 */

import type { CourtState } from '@/components/court'
import { COURT, projectLegacyPoint, type CourtPoint } from './coords'
import { resolveFreezeAtMs, sceneSchema, type FreezeMarker } from './schema'
import { getPresetForConcept } from './presets'
import { buildTimeline } from './timeline'

export type SceneTeam = 'offense' | 'defense'

export interface ScenePlayer {
  id: string
  team: SceneTeam
  role: string
  /** Marker label, defaults to a shortened role/team. */
  label?: string
  start: CourtPoint
  /** True for the player the user controls or reads from. */
  isUser?: boolean
  /** True for the offensive player who currently has the ball. */
  hasBall?: boolean
  /** Optional override color. */
  color?: string
}

export interface SceneBall {
  start: CourtPoint
  /** Player id who is holding the ball at scene start. */
  holderId?: string
}

export type SceneMovementKind =
  | 'cut'
  | 'closeout'
  | 'rotation'
  | 'lift'
  | 'drift'
  | 'pass'
  | 'drive'
  | 'stop_ball'
  // Phase B additions — see `apps/web/lib/scenario3d/schema.ts` for the
  // matching Zod enum. Renderer behaviour is unchanged at this phase.
  | 'back_cut'
  | 'baseline_sneak'
  | 'skip_pass'
  | 'rip'
  | 'jab'

export interface SceneMovement {
  id: string
  /** Player id, or "ball" for a pass. */
  playerId: string
  kind: SceneMovementKind
  to: CourtPoint
  /** ms before this movement starts after replay begins. */
  delayMs?: number
  /** ms the movement takes to play. */
  durationMs?: number
  /** Optional caption shown while playing. */
  caption?: string
}

export type SceneCameraPreset =
  | 'teaching_angle'
  | 'defense'
  | 'top_down'
  // Phase B addition. Runtime mapping for this preset is wired in
  // Phase E/G; today the canvas falls back to its existing framing.
  | 'passer_side_three_quarter'

export interface Scene3D {
  /** Stable identifier for memoising frames. */
  id: string
  type?: string
  court: 'half' | 'full'
  camera: SceneCameraPreset
  players: ScenePlayer[]
  ball: SceneBall
  movements: SceneMovement[]
  answerDemo: SceneMovement[]
  /**
   * Phase B — resolved freeze cue, in ms from the start of `movements`.
   * `null` means "no freeze authored" (renderer treats this as "freeze at
   * end of `movements`", per Section 4.4). Authors set this via the
   * `freezeMarker` field on the input scene; both `atMs` and
   * `beforeMovementId` forms collapse here at scene load.
   */
  freezeAtMs: number | null
  /** True if the scene was synthesised from legacy court_state. */
  synthetic: boolean
}

interface AuthoredScene {
  type?: string
  court?: 'half' | 'full'
  camera?: Scene3D['camera']
  players?: Array<{
    id: string
    team: SceneTeam
    role: string
    label?: string
    start: CourtPoint
    isUser?: boolean
    hasBall?: boolean
    color?: string
  }>
  ball?: SceneBall
  movements?: SceneMovement[]
  answerDemo?: SceneMovement[]
  freezeMarker?: FreezeMarker
}

interface SourceScenario {
  id: string
  court_state?: CourtState | null
  scene?: unknown
  /** The id of the player marked as the user (defaults to "you"). */
  user_role?: string
  /** Concept tags from the scenario; used to pick a default preset. */
  concept_tags?: string[]
}

/**
 * Returns a normalised Scene3D for a scenario, in preference order:
 *   1. Authored `scene` block (validated by Zod).
 *   2. A concept-specific preset (one of the launch concepts).
 *   3. A synth scene built from the legacy `court_state` projection.
 *
 * Always returns a valid Scene3D even if the source data is malformed —
 * scene rendering is the user-facing experience and must never throw.
 */
export function buildScene(scenario: SourceScenario): Scene3D {
  const id = scenario.id || 'scene'

  if (scenario.scene != null) {
    const parsed = sceneSchema.safeParse(scenario.scene)
    if (parsed.success) {
      return sanitiseScene(normaliseAuthoredScene(id, parsed.data as AuthoredScene))
    }
    if (typeof console !== 'undefined') {
      console.warn(`[scenario3d] invalid scene for "${id}":`, parsed.error.flatten())
    }
  }

  const conceptTags = scenario.concept_tags ?? []
  if (conceptTags.length > 0) {
    const preset = getPresetForConcept(id, conceptTags)
    if (preset) return sanitiseScene(preset)
  }

  if (scenario.court_state) {
    const synth = synthesiseSceneFromCourtState({ ...scenario, id, court_state: scenario.court_state })
    if (synth.players.length > 0) {
      return sanitiseScene(synth)
    }
  }

  // Last-resort default scene so the renderer always has something to show.
  return sanitiseScene(createDefaultScene(id))
}

function normaliseAuthoredScene(id: string, scene: AuthoredScene): Scene3D {
  const players: ScenePlayer[] =
    scene.players?.map((p) => ({
      id: p.id,
      team: p.team,
      role: p.role,
      label: p.label,
      start: p.start,
      isUser: !!p.isUser,
      hasBall: !!p.hasBall,
      color: p.color,
    })) ?? []
  const movements = scene.movements ?? []
  const freezeAtMs = resolveFreezeFromAuthored(players, scene.ball, movements, scene.freezeMarker)
  return {
    id,
    type: scene.type,
    court: scene.court ?? 'half',
    camera: scene.camera ?? 'teaching_angle',
    players,
    ball: scene.ball ?? { start: { x: 0, z: 0 } },
    movements,
    answerDemo: scene.answerDemo ?? [],
    freezeAtMs,
    synthetic: false,
  }
}

/**
 * Resolves an authored `freezeMarker` to an absolute `freezeAtMs`. Builds
 * a throwaway timeline so the `beforeMovementId` form picks up the same
 * `startMs` the renderer will sample at runtime. Defensive against
 * malformed input — returns `null` if no freeze can be resolved.
 */
function resolveFreezeFromAuthored(
  players: ScenePlayer[],
  ball: SceneBall | undefined,
  movements: SceneMovement[],
  marker: FreezeMarker | undefined,
): number | null {
  if (!marker) return null
  if (marker.kind === 'atMs') return marker.atMs
  // beforeMovementId — resolve via buildTimeline so chained movements
  // share the same startMs math the runtime uses.
  const proxyScene: Scene3D = {
    id: 'freeze-resolution',
    court: 'half',
    camera: 'teaching_angle',
    players,
    ball: ball ?? { start: { x: 0, z: 0 } },
    movements,
    answerDemo: [],
    freezeAtMs: null,
    synthetic: false,
  }
  const timeline = buildTimeline(proxyScene, movements)
  return resolveFreezeAtMs(
    marker,
    timeline.movements.map((m) => ({ id: m.id, startMs: m.startMs })),
  )
}

function synthesiseSceneFromCourtState(
  scenario: SourceScenario & { court_state: CourtState },
): Scene3D {
  const { court_state } = scenario
  const offenseList = Array.isArray(court_state.offense) ? court_state.offense : []
  const defenseList = Array.isArray(court_state.defense) ? court_state.defense : []
  const ballLoc = court_state.ball_location ?? { x: 250, y: 200 }

  const offense: ScenePlayer[] = offenseList
    .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
    .map((p) => {
      const start = projectLegacyPoint(p.x, p.y)
      const isUser =
        p.id === 'you' || scenario.user_role === p.role || p.id === scenario.user_role
      return {
        id: p.id ?? `o_${Math.random().toString(36).slice(2, 7)}`,
        team: 'offense',
        role: p.role ?? 'offense',
        label: p.label ?? (isUser ? 'You' : roleLabel(p.role)),
        start,
        isUser,
        hasBall: !!p.hasBall,
      }
    })
  const defense: ScenePlayer[] = defenseList
    .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
    .map((p) => {
      const start = projectLegacyPoint(p.x, p.y)
      const isUser =
        p.id === 'you' || scenario.user_role === p.role || p.id === scenario.user_role
      return {
        id: p.id ?? `d_${Math.random().toString(36).slice(2, 7)}`,
        team: 'defense',
        role: p.role ?? 'defense',
        label: p.label ?? (isUser ? 'You' : roleLabel(p.role)),
        start,
        isUser,
        hasBall: false,
      }
    })

  const ballPoint = projectLegacyPoint(
    typeof ballLoc.x === 'number' ? ballLoc.x : 250,
    typeof ballLoc.y === 'number' ? ballLoc.y : 200,
  )
  const holder = offense.find((o) => o.hasBall)

  return {
    id: scenario.id,
    court: 'half',
    camera: 'teaching_angle',
    players: [...offense, ...defense],
    ball: { start: ballPoint, holderId: holder?.id },
    movements: [],
    answerDemo: [],
    freezeAtMs: null,
    synthetic: true,
  }
}

/**
 * "Hero" default scene used when no source data produces a valid scene.
 * Populates the court with five offensive and five defensive players plus
 * the ball so the canvas always reads as basketball — never an empty
 * rectangle. The user is the wing offensive player by default.
 */
export function createDefaultScene(id = 'default_3d_scene'): Scene3D {
  return {
    id,
    court: 'half',
    camera: 'teaching_angle',
    players: createDefaultPlayers(),
    ball: { start: { x: 0, z: 22 }, holderId: 'you' },
    movements: [],
    answerDemo: [],
    freezeAtMs: null,
    synthetic: true,
  }
}

/**
 * Final defensive pass: removes NaN/undefined coordinates, clamps player
 * starts to the half-court, dedupes player ids, drops movements that
 * reference unknown players, and guarantees at least one valid player.
 */
function sanitiseScene(scene: Scene3D): Scene3D {
  const seen = new Set<string>()
  const players: ScenePlayer[] = []
  for (const p of scene.players) {
    if (!p || !p.id) continue
    if (seen.has(p.id)) continue
    seen.add(p.id)
    players.push({
      ...p,
      start: clampPoint(safePoint(p.start)),
    })
  }

  if (players.length === 0) {
    players.push(...createDefaultPlayers())
  }

  // Cap "isUser" to a single player.
  let userSeen = false
  for (const p of players) {
    if (p.isUser) {
      if (userSeen) p.isUser = false
      else userSeen = true
    }
  }

  const validIds = new Set(players.map((p) => p.id))
  const validMovementIds = new Set<string>([...validIds, 'ball'])

  const ballHolder = scene.ball?.holderId
  const ball: SceneBall = {
    start: clampPoint(safePoint(scene.ball?.start)),
    holderId: ballHolder && validIds.has(ballHolder) ? ballHolder : undefined,
  }

  const cleanMovements = (list: SceneMovement[] | undefined): SceneMovement[] => {
    if (!Array.isArray(list)) return []
    return list
      .filter((m) => m && typeof m.id === 'string' && validMovementIds.has(m.playerId))
      .map((m) => ({
        ...m,
        to: clampPoint(safePoint(m.to)),
        delayMs: clampDuration(m.delayMs ?? 0, 0, 10_000),
        durationMs: clampDuration(m.durationMs ?? 700, 1, 8_000),
      }))
  }

  return {
    ...scene,
    players,
    ball,
    movements: cleanMovements(scene.movements),
    answerDemo: cleanMovements(scene.answerDemo),
  }
}

function createDefaultPlayers(): ScenePlayer[] {
  return [
    // Offense — "You" is the ball handler at the top of the key.
    { id: 'you', team: 'offense', role: 'ball_handler', label: 'You', start: { x: 0, z: 22 }, isUser: true, hasBall: true },
    { id: 'o_wing', team: 'offense', role: 'wing', label: 'SG', start: { x: 18, z: 10 } },
    { id: 'o_corner', team: 'offense', role: 'corner', label: 'SF', start: { x: -22, z: 1 } },
    { id: 'o_slot', team: 'offense', role: 'slot', label: 'PF', start: { x: -9, z: 17 } },
    { id: 'o_post', team: 'offense', role: 'post', label: 'C', start: { x: 5, z: 4 } },
    // Defense
    { id: 'd_user', team: 'defense', role: 'on_ball', label: 'D', start: { x: 0, z: 24 } },
    { id: 'd_wing', team: 'defense', role: 'wing_d', label: 'D', start: { x: 17, z: 12 } },
    { id: 'd_corner', team: 'defense', role: 'corner_d', label: 'D', start: { x: -20, z: 3 } },
    { id: 'd_slot', team: 'defense', role: 'slot_d', label: 'D', start: { x: -9, z: 19 } },
    { id: 'd_post', team: 'defense', role: 'post_d', label: 'D', start: { x: 6, z: 6 } },
  ]
}

function safePoint(point: CourtPoint | undefined | null): CourtPoint {
  if (!point) return { x: 0, z: 0 }
  const x = Number.isFinite(point.x) ? point.x : 0
  const z = Number.isFinite(point.z) ? point.z : 0
  return { x, z }
}

function clampPoint(point: CourtPoint): CourtPoint {
  return {
    x: clamp(point.x, -COURT.halfWidthFt, COURT.halfWidthFt),
    z: clamp(point.z, 0, COURT.halfLengthFt),
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function clampDuration(ms: number, min: number, max: number): number {
  if (!Number.isFinite(ms)) return min
  return Math.max(min, Math.min(max, Math.round(ms)))
}

function roleLabel(role?: string): string | undefined {
  if (!role) return undefined
  return role
    .split('_')
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3)
}
