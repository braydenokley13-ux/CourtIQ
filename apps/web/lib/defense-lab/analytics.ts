import { ballBodyClearance } from './analyticalGeometry'
import { contestScale, directionalSpeed } from './capability'
import { flightPosition, interpolateBody } from './physicalExecution'
import type { BallFlight, ModelAssumptions, PlayerId, PlayerState, Point2, Point3, Responsibility, SimulationResult, ThreatId, ThreatOption, WorldFrame } from './types'

export type AnalysisStatus = 'holds' | 'thin' | 'breaks'
export interface OptionWindow {
  id: ThreatId; playerId: PlayerId; label: string; duration: number; totalDuration: number
  intervals: { start: number; end: number }[]; peakAt: number; limitingDefenderId: PlayerId | null
}
export interface ArrivalObservation {
  threatId: ThreatId; playerId: PlayerId; defenderId: PlayerId | null; at: number
  seconds: number | null; observedArrivalAt: number | null; label: string
  opportunitySeconds: number | null; leadSeconds: number | null
}
export interface ResponsibilityConflict {
  defenderId: PlayerId; at: number; threatIds: [ThreatId, ThreatId]; deadlines: [number, number]
  minimumTransit: number; targets: [Point2, Point2]; explanation: string
}
export interface FlightEvidence {
  kind: BallFlight['kind']; from: PlayerId; to: PlayerId | null; start: number; end: number
  minClearance: number; sampleCount: number
  witness: { t: number; defenderId: PlayerId; part: string; ball: Point3; point: Point3 } | null
  conditionalAfterContact: boolean
  /** Actual execution stopped here; end remains the immutable launch plan. */
  stoppedAt?: number
}
export interface AnalysisResult {
  windows: OptionWindow[]; arrival: ArrivalObservation[]
  recovery: { seconds: number | null; triggerAt: number | null; recoveredAt: number | null }
  rotationCount: number; conflicts: ResponsibilityConflict[]; flightEvidence: FlightEvidence[]
  exposures: OptionWindow[]; classification: AnalysisStatus; explanation: string
  assumptions: ModelAssumptions; modelVersion: string; actionableHorizon: number; warnings: string[]
}
export interface WindowTradeoff { id: ThreatId; label: string; before: number; after: number; delta: number; direction: 'closes' | 'opens' | 'similar' }
export interface ComparisonResult { before: AnalysisResult; after: AnalysisResult; tradeoffs: WindowTradeoff[]; explanation: string }

const LABELS: Record<ThreatId, string> = { roll: 'Roller', lift: 'Weakside lift', corner: 'Weak corner', drive: 'Ball / drive', pop: 'Pop', strong: 'Strong corner' }
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
const roundTime = (v: number) => Math.round(v * 1e9) / 1e9

/** Piecewise constant-acceleration travel estimate, with a capped velocity.
 * Negative projection includes reversal. This is not a screened-route proof. */
export function travelTime(distanceRemaining: number, initialSpeed: number, acceleration: number, maxSpeed: number): number {
  if (distanceRemaining <= 0) return 0
  if (!(acceleration > 0) || !(maxSpeed > 0)) return Infinity
  const velocity = clamp(initialSpeed, -maxSpeed, maxSpeed)
  const capTime = (maxSpeed - velocity) / acceleration
  const capDistance = velocity * capTime + acceleration * capTime * capTime / 2
  if (distanceRemaining <= capDistance) return (Math.sqrt(velocity * velocity + 2 * acceleration * distanceRemaining) - velocity) / acceleration
  return capTime + (distanceRemaining - capDistance) / maxSpeed
}

