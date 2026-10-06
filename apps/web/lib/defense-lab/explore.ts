import { analyze, compare, defenderArrival, isThreatOpen } from './analytics'
import type { AnalysisResult, ComparisonResult } from './analytics'
import { findAttackWitness } from './attackCore'
import { contestScale } from './capability'
import { HIGH_PNR_PROBLEM, PROBLEMS } from './scenario'
import { frameAt, simulate } from './simulation'
import type { LabConfig, PlayerId, Point2, ProblemDefinition, SimulationResult, TeamAnswer, ThreatId, ThreatOption, WorldFrame } from './types'

/** Explore: freeze at the teaching moment, offer fixes, replay each one. Every
 * number comes from a real simulate()/analyze() call; nothing is authored. */

export type TeachingCause = 'deep-tag' | 'late-rotation' | 'switch-mismatch' | 'two-on-ball' | 'big-too-deep' | 'big-too-high' | 'unknown'
export interface TeachingMoment {
  /** Freeze time (s). A frame time of the replay. */
  t: number
  threatId: ThreatId
  receiverId: PlayerId
  /** Duration (s) of the executable-geometry window that contains t. */
  openFor: number
  window: { start: number; end: number }
  /** Earliest modeled arrival (s) of the best defender, same estimator as the windows. */
  defenderNeeds: number | null
  bestDefenderId: PlayerId | null
  /** Catch-gather-release horizon (s) the defender has to beat. */
  releaseIn: number | null
  /** defenderNeeds - releaseIn (s): how late the closest defender is. Positive means the shot is ready first. */
  lateBy: number | null
  /** Defender who owns the opened threat in the live responsibilities. */
  responsibleDefenderId?: PlayerId
  /** Defender whose help created the opening (the tagger, the second man on the ball, the switcher). */
  pulledDefenderId?: PlayerId
  /** Everyone the camera must frame. */
  involved: PlayerId[]
  cause: TeachingCause
  /** Finer than `cause` where one cause has two faces: help that came too shallow to stop the roller. */
  mechanism?: 'shallow-tag'
  /** What the actor actually did after the freeze, read from the replay (shot distance to the rim, dribble path). null if the replay never resolves it. */
  finish: 'layup' | 'pull-up' | 'catch-and-shoot' | 'pass' | null
  /** Metres the actor dribbled between the freeze (or his catch) and his shot. */
  dribbleMetres: number | null
  /** Seconds after the freeze until a defender was actually within contest range of the actor in the replay; null = never before the release. */
  realizedArrival: number | null
  /** realizedArrival - releaseIn. Best-case lateBy above is optimistic for the defense; this one is what the replay did. */
  realizedLateBy: number | null
  evidence: string[]
  /** used: the offense's actual read took it. witness: attack-witness semantics. window: largest window fallback. */
  basis: 'used' | 'witness' | 'window'
}

const EPS = 1e-6
/** Shorter than two motion ticks: not an opening worth stopping the tape for. */
const NOISE_SECONDS = 0.05
/** Window changes under this are ignored (a tenth of a second). */
export const MIN_MEANINGFUL_SECONDS = 0.1
const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)
const RIM: Point2 = { x: 0, z: 1.575 }
/** A release this close to the rim is a layup; further out is a jumper. */
const LAYUP_METRES = 2.4
/** Dribbling further than this before the shot makes it a pull-up. */
const PULL_UP_METRES = 1.0
const problemFor = (result: SimulationResult): ProblemDefinition => PROBLEMS.find(p => p.id === result.config.problemId) ?? HIGH_PNR_PROBLEM
const sec = (n: number) => `${n.toFixed(2)} s`

function arrivals(frame: WorldFrame, option: ThreatOption, result: SimulationResult) {
  const a = result.config.assumptions
  return frame.players.filter(p => p.team === 'defense').map(player => {
    const task = frame.responsibilities.find(task => task.defenderId === player.id && task.threatId === option.id)
    const reaction = task ? Math.max(0, a.reactionDelay - (frame.t - task.startedAt)) : a.reactionDelay
    return { id: player.id, seconds: defenderArrival(player, option.target, a, reaction, frame.players.find(p => p.id === option.playerId)) }
  }).sort((x, y) => x.seconds - y.seconds || x.id.localeCompare(y.id))
}


