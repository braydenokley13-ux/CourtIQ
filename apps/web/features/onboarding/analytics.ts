/**
 * WS-1 Onboarding analytics — call after the calibration session resolves
 * and the server has written the starting IQ to Profile.
 *
 * onboarding_completed → final step of 5-screen wizard, after calibration POST
 */
import { track, scrubUserInput } from '@/lib/analytics/events'
import type { Position, SkillLevel } from '@courtiq/core'

export function trackOnboardingCompleted(props: {
  age: number | 'hidden'
  position: Position
  skill: SkillLevel
  /** Selected from a fixed list — scrub defensively anyway. */
  goal: string
  starting_iq: number
}): void {
  track('onboarding_completed', {
    ...props,
    goal: scrubUserInput(props.goal),
  })
}
