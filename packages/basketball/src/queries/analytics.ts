import { ballBodyClearance } from '../simulation/geometry'
import { defenderArrival, travelTime } from './sharedArrival'
import { flightPosition, interpolateBody } from '../simulation/physicalExecution'
import { EXECUTION_LIMITS } from '../domain/executionBudget'
import type {
  BallFlight,
  ModelAssumptions,
  PlayerId,
  PlayerState,
  Point2,
  Point3,
  Responsibility,
  ExecutionTrace,
  ThreatId,
  ThreatOption,
  WorldFrame,
} from '../domain/types'

export { defenderArrival, estimateArrival, travelTime } from './sharedArrival'

export type AnalysisStatus = 'holds' | 'thin' | 'breaks'
export interface OptionWindow {
  id: ThreatId
  playerId: PlayerId
  label: string
  duration: number
  totalDuration: number
  intervals: { start: number; end: number; playerId: PlayerId }[]
  peakAt: number
  limitingDefenderId: PlayerId | null
}
export interface ArrivalObservation {
  threatId: ThreatId
  playerId: PlayerId
  defenderId: PlayerId | null
  at: number
  seconds: number | null
  observedArrivalAt: number | null
  label: string
  opportunitySeconds: number | null
  leadSeconds: number | null
}
export interface ResponsibilityConflict {
  defenderId: PlayerId
  at: number
  threatIds: [ThreatId, ThreatId]
  deadlines: [number, number]
  minimumTransit: number
  targets: [Point2, Point2]
  explanation: string
}
export interface FlightEvidence {
  kind: BallFlight['kind']
  from: PlayerId
  to: PlayerId | null
  start: number
  end: number
  minClearance: number
  sampleCount: number
  witness: { t: number; defenderId: PlayerId; part: string; ball: Point3; point: Point3 } | null
  conditionalAfterContact: boolean
  /** Actual execution stopped here; end remains the immutable launch plan. */
  stoppedAt?: number
}
export interface AnalysisResult {
  windows: OptionWindow[]
  arrival: ArrivalObservation[]
  recovery: { seconds: number | null; triggerAt: number | null; recoveredAt: number | null }
  rotationCount: number
  conflicts: ResponsibilityConflict[]
  flightEvidence: FlightEvidence[]
  exposures: OptionWindow[]
  classification: AnalysisStatus
  explanation: string
  assumptions: ModelAssumptions
  modelVersion: string
  actionableHorizon: number
  warnings: string[]
}
export interface WindowTradeoff {
  id: ThreatId
  label: string
  before: number
  after: number
  delta: number
  direction: 'closes' | 'opens' | 'similar'
}
export interface ComparisonResult {
  before: AnalysisResult
  after: AnalysisResult
  tradeoffs: WindowTradeoff[]
  explanation: string
}

function opportunityLabel(result: ExecutionTrace, id: ThreatId): string {
  return result.input.program.opportunities.find((opportunity) => opportunity.id === id)?.label ?? id
}
function assertQueryWork(result: ExecutionTrace): void {
  if (result.frames.length > EXECUTION_LIMITS.frames) throw new Error('Analysis exceeds its frame budget.')
  let pairs = 0
  for (const frame of result.frames) {
    const n = frame.responsibilities.length
    if (
      n > EXECUTION_LIMITS.activeObligations ||
      frame.options.length > EXECUTION_LIMITS.opportunities ||
      frame.players.length > EXECUTION_LIMITS.players
    )
      throw new Error('Analysis exceeds its per-frame record budget.')
    for (const task of frame.responsibilities)
      if (task.trigger.length > EXECUTION_LIMITS.label) throw new Error('Analysis obligation text exceeds its budget.')
    pairs += (n * (n - 1)) / 2
    if (pairs > EXECUTION_LIMITS.queryPairs) throw new Error('Analysis exceeds its aggregate pair work budget.')
  }
}
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
const roundTime = (v: number) => Math.round(v * 1e9) / 1e9

