/**
 * V6 Packet 2 — Movement rhythm helper contracts.
 *
 * Pins the deterministic numeric outputs of the rhythm helper so
 * future tuning sweeps cannot silently drift the per-role lag /
 * duration scaling.
 */

import { describe, it, expect } from 'vitest'
import {
  getReactionLagMs,
  getRoleCloseoutScale,
  scaleCloseoutDurationMs,
} from './movementRhythm'

describe('getReactionLagMs', () => {
  it('returns deterministic, finite, non-negative integers', () => {
    const out = getReactionLagMs({ role: 'on_ball', cue: 'offense_drive' })
    expect(Number.isInteger(out)).toBe(true)
    expect(out).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(out)).toBe(true)
  })

  it('on-ball defender reacts faster than help/low-man on the same cue', () => {
    const onBall = getReactionLagMs({ role: 'on_ball', cue: 'offense_drive' })
    const lowMan = getReactionLagMs({ role: 'low_man', cue: 'offense_drive' })
    const help = getReactionLagMs({
      role: 'wing_defender_helping',
      cue: 'offense_drive',
    })
    expect(onBall).toBeLessThan(lowMan)
    expect(lowMan).toBeLessThan(help)
  })

  it('denial defender reads a back-cut faster than a drive', () => {
    const back = getReactionLagMs({
      role: 'denying_wing_defender',
      cue: 'offense_back_cut',
    })
    const drive = getReactionLagMs({
      role: 'denying_wing_defender',
      cue: 'offense_drive',
    })
    expect(back).toBeLessThan(drive)
  })

  it('matches the authored audit anchor numbers exactly', () => {
    // Lock the values used by the V6 audit / Packet 7 tuning sweep.
    expect(getReactionLagMs({ role: 'on_ball', cue: 'offense_drive' })).toBe(170)
    expect(
      getReactionLagMs({
        role: 'denying_wing_defender',
        cue: 'offense_lift',
      }),
    ).toBe(210)
    expect(
      getReactionLagMs({
        role: 'denying_wing_defender_top_lock',
        cue: 'offense_lift',
      }),
    ).toBe(220)
    expect(
      getReactionLagMs({ role: 'low_man', cue: 'offense_drive' }),
    ).toBe(380)
    expect(
      getReactionLagMs({
        role: 'wing_defender_helping',
        cue: 'pass_release',
      }),
    ).toBe(440)
    expect(
      getReactionLagMs({
        role: 'wing_defender_helping',
        cue: 'pass_arrival',
      }),
    ).toBe(300)
  })

  it('falls back gracefully on an unknown role', () => {
    const out = getReactionLagMs({
      role: 'mystery_defender',
      cue: 'offense_lift',
    })
    expect(Number.isInteger(out)).toBe(true)
    expect(out).toBeGreaterThan(0)
  })

  it('clamps to non-negative after a back_cut modifier', () => {
    // Even the snappiest combo (on_ball + back_cut) stays positive.
    const out = getReactionLagMs({
      role: 'on_ball',
      cue: 'offense_back_cut',
    })
    expect(out).toBeGreaterThanOrEqual(0)
  })
})

describe('getRoleCloseoutScale', () => {
  it('returns 1.0 on unknown roles (no surprise scale changes)', () => {
    expect(getRoleCloseoutScale('not_a_real_role')).toBe(1.0)
  })

  it('on-ball / screen defenders are faster than help-side', () => {
    expect(getRoleCloseoutScale('on_ball')).toBeLessThan(1.0)
    expect(getRoleCloseoutScale('wing_defender_helping')).toBeGreaterThan(
      1.0,
    )
    expect(
      getRoleCloseoutScale('weak_corner_low_man_helper'),
    ).toBeGreaterThan(1.0)
  })

  it('matches the audit anchor numbers exactly', () => {
    expect(getRoleCloseoutScale('on_ball')).toBe(0.85)
    expect(getRoleCloseoutScale('denying_wing_defender')).toBe(0.95)
    expect(getRoleCloseoutScale('low_man')).toBe(1.15)
    expect(getRoleCloseoutScale('wing_defender_helping')).toBe(1.2)
  })
})

describe('scaleCloseoutDurationMs', () => {
  it('rounds to the nearest 50 ms and stays inside [250, 2000]', () => {
    const out = scaleCloseoutDurationMs(750, 'wing_defender_helping')
    expect(out % 50).toBe(0)
    expect(out).toBeGreaterThanOrEqual(250)
    expect(out).toBeLessThanOrEqual(2000)
  })

  it('scales help defenders longer than on-ball', () => {
    const help = scaleCloseoutDurationMs(750, 'wing_defender_helping')
    const onBall = scaleCloseoutDurationMs(750, 'on_ball')
    expect(help).toBeGreaterThan(onBall)
  })

  it('clamps degenerate base values to a sane default', () => {
    const out = scaleCloseoutDurationMs(NaN, 'on_ball')
    expect(out).toBeGreaterThanOrEqual(250)
    expect(out).toBeLessThanOrEqual(2000)
  })
})
