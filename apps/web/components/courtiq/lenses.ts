import { isThreatOpen, travelTime } from '@/lib/defense-lab/analytics'
import type { TeachingMoment } from '@/lib/defense-lab/explore'
import type { ModelAssumptions, PlayerId, Point2, SimulationResult, ThreatId, WorldFrame } from '@/lib/defense-lab/types'
import { frameAt } from '@/lib/defense-lab/simulation'
import type { Lens, Mark, Tone } from './world/types'

/** Each lens reveals exactly one basketball idea. */
export const LENSES: { id: Lens; plain: string; coach: string; idea: string }[] = [
  { id: 'normal', plain: 'Game view', coach: 'Game view', idea: 'What happens.' },
  { id: 'ownership', plain: 'Who has who', coach: 'Responsibilities', idea: 'Every defender’s job right now — and who is being asked to do two things.' },
  { id: 'reach', plain: 'Who can get there', coach: 'Reach in time', idea: 'How far each defender can get in half a second and one second. Anyone outside every circle is open.' },
  { id: 'passing', plain: 'Open passes', coach: 'Passing windows', idea: 'Every pass the ball can make, lit when no defender gets there before the catch.' },
  { id: 'space', plain: 'Room to drive', coach: 'Drive & roll space', idea: 'Lanes to the rim for the ball and the screener.' },
]

const THREAT_RECEIVER = (frame: WorldFrame, id: ThreatId) => frame.options.find(o => o.id === id)?.playerId

/** Distance a defender covers in `seconds` from rest after reacting. */
export function reachDistance(seconds: number, a: Pick<ModelAssumptions, 'acceleration' | 'maxSpeed' | 'reactionDelay'>, initialSpeed = 0): number {
  const t = Math.max(0, seconds - a.reactionDelay * 0.5)
  if (!t) return 0
  // Invert travelTime by bisection: exact agreement with the arrival estimator.
  let lo = 0, hi = 12
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (travelTime(mid, initialSpeed, a.acceleration, a.maxSpeed) <= t) lo = mid; else hi = mid }
  return lo
}

const KIND_TONE: Record<string, Tone> = { contain: 'defense', guard: 'defense', chase: 'defense', tag: 'warn', split: 'threat', closeout: 'good', recover: 'good', switch: 'defense' }

export function lensMarks(lens: Lens, frame: WorldFrame, assumptions: ModelAssumptions, selected: PlayerId | null): Mark[] {
  if (lens === 'normal') return []
  const marks: Mark[] = []
  const open = new Set(frame.options.filter(o => isThreatOpen(o, frame, assumptions)).map(o => o.id))
  if (lens === 'ownership') {
    const byDefender = new Map<PlayerId, typeof frame.responsibilities>()
    for (const r of frame.responsibilities) byDefender.set(r.defenderId, [...(byDefender.get(r.defenderId) ?? []), r])
    for (const [id, list] of byDefender) {
      const sorted = [...list].sort((a, b) => b.priority - a.priority)
      const top = sorted[0]
      const torn = sorted.length > 1 && sorted[1].priority >= top.priority - 0.5 && sorted[1].threatId !== top.threatId
      marks.push({ kind: 'tether', id: `own-${id}`, from: id, to: top.offensivePlayerId, tone: torn ? 'threat' : KIND_TONE[top.kind] ?? 'defense', width: id === selected ? 0.11 : 0.07 })
      if (torn) marks.push({ kind: 'tether', id: `own2-${id}`, from: id, to: sorted[1].offensivePlayerId, tone: 'threat', opacity: 0.5 })
      marks.push({ kind: 'ring', id: `ownr-${id}`, at: id, tone: torn ? 'threat' : 'defense', radius: 0.42, opacity: 0.55 })
    }
    for (const o of frame.options) if (open.has(o.id) && o.kind !== 'drive') marks.push({ kind: 'ring', id: `open-${o.id}`, at: o.playerId, tone: 'threat', pulse: true, radius: 0.62 })
    return marks
  }
  if (lens === 'reach') {
    for (const p of frame.players) {
      if (p.team !== 'defense') continue
      const speed = Math.hypot(p.vx, p.vz)
      const r1 = reachDistance(0.5, assumptions, speed * 0.3), r2 = reachDistance(1.0, assumptions, speed * 0.3)
      marks.push({ kind: 'disc', id: `reach1-${p.id}`, center: p.id, radius: Math.max(0.4, r1 + assumptions.contestRadius * 0.5), tone: 'defense', opacity: 0.28, edge: true })
      marks.push({ kind: 'disc', id: `reach2-${p.id}`, center: p.id, radius: Math.max(0.6, r2 + assumptions.contestRadius * 0.5), tone: 'defense', opacity: 0.1, edge: true })
    }
    for (const o of frame.options) {
      if (o.kind === 'drive') continue
      marks.push({ kind: 'ring', id: `rcv-${o.id}`, at: o.playerId, tone: open.has(o.id) ? 'threat' : 'neutral', radius: 0.5, pulse: open.has(o.id), opacity: open.has(o.id) ? 1 : 0.4 })
    }
    return marks
  }
  if (lens === 'passing') {
    const owner = frame.ball.owner
    for (const o of frame.options) {
      if (o.kind === 'drive' || !o.available || o.playerId === owner) continue
      const isOpen = open.has(o.id)
      marks.push({ kind: 'lane', id: `lane-${o.id}`, from: owner ?? 'O1', to: o.playerId, tone: isOpen ? 'good' : 'neutral', width: isOpen ? 0.7 : 0.35, opacity: isOpen ? 0.62 : 0.16 })
      if (isOpen) marks.push({ kind: 'ring', id: `lane-r-${o.id}`, at: o.playerId, tone: 'good', radius: 0.6, pulse: true })
    }
    return marks
  }
  // space
  const owner = frame.ball.owner ?? 'O1'
  const rim: Point2 = { x: 0, z: 1.575 }
  const drive = frame.options.find(o => o.id === 'drive')
  const roller = THREAT_RECEIVER(frame, 'roll')
  marks.push({ kind: 'wedge', id: 'space-drive', apex: owner, toward: rim, length: 4.2, spread: 0.5, tone: drive && open.has('drive') ? 'threat' : 'neutral', opacity: drive && open.has('drive') ? 0.5 : 0.2 })
  if (roller) marks.push({ kind: 'wedge', id: 'space-roll', apex: roller, toward: rim, length: 3.2, spread: 0.6, tone: open.has('roll') ? 'threat' : 'neutral', opacity: open.has('roll') ? 0.5 : 0.18 })
  marks.push({ kind: 'disc', id: 'space-rim', center: rim, radius: 1.25, tone: 'focus', opacity: 0.08, edge: true })
  return marks
}