/** Both visitation orders fail even with obstacles/turning/braking removed. */
export function responsibilityConflict(
  frame: WorldFrame,
  first: Responsibility,
  second: Responsibility,
  assumptions: ModelAssumptions,
  labelFor: (id: ThreatId) => string = (id) => id,
): ResponsibilityConflict | null {
  if (
    first.defenderId !== second.defenderId ||
    first.dueAt == null ||
    second.dueAt == null ||
    first.threatId === second.threatId
  )
    return null
  const defender = frame.players.find((player) => player.id === first.defenderId)
  if (!defender) return null
  // The impossibility claim uses an optimistic route but must retain this
  // defender's actual physical ceiling. Baseline caps can wrongly rule out a
  // feasible path for faster personnel. Facing and obstacles remain omitted.
  const maxSpeed = assumptions.maxSpeed * (defender.speed ?? 1)
  const acceleration = assumptions.acceleration * (defender.acceleration ?? 1)
  const transit =
    Math.max(0, distance(first.target, second.target) - first.influenceRadius - second.influenceRadius) / maxSpeed
  const earliest = (responsibility: Responsibility) =>
    Math.max(
      frame.t +
        travelTime(
          Math.max(0, distance(defender, responsibility.target) - responsibility.influenceRadius),
          Math.hypot(defender.vx, defender.vz),
          acceleration,
          maxSpeed,
        ),
      responsibility.availableAt ?? frame.t,
    )
  const feasible = (a: Responsibility, b: Responsibility) => {
    const aAt = earliest(a)
    const bAt = Math.max(aAt + transit, b.availableAt ?? frame.t)
    return aAt <= a.dueAt! + 1e-8 && bAt <= b.dueAt! + 1e-8
  }
  if (feasible(first, second) || feasible(second, first)) return null
  return {
    defenderId: first.defenderId,
    at: frame.t,
    threatIds: [first.threatId, second.threatId],
    deadlines: [first.dueAt, second.dueAt],
    minimumTransit: transit,
    targets: [first.target, second.target],
    explanation: `The ${labelFor(first.threatId).toLowerCase()} and ${labelFor(second.threatId).toLowerCase()} commitments cannot both meet their modeled deadlines, even with an unobstructed route.`,
  }
}

function arrivalForOption(player: PlayerState, option: ThreatOption, frame: WorldFrame, assumptions: ModelAssumptions) {
  const commitment = frame.responsibilities.find((task) => task.defenderId === player.id && task.threatId === option.id)
  const remainingReaction = commitment
    ? Math.max(0, assumptions.reactionDelay - (frame.t - commitment.startedAt))
    : assumptions.reactionDelay
  return defenderArrival(
    player,
    option.target,
    assumptions,
    remainingReaction,
    frame.players.find((p) => p.id === option.playerId),
  )
}

export function isThreatOpen(option: ThreatOption, frame: WorldFrame, assumptions: ModelAssumptions) {
  if (
    !option.available ||
    option.influenceDistance <= assumptions.contestRadius ||
    (option.kind !== 'keep' && option.passClearance != null && option.passClearance <= 0)
  )
    return false
  const defenders = frame.players.filter((player) => player.team === 'defense')
  if (!defenders.length) return false
  const earliestArrival = Math.min(...defenders.map((player) => arrivalForOption(player, option, frame, assumptions)))
  const opportunity = option.timeToRelease ?? assumptions.gatherTime + assumptions.readInterval
  return earliestArrival > opportunity
}

function windowsFromFrames(result: ExecutionTrace): OptionWindow[] {
  const map = new Map<ThreatId, OptionWindow>()
  const active = new Map<ThreatId, { start: number; playerId: PlayerId; defenderId: PlayerId | null }>()
  const close = (id: ThreatId, end: number) => {
    const opening = active.get(id)
    if (!opening) return
    const window = map.get(id)!,
      start = opening.start
    if (end > start + 1e-8) {
      window.intervals.push({ start: roundTime(start), end: roundTime(end), playerId: opening.playerId })
      if (end - start > window.duration) {
        window.duration = roundTime(end - start)
        window.playerId = opening.playerId
        window.limitingDefenderId = opening.defenderId
        window.peakAt = start + (end - start) / 2
      }
    }
    active.delete(id)
  }
  for (let i = 0; i < result.frames.length; i++) {
    const frame = result.frames[i],
      nextAt = result.frames[i + 1]?.t ?? frame.t,
      openIds = new Set<ThreatId>()
    for (const option of frame.options) {
      let window = map.get(option.id)
      if (!window) {
        window = {
          id: option.id,
          playerId: option.playerId,
          label: opportunityLabel(result, option.id),
          duration: 0,
          totalDuration: 0,
          intervals: [],
          peakAt: frame.t,
          limitingDefenderId: option.responsibleDefenderId ?? null,
        }
        map.set(option.id, window)
      }
      const previous = active.get(option.id)
      if (previous && previous.playerId !== option.playerId) close(option.id, frame.t)
      if (isThreatOpen(option, frame, result.input.assumptions)) {
        openIds.add(option.id)
        if (!active.has(option.id))
          active.set(option.id, {
            start: frame.t,
            playerId: option.playerId,
            defenderId: option.responsibleDefenderId ?? null,
          })
        if (nextAt > frame.t) window.totalDuration += nextAt - frame.t
      }
    }
    for (const id of [...active.keys()]) if (!openIds.has(id) || i === result.frames.length - 1) close(id, frame.t)
  }
  return [...map.values()]
    .map((w) => ({ ...w, totalDuration: roundTime(w.totalDuration) }))
    .sort((a, b) => b.duration - a.duration)
}

