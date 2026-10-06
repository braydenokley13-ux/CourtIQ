/** Pure basketball world values. Metres/seconds; x across the court, z from the attacked baseline. */
export type PlayerId = string
export type RoleId = string
export type ThreatId = string
export interface Point2 {
  x: number
  z: number
}
export interface Point3 extends Point2 {
  y: number
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
export interface PolicyActivation {
  ruleId: string
  t: number
  observedAt: number
  evidence: string[]
}
import type { ExecutionInput, ParameterValues, PolicyEvaluation } from './program'
export type { ExecutionInput, ParameterValues, PolicyEvaluation } from './program'
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
  offensivePlayerId?: PlayerId
  episodeId?: string
  observedAt?: number
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
  kind: 'keep' | 'pass'
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
  stage: string
  tick: number
  policyEvaluations: PolicyEvaluation[]
  parameterValues: ParameterValues
  policyActivations?: PolicyActivation[]
  screenEngagedAt?: number
}
export interface WorldEvent {
  id: string
  t: number
  type:
    | 'counter'
    | 'screen'
    | 'read'
    | 'pass'
    | 'catch'
    | 'shot'
    | 'tag'
    | 'transfer'
    | 'intervention'
    | 'contact'
    | 'missed-catch'
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

export interface ExecutionTrace {
  modelVersion: string
  problemVersion: string
  input: ExecutionInput
  frames: WorldFrame[]
  events: WorldEvent[]
  decisions: ReadDecision[]
  diagnostics: SimulationDiagnostics
}
export type SimulationConfig = ExecutionInput
export type ProblemDefinition = import('./program').ContentProgram
