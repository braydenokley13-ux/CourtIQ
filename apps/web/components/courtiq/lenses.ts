import { defenderArrival, estimateArrival, isThreatOpen, travelTime } from '@courtiq/basketball/analytics'
import { sampleArrivalField } from '@courtiq/basketball/arrivalField'
import type { TeachingMoment } from '@courtiq/basketball/explore'
import type {
  ModelAssumptions,
  PlayerId,
  Point2,
  SimulationResult,
  ThreatId,
  WorldFrame,
} from '@courtiq/basketball/types'
import { frameAt } from '@courtiq/basketball/simulation'
import type { Lens, Mark, Tone } from './world/types'

/** Each lens reveals exactly one basketball idea. */
export const LENSES: { id: Lens; plain: string; coach: string; idea: string }[] = [
  { id: 'normal', plain: 'Game view', coach: 'Game view', idea: 'What happens.' },
  {
    id: 'ownership',
    plain: 'Who has who',
    coach: 'Responsibilities',
    idea: 'Each defender is tied to a job by a string. A long string is a job he can’t reach; two strings means he’s pulled two ways.',
  },
  {
    id: 'reach',
    plain: 'Who can get there',
    coach: 'Reach in time',
    idea: 'Rings estimate how soon a defender can get to each spot. Red marks an opening in this model before the shot is ready.',
  },
  {
    id: 'passing',
    plain: 'Open passes',
    coach: 'Passing windows',
    idea: 'Every pass the ball can make. Lit glass is open; a red notch is where a hand gets there first.',
  },
  {
    id: 'space',
    plain: 'Room to drive',
    coach: 'Drive & roll space',
    idea: 'The lane to the rim for the ball and the screener, red when nobody can stop it.',
  },
]

const THREAT_RECEIVER = (frame: WorldFrame, id: ThreatId) => frame.options.find((o) => o.id === id)?.playerId

/** Distance a defender covers in `seconds` from rest after reacting. */
export function reachDistance(
  seconds: number,
  a: Pick<ModelAssumptions, 'acceleration' | 'maxSpeed' | 'reactionDelay'>,
  initialSpeed = 0,
): number {
  const t = Math.max(0, seconds - a.reactionDelay * 0.5)
  if (!t) return 0
  // Invert travelTime by bisection: exact agreement with the arrival estimator.
  let lo = 0,
    hi = 12
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (travelTime(mid, initialSpeed, a.acceleration, a.maxSpeed) <= t) lo = mid
    else hi = mid
  }
  return lo
}

const KIND_TONE: Record<string, Tone> = {
  contain: 'defense',
  guard: 'defense',
  chase: 'defense',
  tag: 'warn',
  split: 'threat',
  closeout: 'good',
  recover: 'good',
  switch: 'defense',
}
const RIM: Point2 = { x: 0, z: 1.575 }
const CHEST = 1.15

type Job = WorldFrame['responsibilities'][number]
const topJobs = (frame: WorldFrame, id: PlayerId): Job[] =>
  frame.responsibilities.filter((r) => r.defenderId === id).sort((a, b) => b.priority - a.priority)

/** One defender owing two different things at nearly equal priority. */
export function tornJobs(frame: WorldFrame, id: PlayerId): [Job, Job] | null {
  const list = topJobs(frame, id)
  if (list.length < 2) return null
  const [a, b] = list
  return b.priority >= a.priority - 0.5 && b.threatId !== a.threatId && b.offensivePlayerId !== a.offensivePlayerId
    ? [a, b]
    : null
}

/** Earliest time any defender contests `target` (same estimator as the open/closed verdict). */
function earliestArrival(frame: WorldFrame, assumptions: ModelAssumptions, target: Point2, receiverId?: PlayerId) {
  const receiver = receiverId ? frame.players.find((p) => p.id === receiverId) : undefined
  let best = Infinity
  for (const p of frame.players)
    if (p.team === 'defense')
      best = Math.min(best, defenderArrival(p, target, assumptions, assumptions.reactionDelay, receiver))
  return best
}

/** The ball clock: how long until a shot/pass is ready, the time every defender must beat. */
export function ballClock(frame: WorldFrame, assumptions: ModelAssumptions, open: Set<string>): number {
  const base = assumptions.gatherTime + assumptions.readInterval
  const pick = frame.options.filter((o) => o.available && (open.size ? open.has(o.id) : o.kind !== 'keep'))
  const times = pick.map((o) => o.timeToRelease ?? base).filter((t) => t > 0)
  return times.length ? Math.min(...times) : base
}