/** The teaching moment drawn on the floor: the open player, the defender who
 * can't get there (and his route), and the help that created it. */
export function momentMarks(moment: TeachingMoment, frame: WorldFrame): Mark[] {
  const marks: Mark[] = [
    { kind: 'ring', id: 'm-open', at: moment.receiverId, tone: 'threat', radius: 0.7, pulse: true },
  ]
  const best = moment.bestDefenderId ?? moment.responsibleDefenderId
  const defender = frame.players.find(p => p.id === best)
  const receiver = frame.players.find(p => p.id === moment.receiverId)
  if (defender && receiver) {
    marks.push({ kind: 'path', id: 'm-route', points: [{ x: defender.x, z: defender.z }, { x: receiver.x, z: receiver.z }], tone: 'warn', width: 0.1, arrow: true, dashed: true })
    marks.push({ kind: 'ring', id: 'm-late', at: defender.id, tone: 'warn', radius: 0.5 })
  }
  const pulled = frame.players.find(p => p.id === moment.pulledDefenderId)
  if (pulled) {
    const task = frame.responsibilities.filter(r => r.defenderId === pulled.id).sort((a, b) => b.priority - a.priority)[0]
    if (task) marks.push({ kind: 'tether', id: 'm-pull', from: pulled.id, to: task.offensivePlayerId, tone: 'defense', width: 0.09 })
    marks.push({ kind: 'ring', id: 'm-pulled', at: pulled.id, tone: 'defense', radius: 0.5 })
  }
  return marks
}

/** Spatial comparison: where each defender went in both worlds over the recent
 * past, and only the divergent ones. */
export function divergenceMarks(before: SimulationResult, after: SimulationResult, t: number, span = 1.6): Mark[] {
  const marks: Mark[] = []
  const t0 = Math.max(0, t - span), steps = 14
  const ids = after.frames[0].players.filter(p => p.team === 'defense').map(p => p.id)
  for (const id of ids) {
    const a: Point2[] = [], b: Point2[] = []
    let gap = 0
    for (let i = 0; i <= steps; i++) {
      const tt = t0 + (t - t0) * i / steps
      const fa = frameAt(after, tt).players.find(p => p.id === id)!, fb = frameAt(before, tt).players.find(p => p.id === id)!
      a.push({ x: fa.x, z: fa.z }); b.push({ x: fb.x, z: fb.z })
      gap = Math.max(gap, Math.hypot(fa.x - fb.x, fa.z - fb.z))
    }
    if (gap < 0.35) continue
    marks.push({ kind: 'path', id: `dv-b-${id}`, points: b, tone: 'ghost', width: 0.07, opacity: 0.55 })
    marks.push({ kind: 'path', id: `dv-a-${id}`, points: a, tone: 'defense', width: 0.09, arrow: true })
  }
  return marks
}
