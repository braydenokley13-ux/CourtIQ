import type {
  PlayerId,
  RoleId,
  ThreatId,
  Point2,
  ModelAssumptions,
  Responsibility,
  WorldFrame,
  ExecutionTrace,
} from '../../domain/types'
export type { PlayerId, RoleId, ThreatId, Point2, ModelAssumptions } from '../../domain/types'
export type CoverageId = 'drop' | 'switch' | 'blitz' | 'hedge' | 'ice' | 'custom'
export type CounterId = 'auto' | 'roll' | 'reject' | 'pop' | 'slip' | 'lift' | 'skip' | 'extra' | 'short-roll'

/** Bounded coach-authored sentences. Roles are resolved by the problem, so a
 * saved response cannot accidentally assign an offensive player as a defender. */
export type CoachRule =
  | { kind: 'roller-depth'; depth: number; response: 'low-man-tags' | 'big-recovers' }
  | { kind: 'lift-rise'; rise: number; response: 'stay-with-lift' | 'x-out' }

export interface TeamAnswer {
  coverage: CoverageId
  poa: 'over' | 'under'
  bigDepth: number
  tag: boolean
  /** 0 stays close to own receiver; 1 commits to the roller. */
  tagDepth: number
  backside: 'x-out' | 'stay'
  rotationTiming: 'early' | 'on-pass'
  recovery: 'on-pass' | 'roller-secured'
  /** Optional for portable legacy answers. One rule per supported observation. */
  coachRules?: CoachRule[]
}
/** Bounded attack intent. Flags permit a response when its observed trigger holds. */
export interface OpponentStrategy {
  screenAngle: number
  liftDelay: number
  liftWidth: number
  reject: boolean
  rescreen: boolean
  shortRoll: boolean
}
export type SituationRole = keyof HighPnrRecipeDefinition['roles']
/** Small serializable condition algebra; observations never include future frames. */
export type PolicyCondition =
  | { kind: 'all' | 'any'; conditions: PolicyCondition[] }
  | { kind: 'action-present'; action: OffensiveAction['kind'] }
  | { kind: 'screen-used' }
  | { kind: 'not'; condition: PolicyCondition }
  | { kind: 'distance'; a: SituationRole; b: SituationRole; below: number }
  | { kind: 'coordinate'; role: SituationRole; axis: 'x' | 'z' | 'vx' | 'vz'; below?: number; above?: number }
  | { kind: 'relative'; a: SituationRole; b: SituationRole; axis: 'x' | 'z'; below?: number; above?: number }
  | { kind: 'responsibility'; role: SituationRole; task: Responsibility['kind'] }
  | { kind: 'possession'; role: SituationRole }
  | { kind: 'enabled'; key: 'reject' | 'rescreen' | 'shortRoll' }
  | { kind: 'activated'; ruleId: string; after?: number }
export interface PolicyMotion {
  role: SituationRole
  kind: OffensiveAction['kind']
  /** Explicit court point, or observed role position plus offset. */
  target: Point2 | { relativeTo: SituationRole; offset: Point2 }
  speed: number
  from?: number
  until?: number
}
export interface BehaviorRule {
  id: string
  label: string
  earliest: number
  latest?: number
  priority: number
  when: PolicyCondition
  motions: PolicyMotion[]
  /** Counter graph edges. Exclusions and once-only activation bound all loops. */
  excludes?: string[]
  deferReadFor?: number
}
export interface DefensiveBehaviorRule {
  id: string
  label: string
  when?: PolicyCondition
  answer?: Partial<TeamAnswer>
  /** Replaces these defenders' current obligations, never their positions. */
  assignments: {
    defender: SituationRole
    offense: SituationRole
    threat: ThreatId
    kind: Responsibility['kind']
    gap: number
    priority: number
    target?: 'tag-depth'
  }[]
}
export type Intervention =
  | { id: string; at: number; kind: 'answer'; patch: Partial<TeamAnswer> }
  | { id: string; at: number; kind: 'opponent'; patch: Partial<OpponentStrategy> }
  | {
      id: string
      at: number
      kind: 'move'
      playerId: PlayerId
      target: Point2
      until?: number
      untilTrigger?: 'ball-leaves' | 'big-secured'
    }

export interface LabConfig {
  problemId: string
  seed: number
  counter: CounterId
  answer: TeamAnswer
  assumptions: ModelAssumptions
  interventions: Intervention[]
  /** Initial positions are a different experiment from a timed movement cue. */
  startingPositions?: Partial<Record<PlayerId, Point2>>
  screenAngle?: number
  /** Absent in legacy configurations; present activates observed opponent policies. */
  opponent?: OpponentStrategy
  /** Coach-supplied athletes. `speed` multiplies the height-derived top speed, `lateral` is the absolute share of
   * forward speed available sideways/backward (0.4 to 1.1), `height` (m) replaces the roster height and with it
   * reach and contest radius. Bounds: speed 0.6 to 1.4, lateral 0.4 to 1.1, height 1.5 to 2.3. */
  personnel?: Partial<Record<PlayerId, { speed?: number; lateral?: number; height?: number }>>
}

export interface ProblemPlayer {
  id: PlayerId
  team: 'offense' | 'defense'
  role: RoleId
  number: number
  height: number
  start: Point2
  /** Optional capability overrides (multipliers); defaults derive from height. */
  speed?: number
  acceleration?: number
  lateral?: number
  reach?: number
}
export interface OffensiveAction {
  id: string
  kind: 'screen' | 'drive' | 'roll' | 'pop' | 'relocate' | 'hold'
  playerId: PlayerId
  from: number
  target: Point2
  speed?: number
  counter?: CounterId[]
}
export interface ReadNode {
  id: string
  actorId: PlayerId
  earliest: number
  /** Optional authored evaluation checkpoint after options become feasible. */
  decisionAt?: number
  trigger: 'screen-used' | 'catch' | 'penetration'
  when?: PolicyCondition
  options: ThreatId[]
  continuations: Partial<Record<ThreatId, string>>
}
export interface HighPnrRecipeDefinition {
  id: string
  version: string
  title: string
  description: string
  players: ProblemPlayer[]
  actions: OffensiveAction[]
  reads: ReadNode[]
  roles: {
    ballhandler: PlayerId
    screener: PlayerId
    weakCorner: PlayerId
    weakLift: PlayerId
    strongCorner: PlayerId
    poa: PlayerId
    big: PlayerId
    lowMan: PlayerId
    backside: PlayerId
    strongSide: PlayerId
  }
  stressAt: number
  offenseRules?: BehaviorRule[]
  defenseRules?: DefensiveBehaviorRule[]
}

export interface LabWorldFrame extends WorldFrame {
  answer: TeamAnswer
}
export interface SimulationResult extends ExecutionTrace {
  config: LabConfig
  frames: LabWorldFrame[]
}
export type CameraId = 'broadcast' | 'sideline' | 'baseline' | 'overhead' | 'coach' | 'player'
export type XRayLayer = 'off' | 'responsibilities' | 'windows' | 'recovery' | 'bodies'

export type {
  WorldFrame,
  PlayerState,
  BallFlight,
  BallState,
  ReadDecision,
  ReadCandidate,
  Responsibility,
  WorldEvent,
  SimulationDiagnostics,
  Point3,
  ThreatOption,
  PolicyActivation,
} from '../../domain/types'