/** Parts of a lane (0..1) a defender could get a hand on before the thing travelling along it
 * (a pass at `speed`, after `delay`; or the dribbler) gets there. Same estimator as the verdict. */
export function laneCuts(
  frame: WorldFrame,
  assumptions: ModelAssumptions,
  a: Point2,
  b: Point2,
  delay: number,
  skipEnd = 0.0,
  speed = assumptions.passSpeed,
  influence = 0.8,
): [number, number][] {
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1,
    N = 22
  const defenders = frame.players.filter((p) => p.team === 'defense')
  const hit: boolean[] = []
  for (let i = 0; i <= N; i++) {
    const f = i / N,
      pt = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }
    const ball = delay + (len * f) / speed
    hit.push(f <= 1 - skipEnd && defenders.some((d) => estimateArrival(d, pt, assumptions, influence) <= ball))
  }
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= N; i++) {
    if (hit[i] && start < 0) start = i
    if ((!hit[i] || i === N) && start >= 0) {
      out.push([Math.max(0, (start - 0.5) / N), Math.min(1, (hit[i] ? i : i - 0.5) / N)])
      start = -1
    }
  }
  return out.slice(0, 3)
}

export function lensMarks(
  lens: Lens,
  frame: WorldFrame,
  assumptions: ModelAssumptions,
  selected: PlayerId | null,
  before?: WorldFrame | null,
): Mark[] {
  if (lens === 'normal') return []
  const marks: Mark[] = []
  const open = new Set(frame.options.filter((o) => isThreatOpen(o, frame, assumptions)).map((o) => o.id))
  const owner = frame.ball.owner

  // ---- Duty strings: every defender is tied to a job; the open man has no string.
  if (lens === 'ownership') {
    const defenders = frame.players.filter((p) => p.team === 'defense')
    for (const d of defenders) {
      const list = topJobs(frame, d.id)
      const top = list[0]
      if (!top) continue
      const torn = tornJobs(frame, d.id)
      const young = frame.t - top.startedAt
      const flash = top.startedAt > 0.05 && young >= 0 && young < 0.6 ? 1 - young / 0.6 : 0
      // Tension: a string stretched across the floor is a job he cannot hold.
      const man = frame.players.find((q) => q.id === top.offensivePlayerId)
      const len = man ? Math.hypot(man.x - d.x, man.z - d.z) : 0
      const tone: Tone = torn
        ? 'threat'
        : len > 4
          ? 'threat'
          : len > 2.6
            ? 'warn'
            : KIND_TONE[top.kind] === 'good'
              ? 'good'
              : 'defense'
      marks.push({
        kind: 'tether',
        id: `own-${d.id}`,
        from: d.id,
        to: top.offensivePlayerId ?? top.target,
        tone,
        y: CHEST,
        sag: torn ? 0.14 : 0.04,
        width: d.id === selected ? 0.11 : 0.075,
        fray: !!torn,
        flash,
        opacity: 0.95,
      })
      if (torn)
        marks.push({
          kind: 'tether',
          id: `own2-${d.id}`,
          from: d.id,
          to: torn[1].offensivePlayerId ?? torn[1].target,
          tone: 'threat',
          y: CHEST + 0.08,
          sag: 0.16,
          width: 0.07,
          fray: true,
          opacity: 0.85,
        })
      // A transfer: the old string snaps loose while the new one whips tight.
      const prev = before ? topJobs(before, d.id)[0] : null
      if (prev && prev.offensivePlayerId !== top.offensivePlayerId && flash > 0)
        marks.push({
          kind: 'tether',
          id: `own-snap-${d.id}`,
          from: d.id,
          to: prev.offensivePlayerId ?? prev.target,
          tone: 'neutral',
          y: CHEST,
          sag: 0.3,
          width: 0.04,
          fray: true,
          opacity: 0.6 * flash,
        })
      if (torn) {
        const t1 = torn[0].offensivePlayerId ? resolveTarget(frame, torn[0].offensivePlayerId) : torn[0].target
        const t2 = torn[1].offensivePlayerId ? resolveTarget(frame, torn[1].offensivePlayerId) : torn[1].target
        let ax = (t1?.x ?? d.x) - d.x,
          az = (t1?.z ?? d.z) - d.z
        if (t2) {
          const bx = t2.x - d.x,
            bz = t2.z - d.z
          const dot = ax * bx + az * bz
          if (dot < 0) {
            ax -= bx
            az -= bz
          } else {
            ax += bx
            az += bz
          }
        }
        marks.push({
          kind: 'ring',
          id: `ownr-${d.id}`,
          at: d.id,
          tone: 'threat',
          radius: 0.5,
          aspect: 1.9,
          rot: Math.atan2(-az, ax),
          pulse: true,
          opacity: 0.9,
        })
      } else marks.push({ kind: 'ring', id: `ownr-${d.id}`, at: d.id, tone: 'defense', radius: 0.42, opacity: 0.5 })
    }
    // The open man: the one figure nobody is tied to.
    for (const o of frame.options)
      if (open.has(o.id))
        marks.push({ kind: 'ring', id: `open-${o.id}`, at: o.playerId, tone: 'threat', pulse: true, radius: 0.62 })
    return marks
  }

  // ---- Arrival map: when can anyone get there? The open man sits outside every band.
  if (lens === 'reach') {
    const clock = ballClock(frame, assumptions, open)
    marks.push({
      kind: 'arrival',
      id: 'arrival',
      field: sampleArrivalField(frame, assumptions),
      ballTime: clock,
      islands: frame.options.filter((o) => open.has(o.id)).map((o) => o.playerId),
    })
    const ringed = new Set<string>()
    for (const o of frame.options) {
      const isOpen = open.has(o.id)
      if (ringed.has(o.playerId) || (o.kind === 'keep' && !isOpen)) continue
      ringed.add(o.playerId)
      marks.push({
        kind: 'ring',
        id: `rcv-${o.id}`,
        at: o.playerId,
        tone: isOpen ? 'threat' : 'neutral',
        radius: 0.5,
        pulse: isOpen,
        opacity: isOpen ? 1 : 0.4,
      })
    }
    const target = frame.options.find((o) => open.has(o.id) && o.playerId !== owner)
    const from = owner ? resolveTarget(frame, owner) : null
    const to = target ? resolveTarget(frame, target.playerId) : null
    if (from && to)
      marks.push({
        kind: 'path',
        id: 'arrival-ball',
        points: [from, to],
        tone: 'offense',
        width: 0.09,
        arrow: true,
        lift: 0.02,
        grow: 700,
        opacity: 0.9,
      })
    return marks
  }

  // ---- Glass corridors: where can the ball go, lit when open.
  if (lens === 'passing') {
    const holder = owner ?? frame.ball.flight?.from ?? null
    const from = holder ? resolveTarget(frame, holder) : null
    const release = ballClock(frame, assumptions, new Set())
    for (const p of frame.players) {
      if (p.team !== 'offense' || p.id === holder || !from || !holder) continue
      // Every teammate is a corridor; lit only while the option is live and nobody gets there first.
      const o = frame.options.find((x) => x.playerId === p.id && x.kind !== 'keep' && x.available)
      const isOpen = !!o && open.has(o.id)
      const to = { x: p.x, z: p.z }
      const margin = o ? earliestArrival(frame, assumptions, o.target, o.playerId) - (o.timeToRelease ?? release) : 0
      marks.push({
        kind: 'lane',
        id: `lane-${p.id}`,
        from: holder,
        to: p.id,
        tone: isOpen ? 'good' : 'neutral',
        width: isOpen ? Math.min(0.7, Math.max(0.16, margin * 0.9)) : 0.22,
        blocked: !isOpen,
        arc: 2.1,
        cuts: isOpen ? [] : laneCuts(frame, assumptions, from, to, assumptions.readInterval, 0.04),
        opacity: isOpen ? 0.9 : 0.5,
      })
      if (isOpen) marks.push({ kind: 'ring', id: `lane-r-${p.id}`, at: p.id, tone: 'good', radius: 0.6, pulse: true })
    }
    // The drive corridor: the ball's other way to the rim.
    const drive = frame.options.find((o) => o.id === 'drive')
    if (holder && from && drive)
      marks.push({
        kind: 'lane',
        id: 'lane-drive',
        from: holder,
        to: RIM,
        tone: open.has('drive') ? 'threat' : 'neutral',
        width: open.has('drive') ? 0.6 : 0.26,
        blocked: !open.has('drive'),
        arc: 1.2,
        cuts: open.has('drive') ? [] : laneCuts(frame, assumptions, from, RIM, 0.15, 0.2, 4.2, 1.0),
        opacity: open.has('drive') ? 0.85 : 0.45,
      })
    return marks
  }

  // ---- Space: the drive corridor to the rim (and the roller's), same glass language.
  const ball = owner ?? 'O1'
  const from = resolveTarget(frame, ball)
  const drive = frame.options.find((o) => o.id === 'drive')
  const roller = THREAT_RECEIVER(frame, 'roll')
  const corridor = (id: string, who: PlayerId, isOpen: boolean, apex: number) => {
    const a = resolveTarget(frame, who)
    if (!a) return
    marks.push({
      kind: 'lane',
      id,
      from: who,
      to: RIM,
      tone: isOpen ? 'threat' : 'neutral',
      width: isOpen ? 0.7 : 0.3,
      blocked: !isOpen,
      arc: apex,
      cuts: isOpen ? [] : laneCuts(frame, assumptions, a, RIM, 0.15, 0.2, 4.2, 1.0),
      opacity: isOpen ? 0.9 : 0.55,
    })
  }
  if (from) corridor('space-drive', ball, !!drive && open.has('drive'), 1.2)
  if (roller) corridor('space-roll', roller, open.has('roll'), 1.9)
  marks.push({ kind: 'disc', id: 'space-rim', center: RIM, radius: 1.25, tone: 'focus', opacity: 0.1, edge: true })
  return marks
}

