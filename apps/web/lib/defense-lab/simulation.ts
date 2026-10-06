import { defenseResponsibilities, observeScreen, type DefensePolicyState } from './defensivePolicy'
import { advancePolicies, evaluateCondition, opponentAt, OPPONENT_BOUNDS, policyGoals, policyReadAfter, type PolicyState } from './offensivePolicy'
import { ENGINE_VERSION, HIGH_PNR_PROBLEM, PROBLEMS, createDefaultConfig } from './scenario'
import { ballBodyClearance } from './analyticalGeometry'
import { contestScale, directionalSpeed, resolveCapability, type Capability } from './capability'
import { estimateArrival } from './analytics'
import { canReachBall, catchSupport, firstFlightContact, flightPosition } from './physicalExecution'
import type { BallFlight, BallState, LabConfig, OffensiveAction, PlayerId, PlayerState, Point2, ProblemDefinition, ReadCandidate, ReadDecision, Responsibility, SimulationDiagnostics, SimulationResult, TeamAnswer, ThreatId, ThreatOption, WorldEvent, WorldFrame } from './types'

export { createDefaultConfig } from './scenario'

const rim = { x: 0, y: 3.05, z: 1.575 }
/** Metres a ball carrier attacks past his current spot: the space a drive must win. */
const DRIVE_STEP = 1.6
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
/** Answer snapshots own their nested sentences, including presentation samples. */
const copyAnswer = (answer: TeamAnswer): TeamAnswer => ({ ...answer, ...(answer.coachRules ? { coachRules: answer.coachRules.map(rule => ({ ...rule })) } : {}) })
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const velocityDirections = Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)])
const player = (players: PlayerState[], id: PlayerId) => players.find(p => p.id === id)!
const towardRim = (p: Point2, gap: number): Point2 => {
  const d = distance(p, rim) || 1
  return { x: p.x - p.x / d * gap, z: p.z + (rim.z - p.z) / d * gap }
}
function random(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296 }
}

/** Timed changes are rules from this moment forward, never position edits. */
export function answerAt(config: LabConfig, time: number): TeamAnswer {
  const answer = { ...config.answer }
  for (const cue of [...config.interventions].sort((a, b) => a.at - b.at)) {
    if (cue.at <= time + 1e-9 && cue.kind === 'answer') Object.assign(answer, cue.patch)
  }
  return answer
}

function validate(config: LabConfig, problem: ProblemDefinition) {
  const a = config.assumptions
  if (problem.players.length !== 10 || new Set(problem.players.map(p => p.id)).size !== 10) throw new Error('The world requires ten unique players.')
  if (!Number.isInteger(config.seed) || !Number.isFinite(config.screenAngle ?? 0)) throw new Error('Invalid seed or screen angle.')
  const bounds: Record<keyof typeof a, [number, number]> = { dt: [0.01, 0.05], duration: [2, 12], maxSpeed: [1, 8], acceleration: [1, 15], reactionDelay: [0, 0.8], passSpeed: [5, 20], ballRadius: [0.06, 0.2], bodyRadius: [0.18, 0.45], contestRadius: [0.5, 2], turnRate: [1, 10], gatherTime: [0.12, 0.6], readInterval: [0.05, 0.5], gravity: [8, 11], releaseHeight: [1.2, 2.4] }
  for (const [key, bound] of Object.entries(bounds)) { const value = a[key as keyof typeof a]; if (!Number.isFinite(value) || value < bound[0] || value > bound[1]) throw new Error(`Invalid model assumption: ${key}`) }
  for (const point of [...problem.players.map(p => p.start), ...Object.values(config.startingPositions ?? {})]) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z) || Math.abs(point.x) > 7.3 || point.z < 0.4 || point.z > 14) throw new Error('Starting position lies outside the supported half court.')
  }
  for (const time of [0, ...config.interventions.map(c => c.at)]) {
    const strategy = opponentAt(config, time)
    if (!strategy) continue
    for (const [key, bounds] of Object.entries(OPPONENT_BOUNDS)) {
      const value = strategy[key as keyof typeof OPPONENT_BOUNDS]
      if (!Number.isFinite(value) || value < bounds[0] || value > bounds[1]) throw new Error(`Invalid opponent parameter: ${key}`)
    }
    for (const key of ['reject', 'rescreen', 'shortRoll'] as const) if (typeof strategy[key] !== 'boolean') throw new Error(`Invalid opponent permission: ${key}`)
  }
  if (config.interventions.length > 64) throw new Error('Too many interventions.')
  for (const cue of config.interventions) {
    if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at > a.duration) throw new Error('Invalid intervention time.')
    if (cue.kind === 'move' && (!problem.players.some(p => p.id === cue.playerId) || !Number.isFinite(cue.target.x) || !Number.isFinite(cue.target.z) || Math.abs(cue.target.x) > 7.25 || cue.target.z < 0.4 || cue.target.z > 14 || (cue.until !== undefined && (!Number.isFinite(cue.until) || cue.until <= cue.at)))) throw new Error('Invalid movement cue.')
  }
  for (const time of [0, ...config.interventions.map(i => i.at)]) { const answer = answerAt(config, time); if (!Number.isFinite(answer.tagDepth) || answer.tagDepth < 0 || answer.tagDepth > 1 || !Number.isFinite(answer.bigDepth) || answer.bigDepth < 1.5 || answer.bigDepth > 6) throw new Error('Invalid tag or big depth.') }
}

/** Idealized straight-line arrival estimate, ignoring transverse velocity and
 * bodies. The policy uses it as a read approximation, not an impossibility proof. */