interface UsedOpening { frame: WorldFrame; threatId: ThreatId; receiverId: PlayerId; lateBy: number }
/** Every read the offense took while that opening was open, in time order. */
function usedOpenings(result: SimulationResult, windows: PlayerWindow[]): UsedOpening[] {
  const a = result.config.assumptions
  return result.decisions.flatMap(decision => {
    if (decision.selected === 'hold') return []
    const frame = result.frames.find(f => Math.abs(f.t - decision.t) < 1e-8)
    const option = frame?.options.find(o => o.id === decision.selected)
    if (!frame || !option || !isThreatOpen(option, frame, a)) return []
    const interval = windows.find(w => w.threatId === option.id && w.playerId === option.playerId)?.intervals.find(i => frame.t >= i.start - EPS && frame.t < i.end - EPS)
    if (!interval || interval.end - interval.start < NOISE_SECONDS - EPS) return []
    const best = arrivals(frame, option, result)[0]
    const release = option.timeToRelease ?? a.gatherTime + a.readInterval
    return [{ frame, threatId: option.id, receiverId: option.playerId, lateBy: best ? best.seconds - release : 0 }]
  }).sort((x, y) => x.frame.t - y.frame.t)
}

interface Picked { frame: WorldFrame; threatId: ThreatId; basis: TeachingMoment['basis']; origin?: { frame: WorldFrame; threatId: ThreatId } }
function pickFrame(result: SimulationResult, analysis: AnalysisResult, windows: PlayerWindow[]): Picked | null {
  const a = result.config.assumptions
  // 1. Reads the offense actually took while the opening was open. The freeze is the
  //    one it exploited most dangerously (largest lateBy: how late the best closeout is
  //    against the release horizon); the first such read is the origin of the chain.
  const used = usedOpenings(result, windows)
  if (used.length) {
    const top = used.reduce((best, u) => (u.lateBy > best.lateBy + EPS ? u : best), used[0])
    return { frame: top.frame, threatId: top.threatId, basis: 'used', ...(top !== used[0] ? { origin: { frame: used[0].frame, threatId: used[0].threatId } } : {}) }
  }
  // 2. Attack-witness semantics: first executable open sample in a sustained window.
  const witness = findAttackWitness(result, analysis)
  if (witness) {
    const frame = result.frames.find(f => Math.abs(f.t - witness.at) < 1e-8)
    if (frame) return { frame, threatId: witness.threatId, basis: 'witness' }
  }
  // 3. Largest window, at the first sample that is truly open.
  const largest = windows.filter(w => w.duration >= NOISE_SECONDS - EPS)[0]
  const interval = largest?.intervals.reduce((best, i) => (i.end - i.start > best.end - best.start ? i : best), largest.intervals[0])
  if (largest && interval) {
    const frame = result.frames.find(f => f.t >= interval.start - EPS && f.t < interval.end - EPS && f.options.some(o => o.id === largest.threatId && o.playerId === largest.playerId && isThreatOpen(o, f, a)))
    if (frame) return { frame, threatId: largest.threatId, basis: 'window' }
  }
  return null
}

/** Most useful freeze: among the openings the offense reads and takes, the one it
 * exploited most dangerously (largest lateBy), explained by what started the chain;
 * else the attack witness, else the largest window. null means the defense holds. */
export function findTeachingMoment(result: SimulationResult, analysis: AnalysisResult = analyze(result)): TeachingMoment | null {
  const windows = playerWindows(result)
  const picked = pickFrame(result, analysis, windows)
  if (!picked) return null
  const moment = buildMoment(result, windows, picked.frame, picked.threatId, picked.basis)
  if (!moment || !picked.origin) return moment
  const origin = buildMoment(result, windows, picked.origin.frame, picked.origin.threatId, 'used')
  const structural = origin && (origin.cause === 'deep-tag' || origin.cause === 'two-on-ball' || origin.cause === 'switch-mismatch' || origin.mechanism === 'shallow-tag')
  if (!origin || !structural && moment.cause !== 'unknown') return moment
  const involved = [...moment.involved]
  for (const id of origin.involved) if (!involved.includes(id)) involved.push(id)
  return { ...moment, cause: origin.cause, ...(origin.mechanism ? { mechanism: origin.mechanism } : {}), ...(origin.pulledDefenderId ? { pulledDefenderId: origin.pulledDefenderId } : {}), involved, evidence: [moment.evidence[0], `It started at ${sec(origin.t)}: ${origin.evidence.slice(1).join(' ')}`] }
}


