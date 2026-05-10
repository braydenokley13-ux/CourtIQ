/**
 * Phase γ — xpService HUNT-multiplier unit tests.
 *
 * Locks the soft-XP-bonus contract from §5.8 of HUNT_DECODER_DESIGN:
 *   - non-HUNT scenarios award the existing base XP curve (no
 *     regression for BDW/ESC/SKR/AOR/DROP).
 *   - HUNT D3+ awards `baseDelta × huntXpMultiplier(difficulty)`.
 *
 * Prisma is mocked so this exercises just the multiplier wiring; the
 * core `xp.award` formula is exercised via core's own tests.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { award } from './xpService'

function mockTx(profile: { level?: number; xp_total?: number } | null) {
  const upsert = vi.fn().mockResolvedValue(undefined)
  return {
    tx: {
      profile: {
        findUnique: vi.fn().mockResolvedValue(profile),
        upsert,
      },
    } as unknown as Prisma.TransactionClient,
    upsert,
  }
}

describe('xpService.award — HUNT multiplier', () => {
  it('non-HUNT awards (decoderTag undefined) match base xp.award (no regression)', async () => {
    const { tx } = mockTx({ level: 1, xp_total: 0 })
    const out = await award(tx, { userId: 'u1', amount: 10, difficulty: 5 })
    // Base: amount(10) × D5 multiplier(1.7) = 17.
    expect(out.xpDelta).toBe(17)
  })

  it('non-HUNT decoderTag also matches base xp.award', async () => {
    const { tx } = mockTx({ level: 1, xp_total: 0 })
    const out = await award(tx, {
      userId: 'u1',
      amount: 10,
      difficulty: 5,
      decoderTag: 'BACKDOOR_WINDOW',
    })
    expect(out.xpDelta).toBe(17)
  })

  it('HUNT D2 awards no bonus (multiplier = 1.0×)', async () => {
    const { tx } = mockTx({ level: 1, xp_total: 0 })
    const out = await award(tx, {
      userId: 'u1',
      amount: 10,
      difficulty: 2,
      decoderTag: 'HUNT_THE_ADVANTAGE',
    })
    // Base D2 multiplier from core is 0.8; round(10 × 0.8) = 8.
    // huntXpMultiplier(2) = 1.0, so xpDelta stays 8.
    expect(out.xpDelta).toBe(8)
  })

  it('HUNT D3 multiplies the base delta by 1.4×', async () => {
    const { tx } = mockTx({ level: 1, xp_total: 0 })
    const out = await award(tx, {
      userId: 'u1',
      amount: 10,
      difficulty: 3,
      decoderTag: 'HUNT_THE_ADVANTAGE',
    })
    // Base D3: round(10 × 1) = 10. HUNT bonus × 1.4 = 14.
    expect(out.xpDelta).toBe(14)
  })

  it('HUNT D5 multiplies the base delta by 1.7×', async () => {
    const { tx } = mockTx({ level: 1, xp_total: 0 })
    const out = await award(tx, {
      userId: 'u1',
      amount: 10,
      difficulty: 5,
      decoderTag: 'HUNT_THE_ADVANTAGE',
    })
    // Base D5: round(10 × 1.7) = 17. HUNT bonus × 1.7 = 28.9 → 29.
    expect(out.xpDelta).toBe(29)
  })
})