function arrival(p: PlayerState, target: Point2, influence: number, config: LabConfig, receiverHeight?: number): number {
  return estimateArrival(p, target, config.assumptions, influence * (receiverHeight === undefined ? p.contest ?? 1 : contestScale(p, receiverHeight)), 0)
}
function segmentDistance(p: Point2, a: Point2, b: Point2) {
  const dx = b.x - a.x, dz = b.z - a.z
  const u = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1)
  return distance(p, { x: a.x + dx * u, z: a.z + dz * u })
}
function threatPlayer(problem: ProblemDefinition, id: ThreatId, owner: PlayerId): PlayerId {
  const r = problem.roles
  return id === 'drive' ? owner : id === 'roll' || id === 'pop' ? r.screener : id === 'corner' ? r.weakCorner : id === 'lift' ? r.weakLift : r.strongCorner
}
function optionSet(players: PlayerState[], ball: BallState, problem: ProblemDefinition, config: LabConfig, t: number, responsibilities: Responsibility[], nodeOptions?: ThreatId[], earliest = 0): ThreatOption[] {
  const owner = ball.owner ?? problem.roles.ballhandler, carrier = player(players, owner), defenders = players.filter(p => p.team === 'defense')
  const options: ThreatId[] = ['roll', 'lift', 'corner', 'drive', 'pop', 'strong']
  return options.map(id => {
    const idPlayer = threatPlayer(problem, id, owner), p = player(players, idPlayer)
    // A drive threat is the space the carrier attacks, a step ahead toward the
    // rim, not the spot he already occupies: a defender trailing him cannot cut
    // that path off just because he stands close behind.
    const ahead = distance(p, rim) || 1
    const target = id === 'drive' ? { x: p.x - (p.x - rim.x) / ahead * DRIVE_STEP, z: p.z - (p.z - rim.z) / ahead * DRIVE_STEP } : { x: p.x, z: p.z }
    const isPop = config.counter === 'pop'
    const available = t >= earliest && ball.phase !== 'pass' && ball.phase !== 'dead' && ball.phase !== 'shot' && (id === 'pop' ? isPop : id === 'roll' ? !isPop && p.z < 7.7 : id === 'drive' ? true : idPlayer !== owner) && (!nodeOptions || nodeOptions.includes(id))
    const scaled = (d: PlayerState) => distance(d, target) / contestScale(d, p.height)
    const nearest = defenders.reduce((best, d) => scaled(d) < scaled(best) ? d : best, defenders[0])
    const flightTime = distance(carrier, p) / config.assumptions.passSpeed + 0.12
    // A handler with a live dribble needs a first step, not a catch and gather.
    const hold = id === 'drive' && idPlayer === owner && ball.phase === 'handle' ? config.assumptions.readInterval : config.assumptions.gatherTime
    // A floor corridor is a policy approximation, not actual 3D interception evidence.
    const clearance = id === 'drive' ? null : Math.min(...defenders.filter(d => distance(d, carrier) > 1.05).map(d => segmentDistance(d, carrier, p) - config.assumptions.bodyRadius - config.assumptions.ballRadius))
    const responsibility = responsibilities.find(r => r.threatId === id && r.offensivePlayerId === idPlayer && r.kind !== 'split') ?? responsibilities.find(r => r.threatId === id && r.offensivePlayerId === idPlayer) ?? responsibilities.find(r => r.threatId === id && r.kind !== 'split') ?? responsibilities.find(r => r.threatId === id)
    return { id, playerId: idPlayer, kind: id, target, available, passClearance: clearance === Infinity ? 9 : clearance, influenceDistance: scaled(nearest), responsibleDefenderId: responsibility?.defenderId, opportunityDeadline: t + flightTime + hold, timeToRelease: flightTime + hold }
  })
}

interface Runtime {
  owner: PlayerId
  flight: BallFlight | null
  phase: BallState['phase']
  nodeId: string | null
  caughtAt: number
  lastReadAt: number
  passCount: number
  driveAt: number | null
  shotAt: number | null
  continuation: string | null
  endedAt: { x: number; y: number; z: number } | null
  policy: PolicyState
  observed: WorldFrame | null
}

