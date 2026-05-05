import { describe, expect, it } from 'vitest'

import {
  CUE_REPAINT_HOLD_CORRECT_MS,
  CUE_REPAINT_HOLD_WRONG_MS,
  DONE_HOLD_MS,
  PRE_BESTREAD_DELAY_MS,
  PRE_CONSEQUENCE_DELAY_MS,
  TEACHING_LABEL_FADE_IN_MS,
  getDecoderTeachingLabel,
  getReplayCadence,
} from './replayTeachingTimeline'

describe('FR-6 replay timing constants', () => {
  it('wrong-path consequence pre-delay matches §10.2 (80 ms)', () => {
    expect(PRE_CONSEQUENCE_DELAY_MS).toBe(80)
  })

  it('best-read pre-delay matches §10.2 (80 ms)', () => {
    expect(PRE_BESTREAD_DELAY_MS).toBe(80)
  })

  it('wrong-path cue repaint hold is 400 ms (1500 → 1900 in §10.2)', () => {
    expect(CUE_REPAINT_HOLD_WRONG_MS).toBe(400)
  })

  it('correct-path cue repaint hold is 600 ms (0 → 600 in §10.2)', () => {
    expect(CUE_REPAINT_HOLD_CORRECT_MS).toBe(600)
  })

  it('teaching label fade-in is 500 ms (§9.4)', () => {
    expect(TEACHING_LABEL_FADE_IN_MS).toBe(500)
  })

  it('done hold is 700 ms (§10.2 +700 ms before CTA)', () => {
    expect(DONE_HOLD_MS).toBe(700)
  })
})

describe('FR-6 replay cadence — total feel targets', () => {
  it('wrong path lands the answer leg before 4 s relative to choice lock', () => {
    // pre-delay (80) + consequence assumed ~1500 + cue repaint (400)
    // + answer-leg motion budget. The plan caps wrong path at 4 s.
    const cad = getReplayCadence('wrong')
    expect(cad.preLegDelayMs + cad.cueRepaintHoldMs + cad.doneHoldMs).toBeLessThan(2000)
  })

  it('correct path total renderer-controlled overhead is below 2 s', () => {
    // Plan §10.2 best-read budget: ~2 s total. The cadence helper
    // carries the renderer-side beats; the answer-leg motion runs
    // alongside and is bounded by scene authoring.
    const cad = getReplayCadence('correct')
    const overhead = cad.preLegDelayMs + cad.cueRepaintHoldMs + cad.doneHoldMs
    expect(overhead).toBeLessThan(2000)
  })

  it('returns frozen objects so consumers cannot mutate them', () => {
    const a = getReplayCadence('wrong')
    expect(() => {
      ;(a as { preLegDelayMs: number }).preLegDelayMs = 9999
    }).toThrow()
  })

  it('wrong / correct cadences use the same done hold (§10.2 same +700ms beat)', () => {
    expect(getReplayCadence('wrong').doneHoldMs).toBe(getReplayCadence('correct').doneHoldMs)
  })
})

describe('FR-6 decoder teaching labels', () => {
  it('BDW says "Read the denial."', () => {
    const l = getDecoderTeachingLabel('BACKDOOR_WINDOW')
    expect(l.text).toBe('Read the denial.')
    expect(l.anchorRole).toBe('cutter')
  })

  it('ESC says "Cut into empty space."', () => {
    const l = getDecoderTeachingLabel('EMPTY_SPACE_CUT')
    expect(l.text).toBe('Cut into empty space.')
  })

  it('AOR says "Read the closeout."', () => {
    const l = getDecoderTeachingLabel('ADVANTAGE_OR_RESET')
    expect(l.text).toBe('Read the closeout.')
    expect(l.anchorRole).toBe('receiver')
  })

  it('SKR says "Punish the help."', () => {
    const l = getDecoderTeachingLabel('SKIP_THE_ROTATION')
    expect(l.text).toBe('Punish the help.')
    expect(l.anchorRole).toBe('open_player')
  })

  it('every decoder label fits the §9.4 max-5-words rule', () => {
    const decoders = [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'ADVANTAGE_OR_RESET',
      'SKIP_THE_ROTATION',
    ] as const
    for (const d of decoders) {
      const words = getDecoderTeachingLabel(d).text.trim().split(/\s+/)
      expect(words.length).toBeLessThanOrEqual(5)
    }
  })

  it('every decoder label is short — schema label cap is 24 chars', () => {
    const decoders = [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'ADVANTAGE_OR_RESET',
      'SKIP_THE_ROTATION',
    ] as const
    for (const d of decoders) {
      expect(getDecoderTeachingLabel(d).text.length).toBeLessThanOrEqual(24)
    }
  })
})
