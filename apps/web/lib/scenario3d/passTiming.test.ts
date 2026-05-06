/**
 * V6 Packet 3 — Pass timing helper contracts.
 */

import { describe, it, expect } from 'vitest'
import {
  computeReceiverSetMs,
  getPassTimingProfile,
  type PassIntent,
} from './passTiming'

const ALL_INTENTS: readonly PassIntent[] = [
  'lead_pass_back_cut',
  'lead_pass_baseline',
  'pocket_pass_short',
  'swing_back',
  'skip_corner',
  'skip_wing',
  'kickout_wing',
  'kickout_corner',
] as const

describe('getPassTimingProfile', () => {
  it('returns finite, non-negative integers for every known intent', () => {
    for (const intent of ALL_INTENTS) {
      const p = getPassTimingProfile(intent)
      expect(Number.isFinite(p.launchOffsetMs)).toBe(true)
      expect(Number.isFinite(p.flightDurationMs)).toBe(true)
      expect(Number.isFinite(p.receiverSetOffsetMs)).toBe(true)
      expect(p.launchOffsetMs).toBeGreaterThanOrEqual(0)
      expect(p.flightDurationMs).toBeGreaterThan(0)
    }
  })

  it('returns a fresh object so callers cannot mutate the table', () => {
    const a = getPassTimingProfile('skip_corner')
    a.launchOffsetMs = -999
    const b = getPassTimingProfile('skip_corner')
    expect(b.launchOffsetMs).not.toBe(-999)
  })

  it('skip passes pre-set the receiver further before release than kickouts', () => {
    const skip = getPassTimingProfile('skip_corner')
    const kick = getPassTimingProfile('kickout_corner')
    // Both negative; "more negative" = earlier set. Skip > kick.
    expect(skip.receiverSetOffsetMs).toBeLessThan(kick.receiverSetOffsetMs)
  })

  it('back-cut leads launch later than ESC pockets / SKR skips', () => {
    expect(
      getPassTimingProfile('lead_pass_back_cut').launchOffsetMs,
    ).toBeGreaterThan(getPassTimingProfile('pocket_pass_short').launchOffsetMs)
    expect(
      getPassTimingProfile('lead_pass_back_cut').launchOffsetMs,
    ).toBeGreaterThan(getPassTimingProfile('skip_corner').launchOffsetMs)
  })

  it('matches authored anchor numbers', () => {
    expect(getPassTimingProfile('lead_pass_back_cut')).toEqual({
      launchOffsetMs: 460,
      flightDurationMs: 580,
      receiverSetOffsetMs: -120,
    })
    expect(getPassTimingProfile('skip_corner')).toEqual({
      launchOffsetMs: 220,
      flightDurationMs: 700,
      receiverSetOffsetMs: -180,
    })
    expect(getPassTimingProfile('swing_back')).toEqual({
      launchOffsetMs: 100,
      flightDurationMs: 580,
      receiverSetOffsetMs: -80,
    })
  })
})

describe('computeReceiverSetMs', () => {
  it('returns durations clamped to [80, 350] ms and rounded to 50 ms', () => {
    for (const intent of ALL_INTENTS) {
      const r = computeReceiverSetMs(intent)
      expect(r.setDurationMs % 50).toBe(0)
      expect(r.setDurationMs).toBeGreaterThanOrEqual(80)
      expect(r.setDurationMs).toBeLessThanOrEqual(350)
      expect(r.setStartMsAfterCutter).toBeGreaterThanOrEqual(0)
    }
  })

  it('skip_corner receiver set starts before launch (catcher pre-loads)', () => {
    // launchOffset=220, receiverSetOffset=-180 -> setStart = 40 (≥ 0)
    const r = computeReceiverSetMs('skip_corner')
    expect(r.setStartMsAfterCutter).toBe(40)
    // Set duration covers from setStart to launch+flight = 920.
    // Raw = 920 - 40 = 880; clamped to 350 max.
    expect(r.setDurationMs).toBe(350)
  })

  it('swing_back pre-loads the receiver less than a skip', () => {
    // The set-window helper clamps to [80, 350] ms so two large
    // raw windows can land on the same clamp ceiling. Compare the
    // raw `receiverSetOffsetMs` (pre-launch lead time) instead.
    const swing = getPassTimingProfile('swing_back').receiverSetOffsetMs
    const skip = getPassTimingProfile('skip_corner').receiverSetOffsetMs
    // Both negative; less-negative = less pre-load.
    expect(swing).toBeGreaterThan(skip)
  })
})
