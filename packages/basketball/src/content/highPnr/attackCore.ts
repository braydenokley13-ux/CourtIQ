import { analyze, defenderArrival, isThreatOpen } from '../../queries/analytics'
import type { AnalysisResult } from '../../queries/analytics'
import { simulate } from '../../simulation/facade'
import type {
  LabConfig,
  OpponentStrategy,
  PlayerId,
  Point2,
  ReadDecision,
  RoleId,
  SimulationResult,
  ThreatId,
  WorldEvent,
} from './types'

export type AttackParameter = keyof OpponentStrategy
export interface AttackChange {
  parameter: AttackParameter
  before: number | boolean
  after: number | boolean
  label: string
}
export interface AttackWitness {
  at: number
  interval: { start: number; end: number }
  threatId: ThreatId
  playerId: PlayerId
  limitingDefenderId: PlayerId
  limitingRole: RoleId
  target: Point2
  defenderPosition: Point2
  arrivalSeconds: number
  releaseSeconds: number
  readAvailableAt?: number
  leadSeconds: number
  passClearance: number | null
  chain: WorldEvent[]
  decision: ReadDecision | null
  conditional: boolean
  explanation: string
}
export interface AttackCandidateSummary {
  id: string
  changes: AttackChange[]
  opponent: OpponentStrategy
  witness: AttackWitness | null
  warnings: string[]
  longestWindow: number
  editDistance: number
}
export interface AttackCandidate extends AttackCandidateSummary {
  config: LabConfig
  result: SimulationResult
  analysis: AnalysisResult
}
export interface AttackReport {
  baseline: AttackCandidate
  selected: AttackCandidate
  candidates: AttackCandidateSummary[]
  pairedRetest: {
    previous: AttackCandidateSummary
    current: AttackCandidate
    sameExperiment: boolean
    explanation: string
  } | null
  sensitivity: { label: string; witness: AttackWitness | null; warnings: string[] }[]
  budget: { limit: number; used: number; pruned: number }
  assumptions: LabConfig['assumptions']
  scope: string
}
/** A bounded presentation sample of a completed replay, never a forecast. */
export interface AttackPreview {
  id: string
  label: string
  playerId: PlayerId
  points: Point2[]
  verdict: 'held' | 'exposed' | 'conditional'
  threatId?: ThreatId
  witnessAt: number | null
  leadSeconds: number | null
  replays: number
  selected: boolean
  executionUnresolved: boolean
}
export interface AttackOptions {
  signal?: { readonly aborted: boolean }
  onProgress?: (fraction: number) => void
  /** At most eight callbacks per search, including the final selected route.
   * The last callback can replace an earlier preview with the same id. */
  onCandidate?: (preview: AttackPreview) => void
  budget?: number
  previousReport?: AttackReport
}

/** Search domain is basketball intent. Permission toggles never force a read. */
export const ATTACK_DOMAIN = [
  { parameter: 'screenAngle' as const, label: 'Screen angle', min: -0.65, max: 0.65, step: 0.325 },
  { parameter: 'liftDelay' as const, label: 'Lift timing', min: -0.25, max: 0.6, step: 0.25 },
  { parameter: 'liftWidth' as const, label: 'Lift spacing', min: -0.7, max: 0.7, step: 0.35 },
]
const booleanLabels = { reject: 'Allow reject', rescreen: 'Allow re-screen', shortRoll: 'Allow short roll' }
const round = (n: number) => Math.round(n * 1e6) / 1e6
const key = (opponent: OpponentStrategy) =>
  JSON.stringify(
    Object.keys(opponent)
      .sort()
      .map((k) => [k, opponent[k as AttackParameter]]),
  )
