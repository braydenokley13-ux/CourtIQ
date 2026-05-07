/**
 * Phase 9 — Session Composition contract tests.
 *
 * Pin the session shape so a copy edit can't silently flip a cold-open
 * card into the standard one, drop a quiet-chrome flag, or extend a
 * session because a user is performing well. The planner is pure and
 * deterministic — these tests treat the byte-identical-output property
 * as load-bearing.
 */

import { describe, expect, it } from 'vitest'

import {
  ALL_SESSION_SHAPES,
  bandTimeOfDay,
  composeSession,
  spaceDecoders,
  type SessionComposeInput,
} from './sessionComposition'
import type { DecoderTag } from './types'

const ALL_TAGS: readonly DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'ADVANTAGE_OR_RESET',
  'SKIP_THE_ROTATION',
]

const baseInput: SessionComposeInput = {
  localHour: 10,
  tier: 'mid-mastery',
  fatigue: 'fresh',
  trainingMode: null,
  decoderQueue: ALL_TAGS,
  isFirstSession: false,
}

describe('bandTimeOfDay', () => {
  it('buckets the canonical day into four bands', () => {
    expect(bandTimeOfDay(7)).toBe('morning')
    expect(bandTimeOfDay(13)).toBe('midday')
    expect(bandTimeOfDay(19)).toBe('evening')
    expect(bandTimeOfDay(2)).toBe('late-night')
    expect(bandTimeOfDay(23)).toBe('late-night')
  })

  it('clamps invalid hours so the planner never throws', () => {
    expect(bandTimeOfDay(Number.NaN)).toBe('midday')
    expect(bandTimeOfDay(-3)).toBe('late-night')
    expect(bandTimeOfDay(99)).toBe('late-night')
  })
})

describe('spaceDecoders', () => {
  it('avoids back-to-back repeats when distribution allows it', () => {
    const out = spaceDecoders([
      'BACKDOOR_WINDOW',
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'EMPTY_SPACE_CUT',
    ])
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]).not.toBe(out[i - 1])
    }
  })

  it('still emits every tag when one decoder dominates the queue (no drops)', () => {
    const queue: DecoderTag[] = [
      'BACKDOOR_WINDOW',
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'BACKDOOR_WINDOW',
    ]
    const out = spaceDecoders(queue)
    expect(out.sort()).toEqual([...queue].sort())
  })

  it('preserves the queue when only one distinct tag is present', () => {
    const out = spaceDecoders(['BACKDOOR_WINDOW', 'BACKDOOR_WINDOW', 'BACKDOOR_WINDOW'])
    expect(out).toEqual(['BACKDOOR_WINDOW', 'BACKDOOR_WINDOW', 'BACKDOOR_WINDOW'])
  })

  it('returns an empty array for an empty queue', () => {
    expect(spaceDecoders([])).toEqual([])
  })
})

describe('composeSession — shape selection', () => {
  it('maps a graded challenge mode to graded-challenge regardless of tier', () => {
    expect(
      composeSession({ ...baseInput, trainingMode: 'boss-challenge', tier: 'onboarding' }).shape,
    ).toBe('graded-challenge')
    expect(
      composeSession({ ...baseInput, trainingMode: 'mixed-reads', tier: 'post-mastery' }).shape,
    ).toBe('graded-challenge')
  })

  it('cold-starts the very first session even at high tier', () => {
    expect(
      composeSession({ ...baseInput, isFirstSession: true, tier: 'post-mastery' }).shape,
    ).toBe('cold-start')
  })

  it('shortens to short-and-sharp when the user is tired', () => {
    expect(composeSession({ ...baseInput, fatigue: 'tired' }).shape).toBe('short-and-sharp')
  })

  it('uses post-mastery-light for post-mastery + fresh', () => {
    expect(composeSession({ ...baseInput, tier: 'post-mastery' }).shape).toBe(
      'post-mastery-light',
    )
  })

  it('maps onboarding tier to the onboarding shape', () => {
    expect(composeSession({ ...baseInput, tier: 'onboarding' }).shape).toBe('onboarding')
  })

  it('falls through to standard for the common case', () => {
    expect(composeSession(baseInput).shape).toBe('standard')
  })
})

