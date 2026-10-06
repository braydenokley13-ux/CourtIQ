/** Basketball inputs and physical snapshots. Metres, seconds; x across court,
 * z from attacked baseline, y true height. Presentation never owns physics. */
export type PlayerId = 'O1' | 'O2' | 'O3' | 'O4' | 'O5' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5'
export type RoleId = 'ballhandler' | 'strong-corner' | 'weak-corner' | 'weak-lift' | 'screener' | 'poa' | 'strong-side' | 'low-man' | 'backside' | 'big'
export type CoverageId = 'drop' | 'switch' | 'blitz' | 'hedge' | 'ice' | 'custom'
export type CounterId = 'auto' | 'roll' | 'reject' | 'pop' | 'slip' | 'lift' | 'skip' | 'extra' | 'short-roll'
export type ThreatId = 'drive' | 'roll' | 'pop' | 'corner' | 'lift' | 'strong'
export interface Point2 { x: number; z: number }
export interface Point3 extends Point2 { y: number }

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
export interface ModelAssumptions {
  dt: number
  duration: number
  maxSpeed: number
  acceleration: number
  reactionDelay: number
  passSpeed: number
  ballRadius: number
  bodyRadius: number
  contestRadius: number
  turnRate: number
  gatherTime: number
  readInterval: number
  gravity: number
  releaseHeight: number
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
export type SituationRole = keyof ProblemDefinition['roles']
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
  assignments: { defender: SituationRole; offense: SituationRole; threat: ThreatId; kind: Responsibility['kind']; gap: number; priority: number; target?: 'tag-depth' }[]
}
export interface PolicyActivation { ruleId: string; t: number; observedAt: number; evidence: string[] }
export type Intervention =
  | { id: string; at: number; kind: 'answer'; patch: Partial<TeamAnswer> }
  | { id: string; at: number; kind: 'opponent'; patch: Partial<OpponentStrategy> }
  | { id: string; at: number; kind: 'move'; playerId: PlayerId; target: Point2; until?: number; untilTrigger?: 'ball-leaves' | 'big-secured' }

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
}
export type SimulationConfig = LabConfig

export interface PlayerPose {
  stance: 'ready' | 'run' | 'defend' | 'screen' | 'dribble' | 'pass' | 'catch' | 'shoot'
  hands: number
  phase: number
  jump: number
}
export interface PlayerState extends Point2 {
  id: PlayerId
  team: 'offense' | 'defense'
  role: RoleId
  number: number
  height: number
  /** Resolved physical profile multipliers (see capability.ts). Absent means a neutral athlete. */
  speed?: number
  acceleration?: number
  lateral?: number
  contest?: number
  vx: number
  vz: number
  yaw: number
  pose: PlayerPose
}
export interface BallFlight {
  from: PlayerId
  to: PlayerId | null
  start: number
  end: number
  a: Point3
  b: Point3
  kind: 'pocket' | 'lob' | 'skip' | 'chest' | 'shot'
}
export interface BallState extends Point3 {
  phase: 'handle' | 'pass' | 'gather' | 'shot' | 'dead'
  owner: PlayerId | null
  receiver: PlayerId | null
  flight: BallFlight | null
}
export interface Responsibility {
  id: string
  defenderId: PlayerId
  threatId: ThreatId
  offensivePlayerId: PlayerId
  kind: 'contain' | 'chase' | 'tag' | 'guard' | 'closeout' | 'recover' | 'switch' | 'split'
  target: Point2
  priority: number
  trigger: string
  /** The observed content/coach rule that produced this obligation, if any. */
  sourceRuleId?: string
  startedAt: number
  influenceRadius: number
  availableAt?: number
  dueAt?: number
}
export interface ThreatOption {
  id: ThreatId
  playerId: PlayerId
  kind: ThreatId
  target: Point2
  /** Basketball graph feasibility, independent of defensive openness. */
  available: boolean
  passClearance: number | null
  influenceDistance: number
  responsibleDefenderId?: PlayerId
  opportunityDeadline?: number
  timeToRelease?: number
  /** Earliest permitted read, including active action/catch commitments. */
  readAvailableAt?: number
}
export interface WorldFrame {
  t: number
  players: PlayerState[]
  ball: BallState
  responsibilities: Responsibility[]
  options: ThreatOption[]
  answer: TeamAnswer
  stage: string
  policyActivations?: PolicyActivation[]
  screenEngagedAt?: number
}
export interface WorldEvent {
  id: string
  t: number
  type: 'counter' | 'screen' | 'read' | 'pass' | 'catch' | 'shot' | 'tag' | 'transfer' | 'intervention' | 'contact' | 'missed-catch'
  label: string
  playerId?: PlayerId
  targetId?: PlayerId
  threatId?: ThreatId
  details?: string
  interventionId?: string
}
export interface ReadCandidate {
  threatId: ThreatId
  playerId: PlayerId
  available: boolean
  clearance: number
  arrivalGap: number
  value: number
}
export interface ReadDecision {
  t: number
  nodeId: string
  actorId: PlayerId
  selected: ThreatId | 'hold'
  reason: string
  candidates: ReadCandidate[]
}
export interface SimulationDiagnostics {
  contactCount: number
  maxCatchError: number
  boundaryBreach: boolean
  warnings: string[]
  /** First unresolved ball/body interaction. No deflection or turnover is invented. */
  flightStops?: FlightStop[]
  missedCatchCount?: number
}
export interface FlightStop {
  flightStart: number
  at: number
  playerId: PlayerId
  part: string
  ball: Point3
  point: Point3
  clearance: number
}
export interface SimulationResult {
  modelVersion: string
  problemVersion: string
  config: LabConfig
  frames: WorldFrame[]
  events: WorldEvent[]
  decisions: ReadDecision[]
  diagnostics: SimulationDiagnostics
}

/** Content uses basketball actions, read nodes and continuations. No renderer data. */
export interface ProblemPlayer {
  id: PlayerId; team: 'offense' | 'defense'; role: RoleId; number: number; height: number; start: Point2
  /** Optional capability overrides (multipliers); defaults derive from height. */
  speed?: number; acceleration?: number; lateral?: number; reach?: number
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
export interface ProblemDefinition {
  id: string
  version: string
  title: string
  description: string
  players: ProblemPlayer[]
  actions: OffensiveAction[]
  reads: ReadNode[]
  roles: { ballhandler: PlayerId; screener: PlayerId; weakCorner: PlayerId; weakLift: PlayerId; strongCorner: PlayerId; poa: PlayerId; big: PlayerId; lowMan: PlayerId; backside: PlayerId; strongSide: PlayerId }
  stressAt: number
  offenseRules?: BehaviorRule[]
  defenseRules?: DefensiveBehaviorRule[]
}

export type CameraId = 'broadcast' | 'sideline' | 'baseline' | 'overhead' | 'coach' | 'player'
export type XRayLayer = 'off' | 'responsibilities' | 'windows' | 'recovery' | 'bodies'