function changes(base: OpponentStrategy, next: OpponentStrategy): AttackChange[] {
  return (Object.keys(base) as AttackParameter[])
    .filter((parameter) => base[parameter] !== next[parameter])
    .map((parameter) => ({
      parameter,
      before: base[parameter],
      after: next[parameter],
      label:
        ATTACK_DOMAIN.find((entry) => entry.parameter === parameter)?.label ??
        booleanLabels[parameter as keyof typeof booleanLabels],
    }))
}
function mutations(opponent: OpponentStrategy): OpponentStrategy[] {
  return [
    ...ATTACK_DOMAIN.flatMap((entry) =>
      [-1, 1].map((direction) => ({
        ...opponent,
        [entry.parameter]: round(
          Math.max(entry.min, Math.min(entry.max, opponent[entry.parameter] + direction * entry.step)),
        ),
      })),
    ),
    ...(Object.keys(booleanLabels) as (keyof typeof booleanLabels)[]).map((parameter) => ({
      ...opponent,
      [parameter]: !opponent[parameter],
    })),
  ]
}
function distance(edits: AttackChange[]) {
  return edits.reduce((sum, edit) => {
    const domain = ATTACK_DOMAIN.find((entry) => entry.parameter === edit.parameter)
    return sum + (domain ? Math.abs(Number(edit.after) - Number(edit.before)) / (domain.max - domain.min) : 1)
  }, 0)
}

/** Earliest executable open sample inside a sustained geometric interval.
 * Forecast openness alone cannot establish an attack before the actual read gate. */
export function findAttackWitness(result: SimulationResult, analysis = analyze(result)): AttackWitness | null {
  const intervals = analysis.windows
    .flatMap((window) =>
      window.intervals
        .filter((interval) => interval.end - interval.start > analysis.actionableHorizon + result.config.assumptions.dt)
        .map((interval) => ({ window, interval })),
    )
    .sort((a, b) => a.interval.start - b.interval.start || a.window.id.localeCompare(b.window.id))
  const executable = intervals
    .flatMap(({ window, interval }) => {
      for (const frame of result.frames) {
        if (frame.t < interval.start - 1e-8 || frame.t >= interval.end - 1e-8) continue
        const option = frame.options.find((option) => option.id === window.id)
        const actualRead = result.decisions.find(
          (decision) =>
            Math.abs(decision.t - frame.t) < 1e-8 &&
            decision.candidates.some((candidate) => candidate.threatId === window.id && candidate.available),
        )
        const priorRead = [...result.decisions].reverse().find((decision) => decision.t <= frame.t + 1e-8)
        const continuingDrive =
          window.id === 'drive' && priorRead?.selected === 'drive' && priorRead.actorId === frame.ball.owner
        if (
          option &&
          (actualRead || continuingDrive) &&
          frame.t >= (option.readAvailableAt ?? interval.start) - 1e-8 &&
          isThreatOpen(option, frame, result.config.assumptions)
        )
          return [{ window, interval, frame, option }]
      }
      return []
    })
    .sort((a, b) => a.frame.t - b.frame.t || a.window.id.localeCompare(b.window.id))
  for (const { window, interval, frame, option } of executable) {
    const assumptions = result.config.assumptions
    const arrival = frame.players
      .filter((player) => player.team === 'defense')
      .map((player) => {
        const task = frame.responsibilities.find((task) => task.defenderId === player.id && task.threatId === option.id)
        const reaction = task
          ? Math.max(0, assumptions.reactionDelay - (frame.t - task.startedAt))
          : assumptions.reactionDelay
        return {
          player,
          seconds: defenderArrival(
            player,
            option.target,
            assumptions,
            reaction,
            frame.players.find((p) => p.id === option.playerId),
          ),
        }
      })
      .sort((a, b) => a.seconds - b.seconds || a.player.id.localeCompare(b.player.id))[0]
    if (!arrival) continue
    const release = option.timeToRelease ?? assumptions.gatherTime + assumptions.readInterval
    const conditional =
      analysis.flightEvidence.some(
        (flight) => flight.conditionalAfterContact && (flight.witness?.t ?? flight.start) <= frame.t,
      ) ||
      result.events.some((event) => event.type === 'missed-catch' && event.t <= frame.t) ||
      result.diagnostics.boundaryBreach
    const chain = result.events.filter(
      (event) =>
        event.t <= frame.t + 1e-8 &&
        ['screen', 'counter', 'read', 'pass', 'catch', 'tag', 'transfer'].includes(event.type),
    )
    return {
      at: frame.t,
      interval,
      threatId: option.id,
      playerId: option.playerId,
      limitingDefenderId: arrival.player.id,
      limitingRole: arrival.player.role,
      target: { ...option.target },
      defenderPosition: { x: arrival.player.x, z: arrival.player.z },
      arrivalSeconds: arrival.seconds,
      releaseSeconds: release,
      readAvailableAt: option.readAvailableAt,
      leadSeconds: arrival.seconds - release,
      passClearance: option.passClearance,
      chain,
      decision: [...result.decisions].reverse().find((decision) => decision.t <= frame.t + 1e-8) ?? null,
      conditional,
      explanation: `${window.label} is executable at ${frame.t.toFixed(2)} s within the ${interval.start.toFixed(2)}–${interval.end.toFixed(2)} s modeled opening. ${arrival.player.id} (${arrival.player.role}) is the earliest modeled closeout: ${arrival.seconds.toFixed(2)} s against a ${release.toFixed(2)} s horizon to the next permitted release.${conditional ? ' This witness follows invalid flight, catch or boundary evidence and is conditional.' : ''}`,
    }
  }
  return null
}