/** Reads what the actor did from the replay, never from the threat id. */
function realized(result: SimulationResult, actorId: PlayerId, from: number, releaseIn: number) {
  const next = result.events.find(e => e.t >= from - 1e-8 && (e.type === 'shot' || e.type === 'pass') && e.playerId === actorId)
  const at = (t: number) => frameAt(result, t).players.find(p => p.id === actorId)!
  let finish: TeachingMoment['finish'] = null, dribbleMetres: number | null = null
  const catchEvent = result.events.find(e => e.t >= from - 1e-8 && e.type === 'catch' && e.playerId === actorId && (!next || e.t <= next.t))
  const start = catchEvent?.t ?? from
  if (next?.type === 'pass') finish = 'pass'
  else if (next?.type === 'shot') {
    let path = 0, previous = at(start)
    for (const f of result.frames) { if (f.t <= start || f.t > next.t + 1e-9) continue; const q = f.players.find(p => p.id === actorId)!; path += dist(previous, q); previous = q }
    dribbleMetres = path
    finish = dist(at(next.t), RIM) <= LAYUP_METRES ? 'layup' : path >= PULL_UP_METRES ? 'pull-up' : 'catch-and-shoot'
  }
  const end = next?.t ?? Infinity
  const a = result.config.assumptions
  let realizedArrival: number | null = null
  for (const f of result.frames) {
    if (f.t < from - 1e-8 || f.t > end + 1e-9) continue
    const actor = f.players.find(p => p.id === actorId)!
    if (f.players.some(d => d.team === 'defense' && dist(d, actor) <= a.contestRadius * contestScale(d, actor))) { realizedArrival = Math.max(0, f.t - from); break }
  }
  return { finish, dribbleMetres, realizedArrival, realizedLateBy: realizedArrival === null ? null : realizedArrival - releaseIn }
}