function chooseAction(actions: OffensiveAction[], id: PlayerId, t: number, config: LabConfig): OffensiveAction | undefined {
  const relevant = actions.filter(a => a.playerId === id && a.from <= t + 1e-9 && (!a.counter || a.counter.includes(config.counter)))
  const override = relevant.filter(a => a.counter?.includes(config.counter)).at(-1)
  return override ?? relevant.at(-1)
}
function offenseGoals(players: PlayerState[], problem: ProblemDefinition, config: LabConfig, t: number, runtime: Runtime): Map<PlayerId, { target: Point2; speed: number; action: string }> {
  const goals = new Map<PlayerId, { target: Point2; speed: number; action: string }>()
  const strategy = opponentAt(config, t)
  const reactive = strategy && runtime.observed ? policyGoals(problem.offenseRules ?? [], runtime.observed, problem, runtime.policy, t) : new Map()
  for (const p of players.filter(p => p.team === 'offense')) {
    const content = problem.players.find(pp => pp.id === p.id)!, action = chooseAction(problem.actions, p.id, t, config)
    let target = action ? { ...action.target } : { ...(config.startingPositions?.[p.id] ?? content.start) }
    let speed = action?.speed ?? 3.4
    if (action?.kind === 'screen' && config.screenAngle) { target = { x: target.x + Math.sin(config.screenAngle) * 0.35, z: target.z + Math.cos(config.screenAngle) * 0.15 } }
    if (strategy) {
      // The lift waits for observed low help. Its delay is measured from that
      // activation, not a pre-recorded route clock.
      if (p.id === problem.roles.weakLift && action?.kind === 'relocate' && problem.offenseRules?.some(r => r.id === 'lift-behind-tag')) {
        const activation = runtime.policy.activations.find(a => a.ruleId === 'lift-behind-tag')
        if (!activation || t < activation.t + Math.max(0, 0.25 + strategy.liftDelay)) target = { ...content.start }
      }
      const policyGoal = reactive.get(p.id)
      if (policyGoal && !(p.id === problem.roles.weakLift && t < (runtime.policy.activations.find(a => a.ruleId === 'lift-behind-tag')?.t ?? Infinity) + Math.max(0, 0.25 + strategy.liftDelay))) { target = { ...policyGoal.target }; speed = policyGoal.speed }
      if (p.id === problem.roles.weakLift) { target.x -= strategy.liftWidth }
      // Angle rotates the handler's use-screen approach and the screener's
      // release around the content screen point, affecting encounter geometry.
      if (strategy.screenAngle && (p.id === problem.roles.ballhandler || p.id === problem.roles.screener)) {
        const pivot = problem.actions.find(a => a.kind === 'screen')?.target
        if (pivot) { const dx = target.x - pivot.x, dz = target.z - pivot.z, c = Math.cos(strategy.screenAngle), sn = Math.sin(strategy.screenAngle); target = { x: pivot.x + dx * c - dz * sn, z: pivot.z + dx * sn + dz * c } }
      }
      target = { x: clamp(target.x, -7.1, 7.1), z: clamp(target.z, 0.5, 13.8) }
    }
    // A keep decision continues the physical drive; other players retain the
    // current content action. No scenario-specific recovery coordinates.
    if (p.id === runtime.owner && runtime.driveAt !== null) { target = towardRim(p, Math.max(0, distance(p, rim) - 0.8)); speed = 3.7 }
    if (runtime.phase === 'gather' && p.id === runtime.owner) { target = { x: p.x, z: p.z }; speed = 2.5 }
    if (runtime.shotAt !== null && p.id === runtime.owner) { target = { x: p.x, z: p.z }; speed = 0 }
    goals.set(p.id, { target, speed, action: action?.kind ?? 'hold' })
  }
  return goals
}

/** Acceleration-bounded velocity search. No position projection/teleportation. */
function advance(p: PlayerState, goal: Point2, speed: number, players: PlayerState[], config: LabConfig, capability: number, scratch: Float64Array, facing?: Point2, profile?: Capability): { next: PlayerState; contact: boolean; breach: boolean } {
  const { dt, acceleration, maxSpeed, bodyRadius, turnRate } = config.assumptions
  const accelerationScale = capability * (profile?.acceleration ?? 1), speedScale = capability * (profile?.speed ?? 1)
  const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz), aLimit = acceleration * dt * accelerationScale
  // Bodies that face something (defenders face the ball) are slower sideways and
  // backward. Movers without a facing target run forward by construction.
  const lateral = facing && profile ? profile.lateral : 1
  const topSpeed = maxSpeed * speedScale
  const along = (vx: number, vz: number) => { const m = Math.hypot(vx, vz); return m < 1e-9 || lateral >= 1 ? topSpeed : directionalSpeed(topSpeed, lateral, p.yaw, vx / m, vz / m) }
  const dirSpeed = d > 0 ? along(dx, dz) : topSpeed
  const cap = Math.min(speed, dirSpeed), desiredSpeed = Math.min(cap, Math.sqrt(Math.max(0, 2 * acceleration * accelerationScale * d)))
  const desiredX = d > 0.035 ? dx / d * desiredSpeed : 0, desiredZ = d > 0.035 ? dz / d * desiredSpeed : 0
  const bound = (index: number, vx: number, vz: number) => {
    let ax = vx - p.vx, az = vz - p.vz
    const delta = Math.hypot(ax, az)
    if (delta > aLimit) { ax *= aLimit / delta; az *= aLimit / delta }
    scratch[index * 2] = p.vx + ax; scratch[index * 2 + 1] = p.vz + az
  }
  bound(0, desiredX, desiredZ); bound(1, 0, 0); bound(2, p.vx, p.vz)
  for (let i = 0; i < 12; i++) bound(i + 3, p.vx + velocityDirections[i][0] * aLimit, p.vz + velocityDirections[i][1] * aLimit)
  let bestX = scratch[0], bestZ = scratch[1], bestCost = Infinity
  const proximity = bodyRadius * 2 + 0.12, proximitySquared = proximity * proximity
  for (let i = 0; i < 15; i++) {
    const vx = scratch[i * 2], vz = scratch[i * 2 + 1]
    if (Math.hypot(vx, vz) > along(vx, vz) + 1e-9) continue
    let cost = 0.16 * ((vx - desiredX) ** 2 + (vz - desiredZ) ** 2)
    const nextX = p.x + vx * dt, nextZ = p.z + vz * dt
    if (Math.abs(nextX) > 7.25 || nextZ < 0.4 || nextZ > 14) cost += 10000
    for (const other of players) {
      if (other.id === p.id) continue
      for (const tau of [dt, 0.15, 0.32]) {
        const gapX = p.x + vx * tau - other.x - other.vx * tau, gapZ = p.z + vz * tau - other.z - other.vz * tau
        const squared = gapX * gapX + gapZ * gapZ
        // Most pairs are metres apart. Reject them before the expensive norm.
        if (squared < proximitySquared) { const gap = Math.hypot(gapX, gapZ) - bodyRadius * 2; cost += (tau === dt ? 900 : 28) * (0.12 - gap) ** 2 }
      }
    }
    if (cost < bestCost) { bestCost = cost; bestX = vx; bestZ = vz }
  }
  const x = p.x + bestX * dt, z = p.z + bestZ * dt, moving = Math.hypot(bestX, bestZ)
  const yawTarget = facing ? Math.atan2(facing.x - p.x, facing.z - p.z) : moving > 0.15 ? Math.atan2(bestX, bestZ) : p.yaw
  const next = { ...p, x, z, vx: bestX, vz: bestZ, yaw: p.yaw + clamp(angleDelta(yawTarget, p.yaw), -turnRate * dt, turnRate * dt), pose: { ...p.pose, phase: p.pose.phase + moving * dt * 4.2 } }
  return { next, contact: players.some(other => other.id !== p.id && distance(next, { x: other.x + other.vx * dt, z: other.z + other.vz * dt }) < bodyRadius * 2 - 0.03), breach: Math.abs(x) > 7.3 || z < 0.35 || z > 14.05 }
}