/** Lexicographic evidence ordering; no global defense score. */
export function compareAttackCandidates(a: AttackCandidateSummary, b: AttackCandidateSummary): number {
  const quality = (candidate: AttackCandidateSummary) =>
    candidate.witness ? (candidate.witness.conditional ? 1 : 0) : 2
  return (
    quality(a) - quality(b) ||
    a.changes.length - b.changes.length ||
    a.editDistance - b.editDistance ||
    (a.witness?.at ?? Infinity) - (b.witness?.at ?? Infinity) ||
    (b.witness?.leadSeconds ?? 0) - (a.witness?.leadSeconds ?? 0) ||
    a.id.localeCompare(b.id)
  )
}
function summary(candidate: AttackCandidate): AttackCandidateSummary {
  const { id, changes, opponent, witness, warnings, longestWindow, editDistance } = candidate
  return { id, changes, opponent, witness, warnings, longestWindow, editDistance }
}
function evaluate(config: LabConfig, base: OpponentStrategy, id: string): AttackCandidate {
  const result = simulate(config),
    analysis = analyze(result)
  const edits = changes(base, config.opponent!)
  return {
    id,
    config,
    result,
    analysis,
    opponent: config.opponent!,
    changes: edits,
    editDistance: distance(edits),
    witness: findAttackWitness(result, analysis),
    warnings: analysis.warnings,
    longestWindow: Math.max(0, ...analysis.windows.map((window) => window.duration)),
  }
}

/** A halted or missed flight is unresolved execution, not a held defensive read. */
export function attackExecutionUnresolved(result: SimulationResult): boolean {
  return (
    result.diagnostics.boundaryBreach ||
    !!result.diagnostics.flightStops?.length ||
    !!result.diagnostics.missedCatchCount ||
    result.events.some((event) => event.type === 'missed-catch')
  )
}

/** Coach-language intent labels describe permissions, not guaranteed actions. */
export function attackIntentLabel(candidate: Pick<AttackCandidateSummary, 'changes'>): string {
  if (!candidate.changes.length) return 'Their current offense'
  return candidate.changes
    .map((edit) => {
      const delta = Number(edit.after) - Number(edit.before)
      if (edit.parameter === 'screenAngle')
        return `Turn screen ${delta > 0 ? '+' : '−'}${Math.abs(Math.round((delta * 180) / Math.PI))}°`
      if (edit.parameter === 'liftDelay')
        return `Lift ${Math.round(Math.abs(delta) * 1000)} ms ${delta < 0 ? 'earlier' : 'later'}`
      if (edit.parameter === 'liftWidth') return `Shift lift ${Math.abs(delta).toFixed(2)} m`
      if (edit.parameter === 'reject') return edit.after ? 'Allow the reject' : 'Stay with the screen'
      if (edit.parameter === 'rescreen') return edit.after ? 'Allow a second screen' : 'One screen only'
      return edit.after ? 'Allow the short roll' : 'Roll through'
    })
    .join(' · ')
}