type Mover = Pick<PlayerState, 'x' | 'z' | 'vx' | 'vz'> & Partial<Pick<PlayerState, 'speed' | 'acceleration' | 'lateral' | 'yaw'>>
export function estimateArrival(player: Mover, target: Point2, assumptions: Pick<ModelAssumptions, 'acceleration' | 'maxSpeed' | 'reactionDelay'>, influenceRadius = 0, remainingReaction = assumptions.reactionDelay) {
  const gap = distance(player, target)
  if (gap <= influenceRadius) return 0
  const projectedSpeed = gap ? ((target.x - player.x) * player.vx + (target.z - player.z) * player.vz) / gap : 0
  // Per-player capability: own top speed and acceleration, and a slower cap when
  // the route is sideways or backward relative to where the body faces.
  let cap = assumptions.maxSpeed * (player.speed ?? 1)
  if (player.lateral !== undefined && player.yaw !== undefined && gap) cap = directionalSpeed(cap, player.lateral, player.yaw, (target.x - player.x) / gap, (target.z - player.z) / gap)
  return Math.max(0, remainingReaction) + travelTime(gap - influenceRadius, projectedSpeed, assumptions.acceleration * (player.acceleration ?? 1), cap)
}
/** A defender's modeled time to contest a target: own capability, own reach. */
export function defenderArrival(player: PlayerState, target: Point2, assumptions: ModelAssumptions, remainingReaction = assumptions.reactionDelay, receiverHeight?: number) {
  const scale = receiverHeight === undefined ? player.contest ?? 1 : contestScale(player, receiverHeight)
  return estimateArrival(player, target, assumptions, assumptions.contestRadius * scale, remainingReaction)
}

/** Both visitation orders fail even with obstacles/turning/braking removed. */
export function responsibilityConflict(frame: WorldFrame, first: Responsibility, second: Responsibility, assumptions: ModelAssumptions): ResponsibilityConflict | null {
  if (first.defenderId !== second.defenderId || first.dueAt == null || second.dueAt == null || first.threatId === second.threatId) return null
  const defender = frame.players.find(player => player.id === first.defenderId)
  if (!defender) return null
  const transit = Math.max(0, distance(first.target, second.target) - first.influenceRadius - second.influenceRadius) / assumptions.maxSpeed
  const earliest = (responsibility: Responsibility) => Math.max(frame.t + travelTime(Math.max(0, distance(defender, responsibility.target) - responsibility.influenceRadius), Math.hypot(defender.vx, defender.vz), assumptions.acceleration, assumptions.maxSpeed), responsibility.availableAt ?? frame.t)
  const feasible = (a: Responsibility, b: Responsibility) => {
    const aAt = earliest(a)
    const bAt = Math.max(aAt + transit, b.availableAt ?? frame.t)
    return aAt <= a.dueAt! + 1e-8 && bAt <= b.dueAt! + 1e-8
  }
  if (feasible(first, second) || feasible(second, first)) return null
  return { defenderId: first.defenderId, at: frame.t, threatIds: [first.threatId, second.threatId], deadlines: [first.dueAt, second.dueAt], minimumTransit: transit, targets: [first.target, second.target], explanation: `The ${LABELS[first.threatId].toLowerCase()} and ${LABELS[second.threatId].toLowerCase()} commitments cannot both meet their modeled deadlines, even with an unobstructed route.` }
}

function arrivalForOption(player: PlayerState, option: ThreatOption, frame: WorldFrame, assumptions: ModelAssumptions) {
  const commitment = frame.responsibilities.find(task => task.defenderId === player.id && task.threatId === option.id)
  const remainingReaction = commitment ? Math.max(0, assumptions.reactionDelay - (frame.t - commitment.startedAt)) : assumptions.reactionDelay
  return defenderArrival(player, option.target, assumptions, remainingReaction, frame.players.find(p => p.id === option.playerId)?.height)
}

export function isThreatOpen(option: ThreatOption, frame: WorldFrame, assumptions: ModelAssumptions) {
  if (!option.available || option.influenceDistance <= assumptions.contestRadius || option.kind !== 'drive' && option.passClearance != null && option.passClearance <= 0) return false
  const defenders = frame.players.filter(player => player.team === 'defense')
  if (!defenders.length) return false
  const earliestArrival = Math.min(...defenders.map(player => arrivalForOption(player, option, frame, assumptions)))
  const opportunity = option.timeToRelease ?? assumptions.gatherTime + assumptions.readInterval
  return earliestArrival > opportunity
}

