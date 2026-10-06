import type { Voice } from '@/lib/defense-lab/corpus'
import { HIGH_PNR_PROBLEM } from '@/lib/defense-lab/scenario'
import type { PlayerId, TeamAnswer, WorldFrame } from '@/lib/defense-lab/types'
import type { Mark } from './world/types'

/** Make each coverage legible on the floor around the screen, using the engine's
 * own live responsibilities (never a canned drawing): the trap, the swap, the
 * force direction, the drop spot. */
export function coverageSignature(frame: WorldFrame, answer: TeamAnswer, voice: Voice): { marks: Mark[]; labels: { anchor: string; text: string }[] } {
  const r = HIGH_PNR_PROBLEM.roles
  const screenAt = frame.screenEngagedAt ?? null
  const marks: Mark[] = [], labels: { anchor: string; text: string }[] = []
  if (screenAt == null || frame.t < screenAt - 0.25 || frame.t > screenAt + 1.6) return { marks, labels }
  const p = voice.register === 'plain'
  const at = (id: PlayerId) => frame.players.find(q => q.id === id)
  const job = (id: PlayerId) => frame.responsibilities.filter(x => x.defenderId === id).sort((a, b) => b.priority - a.priority)[0]
  const handler = frame.ball.owner ?? r.ballhandler
  const poa = job(r.poa), big = job(r.big)
  if (answer.coverage === 'blitz' && poa?.offensivePlayerId === handler && big?.offensivePlayerId === handler) {
    marks.push({ kind: 'ring', id: 'sig-trap', at: handler, tone: 'warn', radius: 1.15, pulse: true })
    marks.push({ kind: 'tether', id: 'sig-trap-a', from: r.poa, to: handler, tone: 'warn', width: 0.08 }, { kind: 'tether', id: 'sig-trap-b', from: r.big, to: handler, tone: 'warn', width: 0.08 })
    labels.push({ anchor: handler, text: p ? 'Two on the ball' : 'Trap' })
  } else if (answer.coverage === 'switch' && poa && big && poa.offensivePlayerId === r.screener && big.offensivePlayerId === handler) {
    const a = at(r.poa), b = at(r.big)
    if (a && b) {
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      marks.push({ kind: 'path', id: 'sig-sw-a', points: [{ x: a.x, z: a.z }, { x: mid.x + 0.6, z: mid.z + 0.4 }, at(r.screener) ?? b], tone: 'defense', width: 0.08, arrow: true })
      marks.push({ kind: 'path', id: 'sig-sw-b', points: [{ x: b.x, z: b.z }, { x: mid.x - 0.6, z: mid.z - 0.4 }, at(handler) ?? a], tone: 'defense', width: 0.08, arrow: true })
      labels.push({ anchor: `pt:${mid.x.toFixed(2)},${mid.z.toFixed(2)}`, text: p ? 'They trade men' : 'Switch' })
    }
  } else if (answer.coverage === 'ice') {
    const h = at(handler), s = at(r.screener)
    if (h && s) {
      // Force away from the screen: toward the side opposite the screener.
      const dir = Math.sign(h.x - s.x) || 1
      marks.push({ kind: 'wedge', id: 'sig-ice', apex: handler, toward: { x: h.x + dir * 3, z: h.z - 1.6 }, length: 2.6, spread: 0.55, tone: 'defense', opacity: 0.5 })
      marks.push({ kind: 'wedge', id: 'sig-ice-no', apex: handler, toward: { x: s.x, z: s.z }, length: 1.6, spread: 0.5, tone: 'threat', opacity: 0.25 })
      labels.push({ anchor: handler, text: p ? 'Pushed away from the screen' : 'ICE: force away' })
    }
  } else if (answer.coverage === 'drop' && big) {
    marks.push({ kind: 'ring', id: 'sig-drop', at: big.target, tone: 'defense', radius: 0.55 })
    labels.push({ anchor: `pt:${big.target.x.toFixed(2)},${big.target.z.toFixed(2)}`, text: p ? 'Big waits here' : 'Drop spot' })
  }
  return { marks, labels }
}