/** Actual offensive movement only. Sampling keeps worker messages small and
 * never projects an available pass as though the offense executed it. */
export function previewAttackCandidate(candidate: AttackCandidate, replays: number, selected = false): AttackPreview {
  const domain = candidate.changes[0]?.parameter
  const role: RoleId =
    domain === 'liftDelay' || domain === 'liftWidth'
      ? 'weak-lift'
      : domain === 'screenAngle' || domain === 'shortRoll'
        ? 'screener'
        : 'ballhandler'
  const playerId =
    (selected ? candidate.witness?.playerId : undefined) ??
    candidate.result.frames[0].players.find((player) => player.role === role)?.id ??
    'O1'
  const end = candidate.witness?.at ?? candidate.config.assumptions.duration
  const frames = candidate.result.frames.filter((frame) => frame.t <= end + 1e-8)
  const stride = Math.max(1, Math.ceil((frames.length - 1) / 31))
  const samples = frames.filter((_, index) => index % stride === 0 || index === frames.length - 1)
  const points = samples.flatMap((frame) => {
    const player = frame.players.find((player) => player.id === playerId)
    return player ? [{ x: player.x, z: player.z }] : []
  })
  const executionUnresolved = attackExecutionUnresolved(candidate.result)
  return {
    id: candidate.id,
    label: attackIntentLabel(candidate),
    playerId,
    points,
    verdict: candidate.witness
      ? candidate.witness.conditional
        ? 'conditional'
        : 'exposed'
      : executionUnresolved
        ? 'conditional'
        : 'held',
    ...(candidate.witness ? { threatId: candidate.witness.threatId } : {}),
    witnessAt: candidate.witness?.at ?? null,
    leadSeconds: candidate.witness?.leadSeconds ?? null,
    replays,
    selected,
    executionUnresolved,
  }
}

