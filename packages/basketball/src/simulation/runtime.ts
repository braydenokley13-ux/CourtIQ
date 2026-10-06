import { ENGINE_VERSION, executionCompatibility, parseExecutionInput } from '../domain/execution'
import { EXECUTION_LIMITS, jsonBytes } from '../domain/executionBudget'
import type {
  ExecutionInput,
  Observation,
  PolicyMemory,
  ParameterValues,
  OpportunityDefinition,
  PolicyEvaluation,
} from '../domain/program'
import type {
  BallFlight,
  BallState,
  ExecutionTrace,
  PlayerId,
  PlayerState,
  Point2,
  ReadCandidate,
  Responsibility,
  WorldEvent,
  WorldFrame,
} from '../domain/types'
import { ballBodyClearance } from './analyticalGeometry'
import { contestScale, resolveCapability, type Capability } from './capability'
import { estimateArrival } from '../queries/analytics'
import { canReachBall, catchSupport, firstFlightContact, flightPosition } from './physicalExecution'
import { advance, predictReceiver } from './motion'
import {
  RIM,
  clamp,
  distance,
  actorId,
  condition,
  target,
  scalar,
  observeActions,
  defensiveObligations,
  advanceOffense,
  motionGoals,
  readAfter,
  type EvaluationContext,
} from './interpreter'
function finiteJSON(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Execution produced a nonfinite state.')
  if (value && typeof value === 'object') for (const child of Object.values(value)) finiteJSON(child)
}
const copy = <T>(x: T): T => {
  finiteJSON(x)
  return JSON.parse(JSON.stringify(x))
}
const player = (players: PlayerState[], id: PlayerId): PlayerState => {
  const p = players.find((p) => p.id === id)
  if (!p) throw new Error(`Player ${id} is absent.`)
  return p
}
/** Complete state is private to one execution. A displayed WorldFrame is not a checkpoint. */
interface CompleteExecutionState {
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
  endedAt: BallFlight['a'] | null
  memory: PolicyMemory
  appliedCommands: Set<string>
  releasedMoves: Set<string>
  previousOwnership: Map<PlayerId, string>
  episodes: Map<string, { start: number; serial: number }>
  episodeSerial: number
  rng: number
  observationHistory: WorldFrame[]
}
function ballState(s: CompleteExecutionState, players: PlayerState[], t: number, input: ExecutionInput): BallState {
  if (s.flight)
    return {
      ...flightPosition(s.flight, t, input.assumptions.gravity),
      phase: s.flight.kind === 'shot' ? 'shot' : 'pass',
      owner: s.flight.from,
      receiver: s.flight.to,
      flight: copy(s.flight),
    }
  if (s.phase === 'dead' && s.endedAt) return { ...s.endedAt, phase: 'dead', owner: null, receiver: null, flight: null }
  const p = player(players, s.owner)
  return {
    x: p.x + Math.sin(p.yaw) * 0.22,
    z: p.z + Math.cos(p.yaw) * 0.22,
    y: s.phase === 'handle' ? 0.5 + Math.abs(Math.sin(t * 9)) * 0.65 : 1.5,
    phase: s.phase,
    owner: s.phase === 'dead' ? null : p.id,
    receiver: p.id,
    flight: null,
  }
}
function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const x = b.x - a.x,
    z = b.z - a.z,
    u = clamp(((p.x - a.x) * x + (p.z - a.z) * z) / (x * x + z * z || 1), 0, 1)
  return distance(p, { x: a.x + x * u, z: a.z + z * u })
}
function preview(flight: BallFlight, players: PlayerState[], input: ExecutionInput): number {
  let clearance = Infinity
  for (let i = 1; i < 16; i++) {
    const t = flight.start + ((flight.end - flight.start) * i) / 16,
      age = t - flight.start,
      ball = flightPosition(flight, t, input.assumptions.gravity)
    for (const p of players.filter((p) => p.team === 'defense')) {
      const predicted = {
        ...p,
        x: p.x + p.vx * Math.min(age, 0.35),
        z: p.z + p.vz * Math.min(age, 0.35),
        pose: { ...p.pose, hands: Math.max(0.8, p.pose.hands) },
      }
      if (canReachBall(ball, predicted, input.assumptions))
        clearance = Math.min(clearance, ballBodyClearance(ball, predicted, input.assumptions).clearance)
    }
  }
  return clearance
}
function observation(frame: WorldFrame, input: ExecutionInput): Observation {
  return {
    tick: frame.tick,
    t: frame.t,
    players: frame.players,
    ball: frame.ball,
    responsibilities: frame.responsibilities,
    roleBindings: input.program.roles,
  }
}
export function parametersAt(input: ExecutionInput, time: number): ParameterValues {
  const values = { ...input.parameters }
  for (const c of input.commands) if (c.at <= time + 1e-9 && c.kind === 'parameters') Object.assign(values, c.values)
  return values
}
function evaluatePolicy(ctx: EvaluationContext, t: number, tick: number, input: ExecutionInput): PolicyEvaluation {
  const before = copy(ctx.memory)
  observeActions(ctx)
  const evaluated = defensiveObligations(ctx, t, input.assumptions.gatherTime, input.assumptions.contestRadius),
    memoryAfter = copy(ctx.memory),
    rails: PolicyEvaluation['parameterTargets'] = []
  for (const p of ctx.observed.players.filter((p) => p.team === 'defense')) {
    const primary = evaluated.obligations
      .filter((r) => r.defenderId === p.id)
      .sort((a, b) => b.priority - a.priority)[0]
    if (!primary) continue
    const def =
      ctx.program.defenseRules
        .find((r) => r.id === primary.sourceRuleId)
        ?.obligations.find((r) => r.id === primary.id) ?? ctx.program.initial.matchups.find((r) => r.id === primary.id)
    if (!def?.railParameter) continue
    const d = ctx.program.parameters.find((p) => p.id === def.railParameter)!
    if (typeof d.min !== 'number' || typeof d.max !== 'number') continue
    const resolve = (value: number) =>
      defensiveObligations(
        {
          ...ctx,
          parameters: { ...ctx.parameters, [d.id]: value },
          memory: copy(memoryAfter),
          budget: { remaining: 8192 },
        },
        t,
        input.assumptions.gatherTime,
        input.assumptions.contestRadius,
      )
        .obligations.filter((r) => r.defenderId === p.id)
        .sort((a, b) => b.priority - a.priority)[0]
    const low = resolve(d.min),
      high = resolve(d.max),
      same =
        !!low &&
        !!high &&
        low.id === primary.id &&
        high.id === primary.id &&
        low.sourceRuleId === primary.sourceRuleId &&
        high.sourceRuleId === primary.sourceRuleId,
      editable = same && distance(low.target, high.target) > 1e-6
    rails.push({
      parameterId: d.id,
      actorId: p.id,
      obligationId: primary.id,
      sourceRuleId: primary.sourceRuleId!,
      min: d.min,
      max: d.max,
      value: ctx.parameters[d.id] as number,
      lower: copy(low?.target ?? primary.target),
      current: copy(primary.target),
      upper: copy(high?.target ?? primary.target),
      editable,
      reason: editable
        ? 'Targets evaluated on the same committed observation and policy memory.'
        : 'Changing this parameter changes responsibility ownership or has no target effect.',
    })
  }
  return {
    effectiveTick: tick,
    observedTick: ctx.observed.tick,
    observedAt: ctx.observed.t,
    parameters: { ...ctx.parameters },
    memoryBefore: before,
    memoryAfter,
    activeRuleIds: evaluated.activeRuleIds,
    obligations: evaluated.obligations,
    parameterTargets: rails,
  }
}
function opportunities(
  ctx: EvaluationContext,
  ball: BallState,
  t: number,
  allowed: string[],
  earliest: number,
  readAt: number,
  input: ExecutionInput,
  responsibilities: Responsibility[],
): WorldFrame['options'] {
  const carrier = player(ctx.observed.players, ctx.owner),
    defenders = ctx.observed.players.filter((p) => p.team === 'defense')
  return input.program.opportunities.map((o) => {
    const receiver = player(ctx.observed.players, actorId(o.actor, ctx)),
      point = target(o.target, ctx),
      scaled = (p: PlayerState) => distance(p, point) / contestScale(p, receiver),
      nearest = defenders.reduce((best, p) => (scaled(p) < scaled(best) ? p : best), defenders[0]),
      travel = distance(carrier, receiver) / input.assumptions.passSpeed + 0.12,
      hold =
        o.kind === 'keep' && receiver.id === ctx.owner && ball.phase === 'handle'
          ? input.assumptions.readInterval
          : input.assumptions.gatherTime,
      clearance =
        o.kind === 'keep'
          ? null
          : Math.min(
              ...defenders
                .filter((d) => distance(d, carrier) > 1.05)
                .map(
                  (d) =>
                    segmentDistance(d, carrier, receiver) - input.assumptions.bodyRadius - input.assumptions.ballRadius,
                ),
            ),
      responsibility =
        responsibilities.find(
          (r) => r.threatId === o.id && r.offensivePlayerId === receiver.id && r.kind !== 'split',
        ) ??
        responsibilities.find((r) => r.threatId === o.id && r.offensivePlayerId === receiver.id) ??
        responsibilities.find((r) => r.threatId === o.id)
    const waiting = o.kind === 'keep' && receiver.id === ctx.owner ? 0 : Math.max(0, readAt - t)
    return {
      id: o.id,
      playerId: receiver.id,
      kind: o.kind,
      target: point,
      available:
        t >= earliest &&
        !['pass', 'dead', 'shot'].includes(ball.phase) &&
        (o.kind === 'keep' ? receiver.id === ctx.owner : receiver.id !== ctx.owner) &&
        allowed.includes(o.id) &&
        (!o.when || condition(o.when, ctx).matches),
      passClearance: clearance === Infinity ? 9 : clearance,
      influenceDistance: scaled(nearest),
      responsibleDefenderId: responsibility?.defenderId,
      opportunityDeadline: t + travel + hold + waiting,
      timeToRelease: travel + hold + waiting,
      readAvailableAt: readAt,
    }
  })
}
function candidates(
  options: WorldFrame['options'],
  ctx: EvaluationContext,
  input: ExecutionInput,
  passes: number,
): ReadCandidate[] {
  const actor = player(ctx.observed.players, ctx.owner),
    defenders = ctx.observed.players.filter((p) => p.team === 'defense')
  return options.map((o) => {
    const receiver = player(ctx.observed.players, o.playerId),
      travel = distance(actor, receiver) / input.assumptions.passSpeed + 0.12,
      gap =
        Math.min(
          ...defenders.map((d) =>
            estimateArrival(
              d,
              receiver,
              input.assumptions,
              input.assumptions.contestRadius * contestScale(d, receiver),
              0,
            ),
          ),
        ) - (o.kind === 'keep' ? 0.35 : travel + input.assumptions.gatherTime),
      lane = o.passClearance ?? 1,
      recipe = input.program.opportunities.find((p) => p.id === o.id)!,
      value =
        gap +
        scalar(recipe.scoreBias, {
          ...ctx,
          metrics: { ...ctx.metrics, passCount: passes, arrivalGap: gap, clearance: lane },
        }) +
        clamp(lane, -1, 1) * recipe.laneWeight
    return {
      threatId: o.id,
      playerId: o.playerId,
      available: o.available && (passes < input.program.terminal.maxPasses || o.kind === 'keep'),
      clearance: lane,
      arrivalGap: gap,
      value,
    }
  })
}
function goals(
  ctx: EvaluationContext,
  t: number,
  s: CompleteExecutionState,
  input: ExecutionInput,
  physicalPlayers?: PlayerState[],
) {
  const out = motionGoals(ctx, t),
    owner = player(physicalPlayers ?? ctx.observed.players, s.owner)
  if (s.driveAt !== null && s.shotAt === null)
    out.set(owner.id, {
      target: {
        x:
          owner.x +
          ((RIM.x - owner.x) / (distance(owner, RIM) || 1)) *
            Math.max(0, distance(owner, RIM) - input.program.terminal.keepGap),
        z:
          owner.z +
          ((RIM.z - owner.z) / (distance(owner, RIM) || 1)) *
            Math.max(0, distance(owner, RIM) - input.program.terminal.keepGap),
      },
      speed: input.program.terminal.keepSpeed,
      action: 'drive',
    })
  if (s.phase === 'gather') out.set(owner.id, { target: { x: owner.x, z: owner.z }, speed: 2.5, action: 'hold' })
  if (s.shotAt !== null) out.set(owner.id, { target: { x: owner.x, z: owner.z }, speed: 0, action: 'hold' })
  return out
}
function launch(
  o: OpportunityDefinition,
  passer: PlayerState,
  receiver: PlayerState,
  goal: { target: Point2; speed: number },
  ctx: EvaluationContext,
  t: number,
  players: PlayerState[],
  input: ExecutionInput,
  scratch: Float64Array,
): BallFlight {
  const profiles = o.launches
  if (!profiles?.length) throw new Error(`Pass opportunity ${o.id} has no authored launch.`)
  const make = (p: (typeof profiles)[number], base?: BallFlight) => {
    if (p.timing === 'extend-first') {
      if (!base) throw new Error('An extension launch requires its authored first plan.')
      const duration = clamp(base.end - base.start + (p.durationOffset ?? 0), p.minDuration, p.maxDuration),
        endpoint = predictReceiver(receiver, goal.target, duration, goal.speed, input, scratch)
      return {
        ...base,
        end: t + duration,
        a: { ...base.a, y: scalar(p.releaseHeight, ctx) },
        b: { ...endpoint, y: p.catchHeight },
        kind: p.kind,
      }
    }
    let duration = clamp(
        distance(passer, receiver) / input.assumptions.passSpeed + 0.12 + (p.durationOffset ?? 0),
        p.minDuration,
        p.maxDuration,
      ),
      endpoint: Point2 = receiver
    for (let i = 0; i < 3; i++) {
      endpoint = predictReceiver(receiver, goal.target, duration, goal.speed, input, scratch)
      duration = clamp(
        distance(passer, endpoint) / input.assumptions.passSpeed + 0.12 + (p.durationOffset ?? 0),
        p.minDuration,
        p.maxDuration,
      )
    }
    return {
      from: passer.id,
      to: receiver.id,
      start: t,
      end: t + duration,
      a: { x: passer.x, y: scalar(p.releaseHeight, ctx), z: passer.z },
      b: { ...endpoint, y: p.catchHeight },
      kind:
        o.useCrossCourtKind && passer.x * endpoint.x < 0 && Math.abs(passer.x - endpoint.x) > 4
          ? ('skip' as const)
          : p.kind,
    }
  }
  let flight = make(profiles[0])
  if (profiles.length > 1 && preview(flight, players, input) < (o.previewThreshold ?? 0)) {
    for (const p of profiles.slice(1)) {
      const alternative = make(p, flight)
      if (preview(alternative, players, input) > preview(flight, players, input)) flight = alternative
    }
  }
  return flight
}
/** Fixed phase order: commands, flight/contact, delayed observation, policy, read,
 * terminal release, pose, commit, cue release, simultaneous bounded movement. */