function buildMoment(result: SimulationResult, windows: PlayerWindow[], frame: WorldFrame, threatId: ThreatId, basis: TeachingMoment['basis']): TeachingMoment | null {
  const problem = problemFor(result), roles = problem.roles, a = result.config.assumptions
  const option = frame.options.find(o => o.id === threatId)!
  const interval = windows.find(w => w.threatId === threatId && w.playerId === option.playerId)?.intervals.find(i => frame.t >= i.start - EPS && frame.t < i.end - EPS)
  if (!interval) return null
  const ranked = arrivals(frame, option, result)
  const best = ranked[0] ?? null
  const releaseIn = option.timeToRelease ?? a.gatherTime + a.readInterval
  const at = (id: PlayerId) => frame.players.find(p => p.id === id)!
  const receiver = at(option.playerId)
  const responsibleDefenderId = option.responsibleDefenderId ?? best?.id
  const evidence: string[] = []
  const tag = frame.responsibilities.find(r => r.kind === 'tag')
  const owner = frame.ball.owner ?? frame.ball.receiver ?? roles.ballhandler
  const onBall = frame.responsibilities.filter(r => (r.kind === 'contain' || r.kind === 'chase') && r.offensivePlayerId === roles.ballhandler)
  const switchTasks = frame.responsibilities.filter(r => r.kind === 'switch')
  const big = at(roles.big), roller = at(roles.screener), handler = at(roles.ballhandler)
  let cause: TeachingCause = 'unknown', pulledDefenderId: PlayerId | undefined, mechanism: TeachingMoment['mechanism']
  const bestId = best?.id
  evidence.push(`${receiver.id} is open at ${sec(frame.t)}: shot ready in ${sec(releaseIn)}, closest defender (${bestId}) needs ${best ? sec(best.seconds) : 'n/a'}${best ? ` → late by ${sec(best.seconds - releaseIn)}` : ''}.`)

  if (switchTasks.length >= 1 && frame.answer.coverage === 'switch') {
    cause = 'switch-mismatch'; pulledDefenderId = (switchTasks.find(r => r.offensivePlayerId === receiver.id) ?? switchTasks[0]).defenderId
    const switched = switchTasks.map(r => { const d = at(r.defenderId), o = at(r.offensivePlayerId); return `${d.id} (${d.height.toFixed(2)} m) on ${o.id} (${o.height.toFixed(2)} m)` }).join(', ')
    evidence.push(`Screen defenders exchanged: ${switched}.`)
  } else if (threatId !== 'drive' && (frame.answer.coverage === 'blitz' || frame.answer.coverage === 'hedge') && onBall.length >= 2 && onBall.every(r => dist(at(r.defenderId), at(owner)) < 2.6)) {
    cause = 'two-on-ball'; pulledDefenderId = onBall.find(r => r.defenderId === roles.big)?.defenderId ?? onBall[1].defenderId
    evidence.push(`${onBall.map(r => r.defenderId).join(' and ')} are both on the ball, so ${threatId} has no one on it.`)
  } else if (tag && option.playerId !== tag.offensivePlayerId && (threatId === 'lift' || threatId === 'corner' || threatId === 'strong')) {
    const tagger = at(tag.defenderId), toRoller = dist(tagger, at(tag.offensivePlayerId)), toReceiver = dist(tagger, receiver)
    pulledDefenderId = tag.defenderId
    if (toRoller < toReceiver && toReceiver > a.contestRadius) {
      cause = 'deep-tag'
      evidence.push(`${tagger.id} is tagging ${tag.offensivePlayerId}: ${toRoller.toFixed(1)} m from the roller, ${toReceiver.toFixed(1)} m from ${receiver.id}.`)
    } else {
      cause = 'late-rotation'
      evidence.push(`${tagger.id} is on the tag but ${toReceiver.toFixed(1)} m from ${receiver.id}; the recovery is late.`)
    }
  } else if (threatId === 'roll' && tag && at(tag.defenderId) && dist(at(tag.defenderId), roller) > a.contestRadius && dist(at(tag.defenderId), roller) > Math.min(dist(at(tag.defenderId), at(roles.weakCorner)), dist(at(tag.defenderId), at(roles.weakLift)))) {
    cause = 'late-rotation'; mechanism = 'shallow-tag'; pulledDefenderId = tag.defenderId
    evidence.push(`${tag.defenderId} is on the tag but stays ${dist(at(tag.defenderId), roller).toFixed(1)} m from the roller, closer to his own weakside man; ${roller.id} catches with only ${big.id} behind him.`)
  } else if (threatId === 'roll' && responsibleDefenderId && (responsibleDefenderId === roles.big || bestId === roles.big) && big.z - roller.z > 1.0) {
    cause = 'big-too-high'; pulledDefenderId = tag?.defenderId
    evidence.push(`${big.id} is ${(big.z - roller.z).toFixed(1)} m above the roller and ${dist(big, roller).toFixed(1)} m away.`)
  } else if ((threatId === 'pop' || threatId === 'drive') && (responsibleDefenderId === roles.big || bestId === roles.big) && big.z < handler.z - 2.6) {
    cause = 'big-too-deep'
    evidence.push(`${big.id} is ${(handler.z - big.z).toFixed(1)} m below the ball and ${dist(big, option.target).toFixed(1)} m from the ${threatId}.`)
  } else if (frame.responsibilities.some(r => r.threatId === threatId && (r.kind === 'closeout' || r.kind === 'recover' || r.kind === 'split' || r.kind === 'tag')) || tag) {
    cause = 'late-rotation'; pulledDefenderId = tag?.defenderId
    const task = frame.responsibilities.find(r => r.threatId === threatId)
    evidence.push(`${task ? `${task.defenderId} owns ${threatId} (${task.kind})` : `Nobody owns ${threatId}`} but arrives after the release.`)
  } else evidence.push('No help, switch or big-depth signature explains this opening; treat it as a plain spacing gap.')

  const involved: PlayerId[] = []
  const add = (id?: PlayerId | null) => { if (id && !involved.includes(id)) involved.push(id) }
  add(receiver.id); add(responsibleDefenderId); add(pulledDefenderId); add(tag?.offensivePlayerId); add(owner as PlayerId)
  if (cause === 'two-on-ball') onBall.forEach(r => add(r.defenderId))
  return { t: frame.t, threatId, receiverId: receiver.id, openFor: interval.end - interval.start, window: { ...interval }, defenderNeeds: best ? best.seconds : null, bestDefenderId: best?.id ?? null, releaseIn, lateBy: best ? best.seconds - releaseIn : null, ...realized(result, receiver.id, frame.t, releaseIn), ...(responsibleDefenderId ? { responsibleDefenderId } : {}), ...(pulledDefenderId ? { pulledDefenderId } : {}), involved, cause, ...(mechanism ? { mechanism } : {}), evidence, basis }
}