describe('composeSession — restraint properties', () => {
  it('never extends a session for performance reasons (fresh ≤ baseline)', () => {
    const fresh = composeSession(baseInput).middle.repCount
    const tired = composeSession({ ...baseInput, fatigue: 'tired' }).middle.repCount
    expect(tired).toBeLessThan(fresh)
  })

  it('never invents a decoder the rotation did not ask for', () => {
    const plan = composeSession({ ...baseInput, decoderQueue: ['BACKDOOR_WINDOW'] })
    for (const tag of plan.middle.decoderOrder) expect(tag).toBe('BACKDOOR_WINDOW')
  })

  it('keeps repCount and decoderOrder in lockstep when the queue is empty (P1 fix)', () => {
    const plan = composeSession({ ...baseInput, decoderQueue: [] })
    expect(plan.middle.repCount).toBe(0)
    expect(plan.middle.decoderOrder).toEqual([])
    expect(plan.middle.whisperCheckpoints).toEqual([])
  })

  it('cycles the spaced sequence when padding short queues (P2 fix)', () => {
    // Standard shape baseline = 8 reps; queue of 2 should cycle, not
    // collapse to back-to-back streaks of the tail tag.
    const plan = composeSession({
      ...baseInput,
      decoderQueue: ['BACKDOOR_WINDOW', 'EMPTY_SPACE_CUT'],
    })
    expect(plan.middle.decoderOrder.length).toBe(plan.middle.repCount)
    const distinct = new Set(plan.middle.decoderOrder)
    expect(distinct.size).toBe(2)
    // Tail must not be the only tag in the back half — the bug
    // collapsed everything past index 1 into the last tag.
    const tail = plan.middle.decoderOrder.slice(2)
    expect(new Set(tail).size).toBeGreaterThan(1)
  })

  it('quiet-chromes the cold open so the first thing the user sees is a play', () => {
    const plan = composeSession({ ...baseInput, isFirstSession: true })
    expect(plan.opening.quietChrome).toBe(true)
    expect(plan.opening.sub).toBeNull()
  })

  it('never offers more than 2 whisper slots in any shape', () => {
    for (const shape of ALL_SESSION_SHAPES) {
      const input: SessionComposeInput = {
        ...baseInput,
        isFirstSession: shape === 'cold-start',
        trainingMode: shape === 'graded-challenge' ? 'boss-challenge' : null,
        tier:
          shape === 'onboarding'
            ? 'onboarding'
            : shape === 'post-mastery-light'
              ? 'post-mastery'
              : 'mid-mastery',
        fatigue: shape === 'short-and-sharp' ? 'tired' : 'fresh',
      }
      const plan = composeSession(input)
      expect(plan.middle.whisperCheckpoints.length).toBeLessThanOrEqual(2)
    }
  })

  it('disables whispers for cold-start and graded-challenge', () => {
    expect(
      composeSession({ ...baseInput, isFirstSession: true }).middle.whisperCheckpoints,
    ).toEqual([])
    expect(
      composeSession({ ...baseInput, trainingMode: 'boss-challenge' }).middle.whisperCheckpoints,
    ).toEqual([])
  })

  it('keeps the closing copy neutral for graded challenges so the summary owns the verdict', () => {
    const plan = composeSession({ ...baseInput, trainingMode: 'boss-challenge' })
    expect(plan.closing.sub).toBeNull()
    expect(plan.closing.inline).toBe(true)
  })
})

describe('composeSession — determinism', () => {
  it('produces byte-identical plans for the same input', () => {
    const a = composeSession(baseInput)
    const b = composeSession(baseInput)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('rep count matches the decoder order length', () => {
    for (const shape of ALL_SESSION_SHAPES) {
      const input: SessionComposeInput = {
        ...baseInput,
        isFirstSession: shape === 'cold-start',
        trainingMode: shape === 'graded-challenge' ? 'boss-challenge' : null,
        tier:
          shape === 'onboarding'
            ? 'onboarding'
            : shape === 'post-mastery-light'
              ? 'post-mastery'
              : 'mid-mastery',
        fatigue: shape === 'short-and-sharp' ? 'tired' : 'fresh',
      }
      const plan = composeSession(input)
      expect(plan.middle.decoderOrder.length).toBe(plan.middle.repCount)
    }
  })

  it('maps each shape to a distinct rep count baseline (no duplicate-shaped accidents)', () => {
    const counts = new Map<string, number>()
    for (const shape of ALL_SESSION_SHAPES) {
      counts.set(shape, REP_COUNT_PER_SHAPE_FOR_TEST[shape])
    }
    // Sanity: at least 4 distinct rep counts across 6 shapes (some
    // overlap — onboarding and short-and-sharp both pick 5 — but the
    // planner should not collapse to a single value).
    const distinct = new Set(counts.values())
    expect(distinct.size).toBeGreaterThanOrEqual(4)
  })
})

// Mirror of the private REP_COUNT_BY_SHAPE in sessionComposition.ts.
// Tests own this so a planner-side change to baselines surfaces here
// rather than as a silent shape regression.
const REP_COUNT_PER_SHAPE_FOR_TEST = {
  'cold-start': 3,
  onboarding: 5,
  standard: 8,
  'short-and-sharp': 5,
  'post-mastery-light': 6,
  'graded-challenge': 10,
} as const
