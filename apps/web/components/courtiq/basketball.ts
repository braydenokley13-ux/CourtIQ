import { roleName, term, type Voice } from '@courtiq/basketball/corpus'
import { coachRuleSentence } from '@courtiq/basketball/coachRules'
import type { PlayerId, Responsibility, RoleId, TeamAnswer, ThreatId, WorldFrame } from '@courtiq/basketball/types'

export const DEFENDER_ORDER: PlayerId[] = ['D1', 'D5', 'D3', 'D4', 'D2']
export const ROLE_OF: Record<PlayerId, RoleId> = {
  O1: 'ballhandler',
  O2: 'strong-corner',
  O3: 'weak-corner',
  O4: 'weak-lift',
  O5: 'screener',
  D1: 'poa',
  D2: 'strong-side',
  D3: 'low-man',
  D4: 'backside',
  D5: 'big',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const who = (id: PlayerId, voice: Voice) =>
  ROLE_OF[id] ? cap(roleName(ROLE_OF[id], voice).replace(/^the /, '')) : cap(id.replace(/[-_]/g, ' '))
export const whoThe = (id: PlayerId, voice: Voice) =>
  ROLE_OF[id] ? roleName(ROLE_OF[id], voice) : id.replace(/[-_]/g, ' ')

const COVERAGE_PLAIN: Record<string, string> = {
  drop: 'Big stays back near the basket',
  switch: 'Swap who guards who',
  blitz: 'Two defenders trap the ball',
  hedge: 'Big jumps out, then goes back',
  ice: 'Push the ball away from the screen',
  custom: 'Custom',
}
const COVERAGE_COACH: Record<string, string> = {
  drop: 'Drop',
  switch: 'Switch',
  blitz: 'Blitz / trap',
  hedge: 'Hedge & recover',
  ice: 'Ice (force away)',
  custom: 'Custom',
}

export function coverageName(answer: TeamAnswer, voice: Voice): string {
  const team = voice.terms?.[answer.coverage]
  if (team) return team
  return voice.register === 'plain' ? COVERAGE_PLAIN[answer.coverage] : COVERAGE_COACH[answer.coverage]
}

export function helpAmount(depth: number, voice: Voice) {
  const plain =
    depth > 0.75
      ? 'All the way to the screener'
      : depth > 0.4
        ? 'Halfway'
        : depth > 0.05
          ? 'Just a little'
          : 'Stays home'
  const coach = depth > 0.75 ? 'Deep tag' : depth > 0.4 ? 'Mid tag' : depth > 0.05 ? 'Shallow tag' : 'No tag'
  return voice.register === 'plain' ? plain : coach
}

/** The executable answer, read back as basketball rules. */
export function rulesTable(answer: TeamAnswer, voice: Voice): [string, string][] {
  const p = voice.register === 'plain'
  const rows: [string, string][] = [
    [p ? 'On the ball screen' : 'Coverage', coverageName(answer, voice)],
    [
      p ? 'Ball defender' : 'POA',
      answer.poa === 'over' ? (p ? 'Fights over the screen' : 'Over') : p ? 'Goes under the screen' : 'Under',
    ],
    [
      p ? 'Screener’s defender' : 'Big',
      `${answer.bigDepth <= 2.6 ? (p ? 'Deep, near the rim' : 'Deep drop') : answer.bigDepth <= 3.6 ? (p ? 'Near the free-throw line' : 'Drop at the nail') : p ? 'Up near the screen' : 'High / at the level'} (${p ? `${Math.round(answer.bigDepth * 3.281)} ft from the baseline` : `${answer.bigDepth.toFixed(1)} m`})`,
    ],
    [
      p ? 'Helper under the basket' : 'Low man',
      answer.tag ? helpAmount(answer.tagDepth, voice) : p ? 'Doesn’t help' : 'No tag',
    ],
    [
      p ? 'Far-side defender' : 'Backside',
      answer.backside === 'x-out' ? (p ? 'Swaps with the helper' : 'X-out') : p ? 'Stays with his shooter' : 'Stay',
    ],
    [
      p ? 'When they swap' : 'Rotation timing',
      answer.rotationTiming === 'early'
        ? p
          ? 'Before the pass'
          : 'Early'
        : p
          ? 'When the ball is passed'
          : 'On the pass',
    ],
    [
      p ? 'Helper goes back when' : 'Recovery',
      answer.recovery === 'on-pass'
        ? p
          ? 'The ball is passed'
          : 'On the pass'
        : p
          ? 'The big is back'
          : 'Roller secured',
    ],
  ]
  for (const rule of answer.coachRules ?? []) rows.push([p ? 'Our rule' : 'Coach rule', coachRuleSentence(rule)])
  return rows
}

const THREAT_PLAIN: Record<ThreatId, string> = {
  drive: 'the ball',
  roll: 'the screener rolling to the rim',
  pop: 'the screener popping out',
  corner: 'the corner shooter',
  lift: 'the shooter moving up',
  strong: 'the near-corner shooter',
}

/** One plain sentence describing a defender's current job. */
export function jobSentence(r: Responsibility | undefined, voice: Voice): string {
  if (!r)
    return voice.register === 'plain' ? 'Stay between your man and the basket.' : 'Stay connected to your assignment.'
  const target =
    voice.register === 'plain'
      ? (THREAT_PLAIN[r.threatId] ?? r.threatId.replace(/[-_]/g, ' '))
      : term(
          r.threatId === 'drive'
            ? 'ball-handler'
            : r.threatId === 'roll'
              ? 'roller'
              : r.threatId === 'lift'
                ? 'lift'
                : r.threatId === 'corner'
                  ? 'corner'
                  : r.threatId,
          voice,
        )
  switch (r.kind) {
    case 'contain':
      return voice.register === 'plain' ? `Keep ${target} in front of you.` : `Contain ${target}.`
    case 'chase':
      return voice.register === 'plain'
        ? `Fight over the screen and get back to ${target}.`
        : `Chase over to ${target}.`
    case 'tag':
      return voice.register === 'plain' ? `Step in front of ${target} until help arrives.` : `Tag ${target}.`
    case 'guard':
      return voice.register === 'plain' ? `Stay with ${target}.` : `Guard ${target}.`
    case 'closeout':
      return voice.register === 'plain' ? `Run at ${target} — high hand, short steps.` : `Close out to ${target}.`
    case 'recover':
      return voice.register === 'plain' ? `Get back to ${target}.` : `Recover to ${target}.`
    case 'switch':
      return voice.register === 'plain' ? `You have ${target} now.` : `Switch onto ${target}.`
    case 'split':
      return voice.register === 'plain'
        ? `Stand between two shooters and be ready for either.`
        : `Split the two shooters.`
  }
}

export function primaryJob(frame: WorldFrame, id: PlayerId) {
  return frame.responsibilities.filter((r) => r.defenderId === id).sort((a, b) => b.priority - a.priority)[0]
}

/** Moments in the possession where this defender's job changes: teaching checkpoints. */
export function checkpointsFor(frames: WorldFrame[], id: PlayerId): { t: number; job: Responsibility }[] {
  const out: { t: number; job: Responsibility }[] = []
  let last = ''
  for (const f of frames) {
    const j = primaryJob(f, id)
    if (!j) continue
    const key = `${j.kind}:${j.threatId}`
    if (key !== last) {
      if (!out.length || f.t - out[out.length - 1].t > 0.35) out.push({ t: f.t, job: j })
      last = key
    }
  }
  return out.slice(0, 6)
}

export const THREAT_SHORT: Record<ThreatId, { plain: string; coach: string }> = {
  drive: { plain: 'Ball to the rim', coach: 'Drive' },
  roll: { plain: 'Screener to the rim', coach: 'Roller' },
  pop: { plain: 'Screener’s jumper', coach: 'Pop' },
  corner: { plain: 'Far-corner shot', coach: 'Weak corner' },
  lift: { plain: 'Shooter moving up', coach: 'Lift' },
  strong: { plain: 'Near-corner shot', coach: 'Strong corner' },
}
export const threatShort = (id: ThreatId, voice: Voice) =>
  THREAT_SHORT[id]?.[voice.register] ?? id.replace(/[-_]/g, ' ')
