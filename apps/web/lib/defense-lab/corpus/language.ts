import type { RoleId, ThreatId } from '../types'
import { ANSWERS } from './answers'
import { CONCEPTS } from './concepts'

export type Register = 'plain' | 'coach'
/** `terms` overrides by concept id, answer id, or `role:<RoleId>` (a bare RoleId works when no concept shares it). */
export interface Voice { register: Register; terms?: Record<string, string> }
export const PLAIN: Voice = { register: 'plain' }
export const COACH: Voice = { register: 'coach' }

/** Words a nontechnical coach may not know. Plain-register text must not contain them. */
export const COACH_ONLY_TERMS: readonly string[] = [
  'x-out', 'lift', 'low man', 'low-man', 'tag', 'stunt', 'skip', 'pocket', 'pop', 'poa', 'nail', 'closeout', 'rotation', 'rotate',
  'hedge', 'blitz', 'drop', 'ice', 'icing', 'short roll', 'roller', 'reject', 'slip', 'peel', 'scram', 'weak side', 'weakside',
  'strong side', 'strongside', 'p&r', 'pnr', 'pick-and-roll', 'chaser', 'penetration', 'tagging',
]
const jargonRe = new RegExp(`(?<![\\w-])(?:${COACH_ONLY_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:s|ed|ging|ing)?(?![\\w-])`, 'i')
/** Returns the first jargon word found in text, or null. */
export function findJargon(text: string): string | null { return jargonRe.exec(text)?.[0] ?? null }

export const ROLE_NAMES: Record<RoleId, { plain: string; coach: string }> = {
  poa: { plain: 'ball defender', coach: 'on-ball defender' },
  big: { plain: 'screener’s defender', coach: 'screen defender' },
  'low-man': { plain: 'helper under the basket', coach: 'low man' },
  backside: { plain: 'backside defender', coach: 'backside defender' },
  'strong-side': { plain: 'defender on the ball side', coach: 'strong-side defender' },
  ballhandler: { plain: 'ball handler', coach: 'ball handler' },
  screener: { plain: 'screener', coach: 'screener' },
  'weak-corner': { plain: 'far-corner shooter', coach: 'weak-side corner' },
  'weak-lift': { plain: 'far-side wing shooter', coach: 'weak-side lift' },
  'strong-corner': { plain: 'near-corner shooter', coach: 'strong-side corner' },
}

const conceptIds = new Set(CONCEPTS.map(c => c.id))
const clean = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined)

/** Word to show for a concept or answer id. Team terms win. Unknown ids come back unchanged. */
export function term(id: string, voice: Voice): string {
  const override = clean(voice.terms?.[id])
  if (override) return override
  const c = CONCEPTS.find(x => x.id === id)
  if (c) return c[voice.register]
  const a = ANSWERS.find(x => x.id === id)
  if (a) return voice.register === 'plain' ? a.plainName : a.coachName
  if (id in ROLE_NAMES) return roleTerm(id as RoleId, voice)
  return id
}
function roleTerm(role: RoleId, voice: Voice): string {
  const override = clean(voice.terms?.[`role:${role}`]) ?? (conceptIds.has(role) ? undefined : clean(voice.terms?.[role]))
  if (override) return override
  // Concepts that name the same job (low man) honour team terms for the concept too.
  const viaConcept = clean(voice.terms?.[role])
  if (viaConcept) return viaConcept
  return ROLE_NAMES[role][voice.register]
}
/** "the ball defender" / "the low man". Respects team terms. */
export function roleName(role: RoleId, voice: Voice): string { return `the ${roleTerm(role, voice)}` }

