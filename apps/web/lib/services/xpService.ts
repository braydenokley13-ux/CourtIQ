import type { Prisma } from '@prisma/client'
import { calcXP, xpToLevel } from '@courtiq/core'

export async function award(
  tx: Prisma.TransactionClient,
  input: { userId: string; isCorrect: boolean; xpReward: number },
): Promise<{ xpDelta: number; xpTotal: number; levelBefore: number; levelAfter: number }> {
  const profile = await tx.profile.findUnique({ where: { user_id: input.userId } })
  const levelBefore = profile?.level ?? 1
  const xpBefore = profile?.xp_total ?? 0
  const streak = profile?.current_streak ?? 0
  const xpDelta = calcXP(input.isCorrect, input.xpReward, streak)
  const xpTotal = xpBefore + xpDelta
  const levelAfter = xpToLevel(xpTotal)

  await tx.profile.upsert({
    where: { user_id: input.userId },
    create: { user_id: input.userId, xp_total: xpTotal, level: levelAfter },
    update: { xp_total: xpTotal, level: levelAfter },
  })

  return { xpDelta, xpTotal, levelBefore, levelAfter }
}