function resolveTarget(frame: WorldFrame, id: PlayerId): Point2 | null {
  const p = frame.players.find((q) => q.id === id)
  return p ? { x: p.x, z: p.z } : null
}

/** The teaching moment drawn on the floor: the open player, the defender who
 * can't get there (and his route), and the help that created it. */
export function momentMarks(moment: TeachingMoment, frame: WorldFrame): Mark[] {
  const marks: Mark[] = [
    { kind: 'ring', id: 'm-open', at: moment.receiverId, tone: 'threat', radius: 0.7, pulse: true },
  ]
  const best = moment.bestDefenderId ?? moment.responsibleDefenderId
  const defender = frame.players.find((p) => p.id === best)
  const receiver = frame.players.find((p) => p.id === moment.receiverId)
  if (defender && receiver) {
    marks.push({
      kind: 'path',
      id: 'm-route',
      points: [
        { x: defender.x, z: defender.z },
        { x: receiver.x, z: receiver.z },
      ],
      tone: 'warn',
      width: 0.1,
      arrow: true,
      dashed: true,
    })
    marks.push({ kind: 'ring', id: 'm-late', at: defender.id, tone: 'warn', radius: 0.5 })
  }
  const pulled = frame.players.find((p) => p.id === moment.pulledDefenderId)
  if (pulled) {
    const task = frame.responsibilities
      .filter((r) => r.defenderId === pulled.id)
      .sort((a, b) => b.priority - a.priority)[0]
    if (task)
      marks.push({
        kind: 'tether',
        id: 'm-pull',
        from: pulled.id,
        to: task.offensivePlayerId ?? task.target,
        tone: 'defense',
        width: 0.09,
      })
    marks.push({ kind: 'ring', id: 'm-pulled', at: pulled.id, tone: 'defense', radius: 0.5 })
  }
  return marks
}

