import type { Prisma } from '@prisma/client'
import { streak } from '@courtiq/core'

export async function tick(
  tx: Prisma.TransactionClient,
  input: { userId: string; today?: Date },
): Promise<{ current: number; previous: number; longest: number; extended: boolean; broken: boolean }> {
  const today = input.today ?? new Date()
  const profile = await tx.profile.findUnique({ where: { user_id: input.userId } })

  const latestEvent = await tx.streakEvent.findFirst({
    where: { user_id: input.userId },
    orderBy: { date: 'desc' },
  })

  const state = streak.tick(latestEvent?.date ?? null, today, profile?.current_streak ?? 0)

  if (!state.unchanged) {
    await tx.streakEvent.upsert({
      where: { user_id_date: { user_id: input.userId, date: new Date(`${state.dateKey}T00:00:00.000Z`) } },
      create: {
        user_id: input.userId,
        date: new Date(`${state.dateKey}T00:00:00.000Z`),
        completed: true,
      },
      update: { completed: true },
    })
  }

  const longest = Math.max(profile?.longest_streak ?? 0, state.current)

  if (state.extended || state.broken) {
    await tx.profile.upsert({
      where: { user_id: input.userId },
      create: {
        user_id: input.userId,
        current_streak: state.current,
        longest_streak: longest,
      },
      update: {
        current_streak: state.current,
        longest_streak: longest,
      },
    })
  }

  return {
    current: state.current,
    previous: profile?.current_streak ?? 0,
    longest,
    extended: state.extended,
    broken: state.broken,
  }
}
