import type {
  BallFlight,
  ModelAssumptions,
  PlayerId,
  Point2,
  PolicyActivation,
  Responsibility,
  RoleId,
  ThreatId,
  WorldFrame,
} from './types'

export type ParameterValue = number | string | boolean
export type ParameterValues = Record<string, ParameterValue>
export interface ContentRef {
  id: string
  version: string
  hash: string
}
export type ActorRef = { player: PlayerId } | { role: RoleId } | { current: 'owner' | 'receiver' | 'reader' }
export type Scalar =
  | number
  | { parameter: string }
  | { coordinate: ActorRef; axis: 'x' | 'z' | 'vx' | 'vz' | 'height' }
  | { encounterTime: string }
  | { metric: 'passCount' | 'arrivalGap' | 'clearance' | 'time' | 'caughtAt' }
  | { op: 'add' | 'subtract' | 'multiply' | 'min' | 'max'; values: Scalar[] }
  | { op: 'clamp'; value: Scalar; min: Scalar; max: Scalar }
  | { op: 'sign'; value: Scalar; zero?: number }
  | { op: 'sin' | 'cos'; value: Scalar }
  | { choose: Condition; yes: Scalar; no: Scalar }
export type Target =
  | Point2
  | { actor: ActorRef; offset?: { x: Scalar; z: Scalar }; lead?: Scalar }
  | { towardRim: Target; gap: Scalar }
  | { mix: [Target, Target]; amount: Scalar }
  | { components: { x: Scalar; z: Scalar } }
  | { axes: { x: Target; z: Target } }
  | { rotate: Target; pivot: Point2; angle: Scalar }
  | { choose: Condition; yes: Target; no: Target }
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { compare: [Scalar, 'lt' | 'lte' | 'gt' | 'gte' | 'eq', Scalar] }
  | { parameter: string; equals: ParameterValue }
  | { distance: [ActorRef, ActorRef]; below: Scalar }
  | { possession: ActorRef }
  | { sameActor: [ActorRef, ActorRef] }
  | { ballPhase: WorldFrame['ball']['phase'][] }
  | { actionActive: string }
  | { encountered: string }
  | { activated: string; after?: Scalar }
  | { obligation: ActorRef; kind: Responsibility['kind'] }
  | { memory: string; equals?: boolean }