/** Spatial comparison, difference only: for each defender who truly ends up elsewhere,
 * a pin where he stands in the other world, a floor trail (capped ~0.9 s) and an
 * arrow from that foot to his real foot. Everyone else is left alone. */
export function divergenceMarks(before: SimulationResult, after: SimulationResult, t: number, span = 0.9): Mark[] {
  const marks: Mark[] = []
  const t0 = Math.max(0, t - span),
    steps = 10
  const ids = after.frames[0].players.filter((p) => p.team === 'defense').map((p) => p.id)
  for (const id of ids) {
    const a: Point2[] = [],
      b: Point2[] = []
    let gap = 0
    for (let i = 0; i <= steps; i++) {
      const tt = t0 + ((t - t0) * i) / steps
      const fa = frameAt(after, tt).players.find((p) => p.id === id)!,
        fb = frameAt(before, tt).players.find((p) => p.id === id)!
      a.push({ x: fa.x, z: fa.z })
      b.push({ x: fb.x, z: fb.z })
      gap = Math.max(gap, Math.hypot(fa.x - fb.x, fa.z - fb.z))
    }
    const now = { a: a[a.length - 1], b: b[b.length - 1] },
      sep = Math.hypot(now.a.x - now.b.x, now.a.z - now.b.z)
    if (gap < 0.35 && sep < 0.2) continue
    marks.push({ kind: 'path', id: `dv-b-${id}`, points: b, tone: 'ghost', width: 0.05, opacity: 0.5 })
    marks.push({ kind: 'path', id: `dv-a-${id}`, points: a, tone: 'defense', width: 0.06, opacity: 0.6 })
    if (sep >= 0.3) {
      // Foot-to-foot pin: from where the other world's defender stands to where he stands now.
      marks.push({ kind: 'pin', id: `dv-pin-${id}`, at: now.b, tone: 'ghost', height: 2.0 })
      marks.push({
        kind: 'path',
        id: `dv-pin-line-${id}`,
        points: [now.b, now.a],
        tone: 'ghost',
        width: 0.05,
        arrow: true,
        lift: 0.01,
        opacity: 0.9,
        grow: 420,
      })
    }
  }
  return marks
}

