import type { Prisma, Scenario } from '@prisma/client'
import { level, xp } from '@courtiq/core'

export async function award(
  tx: Prisma.TransactionClient,
  input: { userId: string; amount: number; difficulty: Scenario['difficulty'] },
): Promise<{ xpDelta: number; xpTotal: number; levelBefore: number; levelAfter: number }> {
  const profile = await tx.profile.findUnique({ where: { user_id: input.userId } })
  const levelBefore = profile?.level ?? 1
  const xpBefore = profile?.xp_total ?? 0
  const xpDelta = xp.award(input.amount, input.difficulty)
  const xpTotal = xpBefore + xpDelta
  const levelAfter = level.fromXp(xpTotal)

  await tx.profile.upsert({
    where: { user_id: input.userId },
    create: { user_id: input.userId, xp_total: xpTotal, level: levelAfter },
    update: { xp_total: xpTotal, level: levelAfter },
  })

  return { xpDelta, xpTotal, levelBefore, levelAfter }
}