function predictReceiver(p: PlayerState, goal: Point2, duration: number, speed: number, config: LabConfig, scratch: Float64Array): Point2 {
  let q = { ...p, pose: { ...p.pose } }
  const n = Math.ceil(duration / config.assumptions.dt)
  for (let i = 0; i < n; i++) q = advance(q, goal, speed, [q], config, 1, scratch).next
  return { x: q.x, z: q.z }
}
const flightAt = flightPosition
/** A current-world launch preview. It uses observed bodies and their present
 * velocity, never future policy frames. The actual run is checked separately. */
function previewClearance(flight: BallFlight, players: PlayerState[], config: LabConfig): number {
  let clearance = Infinity
  for (let i = 1; i < 16; i++) {
    const t = flight.start + (flight.end - flight.start) * i / 16, age = t - flight.start
    const ball = flightAt(flight, t, config.assumptions.gravity)
    for (const p of players.filter(p => p.team === 'defense')) {
      const predicted = { ...p, x: p.x + p.vx * Math.min(age, 0.35), z: p.z + p.vz * Math.min(age, 0.35), pose: { ...p.pose, hands: Math.max(0.8, p.pose.hands) } }
      if (!canReachBall(ball, predicted, config.assumptions)) continue
      clearance = Math.min(clearance, ballBodyClearance(ball, predicted, config.assumptions).clearance)
    }
  }
  return clearance
}
function ballState(runtime: Runtime, players: PlayerState[], t: number, config: LabConfig): BallState {
  if (runtime.flight) return { ...flightAt(runtime.flight, t, config.assumptions.gravity), phase: runtime.flight.kind === 'shot' ? 'shot' : 'pass', owner: runtime.flight.from, receiver: runtime.flight.to, flight: { ...runtime.flight, a: { ...runtime.flight.a }, b: { ...runtime.flight.b } } }
  if (runtime.phase === 'dead' && runtime.endedAt) return { ...runtime.endedAt, phase: 'dead', owner: null, receiver: null, flight: null }
  const p = player(players, runtime.owner)
  return { x: p.x + Math.sin(p.yaw) * 0.22, z: p.z + Math.cos(p.yaw) * 0.22, y: runtime.phase === 'handle' ? 0.5 + Math.abs(Math.sin(t * 9)) * 0.65 : 1.5, phase: runtime.phase, owner: runtime.phase === 'dead' ? null : p.id, receiver: p.id, flight: null }
}

function readCandidates(options: ThreatOption[], players: PlayerState[], actorId: PlayerId, problem: ProblemDefinition, config: LabConfig, passCount: number): ReadCandidate[] {
  const actor = player(players, actorId), defenders = players.filter(p => p.team === 'defense')
  return options.map(option => {
    const receiver = player(players, option.playerId), travel = distance(actor, receiver) / config.assumptions.passSpeed + 0.12
    const arrivals = defenders.map(d => arrival(d, receiver, config.assumptions.contestRadius, config, receiver.height))
    const gap = Math.min(...arrivals) - (option.id === 'drive' ? 0.35 : travel + config.assumptions.gatherTime)
    const lane = option.passClearance ?? 1
    let preference = 0
    if (passCount === 0) {
      const intent = config.counter === 'short-roll' || config.counter === 'slip' ? 'roll' : config.counter === 'skip' || config.counter === 'extra' ? 'corner' : config.counter === 'reject' ? 'drive' : config.counter
      if (intent === option.id) preference = 0.22
    }
    // Receiver reads are based on the actual first closeout. "One more" does
    // not force a pass into a worse option, and capped passes prevent loops.
    if (config.counter === 'extra' && passCount === 1 && option.id !== 'drive') preference = 0.15
    const inside = receiver.z < 4.5 ? 0.26 : 0
    const ownFinish = option.id === 'drive' ? (actorId === problem.roles.screener && actor.z < 4.6 ? 0.7 : actorId === problem.roles.ballhandler ? 0.04 : 0.15) : 0
    const passRisk = option.id === 'roll' ? clamp(lane, -1, 1) * 0.3 : clamp(lane, -1, 1) * 0.06
    return { threatId: option.id, playerId: option.playerId, available: option.available && (passCount < 3 || option.id === 'drive'), clearance: lane, arrivalGap: gap, value: gap + preference + inside + ownFinish + passRisk }
  })
}

export function simulate(config: LabConfig = createDefaultConfig()): SimulationResult {
  const problem = PROBLEMS.find(p => p.id === config.problemId)
  if (!problem) throw new Error('This basketball problem is not installed.')
  return simulateProblem(problem, config)
}

/** The same world accepts custom formation/action/read content. Coverage policy
 * consumes situational roles; neither stepping nor offense reads test problemId. */
