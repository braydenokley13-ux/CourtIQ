/**
 * FR-3 §7.8 — player scale-consistency contract.
 *
 * Locks the GLB rig and procedural figure standing heights to the
 * §7.8 budget so a future packet cannot silently drift either height
 * and break the §7.11 "GLB and procedural figures feel like the same
 * visual system" goal.
 *
 * The contract is intentionally narrow:
 *   1. `ATH_TOTAL_HEIGHT_FT` (procedural) is 5.95 ft.
 *   2. `GLB_TARGET_HEIGHT_FT` (GLB rig after `GLB_M_TO_FT_SCALE`) is
 *      5.93 ft.
 *   3. `|procedural − glb| <= PLAYER_HEIGHT_DELTA_BUDGET_FT` (0.05 ft).
 *   4. Both values are positive and within an obviously-basketball
 *      range so a typo (`5.5` / `0.59`) trips the test rather than
 *      silently shipping a hobbit-sized athlete.
 */

import { describe, expect, it } from 'vitest'
import {
  GLB_TARGET_HEIGHT_FT,
  PLAYER_HEIGHT_DELTA_BUDGET_FT,
} from './glbAthlete'
import { ATH_TOTAL_HEIGHT_FT } from './imperativeScene'

describe('FR-3 §7.8 — player scale contract', () => {
  it('procedural figure height stays at the documented 5.95 ft', () => {
    expect(ATH_TOTAL_HEIGHT_FT).toBe(5.95)
  })

  it('GLB rig target height stays at the documented 5.93 ft', () => {
    expect(GLB_TARGET_HEIGHT_FT).toBe(5.93)
  })

  it('procedural and GLB heights stay within the §7.8 ±0.05 ft delta budget', () => {
    const delta = Math.abs(ATH_TOTAL_HEIGHT_FT - GLB_TARGET_HEIGHT_FT)
    expect(delta).toBeLessThanOrEqual(PLAYER_HEIGHT_DELTA_BUDGET_FT)
  })

  it('the delta budget itself is locked at 0.05 ft so widening it is intentional, not accidental', () => {
    // A future packet that legitimately needs a wider tolerance must
    // edit this literal — at which point the planning doc §7.8 should
    // be updated in the same commit.
    expect(PLAYER_HEIGHT_DELTA_BUDGET_FT).toBe(0.05)
  })

  it('both heights are positive and inside a basketball-realistic 4–8 ft range', () => {
    for (const h of [ATH_TOTAL_HEIGHT_FT, GLB_TARGET_HEIGHT_FT]) {
      expect(h).toBeGreaterThan(4)
      expect(h).toBeLessThan(8)
    }
  })
})
