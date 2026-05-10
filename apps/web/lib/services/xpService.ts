import type { DecoderTag, Prisma, Scenario } from '@prisma/client'
import { level, xp } from '@courtiq/core'
import { huntXpMultiplier } from '@/lib/scenario3d/huntSessionGates'

/** Award XP for a completed scenario attempt.
 *
 *  Phase γ — `decoderTag` is now an optional input. When the scenario
 *  is a HUNT (`HUNT_THE_ADVANTAGE`), we multiply the base XP delta by
 *  `huntXpMultiplier(difficulty)` so D3+ HUNT awards proportionally
 *  more XP — see `HUNT_DECODER_DESIGN.md` §5.1 / §5.8. Default
 *  behavior is unchanged for all non-HUNT decoders, so existing
 *  callers that don't pass `decoderTag` keep their current XP curve. */
export async function award(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    amount: number
    difficulty: Scenario['difficulty']
    decoderTag?: DecoderTag | null
  },
): Promise<{ xpDelta: number; xpTotal: number; levelBefore: number; levelAfter: number }> {
  const profile = await tx.profile.findUnique({ where: { user_id: input.userId } })
  const levelBefore = profile?.level ?? 1
  const xpBefore = profile?.xp_total ?? 0
  const baseDelta = xp.award(input.amount, input.difficulty)
  const huntBonus =
    input.decoderTag === 'HUNT_THE_ADVANTAGE' ? huntXpMultiplier(input.difficulty) : 1
  const xpDelta = Math.round(baseDelta * huntBonus)
  const xpTotal = xpBefore + xpDelta
  const levelAfter = level.fromXp(xpTotal)

  await tx.profile.upsert({
    where: { user_id: input.userId },
    create: { user_id: input.userId, xp_total: xpTotal, level: levelAfter },
    update: { xp_total: xpTotal, level: levelAfter },
  })

  return { xpDelta, xpTotal, levelBefore, levelAfter }
}
