import { describe, it, expect } from 'vitest'
import {
  FIRST_SESSION_SCRIPT,
  isInFirstSession,
  getFirstSessionStep,
  NORMAL_UI_MODE,
} from './script'

describe('FIRST_SESSION_SCRIPT', () => {
  it('is exactly 5 reps long', () => {
    expect(FIRST_SESSION_SCRIPT).toHaveLength(5)
  })

  it('rep 1 is BACKDOOR_WINDOW with cold-start chrome and post-answer reveal', () => {
    const r1 = FIRST_SESSION_SCRIPT[0]!
    expect(r1.rep).toBe(1)
    expect(r1.intent).toBe('first-recognition')
    expect(r1.decoder).toBe('BACKDOOR_WINDOW')
    expect(r1.uiMode.suppressDecoderPill).toBe(true)
    expect(r1.uiMode.revealDecoderAfterAnswer).toBe(true)
    expect(r1.uiMode.autoLoopBeforeFreeze).toBe(true)
    expect(r1.uiMode.suppressSelfReviewChecklist).toBe(true)
    expect(r1.uiMode.suppressReplayControls).toBe(true)
  })

  it('rep 1 only shows ONE cue cluster — disguise must be moderate', () => {
    expect(FIRST_SESSION_SCRIPT[0]!.disguise).toBe('moderate')
  })

  it('rep 2 is the mirror flip — same template, opposite side', () => {
    const r2 = FIRST_SESSION_SCRIPT[1]!
    expect(r2.intent).toBe('recognition-mirror')
    expect(r2.prefer.templateId).toBe('BDW.denied-wing')
    expect(r2.prefer.mirror).toBe(true)
  })

  it('rep 3 graduates: decoder pill returns', () => {
    const r3 = FIRST_SESSION_SCRIPT[2]!
    expect(r3.intent).toBe('recognition-transfer')
    expect(r3.uiMode.suppressDecoderPill).toBe(false)
    expect(r3.prefer.differentTemplateThanRep).toBe(2)
  })

  it('rep 4 introduces a different decoder with brief cold-start framing', () => {
    const r4 = FIRST_SESSION_SCRIPT[3]!
    expect(r4.intent).toBe('cross-decoder-introduction')
    expect(r4.decoder).not.toBe('BACKDOOR_WINDOW')
    expect(r4.uiMode.useGuidedFramingLine).toBe(true)
    expect(r4.uiMode.revealDecoderAfterAnswer).toBe(true)
  })

  it('rep 5 closes with self-review + replay back on, but difficulty tag still off', () => {
    const r5 = FIRST_SESSION_SCRIPT[4]!
    expect(r5.intent).toBe('session-close')
    expect(r5.uiMode.suppressSelfReviewChecklist).toBe(false)
    expect(r5.uiMode.suppressReplayControls).toBe(false)
    expect(r5.uiMode.suppressDifficultyTag).toBe(true)
    expect(r5.uiMode.suppressPhaseTracker).toBe(true)
  })

  it('first three reps hide the decoder pill (recognition before naming)', () => {
    expect(FIRST_SESSION_SCRIPT[0]!.uiMode.suppressDecoderPill).toBe(true)
    expect(FIRST_SESSION_SCRIPT[1]!.uiMode.suppressDecoderPill).toBe(true)
    expect(FIRST_SESSION_SCRIPT[2]!.uiMode.suppressDecoderPill).toBe(false)
  })

  it('first three reps hide self-review checklist (no framework yet)', () => {
    for (let i = 0; i < 3; i++) {
      expect(FIRST_SESSION_SCRIPT[i]!.uiMode.suppressSelfReviewChecklist).toBe(true)
    }
  })

  it('header chips (XP/IQ/streak) are hidden across the entire arc', () => {
    for (const step of FIRST_SESSION_SCRIPT) {
      expect(step.uiMode.suppressHeaderChips).toBe(true)
    }
  })

  it('phase tracker is hidden across the entire arc', () => {
    for (const step of FIRST_SESSION_SCRIPT) {
      expect(step.uiMode.suppressPhaseTracker).toBe(true)
    }
  })

  it('only rep 1 auto-loops before the freeze', () => {
    expect(FIRST_SESSION_SCRIPT[0]!.uiMode.autoLoopBeforeFreeze).toBe(true)
    for (let i = 1; i < FIRST_SESSION_SCRIPT.length; i++) {
      expect(FIRST_SESSION_SCRIPT[i]!.uiMode.autoLoopBeforeFreeze).toBe(false)
    }
  })

  it('NORMAL_UI_MODE returns the dashboard (everything off)', () => {
    expect(NORMAL_UI_MODE.suppressDecoderPill).toBe(false)
    expect(NORMAL_UI_MODE.suppressPhaseTracker).toBe(false)
    expect(NORMAL_UI_MODE.suppressHeaderChips).toBe(false)
    expect(NORMAL_UI_MODE.suppressDifficultyTag).toBe(false)
  })
})

describe('isInFirstSession', () => {
  it('null attemptsCount → not in first session (still loading)', () => {
    expect(isInFirstSession({ attemptsCount: null, scenarioIndex: 0 })).toBe(false)
  })

  it('brand new player on rep 1 → in first session', () => {
    expect(isInFirstSession({ attemptsCount: 0, scenarioIndex: 0 })).toBe(true)
  })

  it('player on rep 5 of session 1 → still in first session', () => {
    expect(isInFirstSession({ attemptsCount: 0, scenarioIndex: 4 })).toBe(true)
  })

  it('player who has finished session 1 → out', () => {
    expect(isInFirstSession({ attemptsCount: 5, scenarioIndex: 0 })).toBe(false)
  })

  it('player with prior attempts (returning) → out, even on idx 0', () => {
    expect(isInFirstSession({ attemptsCount: 12, scenarioIndex: 0 })).toBe(false)
  })
})

describe('getFirstSessionStep', () => {
  it('returns rep N when player is on absolute attempt N', () => {
    expect(getFirstSessionStep({ attemptsCount: 0, scenarioIndex: 0 })?.rep).toBe(1)
    expect(getFirstSessionStep({ attemptsCount: 0, scenarioIndex: 1 })?.rep).toBe(2)
    expect(getFirstSessionStep({ attemptsCount: 2, scenarioIndex: 1 })?.rep).toBe(4)
  })

  it('returns null once past rep 5', () => {
    expect(getFirstSessionStep({ attemptsCount: 5, scenarioIndex: 0 })).toBeNull()
    expect(getFirstSessionStep({ attemptsCount: 0, scenarioIndex: 5 })).toBeNull()
  })

  it('returns null when attemptsCount is null', () => {
    expect(getFirstSessionStep({ attemptsCount: null, scenarioIndex: 0 })).toBeNull()
  })
})
