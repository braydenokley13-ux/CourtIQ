/**
 * V3 P9 — first-rep helper contract tests.
 *
 * Cold-start mode is the main "first great session" lever — these
 * tests pin the boundaries so a future refactor can't quietly
 * re-introduce dashboard chrome on the player's first read.
 */

import { describe, expect, it } from 'vitest'

import { FIRST_REP_CUES, getFirstRepCues, isFirstRep } from './firstRep'

describe('isFirstRep', () => {
  it('returns true for a brand-new player on the first scenario', () => {
    expect(
      isFirstRep({
        attemptsCount: 0,
        scenarioIndex: 0,
        isChallengeMode: false,
      }),
    ).toBe(true)
  })

  it('returns false once the player has any prior attempts', () => {
    expect(
      isFirstRep({
        attemptsCount: 1,
        scenarioIndex: 0,
        isChallengeMode: false,
      }),
    ).toBe(false)
    expect(
      isFirstRep({
        attemptsCount: 50,
        scenarioIndex: 0,
        isChallengeMode: false,
      }),
    ).toBe(false)
  })

  it('returns false on later scenarios within the same session', () => {
    expect(
      isFirstRep({
        attemptsCount: 0,
        scenarioIndex: 1,
        isChallengeMode: false,
      }),
    ).toBe(false)
    expect(
      isFirstRep({
        attemptsCount: 0,
        scenarioIndex: 4,
        isChallengeMode: false,
      }),
    ).toBe(false)
  })

  it('treats unknown attempts (still loading) as not-first to avoid flashing chrome', () => {
    expect(
      isFirstRep({
        attemptsCount: null,
        scenarioIndex: 0,
        isChallengeMode: false,
      }),
    ).toBe(false)
  })

  it('never enters cold-start during a boss / mixed challenge run', () => {
    expect(
      isFirstRep({
        attemptsCount: 0,
        scenarioIndex: 0,
        isChallengeMode: true,
      }),
    ).toBe(false)
  })
})

describe('getFirstRepCues', () => {
  it('returns the same module constant the JSX reads', () => {
    expect(getFirstRepCues()).toBe(FIRST_REP_CUES)
  })

  it('names the decoder in the recognition headline so the player learns the noun AFTER the rep', () => {
    const cues = getFirstRepCues()
    expect(cues.recognitionHeadline('Backdoor Window')).toBe(
      'You saw the Backdoor Window.',
    )
    expect(cues.recoveryHeadline('Skip the Rotation')).toBe(
      'That was the Skip the Rotation.',
    )
  })

  it('passes through the player-voice one-liner for the recognition sub-headline', () => {
    expect(
      FIRST_REP_CUES.recognitionSub('Cut behind a defender who blocks the pass.'),
    ).toBe('Cut behind a defender who blocks the pass.')
  })

  it('keeps the pre-freeze framing free of answer-shaped language', () => {
    // The framing is read BEFORE the freeze, so it must not mention
    // any decoder noun ("backdoor", "skip", etc.) or the player will
    // be primed instead of discovering the read.
    const framing = FIRST_REP_CUES.framing.toLowerCase()
    expect(framing).not.toMatch(/backdoor/)
    expect(framing).not.toMatch(/skip/)
    expect(framing).not.toMatch(/closeout/)
    expect(framing).not.toMatch(/empty[- ]space/)
  })
})