function windowsFromFrames(result: SimulationResult): OptionWindow[] {
  const map = new Map<ThreatId, OptionWindow>()
  const active = new Map<ThreatId, number>()
  for (let i = 0; i < result.frames.length; i++) {
    const frame = result.frames[i]
    const nextAt = result.frames[i + 1]?.t ?? frame.t
    const openIds = new Set<ThreatId>()
    for (const option of frame.options) {
      let window = map.get(option.id)
      if (!window) {
        window = { id: option.id, playerId: option.playerId, label: LABELS[option.id], duration: 0, totalDuration: 0, intervals: [], peakAt: frame.t, limitingDefenderId: option.responsibleDefenderId ?? null }
        map.set(option.id, window)
      }
      if (isThreatOpen(option, frame, result.config.assumptions)) {
        openIds.add(option.id)
        if (!active.has(option.id)) active.set(option.id, frame.t)
        if (nextAt > frame.t) window.totalDuration += nextAt - frame.t
      }
    }
    for (const [id, start] of active) {
      if (!openIds.has(id) || i === result.frames.length - 1) {
        const end = frame.t
        const window = map.get(id)!
        if (end > start + 1e-8) {
          window.intervals.push({ start: roundTime(start), end: roundTime(end) })
          if (end - start > window.duration) {
            window.duration = roundTime(end - start)
            window.peakAt = start + (end - start) / 2
          }
        }
        active.delete(id)
      }
    }
  }
  return [...map.values()].map(window => ({ ...window, totalDuration: roundTime(window.totalDuration) })).sort((a, b) => b.duration - a.duration)
}

function nearestFrame(frames: WorldFrame[], at: number) {
  return frames[Math.min(frames.length - 1, Math.max(0, Math.round(at / (frames[1]?.t - frames[0]?.t || 1))))]
}

function arrivals(result: SimulationResult, windows: OptionWindow[]): ArrivalObservation[] {
  return windows.filter(window => window.duration > 0).map(window => {
    const frame = nearestFrame(result.frames, window.peakAt)
    const option = frame.options.find(candidate => candidate.id === window.id)
    const defenders = frame.players.filter(player => player.team === 'defense')
    const fastest = option ? defenders.map(player => ({ player, seconds: arrivalForOption(player, option, frame, result.config.assumptions) })).sort((a, b) => a.seconds - b.seconds)[0] : undefined
    const defenderId = fastest?.player.id ?? option?.responsibleDefenderId ?? null
    const defender = frame.players.find(player => player.id === defenderId)
    const target = option?.target
    const radius = result.config.assumptions.contestRadius
    let observedArrivalAt: number | null = null
    if (defenderId) for (const later of result.frames) {
      if (later.t < frame.t) continue
      const laterDefender = later.players.find(player => player.id === defenderId)
      const laterTarget = later.options.find(candidate => candidate.id === window.id)?.target
      if (laterDefender && laterTarget && distance(laterDefender, laterTarget) <= radius * (laterDefender.contest ?? 1)) { observedArrivalAt = later.t; break }
    }
    const seconds = fastest?.seconds ?? (defender && target ? defenderArrival(defender, target, result.config.assumptions) : null)
    const opportunitySeconds = option?.timeToRelease ?? null
    return { threatId: window.id, playerId: window.playerId, defenderId, at: frame.t, seconds, observedArrivalAt, opportunitySeconds, leadSeconds: seconds != null && opportunitySeconds != null ? seconds - opportunitySeconds : null, label: 'Earliest modeled defender influence versus this option’s flight-and-gather horizon; screens, turning and closeout control can delay arrival.' }
  })
}

