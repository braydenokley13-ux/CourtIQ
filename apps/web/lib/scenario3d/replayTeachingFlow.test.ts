import { describe, expect, it } from 'vitest'

import {
  CUE_REPAINT_HOLD_CORRECT_MS,
  CUE_REPAINT_HOLD_WRONG_MS,
  PRE_CONSEQUENCE_DELAY_MS,
} from './replayTeachingTimeline'
import {
  simulateReplayFlow,
  totalReplayDurationMs,
} from './replayTeachingFlow'

describe('FR-6 simulateReplayFlow — wrong-answer sequence', () => {
  const wrong = simulateReplayFlow({
    pickedAtMs: 1000,
    isWrongChoice: true,
    consequenceLegMs: 1500,
    answerLegMs: 1800,
  })

  it('emits the contract sequence frozen → consequence → cueRepaint → replaying → done', () => {
    expect(wrong.map((e) => e.phase)).toEqual([
      'frozen',
      'consequence',
      'cueRepaint',
      'replaying',
      'done',
    ])
  })

  it('consequence starts after PRE_CONSEQUENCE_DELAY_MS', () => {
    const consequence = wrong.find((e) => e.phase === 'consequence')!
    expect(consequence.atMs).toBe(1000 + PRE_CONSEQUENCE_DELAY_MS)
  })

  it('cueRepaint follows immediately at consequence end', () => {
    const cueRepaint = wrong.find((e) => e.phase === 'cueRepaint')!
    expect(cueRepaint.atMs).toBe(1000 + PRE_CONSEQUENCE_DELAY_MS + 1500)
  })

  it('replaying starts after CUE_REPAINT_HOLD_WRONG_MS hold', () => {
    const replaying = wrong.find((e) => e.phase === 'replaying')!
    expect(replaying.atMs).toBe(
      1000 + PRE_CONSEQUENCE_DELAY_MS + 1500 + CUE_REPAINT_HOLD_WRONG_MS,
    )
  })

  it('done lands at replaying + answer leg', () => {
    const done = wrong.find((e) => e.phase === 'done')!
    expect(done.atMs).toBe(
      1000 + PRE_CONSEQUENCE_DELAY_MS + 1500 + CUE_REPAINT_HOLD_WRONG_MS + 1800,
    )
  })
})

describe('FR-6 simulateReplayFlow — correct-answer sequence', () => {
  const correct = simulateReplayFlow({
    pickedAtMs: 0,
    isWrongChoice: false,
    consequenceLegMs: 0,
    answerLegMs: 1000,
  })

  it('emits the contract sequence frozen → cueRepaint → replaying → done (no consequence)', () => {
    expect(correct.map((e) => e.phase)).toEqual([
      'frozen',
      'cueRepaint',
      'replaying',
      'done',
    ])
  })

  it('cueRepaint fires synchronously with the pick', () => {
    const cueRepaint = correct.find((e) => e.phase === 'cueRepaint')!
    expect(cueRepaint.atMs).toBe(0)
  })

  it('replaying starts after CUE_REPAINT_HOLD_CORRECT_MS', () => {
    const replaying = correct.find((e) => e.phase === 'replaying')!
    expect(replaying.atMs).toBe(CUE_REPAINT_HOLD_CORRECT_MS)
  })

  it('done lands at replaying + answer leg', () => {
    const done = correct.find((e) => e.phase === 'done')!
    expect(done.atMs).toBe(CUE_REPAINT_HOLD_CORRECT_MS + 1000)
  })
})

describe('FR-6 totalReplayDurationMs — success-criteria budgets', () => {
  it('wrong path with 1.5s consequence + 1.8s answer fits inside 4s', () => {
    const total = totalReplayDurationMs({
      pickedAtMs: 5000,
      isWrongChoice: true,
      consequenceLegMs: 1500,
      answerLegMs: 1800,
    })
    expect(total).toBeLessThan(4000)
  })

  it('correct path with 1.2s answer fits inside 2s', () => {
    const total = totalReplayDurationMs({
      pickedAtMs: 5000,
      isWrongChoice: false,
      consequenceLegMs: 0,
      answerLegMs: 1200,
    })
    expect(total).toBeLessThan(2000)
  })
})