function nearestFrame(frames: WorldFrame[], at: number) {
  let low = 0
  let high = frames.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (frames[middle].t < at) low = middle + 1
    else high = middle
  }
  const later = frames[low]
  const earlier = frames[Math.max(0, low - 1)]
  return at - earlier.t <= later.t - at + 1e-9 ? earlier : later
}

function arrivals(result: ExecutionTrace, windows: OptionWindow[]): ArrivalObservation[] {
  return windows
    .filter((window) => window.duration > 0)
    .map((window) => {
      const frame = nearestFrame(result.frames, window.peakAt)
      const option = frame.options.find(
        (candidate) => candidate.id === window.id && candidate.playerId === window.playerId,
      )
      const defenders = frame.players.filter((player) => player.team === 'defense')
      const fastest = option
        ? defenders
            .map((player) => ({ player, seconds: arrivalForOption(player, option, frame, result.input.assumptions) }))
            .sort((a, b) => a.seconds - b.seconds)[0]
        : undefined
      const defenderId = fastest?.player.id ?? option?.responsibleDefenderId ?? null
      const defender = frame.players.find((player) => player.id === defenderId)
      const target = option?.target
      const radius = result.input.assumptions.contestRadius
      let observedArrivalAt: number | null = null
      if (defenderId)
        for (const later of result.frames) {
          if (later.t < frame.t) continue
          const laterDefender = later.players.find((player) => player.id === defenderId)
          const laterTarget = later.options.find(
            (candidate) => candidate.id === window.id && candidate.playerId === window.playerId,
          )?.target
          if (
            laterDefender &&
            laterTarget &&
            distance(laterDefender, laterTarget) <= radius * (laterDefender.contest ?? 1)
          ) {
            observedArrivalAt = later.t
            break
          }
        }
      const seconds =
        fastest?.seconds ?? (defender && target ? defenderArrival(defender, target, result.input.assumptions) : null)
      const opportunitySeconds = option?.timeToRelease ?? null
      return {
        threatId: window.id,
        playerId: window.playerId,
        defenderId,
        at: frame.t,
        seconds,
        observedArrivalAt,
        opportunitySeconds,
        leadSeconds: seconds != null && opportunitySeconds != null ? seconds - opportunitySeconds : null,
        label:
          'Earliest modeled defender influence versus this option’s flight-and-gather horizon; screens, turning and closeout control can delay arrival.',
      }
    })
}

function recovery(result: ExecutionTrace): AnalysisResult['recovery'] {
  const trigger = result.events.find((event) => event.type === 'tag' || event.type === 'transfer')
  if (!trigger) return { seconds: null, triggerAt: null, recoveredAt: null }
  const stableFor = 0.15
  let connectedSince: number | null = null
  for (const frame of result.frames) {
    if (frame.t <= trigger.t + result.input.assumptions.dt) continue
    const connected =
      frame.responsibilities.length > 0 &&
      frame.responsibilities.every((task) => {
        const defender = frame.players.find((player) => player.id === task.defenderId)
        return defender && distance(defender, task.target) <= task.influenceRadius
      })
    if (!connected) connectedSince = null
    else {
      connectedSince ??= frame.t
      if (frame.t - connectedSince >= stableFor - 1e-8)
        return { seconds: roundTime(connectedSince - trigger.t), triggerAt: trigger.t, recoveredAt: connectedSince }
    }
  }
  return { seconds: null, triggerAt: trigger.t, recoveredAt: null }
}