/** One yield per replay allows cancellation/progress without scheduling-dependent search. */
function* search(config: LabConfig, options: AttackOptions): Generator<number, AttackReport> {
  if (!config.opponent) throw new Error('Enable the adaptive opponent before searching for counters.')
  const limit = Math.max(6, Math.min(40, Math.floor(Number.isFinite(options.budget) ? options.budget! : 28)))
  let used = 0,
    pruned = 0
  let previews = 0
  // Seven evenly spaced completed evaluations plus the final selected route.
  const previewAt = new Set(Array.from({ length: 7 }, (_, index) => 1 + Math.round((index * (limit - 3)) / 6)))
  const showCandidate = (candidate: AttackCandidate) => {
    if (previews < 7 && previewAt.has(used) && !options.signal?.aborted) {
      previews++
      options.onCandidate?.(previewAttackCandidate(candidate, used))
    }
  }
  const base = { ...config.opponent }
  const input = { ...config, opponent: base }
  const baseline = evaluate(input, base, 'base')
  used++
  showCandidate(baseline)
  yield used / limit
  const candidates = [summary(baseline)]
  let selected = baseline
  let pairedRetest: AttackReport['pairedRetest'] = null
  if (options.previousReport) {
    const previous = options.previousReport.selected
    const current = evaluate({ ...input, opponent: { ...previous.opponent } }, base, 'retest')
    used++
    yield used / limit
    const sameExperiment =
      config.seed === previous.config.seed &&
      JSON.stringify(config.assumptions) === JSON.stringify(previous.config.assumptions) &&
      config.counter === previous.config.counter &&
      JSON.stringify(config.startingPositions) === JSON.stringify(previous.config.startingPositions) &&
      config.screenAngle === previous.config.screenAngle &&
      JSON.stringify(
        config.interventions.filter(
          (cue) => cue.kind === 'opponent' || (cue.kind === 'move' && cue.playerId.startsWith('O')),
        ),
      ) ===
        JSON.stringify(
          previous.config.interventions.filter(
            (cue) => cue.kind === 'opponent' || (cue.kind === 'move' && cue.playerId.startsWith('O')),
          ),
        )
    pairedRetest = {
      previous: summary(previous),
      current,
      sameExperiment,
      explanation: sameExperiment
        ? 'Previous attack replayed against your current answer with the same seed, starting geometry and assumptions.'
        : 'Previous opponent intent replayed against the current inputs. Seed, starting geometry, non-defense cues or assumptions changed; this is not an isolated defensive-rule comparison.',
    }
  }
  const reserved = 2
  const seen = new Set([key(base)])
  let frontier = [base]
  // All one-edit neighbors, then a deterministic beam of promising one-edit branches.
  for (let depth = 1; depth <= 2 && used < limit - reserved; depth++) {
    const generation: AttackCandidateSummary[] = []
    for (const parent of frontier)
      for (const opponent of mutations(parent)) {
        const identity = key(opponent)
        if (seen.has(identity)) continue
        seen.add(identity)
        if (changes(base, opponent).length > 2 || used >= limit - reserved) {
          pruned++
          continue
        }
        const candidate = evaluate({ ...input, opponent }, base, `attack-${candidates.length}`)
        candidates.push(summary(candidate))
        generation.push(summary(candidate))
        if (compareAttackCandidates(candidate, selected) < 0) selected = candidate
        used++
        showCandidate(candidate)
        yield used / limit
      }
    // Search ordering favors witnessed branches, then near actionable openings; final ranking still minimizes edits.
    frontier = generation
      .sort(
        (a, b) =>
          Number(!a.witness) - Number(!b.witness) || b.longestWindow - a.longestWindow || compareAttackCandidates(a, b),
      )
      .slice(0, 3)
      .map((candidate) => candidate.opponent)
  }
  const sensitivity: AttackReport['sensitivity'] = []
  for (const delta of [-0.08, 0.08]) {
    const reactionDelay = Math.max(0, Math.min(0.8, input.assumptions.reactionDelay + delta))
    const label = `Reaction ${Math.round(Math.abs(reactionDelay - input.assumptions.reactionDelay) * 1000)} ms ${delta < 0 ? 'earlier' : 'later'}`
    const candidate = evaluate(
      { ...selected.config, assumptions: { ...input.assumptions, reactionDelay } },
      base,
      `sensitivity-${delta}`,
    )
    sensitivity.push({ label, witness: candidate.witness, warnings: candidate.warnings })
    used++
    yield used / limit
  }
  if (!options.signal?.aborted) options.onCandidate?.(previewAttackCandidate(selected, used, true))
  return {
    baseline,
    selected,
    candidates,
    pairedRetest,
    sensitivity,
    budget: { limit, used, pruned },
    assumptions: { ...input.assumptions },
    scope:
      'Bounded deterministic high-P&R search: screen angle, lift timing/spacing and permission to reject, re-screen or short roll. At most two parameter edits; three-branch beam; current initial intent, seed and defensive answer fixed. Reactive permissions do not force actions. Baseline preserves the explicitly enabled adaptive opponent. Two reaction sensitivities inspect the selected attack only. No shooting odds or proof against unsearched offense.',
  }
}
export function attack(config: LabConfig, options: AttackOptions = {}): AttackReport {
  const iterator = search(config, options)
  for (;;) {
    if (options.signal?.aborted) throw Object.assign(new Error('Attack canceled.'), { name: 'AbortError' })
    const step = iterator.next()
    if (step.done) {
      options.onProgress?.(1)
      return step.value
    }
    options.onProgress?.(step.value)
  }
}
export async function attackYielding(
  config: LabConfig,
  options: AttackOptions = {},
  yieldTurn: () => Promise<void> = () => Promise.resolve(),
): Promise<AttackReport> {
  const iterator = search(config, options)
  for (;;) {
    if (options.signal?.aborted) throw Object.assign(new Error('Attack canceled.'), { name: 'AbortError' })
    const step = iterator.next()
    if (step.done) {
      options.onProgress?.(1)
      return step.value
    }
    options.onProgress?.(step.value)
    await yieldTurn()
  }
}
