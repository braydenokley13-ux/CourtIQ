import type { TeamAnswer } from './types'

export interface CoachingInterpretation {
  supported: boolean
  label: string
  patch: Partial<TeamAnswer> | null
  explanation: string
}

interface CoachingTemplate {
  id: string
  text: string
  label: string
  patch: Partial<TeamAnswer>
  explanation: string
}

/** Authored basketball rules, not an open-ended natural-language parser. */
const templates: readonly CoachingTemplate[] = [
  {
    id: 'tag-until-big-recovers',
    text: 'Tag until the big recovers, then get back to the corner.',
    label: 'Tag → own corner',
    patch: { tag: true, recovery: 'roller-secured', backside: 'stay' },
    explanation: 'D3 tags until D5 is within contest distance of the roller after the ball leaves the handler, then D3 returns to the corner. This also changes the backside rule: D4 stays with the lift, replacing the X-out. Recovery is a movement target; arrival still depends on the bodies.',
  },
  {
    id: 'shallow-tag-x-out',
    text: 'Tag shallow and X-out on the pass.',
    label: 'Shallow tag → X-out',
    patch: { tag: true, tagDepth: 0.25, backside: 'x-out', rotationTiming: 'on-pass', recovery: 'on-pass' },
    explanation: 'D3 gives a shallow tag at 25% commitment and releases it when a pass begins. On a pass to the weak corner, D4 takes the corner and D3 takes the lift; the exchange starts on that pass, not during the tag.',
  },
  {
    id: 'chase-over',
    text: 'Chase over the screen.',
    label: 'Chase over',
    patch: { poa: 'over' },
    explanation: 'D1 uses the over-screen chase target. The current coverage still determines whether the screen defenders exchange responsibilities.',
  },
  {
    id: 'stay-with-lift',
    text: 'Stay with the lift while the low man tags.',
    label: 'Tag + stay with lift',
    patch: { tag: true, backside: 'stay' },
    explanation: 'D3 tags the roller using the current tag depth and recovery trigger. D4 stays with the lifting receiver, replacing the X-out; D3 keeps the corner recovery assignment.',
  },
]

export const COACHING_TEMPLATES: readonly { id: string; text: string }[] = templates.map(({ id, text }) => ({ id, text }))

/** Only formatting is normalized. Extra clauses and inferred intent are rejected. */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.!?]$/, '').toLowerCase()
}

/** Returns an explicit preview patch. Calling this function never applies a rule.
 * Supply the effective answer to reject rules the current coverage suppresses. */
export function interpretCoaching(text: string, answer?: Pick<TeamAnswer, 'coverage'> & Partial<Pick<TeamAnswer,'coachRules'>>): CoachingInterpretation {
  const phrase = normalize(text)
  const template = templates.find(candidate => normalize(candidate.text) === phrase)
  if (!template) {
    return {
      supported: false,
      label: 'Unsupported coaching phrase',
      patch: null,
      explanation: 'No rule was created. Choose one of the supported coaching templates; this authoring tool does not infer rules from free text.',
    }
  }
  if (template.patch.tag === true && answer?.coverage === 'switch') {
    return {
      supported: false,
      label: 'Low-man tag conflicts with switch',
      patch: null,
      explanation: 'No rule was created. Switch exchanges the screen defenders: D5 takes the handler and D1 takes the roller, so D3 does not tag. Choose another coverage before adding a low-man tag rule.',
    }
  }
  const replaceReads = !!answer?.coachRules?.length && (template.patch.tag !== undefined || template.patch.backside !== undefined)
  return {
    supported: true,
    label: template.label,
    patch: { ...template.patch, ...(replaceReads ? {coachRules:[]} : {}) },
    explanation: template.explanation + (replaceReads ? ' This cue removes your additional roller and lift reads so they cannot override it.' : ''),
  }
}