/** Actual launched flights, at ≤5 ms probes through interpolated body state. */
export function analyzeFlights(result: ExecutionTrace): FlightEvidence[] {
  assertQueryWork(result)
  const flights = new Map<string, BallFlight>()
  for (const frame of result.frames)
    if (frame.ball.flight) {
      const flight = frame.ball.flight
      flights.set(`${flight.start}:${flight.from}:${flight.kind}`, flight)
    }
  const assumptions = result.input.assumptions
  return [...flights.values()].map((flight) => {
    const evidence: FlightEvidence = {
      kind: flight.kind,
      from: flight.from,
      to: flight.to,
      start: flight.start,
      end: flight.end,
      minClearance: Infinity,
      sampleCount: 0,
      witness: null,
      conditionalAfterContact: false,
    }
    const stop = result.diagnostics.flightStops?.find((contact) => contact.flightStart === flight.start)
    const end = Math.min(result.frames.at(-1)?.t ?? 0, flight.end, stop?.at ?? Infinity)
    const first = flight.start + 0.005
    const count = Math.max(1, Math.ceil((end - first) / 0.005))
    for (let i = 0; i <= count && end >= first; i++) {
      const at = first + ((end - first) * i) / count
      const ball = flightPosition(flight, at, assumptions.gravity)
      let index = Math.min(result.frames.length - 1, Math.max(0, Math.floor(at / assumptions.dt)))
      // Decimal clocks may divide to the preceding integer. Keep probes in the
      // committed neighboring interval, including arbitrary synthetic frames.
      while (index + 1 < result.frames.length && result.frames[index + 1].t <= at + 1e-9) index++
      while (index > 0 && result.frames[index].t > at + 1e-9) index--
      const a = result.frames[index]
      const b = result.frames[Math.min(index + 1, result.frames.length - 1)]
      const q = b.t > a.t ? clamp((at - a.t) / (b.t - a.t), 0, 1) : 0
      for (const defender of a.players.filter((player) => player.team === 'defense')) {
        const other = b.players.find((player) => player.id === defender.id) ?? defender
        const body = interpolateBody(defender, other, q)
        const closest = ballBodyClearance(ball, body, assumptions)
        if (closest.clearance < evidence.minClearance) {
          evidence.minClearance = closest.clearance
          evidence.witness = { t: at, defenderId: body.id, part: closest.part, ball, point: closest.point }
        }
      }
      evidence.sampleCount++
    }
    if (stop) {
      evidence.stoppedAt = stop.at
      if (stop.clearance <= evidence.minClearance) {
        evidence.minClearance = stop.clearance
        evidence.witness = {
          t: stop.at,
          defenderId: stop.playerId,
          part: stop.part,
          ball: { ...stop.ball },
          point: { ...stop.point },
        }
      }
    }
    evidence.conditionalAfterContact = !!stop || evidence.minClearance < 0
    return evidence
  })
}

