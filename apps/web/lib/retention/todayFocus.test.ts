/**
 * V3 P6 — return-loop "today's focus" contract tests.
 *
 * Pin the banding so a copy edit can't silently flip a player from
 * "close on X" → "you're sharpening X" or vice versa, and so the
 * cold-start case never accidentally renders.
 */

import { describe, expect, it } from 'vitest'

import {
  deriveReturnFocus,
  type DecoderProgressLite,
  type PathwayProgressLite,
} from './todayFocus'

const NO_PATHWAY: PathwayProgressLite | null = null
const PATHWAY: PathwayProgressLite = {
  pathwayProgress: 0.4,
  pathwayMastered: false,
  recommendedNext: { trainHref: '/train?x=1', label: 'Continue Beat the Closeout' },
}

const D = (over: Partial<DecoderProgressLite>): DecoderProgressLite => ({
  tag: 'BACKDOOR_WINDOW',
  title: 'Backdoor Window',
  state: 'in_progress',
  attempts: 4,
  rolling_accuracy: 0.7,
  ...over,
})

describe('deriveReturnFocus', () => {
  it('returns null when the player has not taken a rep yet', () => {
    expect(deriveReturnFocus({ attemptsCount: 0, decoders: [], pathway: PATHWAY })).toBeNull()
  })

  it('celebrates a mastered pathway, never a "you should grind" message', () => {
    const focus = deriveReturnFocus({
      attemptsCount: 50,
      decoders: [],
      pathway: { ...PATHWAY, pathwayMastered: true },
    })
    expect(focus?.band).toBe('mastered')
    expect(focus?.headline.toLowerCase()).toContain('mastered')
    expect(focus?.sub).toMatch(/sharp/i)
  })

  it('says "close on <decoder>" when accuracy is high with enough reps', () => {
    const focus = deriveReturnFocus({
      attemptsCount: 12,
      decoders: [
        D({ title: 'Skip the Rotation', rolling_accuracy: 0.78, attempts: 6 }),
        D({ title: 'Backdoor Window', rolling_accuracy: 0.55, attempts: 4 }),
      ],
      pathway: PATHWAY,
    })
    expect(focus?.band).toBe('close-to-mastery')
    expect(focus?.headline).toContain('Skip the Rotation')
    expect(focus?.href).toBe(PATHWAY.recommendedNext!.trainHref)
  })

  it('does NOT call a player "close" off a single hot rep', () => {
    const focus = deriveReturnFocus({
      attemptsCount: 2,
      decoders: [
        D({ title: 'Backdoor Window', rolling_accuracy: 0.95, attempts: 2 }),
      ],
      pathway: PATHWAY,
    })
    // 2 attempts < 3 attempts floor — falls through to active band.
    expect(focus?.band).toBe('in-progress')
  })

  it('falls back to "you\'re sharpening" when accuracy is meh but reps exist', () => {
    const focus = deriveReturnFocus({
      attemptsCount: 5,
      decoders: [
        D({ title: 'Empty-Space Cut', rolling_accuracy: 0.4, attempts: 5 }),
      ],
      pathway: PATHWAY,
    })
    expect(focus?.band).toBe('in-progress')
    expect(focus?.headline.toLowerCase()).toContain('empty-space cut')
    expect(focus?.sub).toBe(PATHWAY.recommendedNext!.label)
  })

  it('uses recommendedNext as a fresh-start when no decoder is in progress', () => {
    const focus = deriveReturnFocus({
      attemptsCount: 1,
      decoders: [
        D({ title: 'Backdoor Window', state: 'new', attempts: 0, rolling_accuracy: 0 }),
      ],
      pathway: PATHWAY,
    })
    expect(focus?.band).toBe('fresh-start')
    expect(focus?.sub).toBe(PATHWAY.recommendedNext!.label)
  })

  it('returns null when a returning player has reps but no recommendation and no in-progress decoder', () => {
    const focus = deriveReturnFocus({
      attemptsCount: 1,
      decoders: [],
      pathway: NO_PATHWAY,
    })
    expect(focus).toBeNull()
  })
})
