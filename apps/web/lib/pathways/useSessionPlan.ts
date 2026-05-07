/**
 * Phase 10 P1 — useSessionPlan hook.
 *
 * Thin React hook that memoizes `buildSessionPlan(...)` against its
 * inputs so the /train page can read `plan.opening`, `plan.middle`,
 * and `plan.closing` without re-deriving on every render. Pure
 * client-only — the page already runs `'use client'` and the planner
 * is sync + dependency-free.
 *
 * The hook never throws; on a degenerate input it returns the same
 * "safest shape" plan that `composeSession` would, so render guards
 * stay simple.
 */

import { useMemo } from 'react'

import { buildSessionPlan, type BuildPlanInput } from './sessionPlanInputs'
import type { SessionPlan } from './sessionComposition'

export function useSessionPlan(input: BuildPlanInput): SessionPlan {
  // Localize the time-of-day band at first render so the open card
  // stays stable for the duration of the session — the band only
  // matters for the opening sub-line, and re-banding on a re-render
  // would risk flickering "Eyes fresh." → null mid-session.
  const localHour = useMemo(
    () => input.localHour ?? new Date().getHours(),
    // localHour is intentionally fixed for the session; re-derive only
    // when the caller passes a new explicit value.
    [input.localHour],
  )

  return useMemo(
    () =>
      buildSessionPlan({
        attemptsCount: input.attemptsCount,
        trainingMode: input.trainingMode,
        scenarios: input.scenarios,
        localHour,
        tierOverride: input.tierOverride,
        fatigue: input.fatigue,
      }),
    [
      input.attemptsCount,
      input.trainingMode,
      input.scenarios,
      localHour,
      input.tierOverride,
      input.fatigue,
    ],
  )
}