export function replayExecution(value: ExecutionInput): ExecutionTrace {
  const input = parseExecutionInput(value),
    compat = executionCompatibility(input)
  if (!compat.replayable) throw new Error(compat.reason)
  const program = input.program,
    { dt, duration } = input.assumptions,
    scratch = new Float64Array(30),
    caps = new Map<PlayerId, number>(),
    profiles = new Map<PlayerId, Capability>()
  const state: CompleteExecutionState = {
    owner: program.initial.ballOwner,
    flight: null,
    phase: 'handle',
    nodeId: program.initial.readNode,
    caughtAt: 0,
    lastReadAt: -10,
    passCount: 0,
    driveAt: null,
    shotAt: null,
    continuation: null,
    endedAt: null,
    memory: { flags: {}, encounters: {}, activations: [] },
    appliedCommands: new Set(),
    releasedMoves: new Set(),
    previousOwnership: new Map(),
    episodes: new Map(),
    episodeSerial: 0,
    rng: input.seed >>> 0,
    observationHistory: [],
  }
  const rand = () => {
    state.rng = (Math.imul(1664525, state.rng) + 1013904223) >>> 0
    return state.rng / 4294967296
  }
  let players: PlayerState[] = program.players.map((p) => {
    caps.set(p.id, 0.96 + rand() * 0.04)
    const person = input.personnel && Object.hasOwn(input.personnel, p.id) ? input.personnel[p.id] : undefined,
      base = resolveCapability({ ...p, height: person?.height ?? p.height }),
      profile = { ...base, speed: base.speed * (person?.speed ?? 1), lateral: person?.lateral ?? base.lateral }
    profiles.set(p.id, profile)
    return {
      id: p.id,
      team: p.team,
      role: p.role,
      number: p.number,
      height: person?.height ?? p.height,
      speed: profile.speed,
      acceleration: profile.acceleration,
      lateral: profile.lateral,
      contest: profile.contest,
      ...((input.startingPositions && Object.hasOwn(input.startingPositions, p.id)
        ? input.startingPositions[p.id]
        : undefined) ?? p.start),
      vx: 0,
      vz: 0,
      yaw: p.team === 'offense' ? Math.PI : 0,
      pose: {
        stance: p.team === 'offense' ? 'ready' : 'defend',
        hands: p.team === 'offense' ? 0.2 : 0.6,
        phase: rand() * Math.PI * 2,
        jump: 0,
      },
    }
  })
  let serializedBytes = jsonBytes(input)
  const charge = (record: unknown): void => {
    finiteJSON(record)
    serializedBytes += jsonBytes(record)
    if (serializedBytes > EXECUTION_LIMITS.traceBytes)
      throw new Error('Execution exceeds its serialized output budget.')
  }
  const frames = state.observationHistory,
    events: WorldEvent[] = [],
    decisions: ExecutionTrace['decisions'] = [],
    diagnostics: ExecutionTrace['diagnostics'] = {
      contactCount: 0,
      maxCatchError: 0,
      boundaryBreach: false,
      warnings: [],
      flightStops: [],
      missedCatchCount: 0,
    },
    event = (e: Omit<WorldEvent, 'id'>) => {
      const record = { ...e, id: `event-${events.length}` }
      charge(record)
      events.push(record)
    }
  let tagAnnounced = false
  const encounterAnnounced = new Set<string>()
  for (let tick = 0; tick <= Math.round(duration / dt); tick++) {
    const t = Number((tick * dt).toFixed(6)),
      parameters = parametersAt(input, t)
    for (const c of input.commands)
      if (c.at <= t + 1e-9 && !state.appliedCommands.has(c.id)) {
        state.appliedCommands.add(c.id)
        event({
          t,
          type: 'intervention',
          interventionId: c.id,
          label:
            c.kind === 'parameters'
              ? 'Executable parameters change from this moment'
              : 'Player receives a movement target',
          ...(c.kind === 'move' ? { playerId: c.playerId } : {}),
        })
      }
    const previous = frames.at(-1)
    if (state.flight && previous) {
      const stop = firstFlightContact(state.flight, previous.players, players, previous.t, t, input.assumptions)
      if (stop) {
        diagnostics.flightStops!.push(stop)
        event({
          t: stop.at,
          type: 'contact',
          label: 'Ball meets a body → execution unresolved',
          playerId: stop.playerId,
          targetId: state.flight.to ?? undefined,
          details: 'Fixed launched ball meets the analytical body envelope. Later possession is unresolved.',
        })
        state.endedAt = { ...stop.ball }
        state.phase = 'dead'
        state.flight = null
        state.nodeId = null
        state.continuation = null
      }
    }
    if (state.flight && t >= state.flight.end - 1e-9) {
      if (state.flight.kind === 'shot') {
        state.endedAt = { ...state.flight.b }
        state.phase = 'dead'
        state.flight = null
      } else {
        const receiver = player(players, state.flight.to!),
          support = catchSupport(receiver, state.flight.b, input.assumptions)
        diagnostics.maxCatchError = Math.max(diagnostics.maxCatchError, support.horizontalError)
        if (!support.reachable) {
          diagnostics.missedCatchCount!++
          event({
            t,
            type: 'missed-catch',
            label: 'Receiver cannot reach the launched ball',
            playerId: receiver.id,
            details: `Fixed landing point ${support.horizontalError.toFixed(2)} m from torso. Later possession is unresolved.`,
          })
          state.endedAt = { ...state.flight.b }
          state.phase = 'dead'
          state.flight = null
          state.nodeId = null
        } else {
          state.owner = receiver.id
          state.phase = 'gather'
          state.caughtAt = t
          state.flight = null
          state.nodeId = state.continuation
          event({ t, type: 'catch', label: 'Catch → read the closeout', playerId: receiver.id })
        }
      }
    }
    let ball = ballState(state, players, t, input)
    const currentFrame: WorldFrame = {
      tick,
      t,
      players,
      ball,
      responsibilities: [],
      options: [],
      stage: 'action',
      policyEvaluations: [],
      parameterValues: parameters,
    }
    const index = Math.max(0, Math.floor((t - input.assumptions.reactionDelay) / dt)),
      observedFrame = input.assumptions.reactionDelay === 0 ? currentFrame : (frames[index] ?? currentFrame),
      observed = observation(observedFrame, input)
    const policyCtx: EvaluationContext = {
      program,
      initialPositions: input.startingPositions,
      observed,
      parameters,
      memory: state.memory,
      owner:
        observed.ball.phase === 'pass'
          ? (observed.ball.receiver ?? state.owner)
          : (observed.ball.owner ?? program.initial.ballOwner),
      reader: state.owner,
      metrics: { passCount: state.passCount, caughtAt: state.caughtAt },
    }
    const evaluation = evaluatePolicy(policyCtx, t, tick, input),
      responsibilities = evaluation.obligations
    if (observedFrame === currentFrame) observed.responsibilities = responsibilities
    for (const [id, at] of Object.entries(state.memory.encounters))
      if (!encounterAnnounced.has(id)) {
        encounterAnnounced.add(id)
        const a = program.actions.find((a) => a.id === id)!
        event({
          t,
          type: 'screen',
          label: 'Authored screen encounter observed',
          playerId: actorId(a.actor, policyCtx),
          details: `Observed encounter ${id} at ${at.toFixed(2)} s; no legality call is certified.`,
        })
      }
    if (state.phase !== 'dead' && state.shotAt === null)
      for (const id of advanceOffense(policyCtx, t)) {
        const r = program.offenseRules.find((r) => r.id === id)!,
          activation = state.memory.activations.find((a) => a.ruleId === id)!
        event({
          t,
          type: 'counter',
          label: r.label,
          details: `Observed at ${activation.observedAt.toFixed(2)} s: ${activation.evidence.join('; ')}`,
        })
      }
    const present = new Set(responsibilities.map((r) => r.id))
    for (const id of state.episodes.keys()) if (!present.has(id)) state.episodes.delete(id)
    for (const r of responsibilities) {
      let e = state.episodes.get(r.id)
      if (!e) {
        e = { start: t, serial: state.episodeSerial++ }
        state.episodes.set(r.id, e)
      }
      r.startedAt = e.start
      r.episodeId = `episode-${e.serial}`
    }
    const help = tagAnnounced ? undefined : responsibilities.find((r) => r.kind === 'tag')
    if (help) {
      tagAnnounced = true
      event({
        t,
        type: 'tag',
        label: `Help commits to ${program.opportunities.find((o) => o.id === help.threatId)?.label ?? help.threatId}`,
        playerId: help.defenderId,
        targetId: help.offensivePlayerId,
        threatId: help.threatId,
      })
    }
    for (const p of players.filter((p) => p.team === 'defense')) {
      const primary = responsibilities.filter((r) => r.defenderId === p.id).sort((a, b) => b.priority - a.priority)[0]
      if (!primary) continue
      const previous = state.previousOwnership.get(p.id)
      if (previous && previous !== primary.threatId)
        event({
          t,
          type: 'transfer',
          label: `${p.number} takes ${program.opportunities.find((o) => o.id === primary.threatId)?.label ?? primary.threatId}`,
          playerId: p.id,
          targetId: primary.offensivePlayerId,
          threatId: primary.threatId,
          details: primary.trigger,
        })
      state.previousOwnership.set(p.id, primary.threatId)
    }
    const now = observation(currentFrame, input),
      ctx: EvaluationContext = { ...policyCtx, observed: now, owner: state.owner, reader: state.owner }
    const node = program.reads.find((n) => n.id === state.nodeId),
      continuous = !!node?.continuousWhen && condition(node.continuousWhen, ctx).matches,
      readyAt =
        node?.trigger.kind === 'catch'
          ? state.caughtAt + input.assumptions.gatherTime
          : Math.max(node?.earliest ?? 0, readAfter(program, state.memory))
    const options = opportunities(
      ctx,
      ball,
      t,
      node?.options ??
        (state.driveAt !== null ? program.opportunities.filter((o) => o.kind === 'keep').map((o) => o.id) : []),
      node?.trigger.kind === 'catch'
        ? state.caughtAt + (continuous ? 0 : input.assumptions.gatherTime)
        : (node?.earliest ?? 0),
      readyAt,
      input,
      responsibilities,
    )
    const triggerReady =
        !!node &&
        actorId(node.actor, ctx) === state.owner &&
        (node.trigger.kind === 'catch'
          ? state.phase === 'gather'
          : node.trigger.kind === 'encounter'
            ? Object.hasOwn(state.memory.encounters, node.trigger.action)
            : condition(node.trigger.when, ctx).matches),
      conditionReady = !node?.when || condition(node.when, policyCtx).matches,
      graphReady = node ? triggerReady && conditionReady : state.driveAt !== null
    if (!graphReady) for (const o of options) o.available = false
    const readReady =
      triggerReady &&
      conditionReady &&
      node &&
      t >= readAfter(program, state.memory) &&
      !state.flight &&
      state.driveAt === null &&
      state.phase !== 'dead' &&
      t >= (continuous ? node.earliest : (node.decisionAt ?? node.earliest)) &&
      (node.trigger.kind !== 'catch' || t >= state.caughtAt + input.assumptions.gatherTime) &&
      t - state.lastReadAt >= input.assumptions.readInterval
    if (readReady && node) {
      state.lastReadAt = t
      const cs = candidates(options, ctx, input, state.passCount).filter((c) => node.options.includes(c.threatId))
      let ranked = cs.filter((c) => c.available).sort((a, b) => b.value - a.value)
      const constraint =
        state.passCount === 0 ? node.initialOptionsWhen?.find((c) => condition(c.when, ctx).matches) : undefined
      if (constraint && ranked.some((c) => constraint.options.includes(c.threatId)))
        ranked = ranked.filter((c) => constraint.options.includes(c.threatId))
      const patient =
        continuous && node.trigger.kind !== 'catch' && node.decisionAt !== undefined && t < node.decisionAt - 1e-9
      if (patient)
        ranked = ranked.filter(
          (c) =>
            c.arrivalGap >=
            (program.opportunities.find((o) => o.id === c.threatId)!.kind === 'keep'
              ? program.terminal.patientKeepLead
              : program.terminal.patientPassLead),
        )
      const selected = ranked[0]
      if (selected) {
        const opportunity = program.opportunities.find((o) => o.id === selected.threatId)!,
          reason = `${opportunity.label} offers the largest current modeled opportunity among permitted reads.`
        const decision = {
          t,
          nodeId: node.id,
          actorId: state.owner,
          selected: selected.threatId,
          reason,
          candidates: cs,
        }
        charge(decision)
        decisions.push(decision)
        event({
          t,
          type: 'read',
          label: `Offense reads → ${opportunity.label}`,
          playerId: state.owner,
          targetId: selected.playerId,
          threatId: selected.threatId,
          details: reason,
        })
        if (opportunity.kind === 'keep') {
          state.driveAt = t
          state.nodeId = null
          state.phase = 'handle'
        } else {
          const receiver = player(players, selected.playerId)
          state.flight = launch(
            opportunity,
            player(players, state.owner),
            receiver,
            goals(policyCtx, t, state, input).get(receiver.id)!,
            ctx,
            t,
            players,
            input,
            scratch,
          )
          state.continuation = Object.hasOwn(node.continuations, selected.threatId)
            ? node.continuations[selected.threatId]
            : null
          state.passCount++
          state.phase = 'pass'
          event({
            t,
            type: 'pass',
            label: `${state.flight.kind} → ${opportunity.label}`,
            playerId: state.owner,
            targetId: receiver.id,
            threatId: selected.threatId,
            details: 'Ball endpoint fixed at release; launch selected from present bodies, never future frames.',
          })
        }
      } else if (!patient) {
        const decision = {
          t,
          nodeId: node.id,
          actorId: state.owner,
          selected: 'hold',
          reason: 'No feasible permitted opportunity in the current graph.',
          candidates: cs,
        }
        charge(decision)
        decisions.push(decision)
      }
      ball = ballState(state, players, t, input)
    }
    const owner = player(players, state.owner),
      terminal = program.terminal,
      finishReady =
        state.shotAt === null &&
        !state.flight &&
        state.phase !== 'dead' &&
        (state.driveAt !== null
          ? t >= state.driveAt + terminal.keepDuration || distance(owner, RIM) < terminal.finishRadius
          : state.phase === 'gather' && !state.nodeId && t >= state.caughtAt + input.assumptions.gatherTime)
    if (finishReady) {
      state.shotAt = t
      state.phase = 'shot'
      state.flight = {
        from: owner.id,
        to: null,
        start: t,
        end: t + terminal.shotBaseDuration + distance(owner, RIM) * terminal.shotDistanceDuration,
        a: {
          x: owner.x,
          y: terminal.shotReleaseHeight + (owner.height - terminal.shotHeightReference) * terminal.shotHeightScale,
          z: owner.z,
        },
        b: RIM,
        kind: 'shot',
      }
      event({ t, type: 'shot', label: 'Modeled release; no make / miss prediction', playerId: owner.id })
      ball = ballState(state, players, t, input)
    }
    const motion = goals(policyCtx, t, state, input, players)
    for (const p of players) {
      p.pose.stance = p.team === 'defense' ? 'defend' : Math.hypot(p.vx, p.vz) > 0.3 ? 'run' : 'ready'
      p.pose.hands = p.team === 'defense' ? (['pass', 'shot'].includes(ball.phase) ? 0.85 : 0.6) : 0.2
      if (p.id === ball.owner && ball.phase !== 'dead') {
        p.pose.stance =
          ball.phase === 'handle'
            ? 'dribble'
            : ball.phase === 'gather'
              ? 'catch'
              : ball.phase === 'shot'
                ? 'shoot'
                : 'pass'
        p.pose.hands = ball.phase === 'handle' ? 0.25 : 0.8
      }
      if (p.id === ball.receiver && ball.phase === 'pass') {
        p.pose.stance = 'catch'
        p.pose.hands = 0.8
      }
      if (motion.get(p.id)?.action === 'screen') p.pose.stance = 'screen'
      p.pose.jump =
        state.shotAt !== null && p.id === state.owner
          ? Math.max(0, 0.23 * Math.sin(Math.min(Math.PI, (t - state.shotAt) * 8)))
          : 0
    }
    const frame: WorldFrame = {
      tick,
      t,
      players: copy(players),
      ball: copy(ball),
      responsibilities: copy(responsibilities),
      options: copy(options),
      parameterValues: { ...parameters },
      policyEvaluations: [copy(evaluation)],
      policyActivations: copy(state.memory.activations),
      ...(Object.keys(state.memory.encounters).length
        ? { screenEngagedAt: Math.min(...Object.values(state.memory.encounters)) }
        : {}),
      stage:
        state.phase === 'dead'
          ? 'finished'
          : state.phase === 'shot'
            ? 'release'
            : state.passCount > 0
              ? 'catch-and-read'
              : tagAnnounced
                ? 'tag-and-read'
                : 'action',
    }
    charge(frame)
    frames.push(frame)
    if (tick === Math.round(duration / dt)) break
    for (const c of input.commands)
      if (
        c.kind === 'move' &&
        c.release &&
        c.at <= t &&
        !state.releasedMoves.has(c.id) &&
        condition(c.release, policyCtx).matches
      ) {
        state.releasedMoves.add(c.id)
        event({
          t,
          type: 'intervention',
          interventionId: c.id,
          playerId: c.playerId,
          label: 'Movement cue releases on its authored observation',
        })
      }
    players = players.map((p) => {
      const cue = input.commands
          .filter(
            (c) =>
              c.kind === 'move' &&
              c.playerId === p.id &&
              c.at <= t + 1e-9 &&
              !state.releasedMoves.has(c.id) &&
              (c.until === undefined || t < c.until),
          )
          .at(-1),
        primary = responsibilities.filter((r) => r.defenderId === p.id).sort((a, b) => b.priority - a.priority)[0],
        goal =
          cue?.kind === 'move'
            ? cue.target
            : p.team === 'offense'
              ? (motion.get(p.id)?.target ?? p)
              : (primary?.target ?? p),
        speed = p.team === 'offense' ? (motion.get(p.id)?.speed ?? 3.4) : input.assumptions.maxSpeed,
        facing =
          p.team === 'defense' && distance(p, goal) <= 2.2
            ? ball
            : p.team === 'offense' && ball.phase === 'pass' && ball.receiver === p.id
              ? ball
              : undefined,
        next = advance(p, goal, speed, players, input, caps.get(p.id)!, scratch, facing, profiles.get(p.id))
      if (next.contact) diagnostics.contactCount++
      diagnostics.boundaryBreach ||= next.breach
      return next.next
    })
  }
  if (diagnostics.contactCount)
    diagnostics.warnings.push(
      'Simplified body envelopes overlap in some samples; contact diagnostics are not foul calls.',
    )
  if (diagnostics.boundaryBreach)
    diagnostics.warnings.push('An acceleration-bounded trajectory crossed the modeled court boundary.')
  if (diagnostics.flightStops!.length)
    diagnostics.warnings.push(
      'Execution stops at an analytical defensive body contact; later possession is unresolved.',
    )
  if (diagnostics.missedCatchCount)
    diagnostics.warnings.push('The receiver cannot meet the fixed catch point; later possession is unresolved.')
  return {
    modelVersion: ENGINE_VERSION,
    problemVersion: program.version,
    input,
    frames,
    events,
    decisions,
    diagnostics,
  }
}