/** Distance labels for the divergent defenders only ("1.4 m shallower"). */
export function divergenceLabels(
  before: SimulationResult,
  after: SimulationResult,
  t: number,
  feet = false,
): { anchor: string; text: string }[] {
  const out: { anchor: string; text: string }[] = []
  const fa = frameAt(after, t),
    fb = frameAt(before, t)
  for (const p of fa.players) {
    if (p.team !== 'defense') continue
    const q = fb.players.find((x) => x.id === p.id)
    if (!q) continue
    const sep = Math.hypot(p.x - q.x, p.z - q.z)
    if (sep < 0.3) continue
    // Where the other world's defender stands relative to where he stands now.
    const dz = q.z - p.z,
      dx = q.x - p.x
    const word =
      Math.abs(dz) > Math.abs(dx) * 0.6 ? (dz < 0 ? 'deeper' : 'higher') : dx > 0 ? 'to the right' : 'to the left'
    out.push({
      anchor: `pt:${((p.x + q.x) / 2).toFixed(2)},${((p.z + q.z) / 2).toFixed(2)}`,
      text: `#${p.id.slice(1)} ${feet ? `${Math.round(sep * 3.281)} ft` : `${sep.toFixed(1)} m`} ${word}`,
    })
  }
  return out
}

/** "Show me why": the causal chain behind one moment, in one picture.
 * Passes that led here, the help that got pulled, and the late defender's
 * reach (how far he can get before the shot is ready) versus the open man. */
