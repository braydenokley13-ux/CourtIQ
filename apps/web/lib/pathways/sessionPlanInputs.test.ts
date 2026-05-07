/**
 * Phase 10 P1 — sessionPlanInputs adapter contract tests.
 *
 * Pin the tier banding, the cold-open trigger, and the queue
 * derivation so the /train page can wire `buildSessionPlan(...)` once
 * and trust the shape contract holds across copy / config edits.
 */

import { describe, expect, it } from 'vitest'

import {
  ONBOARDING_ATTEMPTS_MAX,
  POST_MASTERY_ATTEMPTS_MIN,
  buildSessionPlan,
  deriveDecoderQueue,
  deriveTier,
} from './sessionPlanInputs'
import type { DecoderTag } from './types'

const SCN = (tag: DecoderTag | null) => ({ decoder_tag: tag })

describe('deriveTier', () => {
  it('treats null / zero attempts as onboarding', () => {
    expect(deriveTier({ attemptsCount: null })).toBe('onboarding')
    expect(deriveTier({ attemptsCount: 0 })).toBe('onboarding')
  })

  it('keeps users in onboarding below the attempts ceiling', () => {
    expect(deriveTier({ attemptsCount: ONBOARDING_ATTEMPTS_MAX - 1 })).toBe('onboarding')
  })

  it('flips to mid-mastery at the onboarding ceiling', () => {
    expect(deriveTier({ attemptsCount: ONBOARDING_ATTEMPTS_MAX })).toBe('mid-mastery')
  })

  it('flips to post-mastery at the post-mastery floor', () => {
    expect(deriveTier({ attemptsCount: POST_MASTERY_ATTEMPTS_MIN })).toBe('post-mastery')
  })

  it('honors an explicit override', () => {
    expect(deriveTier({ attemptsCount: 999, override: 'onboarding' })).toBe('onboarding')
  })
})

describe('deriveDecoderQueue', () => {
  it('preserves order and skips null tags', () => {
    expect(
      deriveDecoderQueue({
        scenarios: [
          SCN('BACKDOOR_WINDOW'),
          SCN(null),
          SCN('EMPTY_SPACE_CUT'),
          SCN('BACKDOOR_WINDOW'),
        ],
      }),
    ).toEqual(['BACKDOOR_WINDOW', 'EMPTY_SPACE_CUT', 'BACKDOOR_WINDOW'])
  })

  it('returns an empty queue when no scenarios carry a decoder', () => {
    expect(deriveDecoderQueue({ scenarios: [SCN(null), SCN(null)] })).toEqual([])
  })
})

describe('buildSessionPlan', () => {
  it('cold-starts when attemptsCount is 0', () => {
    const plan = buildSessionPlan({
      attemptsCount: 0,
      trainingMode: null,
      scenarios: [SCN('BACKDOOR_WINDOW')],
      localHour: 10,
    })
    expect(plan.shape).toBe('cold-start')
    expect(plan.opening.quietChrome).toBe(true)
  })

  it('routes boss-challenge mode to graded shape regardless of attempts', () => {
    const plan = buildSessionPlan({
      attemptsCount: 5,
      trainingMode: 'boss-challenge',
      scenarios: [SCN('BACKDOOR_WINDOW')],
      localHour: 10,
    })
    expect(plan.shape).toBe('graded-challenge')
    expect(plan.middle.whisperCheckpoints).toEqual([])
  })

  it('ignores unknown training mode strings (defensive normalization)', () => {
    const plan = buildSessionPlan({
      attemptsCount: 50,
      trainingMode: 'definitely-not-a-real-mode',
      scenarios: [SCN('BACKDOOR_WINDOW'), SCN('EMPTY_SPACE_CUT')],
      localHour: 10,
    })
    expect(plan.shape).toBe('standard')
  })

  it('is deterministic for fixed inputs', () => {
    const args = {
      attemptsCount: 50,
      trainingMode: null,
      scenarios: [SCN('BACKDOOR_WINDOW'), SCN('EMPTY_SPACE_CUT')],
      localHour: 10,
    } as const
    expect(JSON.stringify(buildSessionPlan(args))).toBe(JSON.stringify(buildSessionPlan(args)))
  })
})
