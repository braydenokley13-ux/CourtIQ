/**
 * Phase delta-Telemetry (WS-T) — tests for the pure beat_results
 * analytics helpers. Pure tests, no mocks needed.
 */
import { describe, expect, it } from 'vitest'
import {
  aggregateLatencyByBeat,
  computeDecoderConfusionFlag,
  computeFirstActionLatencyMs,
  decoderConfusionRate,
  type BeatResults,
} from './beatAnalytics'

describe('computeFirstActionLatencyMs', () => {
  it('returns empty array for null beat_results', () => {
    expect(computeFirstActionLatencyMs(null)).toEqual([])
    expect(computeFirstActionLatencyMs(undefined)).toEqual([])
  })

  it('returns null latency on canonical Phase gamma rows', () => {
    const beats: BeatResults = [
      { beatIndex: 0, correct: true },
      { beatIndex: 1, correct: false },
    ]
    expect(computeFirstActionLatencyMs(beats)).toEqual([
      { beatIndex: 0, latencyMs: null },
      { beatIndex: 1, latencyMs: null },
    ])
  })

  it('surfaces firstActionMs when present', () => {
    const beats: BeatResults = [
      { beatIndex: 0, correct: true, firstActionMs: 1200 },
      { beatIndex: 1, correct: false, firstActionMs: 2400 },
    ]
    expect(computeFirstActionLatencyMs(beats)).toEqual([
      { beatIndex: 0, latencyMs: 1200 },
      { beatIndex: 1, latencyMs: 2400 },
    ])
  })

  it('accepts latencyMs alias', () => {
    const beats = [
      { beatIndex: 0, correct: true, latencyMs: 900 },
    ] as unknown as BeatResults
    expect(computeFirstActionLatencyMs(beats)).toEqual([
      { beatIndex: 0, latencyMs: 900 },
    ])
  })

  it('treats malformed input as empty', () => {
    expect(computeFirstActionLatencyMs('nope' as unknown as BeatResults)).toEqual([])
    expect(computeFirstActionLatencyMs({} as unknown as BeatResults)).toEqual([])
    expect(computeFirstActionLatencyMs([
      { beatIndex: 'oops', correct: true },
    ] as unknown as BeatResults)).toEqual([])
    expect(computeFirstActionLatencyMs([
      { beatIndex: 0, correct: 'yes' },
    ] as unknown as BeatResults)).toEqual([])
    expect(computeFirstActionLatencyMs([null] as unknown as BeatResults)).toEqual([])
  })

  it('ignores negative or non-finite latency values', () => {
    const beats = [
      { beatIndex: 0, correct: true, firstActionMs: -5 },
      { beatIndex: 1, correct: true, firstActionMs: Number.POSITIVE_INFINITY },
      { beatIndex: 2, correct: true, latencyMs: NaN },
    ] as unknown as BeatResults
    expect(computeFirstActionLatencyMs(beats)).toEqual([
      { beatIndex: 0, latencyMs: null },
      { beatIndex: 1, latencyMs: null },
      { beatIndex: 2, latencyMs: null },
    ])
  })
})

describe('computeDecoderConfusionFlag', () => {
  it('returns false for single-beat scenarios', () => {
    expect(computeDecoderConfusionFlag(null, 1)).toBe(false)
    expect(computeDecoderConfusionFlag([{ beatIndex: 0, correct: false }], 1)).toBe(false)
  })

  it('returns false when no non-final beat is wrong', () => {
    const beats: BeatResults = [
      { beatIndex: 0, correct: true },
      { beatIndex: 1, correct: false },
    ]
    expect(computeDecoderConfusionFlag(beats, 2)).toBe(false)
  })

  it('returns true when a non-final beat is wrong', () => {
    const beats: BeatResults = [
      { beatIndex: 0, correct: false },
      { beatIndex: 1, correct: true },
    ]
    expect(computeDecoderConfusionFlag(beats, 2)).toBe(true)
  })

  it('returns true when an earlier beat in a 3-beat scenario is wrong', () => {
    const beats: BeatResults = [
      { beatIndex: 0, correct: true },
      { beatIndex: 1, correct: false },
      { beatIndex: 2, correct: true },
    ]
    expect(computeDecoderConfusionFlag(beats, 3)).toBe(true)
  })

  it('returns false for null / malformed beat_results', () => {
    expect(computeDecoderConfusionFlag(null, 2)).toBe(false)
    expect(computeDecoderConfusionFlag(undefined, 2)).toBe(false)
    expect(computeDecoderConfusionFlag('bad' as unknown as BeatResults, 2)).toBe(false)
    expect(computeDecoderConfusionFlag([], 2)).toBe(false)
  })

  it('returns false on non-finite beat count', () => {
    expect(computeDecoderConfusionFlag([{ beatIndex: 0, correct: false }], Number.NaN)).toBe(false)
  })
})