export function analyze(result: ExecutionTrace): AnalysisResult {
  assertQueryWork(result)
  const assumptions = { ...result.input.assumptions }
  const windows = windowsFromFrames(result)
  const conflicts: ResponsibilityConflict[] = []
  const seenConflicts = new Set<string>()
  for (const frame of result.frames)
    for (let i = 0; i < frame.responsibilities.length; i++)
      for (let j = i + 1; j < frame.responsibilities.length; j++) {
        const conflict = responsibilityConflict(
          frame,
          frame.responsibilities[i],
          frame.responsibilities[j],
          assumptions,
          (id) => opportunityLabel(result, id),
        )
        if (!conflict) continue
        const key = JSON.stringify([conflict.defenderId, conflict.threatIds.slice().sort()])
        if (!seenConflicts.has(key)) {
          seenConflicts.add(key)
          conflicts.push(conflict)
        }
      }
  const flightEvidence = analyzeFlights(result)
  const warnings = [...result.diagnostics.warnings]
  if (flightEvidence.some((flight) => flight.conditionalAfterContact && flight.stoppedAt == null))
    warnings.push(
      'A launched ball intersects an analytical body envelope; later continuations are conditional geometry.',
    )
  if (!result.diagnostics.missedCatchCount && result.events.some((event) => event.type === 'missed-catch'))
    warnings.push('A receiver did not meet the fixed catch point; the continuation is outside the supported catch.')
  if (result.diagnostics.boundaryBreach) warnings.push('The replay crosses the supported court boundary.')
  const lastFrame = result.frames.at(-1)
  if (
    !lastFrame ||
    lastFrame.t < assumptions.duration - assumptions.dt - 1e-8 ||
    (lastFrame.ball.flight && lastFrame.ball.flight.end > lastFrame.t + 1e-8) ||
    lastFrame.ball.phase === 'handle' ||
    lastFrame.ball.phase === 'gather'
  )
    warnings.push('The replay horizon ends before the possession continuation is resolved.')
  const actionableHorizon = assumptions.gatherTime + assumptions.readInterval
  const exposures = windows.filter((window) => window.duration > actionableHorizon + assumptions.dt)
  const near = windows.some(
    (window) => window.duration > Math.max(assumptions.dt, actionableHorizon - 2 * assumptions.dt),
  )
  const classification: AnalysisStatus = warnings.length
    ? 'thin'
    : conflicts.length || exposures.length
      ? 'breaks'
      : near
        ? 'thin'
        : 'holds'
  const biggest = exposures[0] ?? windows[0]
  const measuredExplanation = conflicts.length
    ? conflicts[0].explanation
    : exposures.length
      ? `${biggest.label} retains a ${biggest.duration.toFixed(1)} s modeled opening, longer than the ${actionableHorizon.toFixed(1)} s catch-and-read assumption.`
      : near
        ? 'The remaining opening is close to the catch-and-read assumption; test feet and reaction timing.'
        : 'No available option retains an actionable opening in this replay under the stated movement and catch-and-read assumptions.'
  const explanation = warnings.length
    ? `${measuredExplanation} Later continuation evidence is conditional; inspect the flight, catch or movement warning.`
    : measuredExplanation
  return {
    windows,
    arrival: arrivals(result, windows),
    recovery: recovery(result),
    rotationCount: result.events.filter((event) => event.type === 'transfer').length,
    conflicts,
    flightEvidence,
    exposures,
    classification,
    explanation,
    assumptions,
    modelVersion: result.modelVersion,
    actionableHorizon,
    warnings,
  }
}

export function compare(beforeResult: ExecutionTrace, afterResult: ExecutionTrace): ComparisonResult {
  const before = analyze(beforeResult)
  const after = analyze(afterResult)
  const ids = new Set([...before.windows.map((window) => window.id), ...after.windows.map((window) => window.id)])
  const threshold = Math.max(before.assumptions.dt, after.assumptions.dt)
  const tradeoffs: WindowTradeoff[] = [...ids].map((id) => {
    const a = before.windows.find((window) => window.id === id)?.duration ?? 0
    const b = after.windows.find((window) => window.id === id)?.duration ?? 0
    const delta = roundTime(b - a)
    return {
      id,
      label:
        after.windows.find((window) => window.id === id)?.label ??
        before.windows.find((window) => window.id === id)?.label ??
        id,
      before: a,
      after: b,
      delta,
      direction: delta < -threshold ? 'closes' : delta > threshold ? 'opens' : 'similar',
    }
  })
  const closed = tradeoffs.filter((change) => change.direction === 'closes').sort((a, b) => a.delta - b.delta)
  const opened = tradeoffs.filter((change) => change.direction === 'opens').sort((a, b) => b.delta - a.delta)
  const explanation =
    closed.length && opened.length
      ? `${closed[0].label} closes by ${(-closed[0].delta).toFixed(1)} s; ${opened[0].label.toLowerCase()} opens by ${opened[0].delta.toFixed(1)} s.`
      : closed.length
        ? `${closed[0].label} closes by ${(-closed[0].delta).toFixed(1)} s in this modeled replay.`
        : opened.length
          ? `${opened[0].label} opens by ${opened[0].delta.toFixed(1)} s in this modeled replay.`
          : 'These answers retain similar option windows at the motion-clock resolution.'
  return { before, after, tradeoffs, explanation }
}
