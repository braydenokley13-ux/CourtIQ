import type { CoachRule } from './types'

export const COACH_RULE_BOUNDS = { depth: [2.5, 7], rise: [0.5, 3] } as const

/** Sentence composition is explicit. It is not free-text inference. */
export function coachRuleSentence(rule: CoachRule): string {
  return rule.kind === 'roller-depth'
    ? `After the screen, when the roller gets below ${rule.depth.toFixed(1)} m from the baseline, ${rule.response === 'low-man-tags' ? 'the low man tags and the big contains the ball' : 'the big takes the roller and the low man returns to the corner'}.`
    : `After the screen, when the weakside lift rises ${rule.rise.toFixed(1)} m during the roll, ${rule.response === 'stay-with-lift' ? 'the backside stays with the lift' : 'X-out: backside takes corner, low man takes lift, big takes roller'}.`
}
