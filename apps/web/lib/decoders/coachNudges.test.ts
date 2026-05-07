/**
 * V3 P10 P5 — coach nudge contract tests.
 *
 * Pin both the per-tag attention cue and the visibility logic so a
 * future copy/UX edit can't accidentally surface the nudge during a
 * boss challenge, on first-rep cold-start, or after the freeze.
 */

import { describe, expect, it } from 'vitest'

import { ALL_DECODER_TAGS } from '@/lib/pathways/types'
import { getCoachNudge, shouldShowCoachNudge } from './coachNudges'

describe('getCoachNudge', () => {
  it('returns a non-empty short cue for every live decoder', () => {
    for (const tag of ALL_DECODER_TAGS) {
      const cue = getCoachNudge(tag)
      expect(cue.length).toBeGreaterThan(0)
      // The cue is meant to be glanceable — anything longer than one
      // short phrase is doing too much.
      expect(cue.length).toBeLessThanOrEqual(40)
    }
  })

  it('keeps the cue an attention pointer, not an instruction', () => {
    // The nudge must NOT contain a verb-of-action like "cut" or
    // "skip" — that would telegraph the read.
    for (const tag of ALL_DECODER_TAGS) {
      const cue = getCoachNudge(tag).toLowerCase()
      expect(cue).not.toMatch(/\bcut\b/)
      expect(cue).not.toMatch(/\bskip\b/)
      expect(cue).not.toMatch(/\battack\b/)
      expect(cue).not.toMatch(/\bdrive\b/)
      expect(cue).not.toMatch(/\bshoot\b/)
    }
  })

  it('all four cues are distinct so reps never repeat the same line', () => {
    const cues = ALL_DECODER_TAGS.map((tag) => getCoachNudge(tag))
    expect(new Set(cues).size).toBe(cues.length)
  })
})

describe('shouldShowCoachNudge', () => {
  const baseline = {
    decoderTag: 'BACKDOOR_WINDOW' as const,
    scenarioIndex: 0,
    isFirstRep: false,
    isChallengeMode: false,
    frozen: false,
  }

  it('surfaces on the first scenario of a normal decoder session', () => {
    expect(shouldShowCoachNudge(baseline)).toBe(true)
  })

  it('hides for legacy 2D fixtures with no decoder tag', () => {
    expect(shouldShowCoachNudge({ ...baseline, decoderTag: null })).toBe(false)
  })

  it('hides on first-rep cold-start so it never competes with stripped chrome', () => {
    expect(shouldShowCoachNudge({ ...baseline, isFirstRep: true })).toBe(false)
  })

  it('hides in boss / mixed challenge runs', () => {
    expect(shouldShowCoachNudge({ ...baseline, isChallengeMode: true })).toBe(false)
  })

  it('fades the moment the scene reaches its freeze marker', () => {
    expect(shouldShowCoachNudge({ ...baseline, frozen: true })).toBe(false)
  })

  it('only fires on the first scenario of a session — never on follow-up reps', () => {
    expect(shouldShowCoachNudge({ ...baseline, scenarioIndex: 1 })).toBe(false)
    expect(shouldShowCoachNudge({ ...baseline, scenarioIndex: 4 })).toBe(false)
  })
})