function recovery(result: SimulationResult): AnalysisResult['recovery'] {
  const trigger = result.events.find(event => event.type === 'tag' || event.type === 'transfer')
  if (!trigger) return { seconds: null, triggerAt: null, recoveredAt: null }
  const stableFor = 0.15
  let connectedSince: number | null = null
  for (const frame of result.frames) {
    if (frame.t <= trigger.t + result.config.assumptions.dt) continue
    const connected = frame.responsibilities.length > 0 && frame.responsibilities.every(task => {
      const defender = frame.players.find(player => player.id === task.defenderId)
      return defender && distance(defender, task.target) <= task.influenceRadius
    })
    if (!connected) connectedSince = null
    else {
      connectedSince ??= frame.t
      if (frame.t - connectedSince >= stableFor - 1e-8) return { seconds: roundTime(connectedSince - trigger.t), triggerAt: trigger.t, recoveredAt: connectedSince }
    }
  }
  return { seconds: null, triggerAt: trigger.t, recoveredAt: null }
}

/** Actual launched flights, at ≤5 ms probes through interpolated body state. */
export function analyzeFlights(result: SimulationResult): FlightEvidence[] {
  const flights = new Map<string, BallFlight>()
  for (const frame of result.frames) if (frame.ball.flight) {
    const flight = frame.ball.flight
    flights.set(`${flight.start}:${flight.from}:${flight.kind}`, flight)
  }
  const assumptions = result.config.assumptions
  return [...flights.values()].map(flight => {
    const evidence: FlightEvidence = { kind: flight.kind, from: flight.from, to: flight.to, start: flight.start, end: flight.end, minClearance: Infinity, sampleCount: 0, witness: null, conditionalAfterContact: false }
    const stop = result.diagnostics.flightStops?.find(contact => contact.flightStart === flight.start)
    const end = Math.min(result.frames.at(-1)?.t ?? 0, flight.end, stop?.at ?? Infinity)
    const first = flight.start + 0.005
    const count = Math.max(1, Math.ceil((end - first) / 0.005))
    for (let i = 0; i <= count && end >= first; i++) {
      const at = first + (end - first) * i / count
      const ball = flightPosition(flight, at, assumptions.gravity)
      let index = Math.min(result.frames.length - 1, Math.max(0, Math.floor(at / assumptions.dt)))
      // Decimal clocks may divide to the preceding integer. Keep probes in the
      // committed neighboring interval, including arbitrary synthetic frames.
      while (index + 1 < result.frames.length && result.frames[index + 1].t <= at + 1e-9) index++
      while (index > 0 && result.frames[index].t > at + 1e-9) index--
      const a = result.frames[index]
      const b = result.frames[Math.min(index + 1, result.frames.length - 1)]
      const q = b.t > a.t ? clamp((at - a.t) / (b.t - a.t), 0, 1) : 0
      for (const defender of a.players.filter(player => player.team === 'defense')) {
        const other = b.players.find(player => player.id === defender.id) ?? defender
        const body = interpolateBody(defender, other, q)
        const closest = ballBodyClearance(ball, body, assumptions)
        if (closest.clearance < evidence.minClearance) { evidence.minClearance = closest.clearance; evidence.witness = { t: at, defenderId: body.id, part: closest.part, ball, point: closest.point } }
      }
      evidence.sampleCount++
    }
    if (stop) {
      evidence.stoppedAt = stop.at
      if (stop.clearance <= evidence.minClearance) { evidence.minClearance = stop.clearance; evidence.witness = { t: stop.at, defenderId: stop.playerId, part: stop.part, ball: { ...stop.ball }, point: { ...stop.point } } }
    }
    evidence.conditionalAfterContact = !!stop || evidence.minClearance < 0
    return evidence
  })
}