/** Smallest circle containing the involved players and the ball at t. */
export function framingAt(result: SimulationResult, t: number, involved: PlayerId[]): { center: Point2; radius: number } {
  const frame = frameAt(result, t)
  const ids = involved.length ? involved : frame.players.map(p => p.id)
  const pts: Point2[] = [...frame.players.filter(p => ids.includes(p.id)).map(p => ({ x: p.x, z: p.z })), { x: frame.ball.x, z: frame.ball.z }]
  const contains = (c: { center: Point2; radius: number }) => pts.every(p => dist(p, c.center) <= c.radius + 1e-9)
  let best: { center: Point2; radius: number } | null = null
  const consider = (c: { center: Point2; radius: number } | null) => { if (c && contains(c) && (!best || c.radius < best.radius)) best = c }
  for (const p of pts) consider({ center: p, radius: 0 })
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) consider({ center: { x: (pts[i].x + pts[j].x) / 2, z: (pts[i].z + pts[j].z) / 2 }, radius: dist(pts[i], pts[j]) / 2 })
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) for (let k = j + 1; k < pts.length; k++) {
    const [a, b, c] = [pts[i], pts[j], pts[k]]
    const d = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z))
    if (Math.abs(d) < 1e-12) continue
    const ux = ((a.x ** 2 + a.z ** 2) * (b.z - c.z) + (b.x ** 2 + b.z ** 2) * (c.z - a.z) + (c.x ** 2 + c.z ** 2) * (a.z - b.z)) / d
    const uz = ((a.x ** 2 + a.z ** 2) * (c.x - b.x) + (b.x ** 2 + b.z ** 2) * (a.x - c.x) + (c.x ** 2 + c.z ** 2) * (b.x - a.x)) / d
    consider({ center: { x: ux, z: uz }, radius: dist({ x: ux, z: uz }, a) })
  }
  return best ?? { center: { x: 0, z: 0 }, radius: 0 }
}

/** Windows per threat AND receiver. analyze() merges every receiver of a threat id
 * (the handler's pull-up and a weakside driver are both 'drive'), which hides
 * real changes behind the longest one. */
export interface PlayerWindow { threatId: ThreatId; playerId: PlayerId; duration: number; totalDuration: number; intervals: { start: number; end: number }[] }
export function playerWindows(result: SimulationResult): PlayerWindow[] {
  const a = result.config.assumptions, map = new Map<string, PlayerWindow>(), active = new Map<string, number>()
  const last = result.frames.length - 1
  result.frames.forEach((frame, i) => {
    const next = result.frames[i + 1]?.t ?? frame.t, open = new Set<string>()
    for (const option of frame.options) {
      const key = `${option.id}:${option.playerId}`
      if (!map.has(key)) map.set(key, { threatId: option.id, playerId: option.playerId, duration: 0, totalDuration: 0, intervals: [] })
      if (isThreatOpen(option, frame, a)) { open.add(key); if (!active.has(key)) active.set(key, frame.t); map.get(key)!.totalDuration += next - frame.t }
    }
    for (const [key, start] of active) if (!open.has(key) || i === last) {
      const w = map.get(key)!
      if (frame.t > start + 1e-8) { w.intervals.push({ start, end: frame.t }); w.duration = Math.max(w.duration, frame.t - start) }
      active.delete(key)
    }
  })
  return [...map.values()].filter(w => w.intervals.length).sort((x, y) => y.duration - x.duration || x.threatId.localeCompare(y.threatId))
}

export interface FixChange { threatId: ThreatId; playerId: PlayerId; before: number; after: number }
export interface FixOption {
  id: string
  plain: string
  detail: string
  patch: Partial<TeamAnswer>
  result: SimulationResult
  comparison: ComparisonResult
  improves: FixChange[]
  opens: FixChange[]
  newMoment: TeachingMoment | null
  /** True when explore ran with withFrames:false: `result.frames` is empty; call replayFix to rebuild it. */
  framesOmitted?: boolean
}
export interface ProposeOptions {
  /** Reuse an already computed baseline. */
  baseline?: SimulationResult
  /** Upper bound on options including keep-as-is. Default 6. */
  max?: number
}