describe('aggregateLatencyByBeat', () => {
  it('returns empty array for no rows', () => {
    expect(aggregateLatencyByBeat([])).toEqual([])
  })

  it('skips rows with no latency signal', () => {
    expect(aggregateLatencyByBeat([
      { beat_results: [{ beatIndex: 0, correct: true }] },
      { beat_results: null },
    ])).toEqual([])
  })

  it('computes p50 and p95 nearest-rank per beat', () => {
    const rows = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900].map((ms) => ({
      beat_results: [{ beatIndex: 0, correct: true, firstActionMs: ms }] as BeatResults,
    }))
    const out = aggregateLatencyByBeat(rows)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      beatIndex: 0,
      n: 10,
      // nearest-rank p50 → ceil(0.5 * 10) = 5 → 5th value = 1400
      p50Ms: 1400,
      // nearest-rank p95 → ceil(0.95 * 10) = 10 → 10th value = 1900
      p95Ms: 1900,
    })
  })

  it('buckets latencies separately per beatIndex and sorts ascending', () => {
    const rows: Array<{ beat_results: BeatResults }> = [
      { beat_results: [
        { beatIndex: 0, correct: true, firstActionMs: 500 },
        { beatIndex: 1, correct: false, firstActionMs: 2500 },
      ] },
      { beat_results: [
        { beatIndex: 0, correct: true, firstActionMs: 700 },
        { beatIndex: 1, correct: true, firstActionMs: 2200 },
      ] },
    ]
    const out = aggregateLatencyByBeat(rows)
    expect(out.map((b) => b.beatIndex)).toEqual([0, 1])
    expect(out[0].n).toBe(2)
    expect(out[1].n).toBe(2)
    expect(out[0].p50Ms).toBe(500)
    expect(out[0].p95Ms).toBe(700)
    expect(out[1].p50Ms).toBe(2200)
    expect(out[1].p95Ms).toBe(2500)
  })

  it('ignores beats without latency from the sample', () => {
    const rows: Array<{ beat_results: BeatResults }> = [
      { beat_results: [
        { beatIndex: 0, correct: true, firstActionMs: 1000 },
        { beatIndex: 0, correct: true }, // no latency — skipped
      ] },
    ]
    expect(aggregateLatencyByBeat(rows)).toEqual([
      { beatIndex: 0, n: 1, p50Ms: 1000, p95Ms: 1000 },
    ])
  })

  it('drops malformed rows defensively', () => {
    const rows = [
      { beat_results: 'garbage' as unknown as BeatResults },
      { beat_results: [{ beatIndex: 0, correct: true, firstActionMs: 800 }] as BeatResults },
    ]
    expect(aggregateLatencyByBeat(rows)).toEqual([
      { beatIndex: 0, n: 1, p50Ms: 800, p95Ms: 800 },
    ])
  })
})

describe('decoderConfusionRate', () => {
  it('returns zero for empty input', () => {
    expect(decoderConfusionRate([])).toEqual({ n: 0, confusionRate: 0 })
  })

  it('always reports zero for single-beat-only rows', () => {
    const rows = [
      { beat_results: null, scenarioBeatCount: 1 },
      { beat_results: [{ beatIndex: 0, correct: false }] as BeatResults, scenarioBeatCount: 1 },
    ]
    expect(decoderConfusionRate(rows)).toEqual({ n: 2, confusionRate: 0 })
  })

  it('computes the correct fraction over a mix', () => {
    const rows: Array<{ beat_results: BeatResults; scenarioBeatCount: number }> = [
      // confused: non-final wrong
      { beat_results: [{ beatIndex: 0, correct: false }, { beatIndex: 1, correct: true }], scenarioBeatCount: 2 },
      // not confused: only final wrong
      { beat_results: [{ beatIndex: 0, correct: true }, { beatIndex: 1, correct: false }], scenarioBeatCount: 2 },
      // not confused: single-beat
      { beat_results: [{ beatIndex: 0, correct: false }], scenarioBeatCount: 1 },
      // confused: non-final wrong in 3-beat
      {
        beat_results: [
          { beatIndex: 0, correct: true },
          { beatIndex: 1, correct: false },
          { beatIndex: 2, correct: true },
        ],
        scenarioBeatCount: 3,
      },
    ]
    expect(decoderConfusionRate(rows)).toEqual({ n: 4, confusionRate: 0.5 })
  })

  it('treats malformed rows as not confused', () => {
    const rows = [
      { beat_results: 'oops' as unknown as BeatResults, scenarioBeatCount: 2 },
    ]
    expect(decoderConfusionRate(rows)).toEqual({ n: 1, confusionRate: 0 })
  })
})