export function simulateProblem(problem: ProblemDefinition, input: LabConfig): SimulationResult {
  const config = copy(input)
  validate(config, problem)
  const { dt, duration } = config.assumptions, rand = random(config.seed)
  // Run-local candidate storage is reused by all motion/prediction calls. It
  // never enters retained replay snapshots or crosses a worker boundary.
  const motionScratch = new Float64Array(30)
  const capabilities = new Map<PlayerId, number>(), profiles = new Map<PlayerId, Capability>()
  let players: PlayerState[] = problem.players.map(p => {
    capabilities.set(p.id, 0.96 + rand() * 0.04)
    const profile = resolveCapability(p)
    profiles.set(p.id, profile)
    return { id: p.id, team: p.team, role: p.role, number: p.number, height: p.height, speed: profile.speed, acceleration: profile.acceleration, lateral: profile.lateral, contest: profile.contest, ...(config.startingPositions?.[p.id] ?? p.start), vx: 0, vz: 0, yaw: p.team === 'offense' ? Math.PI : 0, pose: { stance: p.team === 'offense' ? 'ready' : 'defend', hands: p.team === 'offense' ? 0.2 : 0.6, phase: rand() * Math.PI * 2, jump: 0 } }
  })
  const firstNode = problem.reads.find(n => n.trigger !== 'catch') ?? problem.reads[0]
  const runtime: Runtime = { owner: firstNode?.actorId ?? problem.roles.ballhandler, flight: null, phase: 'handle', nodeId: firstNode?.id ?? null, caughtAt: 0, lastReadAt: -10, passCount: 0, driveAt: null, shotAt: null, continuation: null, endedAt: null, policy: { activations: [] }, observed: null }
  const frames: WorldFrame[] = [], events: WorldEvent[] = [], decisions: ReadDecision[] = []
  const diagnostics: SimulationDiagnostics = { contactCount: 0, maxCatchError: 0, boundaryBreach: false, warnings: [], flightStops: [], missedCatchCount: 0 }
  const defenseState: DefensePolicyState = { screenAt: null, showReleased: false }
  const releasedMoves = new Set<string>()
  const appliedCues = new Set<string>(), previousResponsibilities = new Map<PlayerId, string>(), starts = new Map<string, number>()
  let screenAnnounced = false, tagAnnounced = false
  const event = (e: Omit<WorldEvent, 'id'>) => events.push({ ...e, id: `event-${events.length}` })
  for (let k = 0; k <= Math.round(duration / dt); k++) {
    const t = Number((k * dt).toFixed(6)), answer = answerAt(config, t)
    for (const cue of config.interventions) if (cue.at <= t + 1e-9 && !appliedCues.has(cue.id)) { appliedCues.add(cue.id); event({ t, type: 'intervention', label: cue.kind === 'answer' ? 'Defensive rule changes from this moment' : cue.kind === 'opponent' ? 'Opponent strategy changes from this moment' : 'Player receives a new movement target', ...(cue.kind === 'move' ? { playerId: cue.playerId } : {}) }) }

    const previousFrame = frames.at(-1)
    if (runtime.flight && previousFrame) {
      const stop = firstFlightContact(runtime.flight, previousFrame.players, players, previousFrame.t, t, config.assumptions)
      if (stop) {
        diagnostics.flightStops!.push(stop)
        event({ t: stop.at, type: 'contact', label: 'Ball meets a body → execution unresolved', playerId: stop.playerId, targetId: runtime.flight.to ?? undefined, details: `Launched ball intersects the ${stop.part} envelope. Possession stops here; no deflection, turnover or later catch is invented.` })
        runtime.endedAt = { ...stop.ball }; runtime.phase = 'dead'; runtime.flight = null; runtime.nodeId = null; runtime.continuation = null
      }
    }
    if (runtime.flight && t >= runtime.flight.end - 1e-9) {
      if (runtime.flight.kind === 'shot') { runtime.endedAt = { ...runtime.flight.b }; runtime.phase = 'dead'; runtime.flight = null }
      else {
        const receiver = player(players, runtime.flight.to!), support = catchSupport(receiver, runtime.flight.b, config.assumptions)
        diagnostics.maxCatchError = Math.max(diagnostics.maxCatchError, support.horizontalError)
        if (!support.reachable) { diagnostics.missedCatchCount!++; event({ t, type: 'missed-catch', label: 'Receiver cannot reach the launched ball', playerId: receiver.id, details: `Fixed landing point ${support.horizontalError.toFixed(2)} m from torso, at ${runtime.flight.b.y.toFixed(2)} m height; outside this receiver's authored facing/height envelope. Later possession is not simulated.` }); runtime.endedAt = { ...runtime.flight.b }; runtime.phase = 'dead'; runtime.flight = null; runtime.nodeId = null }
        else { runtime.owner = receiver.id; runtime.phase = 'gather'; runtime.caughtAt = t; runtime.flight = null; runtime.nodeId = runtime.continuation; event({ t, type: 'catch', label: 'Catch → read the closeout', playerId: receiver.id }) }
      }
    }
    let ball = ballState(runtime, players, t, config)
    const observedIndex = Math.max(0, Math.floor((t - config.assumptions.reactionDelay) / dt))
    const currentObserved: WorldFrame = { t, players, ball, responsibilities: [], options: [], answer, stage: 'screen' }
    // Zero delay observes this tick's world. frames[k] does not exist until the
    // tick is committed; substituting time zero would repeatedly reset triggers.
    const observed = config.assumptions.reactionDelay === 0 ? currentObserved : frames[observedIndex] ?? currentObserved
    observeScreen(observed, problem, defenseState)
    if (!screenAnnounced && defenseState.screenAt !== null) { screenAnnounced = true; event({ t, type: 'screen', label: config.counter === 'slip' ? 'Early screen encounter → slip' : 'Handler enters the screen encounter', playerId: problem.roles.screener, details: `Observed body encounter at ${defenseState.screenAt.toFixed(2)} s; this is not a certified contact or legality call.` }) }
    const strategy = opponentAt(config, t)
    if (observed === currentObserved && defenseState.screenAt !== null) observed.screenEngagedAt = defenseState.screenAt
    const responsibilities = defenseResponsibilities(observed, answer, problem, config, t, strategy ? defenseState : undefined)
    if (observed === currentObserved) observed.responsibilities = responsibilities
    runtime.observed = observed
    if (strategy && runtime.phase !== 'dead' && runtime.shotAt === null) {
      for (const activation of advancePolicies(problem.offenseRules ?? [], observed, problem, strategy, runtime.policy, t)) {
        const rule = problem.offenseRules!.find(r => r.id === activation.ruleId)!
        event({ t, type: 'counter', label: rule.label, details: `Observed at ${activation.observedAt.toFixed(2)} s: ${activation.evidence.join('; ')}.` })
      }
    }
    for (const task of responsibilities) { if (!starts.has(task.id)) starts.set(task.id, t); task.startedAt = starts.get(task.id)! }
    if (!tagAnnounced && responsibilities.some(r => r.kind === 'tag')) { tagAnnounced = true; event({ t, type: 'tag', label: 'Low man commits to the roll', playerId: problem.roles.lowMan, targetId: problem.roles.screener, threatId: 'roll' }) }
    for (const p of players.filter(p => p.team === 'defense')) {
      const primary = responsibilities.filter(r => r.defenderId === p.id).sort((a, b) => b.priority - a.priority)[0]
      if (!primary) continue
      const previous = previousResponsibilities.get(p.id)
      if (previous && previous !== primary.threatId) event({ t, type: 'transfer', label: `${p.number} takes ${primary.threatId === 'drive' ? 'the ball' : primary.threatId}`, playerId: p.id, targetId: primary.offensivePlayerId, threatId: primary.threatId, details: primary.trigger })
      previousResponsibilities.set(p.id, primary.threatId)
    }
    const node = problem.reads.find(n => n.id === runtime.nodeId)
    const optionReadyAt = node?.trigger === 'catch' ? runtime.caughtAt + config.assumptions.gatherTime : strategy ? Math.max(node?.decisionAt ?? node?.earliest ?? 0, policyReadAfter(problem.offenseRules ?? [], runtime.policy)) : node?.earliest ?? 0
    const options = optionSet(players, ball, problem, config, t, responsibilities, node?.options ?? (runtime.driveAt !== null ? ['drive'] : []), node?.trigger === 'catch' ? runtime.caughtAt + (strategy ? 0 : config.assumptions.gatherTime) : node?.earliest ?? 0)
    if (strategy) for (const option of options) {
      // A ball carrier does not wait for a pass read: pulling up or attacking
      // the space is available the moment he comes off the screen.
      const waiting = option.id === 'drive' && option.playerId === runtime.owner ? 0 : Math.max(0, optionReadyAt - t)
      option.readAvailableAt = optionReadyAt
      option.timeToRelease = (option.timeToRelease ?? 0) + waiting
      option.opportunityDeadline = (option.opportunityDeadline ?? t) + waiting
    }
    const triggerReady = node && (node.trigger === 'catch' ? runtime.phase === 'gather' : node.trigger === 'screen-used' ? defenseState.screenAt !== null : player(players, node.actorId).z < (config.startingPositions?.[node.actorId]?.z ?? problem.players.find(p => p.id === node.actorId)?.start.z ?? 0) - 0.8)
    const conditionReady = !node?.when || !!strategy && evaluateCondition(node.when, observed, problem, strategy, runtime.policy).matches
    // Physical spacing is not enough: the content graph must have reached its
    // trigger. A pending evaluation checkpoint may still forecast an option,
    // but an unencountered screen or unmet condition cannot create windows.
    const graphReady = node ? triggerReady && conditionReady : runtime.driveAt !== null
    if (!graphReady) for (const option of options) option.available = false
    const readReady = triggerReady && conditionReady && node && t >= policyReadAfter(problem.offenseRules ?? [], runtime.policy) && !runtime.flight && runtime.driveAt === null && runtime.phase !== 'dead' && t >= (node.decisionAt ?? node.earliest) && (node.trigger !== 'catch' || t >= runtime.caughtAt + config.assumptions.gatherTime) && t - runtime.lastReadAt >= config.assumptions.readInterval
    if (readReady && node) {
      runtime.lastReadAt = t
      const candidates = readCandidates(options, players, runtime.owner, problem, config, runtime.passCount).filter(c => node.options.includes(c.threatId))
      const ranked = candidates.filter(c => c.available).sort((a, b) => b.value - a.value)
      const choice = ranked[0]
      if (choice) {
        const alternative = ranked[1]
        const decision: ReadDecision = { t, nodeId: node.id, actorId: runtime.owner, selected: choice.threatId, reason: choice.threatId === 'drive' ? 'The ball carrier keeps the current advantage; passing options offer less time before defensive influence.' : `${choice.threatId === 'roll' ? 'The roller' : choice.threatId === 'corner' ? 'The weak corner' : choice.threatId === 'lift' ? 'The lift' : choice.threatId === 'pop' ? 'The popping screener' : 'Strong-side spacing'} offers the larger modeled catch-and-read opportunity${alternative ? ` than ${alternative.threatId}` : ''}. The read uses current defenders and offensive intent.`, candidates }
        decisions.push(decision); event({ t, type: 'read', label: `Offense reads → ${choice.threatId === 'drive' ? 'keep' : choice.threatId}`, playerId: runtime.owner, targetId: choice.playerId, threatId: choice.threatId, details: decision.reason })
        if (choice.threatId === 'drive') { runtime.driveAt = t; runtime.nodeId = null; runtime.phase = 'handle' }
        else {
          const passer = player(players, runtime.owner), receiver = player(players, choice.playerId), goals = offenseGoals(players, problem, config, t, runtime), goal = goals.get(receiver.id)!
          let flightDuration = clamp(distance(passer, receiver) / config.assumptions.passSpeed + 0.12, 0.25, 1.3), endpoint: Point2 = receiver
          for (let j = 0; j < 3; j++) { endpoint = predictReceiver(receiver, goal.target, flightDuration, goal.speed, config, motionScratch); flightDuration = clamp(distance(passer, endpoint) / config.assumptions.passSpeed + 0.12, 0.25, 1.3) }
          runtime.flight = { from: passer.id, to: receiver.id, start: t, end: t + flightDuration, a: { x: passer.x, y: choice.threatId === 'roll' ? 1.25 : config.assumptions.releaseHeight, z: passer.z }, b: { ...endpoint, y: 1.55 }, kind: choice.threatId === 'roll' ? 'pocket' : distance(passer, endpoint) > 6 ? 'skip' : 'chest' }
          if (choice.threatId === 'roll' && previewClearance(runtime.flight, players, config) < 0.08) {
            const lobDuration = Math.min(1.1, flightDuration + 0.2)
            const lobEndpoint = predictReceiver(receiver, goal.target, lobDuration, goal.speed, config, motionScratch)
            const lob: BallFlight = { ...runtime.flight, end: t + lobDuration, a: { ...runtime.flight.a, y: config.assumptions.releaseHeight + 0.15 }, b: { ...lobEndpoint, y: 1.85 }, kind: 'lob' }
            if (previewClearance(lob, players, config) > previewClearance(runtime.flight, players, config)) runtime.flight = lob
          }
          runtime.continuation = node.continuations[choice.threatId] ?? null; runtime.passCount++; runtime.phase = 'pass'
          event({ t, type: 'pass', label: `${runtime.flight.kind === 'pocket' ? 'Pocket' : runtime.flight.kind === 'lob' ? 'Lob' : runtime.flight.kind === 'skip' ? 'Skip' : 'Pass'} → ${choice.threatId}`, playerId: passer.id, targetId: receiver.id, threatId: choice.threatId, details: 'Ball endpoint fixed at release; launch shape chosen from present body geometry, never future frames.' })
        }
      } else decisions.push({ t, nodeId: node.id, actorId: runtime.owner, selected: 'hold', reason: 'No basketball-feasible receiver in the current graph.', candidates })
      ball = ballState(runtime, players, t, config)
      // Preserve this tick's evaluated options; launched ball is a separate state.
    }
    // A receiver with no continuation gathers, then finishes. A keep continuation
    // stays physical for at least half a second before its authored release.
    const ownerPlayer = player(players, runtime.owner)
    const finishReady = runtime.shotAt === null && !runtime.flight && runtime.phase !== 'dead' && (runtime.driveAt !== null ? t >= runtime.driveAt + 0.7 || distance(ownerPlayer, rim) < 1.5 : runtime.phase === 'gather' && !runtime.nodeId && t >= runtime.caughtAt + config.assumptions.gatherTime)
    if (finishReady) {
      runtime.shotAt = t; runtime.phase = 'shot'; const shotDuration = 0.55 + distance(ownerPlayer, rim) * 0.06
      runtime.flight = { from: ownerPlayer.id, to: null, start: t, end: t + shotDuration, a: { x: ownerPlayer.x, y: 2.25 + (ownerPlayer.height - 1.9) * 0.5, z: ownerPlayer.z }, b: rim, kind: 'shot' }
      event({ t, type: 'shot', label: 'Modeled release; no make / miss prediction', playerId: ownerPlayer.id }); ball = ballState(runtime, players, t, config)
    }
    for (const p of players) {
      const speed = Math.hypot(p.vx, p.vz)
      p.pose.stance = p.team === 'defense' ? 'defend' : speed > 0.3 ? 'run' : 'ready'
      p.pose.hands = p.team === 'defense' ? ball.phase === 'pass' || ball.phase === 'shot' ? 0.85 : 0.6 : 0.2
      if (p.id === ball.owner && ball.phase !== 'dead') { p.pose.stance = ball.phase === 'handle' ? 'dribble' : ball.phase === 'gather' ? 'catch' : ball.phase === 'shot' ? 'shoot' : 'pass'; p.pose.hands = ball.phase === 'handle' ? 0.25 : 0.8 }
      if (p.id === ball.receiver && ball.phase === 'pass') { p.pose.stance = 'catch'; p.pose.hands = 0.8 }
      if (p.id === problem.roles.screener && t < 0.48 && config.counter !== 'slip') p.pose.stance = 'screen'
      p.pose.jump = runtime.shotAt !== null && p.id === runtime.owner ? Math.max(0, 0.23 * Math.sin(Math.min(Math.PI, (t - runtime.shotAt) * 8))) : 0
    }
    // Typed field copies avoid JSON serialization on the hot motion clock while
    // preserving independent snapshots: presentation may never mutate history.
    frames.push({ t, players: players.map(p => ({ ...p, pose: { ...p.pose } })), ball: { ...ball, flight: ball.flight ? { ...ball.flight, a: { ...ball.flight.a }, b: { ...ball.flight.b } } : null }, responsibilities: responsibilities.map(r => ({ ...r, target: { ...r.target } })), options: options.map(o => ({ ...o, target: { ...o.target } })), answer: copyAnswer(answer), ...(strategy ? { policyActivations: runtime.policy.activations.map(a => ({ ...a, evidence: [...a.evidence] })), ...(defenseState.screenAt !== null ? { screenEngagedAt: defenseState.screenAt } : {}) } : {}), stage: runtime.phase === 'dead' ? 'finished' : runtime.phase === 'shot' ? 'release' : runtime.passCount > 0 ? 'catch-and-read' : tagAnnounced ? 'tag-and-read' : 'screen' })
    if (k === Math.round(duration / dt)) break
    const goals = offenseGoals(players, problem, config, t, runtime)
    for (const cue of config.interventions) {
      if (cue.kind !== 'move' || !cue.untilTrigger || cue.at > t || releasedMoves.has(cue.id)) continue
      const observedBig = player(observed.players, problem.roles.big), observedRoller = player(observed.players, problem.roles.screener)
      const release = cue.untilTrigger === 'ball-leaves'
        ? observed.ball.flight !== null && observed.ball.flight.start >= cue.at
        : observed.t >= cue.at && distance(observedBig, observedRoller) <= config.assumptions.contestRadius && observed.responsibilities.some(r => r.defenderId === observedBig.id && r.offensivePlayerId === observedRoller.id && r.priority >= 1)
      if (release) { releasedMoves.add(cue.id); event({ t, type: 'intervention', interventionId: cue.id, playerId: cue.playerId, label: cue.untilTrigger === 'ball-leaves' ? 'Demonstrated position releases on the pass' : 'Demonstrated position releases when big secures roller', details: 'The movement cue ends; this player resumes the current defensive rules.' }) }
    }
    const nextPlayers = players.map(p => {
      const cue = [...config.interventions].filter(c => c.kind === 'move' && c.playerId === p.id && !releasedMoves.has(c.id) && c.at <= t + 1e-9 && (c.until === undefined || t < c.until)).at(-1)
      const primary = responsibilities.filter(r => r.defenderId === p.id).sort((a, b) => b.priority - a.priority)[0]
      const goal = cue?.kind === 'move' ? cue.target : p.team === 'offense' ? goals.get(p.id)?.target ?? p : primary?.target ?? p
      const speed = p.team === 'offense' ? goals.get(p.id)?.speed ?? 3.4 : config.assumptions.maxSpeed
      const facing = p.team === 'defense' ? ball : ball.phase === 'pass' && ball.receiver === p.id ? ball : undefined
      const next = advance(p, goal, speed, players, config, capabilities.get(p.id)!, motionScratch, facing, profiles.get(p.id))
      if (next.contact) diagnostics.contactCount++
      diagnostics.boundaryBreach ||= next.breach
      return next.next
    })
    players = nextPlayers
  }
  if (diagnostics.contactCount) diagnostics.warnings.push('Simplified body envelopes overlap in some motion samples; these are contact diagnostics, not foul calls.')
  if (diagnostics.boundaryBreach) diagnostics.warnings.push('An acceleration-bounded trajectory crossed the modeled court boundary.')
  if (diagnostics.flightStops!.length) diagnostics.warnings.push('A launched ball meets an analytical defensive body envelope. Execution stops at contact; the subsequent possession is unresolved.')
  if (diagnostics.missedCatchCount) diagnostics.warnings.push('A receiver cannot meet the fixed catch point within the authored facing/height envelope; possession stops at that catch.')
  return { modelVersion: ENGINE_VERSION, problemVersion: problem.version, config, frames, events, decisions, diagnostics }
}