interface Candidate { id: string; plain: string; detail: string; patch: (a: TeamAnswer) => Partial<TeamAnswer> | null }
const round2 = (n: number) => Math.round(n * 100) / 100
const CATALOG: Record<string, Candidate> = {
  'help-less': { id: 'help-less', plain: 'Help less on the roller', detail: 'Low man stays closer to the shooter.', patch: a => a.tag && a.tagDepth > 0.25 ? { tagDepth: round2(Math.max(0.2, a.tagDepth * 0.45)) } : null },
  'help-more': { id: 'help-more', plain: 'Help more on the roller', detail: 'Low man commits to the roller; more protection at the rim.', patch: a => a.tag && a.tagDepth < 0.85 ? { tagDepth: round2(Math.min(1, a.tagDepth + 0.4)) } : null },
  'rotate-early': { id: 'rotate-early', plain: 'Rotate earlier', detail: 'Start the X-out during the tag instead of waiting for the pass.', patch: a => a.rotationTiming !== 'early' || a.backside !== 'x-out' ? { rotationTiming: 'early', backside: 'x-out' } : null },
  'stay-home': { id: 'stay-home', plain: 'Stay home on the lift', detail: 'Backside defender stays with the lift instead of splitting or X-ing out.', patch: a => a.backside !== 'stay' ? { backside: 'stay' } : null },
  'x-out': { id: 'x-out', plain: 'X-out behind the tag', detail: 'Backside defender takes the corner while the low man recovers.', patch: a => a.backside !== 'x-out' ? { backside: 'x-out' } : null },
  'big-higher': { id: 'big-higher', plain: 'Keep the big higher', detail: 'Screen defender plays higher to protect the ball and pop.', patch: a => a.bigDepth < 5.6 ? { bigDepth: round2(Math.min(6, a.bigDepth + 1.4)) } : null },
  'big-lower': { id: 'big-lower', plain: 'Keep the big lower', detail: 'Screen defender drops deeper to protect the rim.', patch: a => a.bigDepth > 2.4 ? { bigDepth: round2(Math.max(1.5, a.bigDepth - 1.2)) } : null },
  'switch': { id: 'switch', plain: 'Switch the screen', detail: 'Screen defenders exchange; nobody has to tag.', patch: a => a.coverage !== 'switch' ? { coverage: 'switch' } : null },
  'blitz': { id: 'blitz', plain: 'Trap the ball', detail: 'Two defenders commit to the ball; the weakside handles the release.', patch: a => a.coverage !== 'blitz' ? { coverage: 'blitz' } : null },
  'hedge': { id: 'hedge', plain: 'Show and recover', detail: 'Big shows at the screen, then recovers to the roller.', patch: a => a.coverage !== 'hedge' ? { coverage: 'hedge' } : null },
  'drop': { id: 'drop', plain: 'Go back to drop', detail: 'Big contains below the screen; no switch or trap.', patch: a => a.coverage !== 'drop' ? { coverage: 'drop' } : null },
  'big-owns-roller': { id: 'big-owns-roller', plain: 'No tag: big owns the roller', detail: 'Low man stays on the corner; the big has to recover.', patch: a => a.tag ? { tag: false } : null },
  'secure-roller': { id: 'secure-roller', plain: 'Help until the roller is secured', detail: 'Low man stays in help until the big has the roller.', patch: a => a.recovery !== 'roller-secured' ? { recovery: 'roller-secured' } : null },
}
const ORDER: Record<TeachingCause | 'none', string[]> = {
  'deep-tag': ['help-less', 'stay-home', 'rotate-early', 'switch', 'blitz', 'big-owns-roller', 'hedge', 'big-higher'],
  'late-rotation': ['rotate-early', 'help-more', 'stay-home', 'help-less', 'secure-roller', 'blitz', 'switch', 'big-higher'],
  'switch-mismatch': ['drop', 'hedge', 'blitz', 'help-more', 'stay-home', 'rotate-early', 'big-higher'],
  'two-on-ball': ['drop', 'rotate-early', 'help-more', 'stay-home', 'hedge', 'secure-roller', 'big-higher'],
  'big-too-deep': ['big-higher', 'hedge', 'blitz', 'help-less', 'stay-home', 'rotate-early', 'switch'],
  'big-too-high': ['big-lower', 'help-more', 'secure-roller', 'hedge', 'switch', 'rotate-early', 'stay-home'],
  unknown: ['help-less', 'help-more', 'rotate-early', 'stay-home', 'big-higher', 'big-lower', 'switch', 'blitz', 'hedge'],
  none: ['help-less', 'help-more', 'rotate-early', 'stay-home', 'big-higher', 'big-lower', 'switch', 'blitz', 'hedge'],
}
const GENERIC = ['help-less', 'help-more', 'rotate-early', 'stay-home', 'x-out', 'big-higher', 'big-lower', 'switch', 'blitz', 'hedge', 'drop', 'big-owns-roller', 'secure-roller']

function sameMotion(a: SimulationResult, b: SimulationResult) {
  if (a.frames.length !== b.frames.length) return false
  return a.frames.every((fa, i) => fa.players.every((p, j) => Math.hypot(p.x - b.frames[i].players[j].x, p.z - b.frames[i].players[j].z) < 1e-6))
}
function changes(before: PlayerWindow[], after: PlayerWindow[], sign: 1 | -1): FixChange[] {
  const keys = new Map<string, { threatId: ThreatId; playerId: PlayerId }>()
  for (const w of [...before, ...after]) keys.set(`${w.threatId}:${w.playerId}`, w)
  const dur = (list: PlayerWindow[], k: { threatId: ThreatId; playerId: PlayerId }) => list.find(w => w.threatId === k.threatId && w.playerId === k.playerId)?.duration ?? 0
  return [...keys.values()].map(k => ({ threatId: k.threatId, playerId: k.playerId, before: dur(before, k), after: dur(after, k) })).filter(c => sign * (c.after - c.before) >= MIN_MEANINGFUL_SECONDS - EPS).sort((x, y) => sign * ((y.after - y.before) - (x.after - x.before)) || x.threatId.localeCompare(y.threatId))
}

