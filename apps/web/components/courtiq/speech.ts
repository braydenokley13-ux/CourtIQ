import type { Voice } from '@/lib/defense-lab/corpus'
import type { PlayerId, ThreatId } from '@/lib/defense-lab/types'
import { ROLE_OF } from './basketball'

/** How a coach says time out loud. Exact decimals stay in Coach terms. */
export function spoken(seconds: number, voice: Voice): string {
  if (voice.register !== 'plain') return `${(Math.round(seconds * 10) / 10).toFixed(1)} s`
  const s = Math.abs(seconds)
  if (s < 0.15) return 'a split second'
  if (s < 0.35) return 'about a quarter second'
  if (s < 0.65) return 'about half a second'
  if (s < 0.9) return 'almost a second'
  if (s < 1.2) return 'about a second'
  if (s < 1.7) return 'about a second and a half'
  return `about ${Math.round(s)} seconds`
}

const OFFENSE_PLAIN: Record<string, string> = { ballhandler: 'their ball handler', screener: 'their screener', 'weak-corner': 'their far-corner shooter', 'weak-lift': 'their far-wing shooter', 'strong-corner': 'their near-corner shooter' }
const DEFENSE_PLAIN: Record<string, string> = { poa: 'your ball defender', big: 'your big', 'low-man': 'your helper', backside: 'your far-side defender', 'strong-side': 'your near-side defender' }
const OFFENSE_COACH: Record<string, string> = { ballhandler: 'handler', screener: 'screener', 'weak-corner': 'weak corner', 'weak-lift': 'weak wing', 'strong-corner': 'strong corner' }
const DEFENSE_COACH: Record<string, string> = { poa: 'POA', big: 'big', 'low-man': 'low man', backside: 'backside', 'strong-side': 'strong side' }

const num = (id: PlayerId) => id.slice(1)

/** "#5, their screener" / "your #3 (helper)" — number first so it matches the court. */
export function person(id: PlayerId, voice: Voice, opts: { short?: boolean } = {}): string {
  const role = ROLE_OF[id]
  const defense = id.startsWith('D')
  if (voice.register === 'plain') {
    const r = defense ? DEFENSE_PLAIN[role] : OFFENSE_PLAIN[role]
    return opts.short ? `#${num(id)}` : defense ? `${r} (#${num(id)})` : `${r} (#${num(id)})`
  }
  const team = voice.terms?.[`role:${role}`] ?? voice.terms?.[role]
  const r = team ?? (defense ? DEFENSE_COACH[role] : OFFENSE_COACH[role])
  return opts.short ? `#${num(id)}` : `${defense ? 'X' : ''}${num(id)} (${r})`
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Name an opening by WHO gets it, so two different drives never share a label. */
export function opening(threatId: ThreatId, playerId: PlayerId | undefined, voice: Voice): string {
  const n = playerId ? `#${num(playerId)}` : ''
  const p = voice.register === 'plain'
  const role = playerId ? ROLE_OF[playerId] : undefined
  switch (threatId) {
    case 'drive': return role === 'ballhandler' || !role ? (p ? `Ball handler's drive` : `${n} drive`.trim()) : (p ? `${n}'s drive from the ${role === 'weak-corner' ? 'far corner' : role === 'weak-lift' ? 'far wing' : role === 'strong-corner' ? 'near corner' : 'post'}` : `${n} attack off the catch`)
    case 'roll': return p ? `Screener's roll to the rim` : `${n || 'Screener'} roll`
    case 'pop': return p ? `Screener's open jumper` : `${n || 'Screener'} pop`
    case 'corner': return p ? 'Far-corner shot' : `${n || 'Weak'} corner three`
    case 'lift': return p ? 'Far-wing shot' : `${n || 'Weak'} lift`
    case 'strong': return p ? 'Near-corner shot' : `${n || 'Strong'} corner three`
  }
}

export interface Delta { threatId: ThreatId; playerId?: PlayerId; before: number; after: number }
const EPS = 0.1

/** One verdict + one honest body, from the SAME rows (never contradicts itself). */
export function tradeoffWords(rows: Delta[], voice: Voice): { headline: string; body: string; gains: Delta[]; costs: Delta[] } {
  const gains = rows.filter(r => r.before - r.after >= EPS).sort((a, b) => (b.before - b.after) - (a.before - a.after))
  const costs = rows.filter(r => r.after - r.before >= EPS).sort((a, b) => (b.after - b.before) - (a.after - a.before))
  const p = voice.register === 'plain'
  const list = (xs: Delta[]) => { const names = xs.map(x => opening(x.threatId, x.playerId, voice).toLowerCase()); return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] }
  let headline: string, body: string
  if (gains.length && costs.length) {
    headline = p ? `Fixes the ${list(gains.slice(0, 2))}. Gives up the ${list(costs.slice(0, 1))}.` : `Closes the ${list(gains.slice(0, 2))}; opens the ${list(costs.slice(0, 1))}.`
    body = `${p ? 'New problem' : 'Cost'}: ${opening(costs[0].threatId, costs[0].playerId, voice).toLowerCase()} is now open for ${spoken(costs[0].after, voice)}${costs[0].before > 0.05 ? ` (was ${spoken(costs[0].before, voice)})` : ''}. That's the tradeoff — you decide which one you'd rather give up.`
  } else if (gains.length) {
    headline = p ? `Fixes the ${list(gains.slice(0, 2))}.` : `Closes the ${list(gains.slice(0, 2))}.`
    body = p ? 'Nothing new opened in this run. Try Break My Defense — a real offense would look for the next weakness.' : 'No new window above 0.1 s in this run. Attack it to find the next weakness.'
  } else if (costs.length) {
    headline = p ? `Worse: the ${list(costs.slice(0, 2))} opened up.` : `Opens the ${list(costs.slice(0, 2))}.`
    body = p ? 'This change made things easier for them. Try something else, or go back.' : 'Net regression for this action.'
  } else {
    headline = p ? 'Not much changed.' : 'No material change.'
    body = p ? 'Both versions end up about the same in this play.' : 'All windows within 0.1 s.'
  }
  return { headline, body, gains, costs }
}

