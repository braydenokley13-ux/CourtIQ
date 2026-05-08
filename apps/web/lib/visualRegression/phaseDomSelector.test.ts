/**
 * Pack 2 §3.1.14 / Replay-1 — locks the visual-regression phase ↔
 * `data-replay-phase` mapping in the screenshot harness.
 *
 * The harness uses these accepted-value sets via `page.waitForFunction`
 * to decide WHEN to capture each phase. If the mapping drifts (an
 * extra ReplayPhase token sneaks into the controller, an existing
 * token gets renamed), the harness will either wait forever (timing
 * out into the wall-clock fallback) or capture the wrong frame —
 * silently corrupting baselines. This test is the gate.
 */
import { describe, expect, it } from 'vitest'
import {
  PHASE_DOM_MATCH,
  phaseDomMatches,
  type ReplayPhaseToken,
  type VisualPhase,
} from './phaseDomSelector'

const ALL_REPLAY_PHASES: ReplayPhaseToken[] = [
  'idle',
  'setup',
  'playing',
  'frozen',
  'consequence',
  'cueRepaint',
  'replaying',
  'done',
]

describe('PHASE_DOM_MATCH', () => {
  it('partitions ReplayPhase tokens into pre-freeze / freeze / post-freeze', () => {
    expect(PHASE_DOM_MATCH.load).toEqual(['idle', 'setup', 'playing'])
    expect(PHASE_DOM_MATCH.freeze).toEqual(['frozen'])
    expect(PHASE_DOM_MATCH.after).toEqual([
      'consequence',
      'cueRepaint',
      'replaying',
      'done',
    ])
  })

  it('covers every ReplayPhase token exactly once across the three buckets', () => {
    const seen = new Set<string>()
    for (const phase of ['load', 'freeze', 'after'] as VisualPhase[]) {
      for (const token of PHASE_DOM_MATCH[phase]) {
        expect(seen.has(token), `${token} appears in multiple buckets`).toBe(
          false,
        )
        seen.add(token)
      }
    }
    expect(seen.size).toBe(ALL_REPLAY_PHASES.length)
    for (const token of ALL_REPLAY_PHASES) {
      expect(seen.has(token), `${token} is uncovered`).toBe(true)
    }
  })

  it('keeps `frozen` exclusive to the `freeze` bucket', () => {
    expect(phaseDomMatches('freeze', 'frozen')).toBe(true)
    expect(phaseDomMatches('load', 'frozen')).toBe(false)
    expect(phaseDomMatches('after', 'frozen')).toBe(false)
  })
})

describe('phaseDomMatches', () => {
  it('returns false for null / undefined / empty attribute', () => {
    expect(phaseDomMatches('load', null)).toBe(false)
    expect(phaseDomMatches('freeze', undefined)).toBe(false)
    expect(phaseDomMatches('after', '')).toBe(false)
  })

  it('returns true on every accepted (phase, token) pair', () => {
    for (const phase of ['load', 'freeze', 'after'] as VisualPhase[]) {
      for (const token of PHASE_DOM_MATCH[phase]) {
        expect(phaseDomMatches(phase, token)).toBe(true)
      }
    }
  })

  it('rejects an unknown attribute value', () => {
    // A future renderer typo or stale attribute must not match any
    // bucket — the harness should fall back to wall-clock instead of
    // accepting the typo as a valid phase.
    expect(phaseDomMatches('load', 'PLAYING')).toBe(false)
    expect(phaseDomMatches('freeze', 'froze')).toBe(false)
    expect(phaseDomMatches('after', 'finished')).toBe(false)
  })
})
