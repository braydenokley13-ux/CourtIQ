/**
 * V3 P11 P8 — reward visibility contract tests.
 *
 * Pin the streak-chip rule so a future copy or UX edit can't quietly
 * re-introduce "1 🔥" framing on a single correct rep.
 */

import { describe, expect, it } from 'vitest'

import { shouldShowStreakChip } from './visibility'

describe('shouldShowStreakChip', () => {
  it('hides at 0 — no flame for a streak that does not exist', () => {
    expect(shouldShowStreakChip(0)).toBe(false)
  })

  it('hides at 1 — a single correct rep is not a streak', () => {
    expect(shouldShowStreakChip(1)).toBe(false)
  })

  it('shows at 2+ — that is the smallest read of real momentum', () => {
    expect(shouldShowStreakChip(2)).toBe(true)
    expect(shouldShowStreakChip(3)).toBe(true)
    expect(shouldShowStreakChip(99)).toBe(true)
  })

  it('hides on negative / non-finite values without throwing', () => {
    expect(shouldShowStreakChip(-1)).toBe(false)
    expect(shouldShowStreakChip(Number.NaN)).toBe(false)
    // Infinity is not finite — the gate rejects it so a corrupt
    // payload can't surface a "Infinity 🔥" chip.
    expect(shouldShowStreakChip(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