/** Plain names for the explore catalog's fixes (coach wording stays as authored). */
export const FIX_PLAIN: Record<string, { plain: string; detail: string }> = {
  'help-less': { plain: 'Helper stays closer to his own man', detail: 'Your helper leaves the diving screener sooner and stays near his shooter.' },
  'help-more': { plain: 'Helper commits to the screener', detail: 'Your helper goes all the way to stop the diving screener.' },
  'stay-home': { plain: 'Far-side defender stays with his own man', detail: 'He doesn’t slide over to help, so his shooter can’t get open on the pass.' },
  'rotate-early': { plain: 'Far-side swap starts sooner', detail: 'Your far-side defender slides over as soon as the helper leaves — not after the pass.' },
  'x-out': { plain: 'Far-side defenders swap men', detail: 'When the helper leaves, the other two on the far side trade players.' },
  'switch': { plain: 'Switch — the two defenders trade men', detail: 'Your ball defender and your big swap who they guard at the screen.' },
  'blitz': { plain: 'Trap the ball with two', detail: 'Your big and ball defender both jump the ball handler.' },
  'ice': { plain: 'Push the ball away from the screen', detail: 'Your ball defender blocks the screen side; your big waits where the ball is pushed.' },
  'drop': { plain: 'Keep the big back near the basket', detail: 'Your big stays between the ball and the rim.' },
  'big-higher': { plain: 'Big plays higher', detail: 'Your big meets the ball closer to the screen.' },
  'big-lower': { plain: 'Big stays deeper', detail: 'Your big waits closer to the basket.' },
  'big-owns-roller': { plain: 'Big takes the screener himself', detail: 'Your big stays with the diving screener so your helper doesn’t have to.' },
  'secure-roller': { plain: 'Helper waits until the big is back', detail: 'Your helper stays on the screener until your big gets back to him.' },
}
