import type { Prisma, Profile, Scenario } from '@prisma/client'
import { calcIQDelta } from '@courtiq/core'

export async function applyAttempt(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    scenario: Pick<Scenario, 'difficulty'>
    isCorrect: boolean
    timeMs: number
  },
): Promise<{ iqBefore: number; iqAfter: number; iqDelta: number }> {
  const profile = await tx.profile.findUnique({ where: { user_id: input.userId } })
  const iqBefore = profile?.iq_score ?? 500
  const iqDelta = calcIQDelta(iqBefore, input.scenario.difficulty, input.isCorrect, input.timeMs)
  const iqAfter = Math.max(0, iqBefore + iqDelta)

  await tx.profile.upsert({
    where: { user_id: input.userId },
    create: { user_id: input.userId, iq_score: iqAfter },
    update: { iq_score: iqAfter },
  })

  return { iqBefore, iqAfter, iqDelta }
}
