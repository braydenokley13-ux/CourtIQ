import type { Prisma } from '@prisma/client'

export async function update(
  tx: Prisma.TransactionClient,
  input: { userId: string; conceptIds: string[]; isCorrect: boolean },
): Promise<void> {
  const now = new Date()
  const dueAt = input.isCorrect ? null : new Date(now.getTime() + 24 * 60 * 60 * 1000)

  for (const conceptId of input.conceptIds) {
    const current = await tx.mastery.findUnique({
      where: {
        user_id_concept_id: {
          user_id: input.userId,
          concept_id: conceptId,
        },
      },
    })

    const attempts = (current?.attempts_count ?? 0) + 1
    const prevAcc = current?.rolling_accuracy ?? 0
    const nextAcc = ((prevAcc * (attempts - 1)) + (input.isCorrect ? 1 : 0)) / attempts

    await tx.mastery.upsert({
      where: {
        user_id_concept_id: {
          user_id: input.userId,
          concept_id: conceptId,
        },
      },
      create: {
        user_id: input.userId,
        concept_id: conceptId,
        attempts_count: attempts,
        rolling_accuracy: nextAcc,
        last_seen_at: now,
        spaced_rep_due_at: dueAt,
      },
      update: {
        attempts_count: attempts,
        rolling_accuracy: nextAcc,
        last_seen_at: now,
        spaced_rep_due_at: dueAt,
      },
    })
  }
}
