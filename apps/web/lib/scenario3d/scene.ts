/**
 * Normalised in-memory representation of a scenario scene that the 3D
 * components consume. Sourced either from an authored `scene` block or
 * synthesised from the legacy 2D `court_state`.
 */

import type { CourtState } from '@/components/court'
import { COURT, projectLegacyPoint, type CourtPoint } from './coords'
import { sceneSchema } from './schema'
import { getPresetForConcept } from './presets'

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

export interface SceneMovement {
  id: string
  /** Player id, or "ball" for a pass. */
  playerId: string
  kind: 'cut' | 'closeout' | 'rotation' | 'lift' | 'drift' | 'pass' | 'drive' | 'stop_ball'
  to: CourtPoint
  /** ms before this movement starts after replay begins. */
  delayMs?: number
  /** ms the movement takes to play. */
  durationMs?: number
  /** Optional caption shown while playing. */
  caption?: string
}

export interface Scene3D {
  /** Stable identifier for memoising frames. */
  id: string
  type?: string
  court: 'half' | 'full'
  camera: 'teaching_angle' | 'defense' | 'top_down'
  players: ScenePlayer[]
  ball: SceneBall
  movements: SceneMovement[]
  answerDemo: SceneMovement[]
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
  return {
    id,
    type: scene.type,
    court: scene.court ?? 'half',
    camera: scene.camera ?? 'teaching_angle',
    players,
    ball: scene.ball ?? { start: { x: 0, z: 0 } },
    movements: scene.movements ?? [],
    answerDemo: scene.answerDemo ?? [],
    synthetic: false,
  }
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
    synthetic: true,
  }
}

/**
 * Minimal default scene used as a last resort when no source data can
 * produce a valid scene. The renderer always has something to draw.
 */
export function createDefaultScene(id = 'default_3d_scene'): Scene3D {
  return {
    id,
    court: 'half',
    camera: 'teaching_angle',
    players: createDefaultPlayers(),
    ball: { start: { x: 0, z: 18 }, holderId: 'you' },
    movements: [],
    answerDemo: [],
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
    {
      id: 'you',
      team: 'offense',
      role: 'wing',
      label: 'You',
      start: { x: 0, z: 18 },
      isUser: true,
      hasBall: true,
    },
    {
      id: 'default_defender',
      team: 'defense',
      role: 'defender',
      label: 'DEF',
      start: { x: 2.8, z: 14 },
    },
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
