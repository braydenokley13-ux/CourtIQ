import type { Prisma, Scenario } from '@prisma/client'
import { iq } from '@courtiq/core'

export async function applyAttempt(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    scenario: Pick<Scenario, 'difficulty'>
    choice: { is_correct: boolean }
    timeMs: number
  },
): Promise<{ iqBefore: number; iqAfter: number; iqDelta: number }> {
  const profile = await tx.profile.findUnique({ where: { user_id: input.userId } })
  const iqBefore = profile?.iq_score ?? 500
  const result = iq.applyAttempt(
    { difficulty: input.scenario.difficulty },
    { isCorrect: input.choice.is_correct },
    input.timeMs,
    iqBefore,
  )

  await tx.profile.upsert({
    where: { user_id: input.userId },
    create: { user_id: input.userId, iq_score: result.after },
    update: { iq_score: result.after },
  })

  return { iqBefore, iqAfter: result.after, iqDelta: result.delta }
}