export function analyze(result: SimulationResult): AnalysisResult {
  const assumptions = { ...result.config.assumptions }
  const windows = windowsFromFrames(result)
  const conflicts: ResponsibilityConflict[] = []
  const seenConflicts = new Set<string>()
  for (const frame of result.frames) for (let i = 0; i < frame.responsibilities.length; i++) for (let j = i + 1; j < frame.responsibilities.length; j++) {
    const conflict = responsibilityConflict(frame, frame.responsibilities[i], frame.responsibilities[j], assumptions)
    if (!conflict) continue
    const key = `${conflict.defenderId}:${conflict.threatIds.slice().sort().join(':')}`
    if (!seenConflicts.has(key)) { seenConflicts.add(key); conflicts.push(conflict) }
  }
  const flightEvidence = analyzeFlights(result)
  const warnings = [...result.diagnostics.warnings]
  if (flightEvidence.some(flight => flight.conditionalAfterContact && flight.stoppedAt == null)) warnings.push('A launched ball intersects an analytical body envelope; later continuations are conditional geometry.')
  if (!result.diagnostics.missedCatchCount && result.events.some(event => event.type === 'missed-catch')) warnings.push('A receiver did not meet the fixed catch point; the continuation is outside the supported catch.')
  if (result.diagnostics.boundaryBreach) warnings.push('The replay crosses the supported court boundary.')
  const lastFrame = result.frames.at(-1)
  if (!lastFrame || lastFrame.t < assumptions.duration - assumptions.dt - 1e-8 || lastFrame.ball.flight && lastFrame.ball.flight.end > lastFrame.t + 1e-8 || lastFrame.ball.phase === 'handle' || lastFrame.ball.phase === 'gather') warnings.push('The replay horizon ends before the possession continuation is resolved.')
  const actionableHorizon = assumptions.gatherTime + assumptions.readInterval
  const exposures = windows.filter(window => window.duration > actionableHorizon + assumptions.dt)
  const near = windows.some(window => window.duration > Math.max(assumptions.dt, actionableHorizon - 2 * assumptions.dt))
  const classification: AnalysisStatus = warnings.length ? 'thin' : conflicts.length || exposures.length ? 'breaks' : near ? 'thin' : 'holds'
  const biggest = exposures[0] ?? windows[0]
  const measuredExplanation = conflicts.length ? conflicts[0].explanation
    : exposures.length ? `${biggest.label} retains a ${biggest.duration.toFixed(1)} s modeled opening, longer than the ${actionableHorizon.toFixed(1)} s catch-and-read assumption.`
    : near ? 'The remaining opening is close to the catch-and-read assumption; test feet and reaction timing.'
    : 'No available option retains an actionable opening in this replay under the stated movement and catch-and-read assumptions.'
  const explanation = warnings.length ? `${measuredExplanation} Later continuation evidence is conditional; inspect the flight, catch or movement warning.` : measuredExplanation
  return { windows, arrival: arrivals(result, windows), recovery: recovery(result), rotationCount: result.events.filter(event => event.type === 'transfer').length, conflicts, flightEvidence, exposures, classification, explanation, assumptions, modelVersion: result.modelVersion, actionableHorizon, warnings }
}

export function compare(beforeResult: SimulationResult, afterResult: SimulationResult): ComparisonResult {
  const before = analyze(beforeResult)
  const after = analyze(afterResult)
  const ids = new Set([...before.windows.map(window => window.id), ...after.windows.map(window => window.id)])
  const threshold = Math.max(before.assumptions.dt, after.assumptions.dt)
  const tradeoffs: WindowTradeoff[] = [...ids].map(id => {
    const a = before.windows.find(window => window.id === id)?.duration ?? 0
    const b = after.windows.find(window => window.id === id)?.duration ?? 0
    const delta = roundTime(b - a)
    return { id, label: LABELS[id], before: a, after: b, delta, direction: delta < -threshold ? 'closes' : delta > threshold ? 'opens' : 'similar' }
  })
  const closed = tradeoffs.filter(change => change.direction === 'closes').sort((a, b) => a.delta - b.delta)
  const opened = tradeoffs.filter(change => change.direction === 'opens').sort((a, b) => b.delta - a.delta)
  const explanation = closed.length && opened.length ? `${closed[0].label} closes by ${(-closed[0].delta).toFixed(1)} s; ${opened[0].label.toLowerCase()} opens by ${opened[0].delta.toFixed(1)} s.`
    : closed.length ? `${closed[0].label} closes by ${(-closed[0].delta).toFixed(1)} s in this modeled replay.`
    : opened.length ? `${opened[0].label} opens by ${opened[0].delta.toFixed(1)} s in this modeled replay.`
    : 'These answers retain similar option windows at the motion-clock resolution.'
  return { before, after, tradeoffs, explanation }
}