export interface FixReport { fixes: FixOption[]; ineffective: { id: string; plain: string; patch: Partial<TeamAnswer> }[] }

/** Like proposeFixes, but also reports patches that did not change any player's motion. */
export function proposeFixesDetailed(config: LabConfig, moment: TeachingMoment | null, opts: ProposeOptions = {}): FixReport {
  const baseline = opts.baseline ?? simulate(config)
  const max = Math.max(1, opts.max ?? 6)
  const keep: FixOption = { id: 'keep', plain: 'Keep it as is', detail: 'Accept the tradeoff; no change.', patch: {}, result: baseline, comparison: compare(baseline, baseline), improves: [], opens: [], newMoment: null }
  keep.newMoment = moment ?? findTeachingMoment(baseline, keep.comparison.before)
  const baseWindows = playerWindows(baseline)
  const fixes: FixOption[] = [keep]
  const ineffective: FixReport['ineffective'] = []
  const ids = [...ORDER[moment?.cause ?? 'none'], ...GENERIC.filter(id => !ORDER[moment?.cause ?? 'none'].includes(id))]
  for (const id of ids) {
    if (fixes.length >= max) break
    const candidate = CATALOG[id]
    const patch = candidate.patch(config.answer)
    if (!patch) continue
    const next: LabConfig = { ...config, answer: { ...config.answer, ...patch } }
    const result = simulate(next)
    if (sameMotion(baseline, result)) { ineffective.push({ id, plain: candidate.plain, patch }); continue }
    const comparison = compare(baseline, result), windows = playerWindows(result)
    fixes.push({ id, plain: candidate.plain, detail: candidate.detail, patch, result, comparison, improves: changes(baseWindows, windows, -1), opens: changes(baseWindows, windows, 1), newMoment: findTeachingMoment(result, comparison.after) })
  }
  return { fixes, ineffective }
}

export function proposeFixes(config: LabConfig, moment: TeachingMoment | null, opts: ProposeOptions = {}): FixOption[] {
  return proposeFixesDetailed(config, moment, opts).fixes
}

export interface ExploreReport { baseline: SimulationResult; moment: TeachingMoment | null; fixes: FixOption[]; ineffective: FixReport['ineffective']; framesOmitted?: boolean }
const withoutFrames = (result: SimulationResult): SimulationResult => ({ ...result, frames: [], diagnostics: { ...result.diagnostics, flightStops: result.diagnostics.flightStops?.map(s => ({ ...s })) } })
/** Rebuild one option's full replay (deterministic) on the main thread. */
export function replayFix(config: LabConfig, fix: Pick<FixOption, 'patch'>): SimulationResult {
  return simulate({ ...config, answer: { ...config.answer, ...fix.patch } })
}
/** One-call pipeline used by the worker. withFrames:false drops every replay's
 * frames (about 1.3 MB each through structured clone); the UI then calls
 * replayFix for the one option the coach picks. */
export function explore(config: LabConfig, opts: { max?: number; withFrames?: boolean } = {}): ExploreReport {
  const baseline = simulate(config)
  const moment = findTeachingMoment(baseline)
  const { fixes, ineffective } = proposeFixesDetailed(config, moment, { baseline, max: opts.max })
  if (opts.withFrames === false) return { baseline: withoutFrames(baseline), moment, fixes: fixes.map(f => ({ ...f, result: withoutFrames(f.result), framesOmitted: true })), ineffective, framesOmitted: true }
  return { baseline, moment, fixes, ineffective }
}

export interface Divergence {
  firstDivergenceAt: number | null
  perPlayer: Record<PlayerId, { maxGap: number; at: number }>
  windows: { threatId: ThreatId; playerId: PlayerId; before: { start: number; end: number } | null; after: { start: number; end: number } | null; location: Point2 }[]
}
/** Metres a player must differ by before the replays count as diverged. */
export const DIVERGENCE_METRES = 0.05