/** Interpolates presentation motion only. Discrete possession and responsibility
 * changes remain on the earlier snapshot until their actual clock tick. */
export function frameAt(result: SimulationResult, time: number): WorldFrame {
  const frames = result.frames
  // Dividing a decimal clock by dt can put an exact stored tick just below its
  // integer index (2.525 / .025 = 100.999...). Search the committed timestamps
  // instead: discrete read/possession evidence must agree with exact snapshots.
  let low = 0, high = frames.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (frames[middle].t <= time + 1e-9) low = middle + 1
    else high = middle
  }
  const index = Math.max(0, low - 1), a = frames[index], b = frames[Math.min(index + 1, frames.length - 1)]
  const u = a.t === b.t ? 0 : clamp((time - a.t) / (b.t - a.t), 0, 1)
  const stop = a.ball.flight ? result.diagnostics.flightStops?.find(contact => contact.flightStart === a.ball.flight!.start && time >= contact.at - 1e-9) : undefined
  return { ...a, answer: copyAnswer(a.answer), ...(stop ? { stage: 'finished', options: a.options.map(option => ({ ...option, available: false })) } : {}), t: clamp(time, 0, frames[frames.length - 1].t), players: a.players.map((p, i) => ({ ...p, x: lerp(p.x, b.players[i].x, u), z: lerp(p.z, b.players[i].z, u), vx: lerp(p.vx, b.players[i].vx, u), vz: lerp(p.vz, b.players[i].vz, u), yaw: p.yaw + angleDelta(b.players[i].yaw, p.yaw) * u, pose: { ...p.pose, phase: lerp(p.pose.phase, b.players[i].pose.phase, u), jump: lerp(p.pose.jump, b.players[i].pose.jump, u) } })), ball: stop ? { ...stop.ball, phase: 'dead', owner: null, receiver: null, flight: null } : a.ball.flight ? { ...a.ball, ...flightAt(a.ball.flight, time, result.config.assumptions.gravity) } : a.ball.phase === b.ball.phase && a.ball.owner === b.ball.owner ? { ...a.ball, x: lerp(a.ball.x, b.ball.x, u), y: lerp(a.ball.y, b.ball.y, u), z: lerp(a.ball.z, b.ball.z, u) } : { ...a.ball } }
}

export const MODEL_PROBLEM = HIGH_PNR_PROBLEM