export function whyMarks(
  moment: TeachingMoment,
  result: SimulationResult,
  t: number,
  assumptions: ModelAssumptions,
): { marks: Mark[]; labels: { anchor: string; text: string; kind: 'pass' | 'reach' | 'help' }[] } {
  const frame = frameAt(result, t)
  const marks: Mark[] = [],
    labels: { anchor: string; text: string; kind: 'pass' | 'reach' | 'help' }[] = []
  // 1. The ball's journey to this moment.
  let n = 0
  for (const f of result.frames) {
    const fl = f.ball.flight
    if (!fl || f.t > t || fl.kind === 'shot') continue
    if (marks.some((m) => m.id === `why-pass-${fl.start}`)) continue
    n++
    const mid = { x: (fl.a.x + fl.b.x) / 2, z: (fl.a.z + fl.b.z) / 2 }
    marks.push({
      kind: 'path',
      id: `why-pass-${fl.start}`,
      points: [
        { x: fl.a.x, z: fl.a.z },
        { x: fl.b.x, z: fl.b.z },
      ],
      tone: 'offense',
      width: 0.12,
      arrow: true,
      opacity: 0.9,
      grow: 700,
    })
    labels.push({ anchor: `pt:${mid.x.toFixed(2)},${mid.z.toFixed(2)}`, text: `Pass ${n}`, kind: 'pass' })
  }
  // 2. The help that started it.
  const pulled = moment.pulledDefenderId
  if (pulled) {
    const tagged = result.frames.find((f) =>
      f.responsibilities.some((r) => r.defenderId === pulled && (r.kind === 'tag' || r.kind === 'split')),
    )
    const task = tagged?.responsibilities.find(
      (r) => r.defenderId === pulled && (r.kind === 'tag' || r.kind === 'split'),
    )
    const me = tagged?.players.find((p) => p.id === pulled)
    if (tagged && task && me) {
      marks.push({
        kind: 'path',
        id: 'why-help',
        points: [{ x: me.x, z: me.z }, task.target],
        tone: 'warn',
        width: 0.09,
        dashed: true,
        arrow: true,
      })
      labels.push({
        anchor: `pt:${me.x.toFixed(2)},${me.z.toFixed(2)}`,
        text: `Helps at ${tagged.t.toFixed(1)} s`,
        kind: 'help',
      })
    }
  }
  // 3. Reach before the shot is ready vs. the open man.
  const best = frame.players.find((p) => p.id === (moment.bestDefenderId ?? moment.responsibleDefenderId))
  const receiver = frame.players.find((p) => p.id === moment.receiverId)
  if (best && receiver && moment.releaseIn != null) {
    const r = reachDistance(moment.releaseIn, assumptions, Math.hypot(best.vx, best.vz)) + assumptions.contestRadius
    marks.push({
      kind: 'disc',
      id: 'why-reach',
      center: best.id,
      radius: Math.max(0.5, r),
      tone: 'defense',
      opacity: 0.35,
      edge: true,
    })
    marks.push({ kind: 'ring', id: 'why-open', at: receiver.id, tone: 'threat', radius: 0.65, pulse: true })
    labels.push({
      anchor: `pt:${best.x.toFixed(2)},${best.z.toFixed(2)}`,
      text: `Can reach this far in ${moment.releaseIn.toFixed(2)} s`,
      kind: 'reach',
    })
  }
  if (moment.threatId === 'drive' && receiver)
    marks.push({
      kind: 'wedge',
      id: 'why-lane',
      apex: receiver.id,
      toward: { x: 0, z: 1.575 },
      length: Math.hypot(receiver.x, receiver.z - 1.575),
      spread: 0.42,
      tone: 'threat',
      opacity: 0.55,
    })
  return { marks, labels }
}

/** One short pinned phrase per lens, only where the idea needs a word (3 words and a number). */
export function lensLabels(
  lens: Lens,
  frame: WorldFrame,
  assumptions: ModelAssumptions,
): { anchor: string; text: string; tone: 'threat' | 'warn' | 'good' | 'defense' }[] {
  if (lens === 'normal') return []
  const out: { anchor: string; text: string; tone: 'threat' | 'warn' | 'good' | 'defense' }[] = []
  const open = new Set(frame.options.filter((o) => isThreatOpen(o, frame, assumptions)).map((o) => o.id))
  const openOpt = frame.options.find((o) => open.has(o.id))
  if (lens === 'ownership') {
    for (const p of frame.players)
      if (p.team === 'defense' && tornJobs(frame, p.id))
        out.push({ anchor: p.id, text: 'Owes two jobs', tone: 'threat' })
    if (openOpt) {
      const jobs = frame.responsibilities.filter((r) => r.offensivePlayerId === openOpt.playerId)
      const owner = jobs.length ? frame.players.find((q) => q.id === jobs[0].defenderId) : null,
        him = frame.players.find((q) => q.id === openOpt.playerId)
      const far = owner && him ? Math.hypot(owner.x - him.x, owner.z - him.z) : 0
      out.push({
        anchor: openOpt.playerId,
        text: owner && far > 2.6 ? `His string is ${far.toFixed(0)} m long` : 'Nobody tied to him',
        tone: 'threat',
      })
    }
  } else if (lens === 'reach' && openOpt) {
    out.push({
      anchor: openOpt.playerId,
      text: `Nobody there in ${ballClock(frame, assumptions, open).toFixed(1)} s`,
      tone: 'threat',
    })
  } else if (lens === 'passing') {
    for (const o of frame.options)
      if (open.has(o.id) && o.kind !== 'keep' && o.playerId !== frame.ball.owner)
        out.push({ anchor: o.playerId, text: 'Open pass', tone: 'good' })
    if (open.has('drive')) out.push({ anchor: frame.ball.owner ?? 'O1', text: 'Drive lane open', tone: 'threat' })
  } else if (lens === 'space') {
    if (open.has('drive')) out.push({ anchor: frame.ball.owner ?? 'O1', text: 'Room to drive', tone: 'threat' })
    if (open.has('roll')) {
      const r = frame.options.find((o) => o.id === 'roll')
      if (r) out.push({ anchor: r.playerId, text: 'Room to roll', tone: 'threat' })
    }
  }
  return out
}