export function divergence(before: SimulationResult, after: SimulationResult): Divergence {
  const n = Math.min(before.frames.length, after.frames.length)
  const perPlayer = {} as Divergence['perPlayer']
  let firstDivergenceAt: number | null = null
  for (let i = 0; i < n; i++) {
    const fa = before.frames[i], fb = after.frames[i]
    for (const p of fa.players) {
      const q = fb.players.find(o => o.id === p.id)
      if (!q) continue
      const gap = Math.hypot(p.x - q.x, p.z - q.z)
      if (!perPlayer[p.id]) perPlayer[p.id] = { maxGap: 0, at: fa.t }
      if (gap > perPlayer[p.id].maxGap) perPlayer[p.id] = { maxGap: gap, at: fa.t }
      if (firstDivergenceAt === null && gap > DIVERGENCE_METRES) firstDivergenceAt = fa.t
    }
  }
  const wb = playerWindows(before), wa = playerWindows(after)
  const longest = (w?: PlayerWindow) => w ? w.intervals.reduce((best, i) => (i.end - i.start > best.end - best.start ? i : best), w.intervals[0]) : null
  const keys = new Map<string, { threatId: ThreatId; playerId: PlayerId }>()
  for (const w of [...wb, ...wa]) keys.set(`${w.threatId}:${w.playerId}`, w)
  const windows: Divergence['windows'] = [...keys.values()].sort((x, y) => x.threatId.localeCompare(y.threatId) || x.playerId.localeCompare(y.playerId)).map(({ threatId, playerId }) => {
    const b = longest(wb.find(w => w.threatId === threatId && w.playerId === playerId)), a = longest(wa.find(w => w.threatId === threatId && w.playerId === playerId))
    const source = b ? { result: before, interval: b } : { result: after, interval: a! }
    const mid = (source.interval.start + source.interval.end) / 2
    const receiver = frameAt(source.result, mid).players.find(p => p.id === playerId)!
    return { threatId, playerId, before: b ? { ...b } : null, after: a ? { ...a } : null, location: { x: receiver.x, z: receiver.z } }
  })
  return { firstDivergenceAt, perPlayer, windows }
}

export interface Robustness {
  samples: number
  /** Runs in which the same threat and receiver opened AND the offense used it (when the reference run has a moment). */
  opened: number
  /** Runs with no used opening at all (when the reference run holds). */
  held: number
  /** Range of best-case lateBy across the runs where it opened. */
  lateByRange: [number, number] | null
  verdictLabel: string
  /** Wall-clock cost of the ensemble. */
  ms: number
}
function jitterStream(seed: number) {
  let x = (seed ^ 0x9e3779b9) >>> 0
  return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296 * 2 - 1 }
}
/** The deterministic perturbation behind sample `index`: seed, reaction +-0.05 s, top speed +-4%, every start +-0.25 m. */
export function jitterConfig(config: LabConfig, index: number): LabConfig {
  const u = jitterStream((config.seed + 1000003 * (index + 1)) >>> 0)
  const problem = PROBLEMS.find(p => p.id === config.problemId) ?? HIGH_PNR_PROBLEM
  const a = config.assumptions
  const startingPositions: LabConfig['startingPositions'] = { ...config.startingPositions }
  for (const p of problem.players) {
    const start = config.startingPositions?.[p.id] ?? p.start
    startingPositions[p.id] = { x: Math.max(-7.2, Math.min(7.2, start.x + u() * 0.25)), z: Math.max(0.5, Math.min(13.5, start.z + u() * 0.25)) }
  }
  return { ...config, seed: (config.seed + 1000003 * (index + 1)) >>> 0, startingPositions, assumptions: { ...a, reactionDelay: Math.max(0, Math.min(0.8, a.reactionDelay + u() * 0.05)), maxSpeed: Math.max(1, Math.min(8, a.maxSpeed * (1 + u() * 0.04))) } }
}
/** Would the same verdict survive small, deterministic changes to the world? */
export function robustness(config: LabConfig, opts: { samples?: number; moment?: TeachingMoment | null; baseline?: SimulationResult } = {}): Robustness {
  const started = performance.now(), n = Math.max(1, opts.samples ?? 8)
  const reference = opts.moment !== undefined ? opts.moment : findTeachingMoment(opts.baseline ?? simulate(config))
  let opened = 0, held = 0
  const lates: number[] = []
  for (let i = 0; i < n; i++) {
    const result = simulate(jitterConfig(config, i)), used = usedOpenings(result, playerWindows(result))
    if (!used.length) held++
    const same = reference ? used.filter(u => u.threatId === reference.threatId && u.receiverId === reference.receiverId) : []
    if (same.length) { opened++; lates.push(Math.max(...same.map(u => u.lateBy))) }
  }
  const verdictLabel = reference ? `Opened in ${opened} of ${n} runs` : `Held in ${held} of ${n} runs`
  return { samples: n, opened, held, lateByRange: lates.length ? [Math.min(...lates), Math.max(...lates)] : null, verdictLabel, ms: performance.now() - started }
}