export interface ParameterDefinition {
  id: string
  default: ParameterValue
  min?: number
  max?: number
  choices?: ParameterValue[]
}
export interface ProgramPlayer {
  id: PlayerId
  team: 'offense' | 'defense'
  role: RoleId
  number: number
  height: number
  start: Point2
  speed?: number
  acceleration?: number
  lateral?: number
  reach?: number
}
export interface MotionAction {
  id: string
  actor: ActorRef
  kind: 'screen' | 'drive' | 'roll' | 'pop' | 'relocate' | 'hold'
  from: number
  until?: number
  when?: Condition
  target: Target
  speed: number
  priority?: number
  delayedUntil?: { activation: string; delay: Scalar }
  screen?: { beneficiary: ActorRef; encounterDistance: number; minimumSpeed: number }
}
export interface ProgramBehaviorRule {
  id: string
  label: string
  earliest: number
  latest?: number
  priority: number
  when: Condition
  motions: {
    actor: ActorRef
    kind: MotionAction['kind']
    target: Target
    speed: number
    from?: Scalar
    until?: Scalar
  }[]
  excludes?: string[]
  deferReadFor?: number
}
export interface ObligationDefinition {
  id: string
  defender: ActorRef
  subject: { actor: ActorRef } | { region: string } | { rim: true }
  threat: ThreatId
  kind: Responsibility['kind']
  target: Target
  priority: number
  influence?: Scalar
  dueAfterPass?: boolean
  when?: Condition
  railParameter?: string
}
export interface DefensiveRule {
  id: string
  label: string
  labelBindings?: { token: string; parameter: string; decimals: number }[]
  when?: Condition
  replaceFor: ActorRef[]
  obligations: ObligationDefinition[]
  adjust?: {
    subject: ActorRef
    excludeKinds: Responsibility['kind'][]
    first: boolean
    target: Target
    priority: number
  }
}
export interface MemoryRule {
  id: string
  when: Condition
  value: boolean
  latch?: boolean
}
export interface LaunchProfile {
  timing?: 'iterative' | 'extend-first'
  kind: Exclude<BallFlight['kind'], 'shot'>
  releaseHeight: Scalar
  catchHeight: number
  durationOffset?: number
  minDuration: number
  maxDuration: number
}
export interface OpportunityDefinition {
  id: ThreatId
  label: string
  actor: ActorRef
  kind: 'keep' | 'pass'
  when?: Condition
  target: Target
  scoreBias: Scalar
  laneWeight: number
  launches?: LaunchProfile[]
  useCrossCourtKind?: boolean
  previewThreshold?: number
}
export interface ReadNodeDefinition {
  id: string
  actor: ActorRef
  earliest: number
  decisionAt?: number
  trigger: { kind: 'catch' } | { kind: 'encounter'; action: string } | { kind: 'condition'; when: Condition }
  when?: Condition
  continuousWhen?: Condition
  options: ThreatId[]
  continuations: Record<ThreatId, string>
  initialOptionsWhen?: { when: Condition; options: ThreatId[] }[]
}
export interface VariationDefinition {
  parameter: string
  label: string
  min?: number
  max?: number
  step?: number
  toggle?: boolean
}
export interface ContentProgram {
  id: string
  version: string
  title: string
  description: string
  players: ProgramPlayer[]
  roles: Record<RoleId, PlayerId>
  initial: { ballOwner: PlayerId; readNode: string | null; matchups: ObligationDefinition[] }
  parameters: ParameterDefinition[]
  actions: MotionAction[]
  opportunities: OpportunityDefinition[]
  reads: ReadNodeDefinition[]
  offenseRules: ProgramBehaviorRule[]
  defenseRules: DefensiveRule[]
  memoryRules: MemoryRule[]
  variations: VariationDefinition[]
  regions?: Record<string, Point2>
  editAt: number
  terminal: {
    maxPasses: number
    keepDuration: number
    finishRadius: number
    keepGap: number
    keepSpeed: number
    keepHorizon: number
    patientPassLead: number
    patientKeepLead: number
    shotBaseDuration: number
    shotDistanceDuration: number
    shotReleaseHeight: number
    shotHeightReference: number
    shotHeightScale: number
  }
}
export type ExecutionCommand =
  | { id: string; at: number; kind: 'parameters'; values: ParameterValues }
  | { id: string; at: number; kind: 'move'; playerId: PlayerId; target: Point2; until?: number; release?: Condition }
export interface ExecutionInput {
  schemaVersion: number
  engineVersion: string
  content: ContentRef
  program: ContentProgram
  seed: number
  assumptions: ModelAssumptions
  parameters: ParameterValues
  commands: ExecutionCommand[]
  startingPositions?: Partial<Record<PlayerId, Point2>>
  personnel?: Partial<Record<PlayerId, { speed?: number; lateral?: number; height?: number }>>
}
export interface PolicyMemory {
  flags: Record<string, boolean>
  encounters: Record<string, number>
  activations: PolicyActivation[]
}
export interface ParameterTargetRail {
  parameterId: string
  actorId: PlayerId
  obligationId: string
  sourceRuleId: string
  min: number
  max: number
  value: number
  lower: Point2
  current: Point2
  upper: Point2
  editable: boolean
  reason: string
}
export interface PolicyEvaluation {
  effectiveTick: number
  observedTick: number
  observedAt: number
  parameters: ParameterValues
  memoryBefore: PolicyMemory
  memoryAfter: PolicyMemory
  activeRuleIds: string[]
  obligations: Responsibility[]
  parameterTargets: ParameterTargetRail[]
}
export interface Observation {
  tick: number
  t: number
  players: WorldFrame['players']
  ball: WorldFrame['ball']
  responsibilities: Responsibility[]
  roleBindings: Record<RoleId, PlayerId>
}

/** A forward version is bounded portable data until an installed codec can execute it. */
export type StoredExecutionInput =
  | ExecutionInput
  | { schemaVersion: number; engineVersion: string; content: ContentRef; [key: string]: unknown }