describe('FR-6 simulateReplayFlow — purity / determinism', () => {
  it('same inputs always produce the same event sequence', () => {
    const a = simulateReplayFlow({
      pickedAtMs: 1234,
      isWrongChoice: true,
      consequenceLegMs: 1500,
      answerLegMs: 1500,
    })
    const b = simulateReplayFlow({
      pickedAtMs: 1234,
      isWrongChoice: true,
      consequenceLegMs: 1500,
      answerLegMs: 1500,
    })
    expect(a).toEqual(b)
  })

  it('event timestamps are monotonically non-decreasing', () => {
    const e = simulateReplayFlow({
      pickedAtMs: 0,
      isWrongChoice: true,
      consequenceLegMs: 1500,
      answerLegMs: 1500,
    })
    let prev = -Infinity
    for (const ev of e) {
      expect(ev.atMs).toBeGreaterThanOrEqual(prev)
      prev = ev.atMs
    }
  })

  it('does not mutate input objects', () => {
    const input = {
      pickedAtMs: 0,
      isWrongChoice: true,
      consequenceLegMs: 1500,
      answerLegMs: 1500,
    }
    const snap = JSON.stringify(input)
    simulateReplayFlow(input)
    expect(JSON.stringify(input)).toBe(snap)
  })
})

describe('FR-6 simulateReplayFlow — overlay phase mapping invariants', () => {
  it('cueRepaint is always emitted exactly once on both paths', () => {
    const wrong = simulateReplayFlow({
      pickedAtMs: 0,
      isWrongChoice: true,
      consequenceLegMs: 1500,
      answerLegMs: 1500,
    })
    const correct = simulateReplayFlow({
      pickedAtMs: 0,
      isWrongChoice: false,
      consequenceLegMs: 0,
      answerLegMs: 1500,
    })
    expect(wrong.filter((e) => e.phase === 'cueRepaint')).toHaveLength(1)
    expect(correct.filter((e) => e.phase === 'cueRepaint')).toHaveLength(1)
  })

  it('cueRepaint always lands BEFORE replaying so the cue cluster repaints before motion', () => {
    for (const isWrong of [true, false]) {
      const e = simulateReplayFlow({
        pickedAtMs: 0,
        isWrongChoice: isWrong,
        consequenceLegMs: 1500,
        answerLegMs: 1500,
      })
      const cueRepaint = e.find((x) => x.phase === 'cueRepaint')!
      const replaying = e.find((x) => x.phase === 'replaying')!
      expect(replaying.atMs).toBeGreaterThan(cueRepaint.atMs)
    }
  })

  it('on the correct path consequence is never emitted', () => {
    const correct = simulateReplayFlow({
      pickedAtMs: 0,
      isWrongChoice: false,
      consequenceLegMs: 0,
      answerLegMs: 1500,
    })
    expect(correct.find((e) => e.phase === 'consequence')).toBeUndefined()
  })

  it('on the wrong path consequence comes before cueRepaint and ends before replaying', () => {
    const wrong = simulateReplayFlow({
      pickedAtMs: 0,
      isWrongChoice: true,
      consequenceLegMs: 1500,
      answerLegMs: 1500,
    })
    const consequence = wrong.find((e) => e.phase === 'consequence')!
    const cueRepaint = wrong.find((e) => e.phase === 'cueRepaint')!
    const replaying = wrong.find((e) => e.phase === 'replaying')!
    expect(consequence.atMs).toBeLessThan(cueRepaint.atMs)
    expect(cueRepaint.atMs).toBeLessThan(replaying.atMs)
  })
})