const the = (id: string, voice: Voice) => `the ${term(id, voice)}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Compound-adjective form: "low man" becomes "low-man" unless the team supplied its own word. */
const adj = (id: string, voice: Voice) => (voice.terms?.[id] ? term(id, voice) : term(id, voice).replace(/ /g, '-'))

export function formatSeconds(s: number): string { return `${(Math.round(s * 10) / 10).toFixed(1)} s` }

const THREAT_CONCEPT: Record<ThreatId, string> = { drive: 'drive', roll: 'roller', pop: 'pop', corner: 'weak-corner', lift: 'lift', strong: 'strong-corner' }
/** Noun for a threat: "the screener diving to the basket", "the lift". */
export function threatNoun(threatId: ThreatId, voice: Voice): string { return the(THREAT_CONCEPT[threatId], voice) }

export interface ThreatContext { responsibleRole?: RoleId }
export function describeThreat(threatId: ThreatId, voice: Voice, ctx: ThreatContext = {}): string {
  const plain = voice.register === 'plain'
  let s: string
  switch (threatId) {
    case 'drive': s = plain ? 'The ball handler has a clear path to the basket.' : 'The handler has a lane to the rim.'; break
    case 'roll': s = plain ? `${cap(threatNoun('roll', voice))} is open near the basket.` : `${cap(threatNoun('roll', voice))} is open at the rim.`; break
    case 'pop': s = plain ? `${cap(threatNoun('pop', voice))} is open for a shot.` : `${cap(threatNoun('pop', voice))} is open above the break.`; break
    case 'corner': s = plain ? 'The shooter in the far corner is open.' : `${cap(threatNoun('corner', voice))} is open.`; break
    case 'lift': s = plain ? `${cap(threatNoun('lift', voice))} is open.` : `${cap(threatNoun('lift', voice))} is open.`; break
    case 'strong': s = plain ? 'The shooter in the near corner is open.' : `${cap(threatNoun('strong', voice))} is open.`; break
  }
  if (ctx.responsibleRole) s += plain ? ` ${cap(roleName(ctx.responsibleRole, voice))} is supposed to cover that player.` : ` ${cap(roleName(ctx.responsibleRole, voice))} owns it.`
  return s
}

export type MomentCause = 'deep-tag' | 'late-rotation' | 'switch-mismatch' | 'two-on-ball' | 'big-too-deep' | 'big-too-high' | 'unknown'
export interface MomentInput {
  threatId: ThreatId
  /** Seconds the receiver is open. */
  openFor: number
  /** Seconds the responsible defender needs to arrive. */
  defenderNeeds?: number
  responsibleRole?: RoleId
  pulledRole?: RoleId
  cause?: MomentCause
  /** The player who actually has the opening (a drive may come from any catcher). */
  receiverRole?: RoleId
  /** Seconds until the shot/finish is ready; "late" compares against this. */
  releaseIn?: number
  /** What the open player actually did with it. */
  finish?: 'layup' | 'pull-up' | 'catch-and-shoot' | 'pass' | null
}
export interface Moment { headline: string; body: string; numbers: string[] }

const openLabel = (t: ThreatId, voice: Voice): string => {
  if (voice.register === 'plain') return t === 'drive' ? 'Lane open' : t === 'roll' ? 'Screener open' : t === 'pop' ? 'Screener open' : 'Shooter open'
  return t === 'drive' ? 'Lane open' : t === 'roll' ? 'Roll open' : t === 'pop' ? 'Pop open' : 'Window open'
}
const finiteNonNeg = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

export function explainMoment(input: MomentInput, voice: Voice): Moment {
  const plain = voice.register === 'plain'
  const { threatId, cause = 'unknown' } = input
  const spotShooter = threatId === 'corner' || threatId === 'lift' || threatId === 'strong' || threatId === 'pop'
  const low = the('low-man', voice), roller = the('roller', voice), xout = term('x-out', voice)

  let headline: string
  const driver = threatId === 'drive' && input.receiverRole && input.receiverRole !== 'ballhandler' ? roleName(input.receiverRole, voice) : null
  if (driver && input.finish === 'pull-up') headline = plain ? `${cap(driver)} gets an open pull-up jumper.` : `${cap(driver)} attacks the closeout into a pull-up.`
  else if (driver && input.finish === 'catch-and-shoot') headline = plain ? `${cap(driver)} gets an open shot.` : `${cap(driver)} is open on the catch.`
  else if (driver) headline = plain ? `${cap(driver)} drives past his man to the basket.` : `${cap(driver)} attacks the closeout to the rim.`
  else if (threatId === 'drive' && input.finish === 'pull-up') headline = plain ? 'The ball handler gets an open pull-up jumper.' : 'The handler gets a clean pull-up.'
  else if (plain) headline = threatId === 'drive' ? 'The ball handler gets to the basket.' : threatId === 'roll' ? 'Their screener is open near the basket.' : 'Their shooter is open.'
  else if (cause === 'deep-tag' && spotShooter) headline = `Deep ${adj('low-man', voice)} ${term('tag', voice)} exposes ${threatNoun(threatId, voice)} before the ${xout} arrives.`
  else headline = describeThreat(threatId, voice)

  const sentences: string[] = []
  const pulled = input.pulledRole ? roleName(input.pulledRole, voice) : null
  switch (cause) {
    case 'deep-tag': sentences.push(plain ? `${driver ? 'It starts at the screen: your' : 'Your'} ${term('low-man', voice)} goes all the way to the ${term('roller', voice)}, so the far side has less help.` : `${cap(low)} commits to ${roller}, so the weak side has no early help.`); break
    case 'late-rotation': sentences.push(plain ? 'The far-side defenders waited for the pass before moving, which is too late.' : `The ${term('rotation', voice)} started on the pass, not on the ${term('tag', voice)}.`); break
    case 'switch-mismatch': sentences.push(plain ? 'After the switch, the defenders have each other’s players and need time to get set.' : 'After the switch, the new matchups need time to get set.'); break
    case 'two-on-ball': sentences.push(plain ? 'Two of your defenders are on the ball handler, so someone behind them has to cover too much.' : 'Two on the ball leaves the weak side a man short.'); break
    case 'big-too-deep': sentences.push(plain ? 'Your big is back near the basket, so the ball handler has room to shoot or pass.' : 'The big is too deep, which gives the handler room and the roller a pocket.'); break
    case 'big-too-high': sentences.push(plain ? 'Your big is up near the ball, so the screener has a path to the basket.' : 'The big is too high, which gives the roller an easy path.'); break
    case 'unknown': break
  }
  if (pulled && cause !== 'deep-tag') sentences.push(plain ? `${cap(pulled)} was pulled away from his own player.` : `${cap(pulled)} was pulled off his man.`)
  const late = finiteNonNeg(input.defenderNeeds) && (finiteNonNeg(input.releaseIn) ? input.defenderNeeds > input.releaseIn : finiteNonNeg(input.openFor) && input.defenderNeeds > input.openFor)
  if (input.responsibleRole) {
    const who = cap(roleName(input.responsibleRole, voice))
    sentences.push(plain ? `${who} has to cover that player${late ? ' but cannot get there in time' : ''}.` : `${who} owns it${late ? ' and is late' : ''}.`)
  } else if (late) {
    sentences.push(plain ? 'Your next defender cannot get there in time.' : 'The next defender is late.')
  }
  if (sentences.length === 0) sentences.push(describeThreat(threatId, voice))

  const numbers: string[] = []
  if (finiteNonNeg(input.openFor)) numbers.push(`${openLabel(threatId, voice)} ${formatSeconds(input.openFor)}`)
  if (finiteNonNeg(input.defenderNeeds)) numbers.push(`Defender needs ${formatSeconds(input.defenderNeeds)}`)
  return { headline, body: sentences.join(' '), numbers }
}

export interface TradeoffChange { threatId: ThreatId; /** seconds open before */ before: number; /** seconds open after */ after: number }
/** Changes smaller than this (seconds) are treated as no change. A reporting choice, not a basketball constant. */
export const TRADEOFF_EPSILON = 0.05
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function describeTradeoff(changes: readonly TradeoffChange[], voice: Voice): string {
  const plain = voice.register === 'plain'
  const valid = changes.filter(c => Number.isFinite(c.before) && Number.isFinite(c.after))
  const closes = valid.filter(c => c.after < c.before - TRADEOFF_EPSILON).map(c => threatNoun(c.threatId, voice))
  const opens = valid.filter(c => c.after > c.before + TRADEOFF_EPSILON).map(c => threatNoun(c.threatId, voice))
  if (!closes.length && !opens.length) return plain ? 'Nothing important changed: the same players are open for about the same time.' : 'No meaningful change in any window.'
  if (closes.length && !opens.length) return plain ? `This takes away ${list(closes)} and does not open anything new.` : `Closes ${list(closes)}; no new window opens.`
  if (!closes.length) return plain ? `This gives ${list(opens)} more room and does not take anything away.` : `Opens ${list(opens)}; nothing closes in exchange.`
  return plain
    ? `This protects ${list(closes)} but gives ${list(opens)} more room, so it comes down to which shot you would rather give up.`
    : `Protects ${list(closes)} but gives ${list(opens)} more room; which window to concede is a philosophy call.`
}
