import type { Prisma } from '@prisma/client'
import type { BadgeFamily } from '@courtiq/core'

type BadgeSeed = {
  slug: string
  name: string
  family: BadgeFamily
  icon_ref: string
  criteria: Record<string, unknown>
}

type UserBadgeWithBadge = { badge: { slug: string } }
type MasteryRow = { concept_id: string; rolling_accuracy: number; attempts_count: number }
type AttemptRow = { is_correct: boolean; time_ms: number }
type SessionRow = { id: string; scenario_ids: string[]; correct_count: number }
type BadgeRow = { id: string; slug: string; family: BadgeFamily; criteria: unknown }

const STARTER_BADGES: BadgeSeed[] = [
  // Concept mastery (5)
  { slug: 'concept-help-side-guru', name: 'Help Side Guru', family: 'CONCEPT', icon_ref: 'shield-help', criteria: { type: 'concept_mastery', concept: 'help_defense_basics', min_accuracy: 0.8, min_attempts: 10 } },
  { slug: 'concept-transition-maestro', name: 'Transition Maestro', family: 'CONCEPT', icon_ref: 'fastbreak', criteria: { type: 'concept_mastery', concept: 'transition_stop_ball', min_accuracy: 0.8, min_attempts: 10 } },
  { slug: 'concept-closeout-commander', name: 'Closeout Commander', family: 'CONCEPT', icon_ref: 'closeout', criteria: { type: 'concept_mastery', concept: 'closeouts', min_accuracy: 0.8, min_attempts: 10 } },
  { slug: 'concept-rotation-reader', name: 'Rotation Reader', family: 'CONCEPT', icon_ref: 'rotation', criteria: { type: 'concept_mastery', concept: 'low_man_rotation', min_accuracy: 0.8, min_attempts: 10 } },
  { slug: 'concept-space-architect', name: 'Space Architect', family: 'CONCEPT', icon_ref: 'spacing', criteria: { type: 'concept_mastery', concept: 'spacing_fundamentals', min_accuracy: 0.8, min_attempts: 10 } },

  // Milestones (5)
  { slug: 'milestone-first-50', name: 'First 50 Reps', family: 'MILESTONE', icon_ref: 'milestone-50', criteria: { type: 'scenario_count', min_attempts: 50 } },
  { slug: 'milestone-century', name: '100 Scenarios', family: 'MILESTONE', icon_ref: 'milestone-100', criteria: { type: 'scenario_count', min_attempts: 100 } },
  { slug: 'milestone-xp-1000', name: '1,000 XP', family: 'MILESTONE', icon_ref: 'xp-1000', criteria: { type: 'xp_total', min_xp: 1000 } },
  { slug: 'milestone-level-10', name: 'Double Digits', family: 'MILESTONE', icon_ref: 'level-10', criteria: { type: 'level', min_level: 10 } },
  { slug: 'milestone-streak-30', name: '30-Day Streak', family: 'MILESTONE', icon_ref: 'streak-30', criteria: { type: 'streak', min_streak: 30 } },

  // Accuracy (5)
  { slug: 'accuracy-perfect-5', name: 'Perfect Session (5/5)', family: 'ACCURACY', icon_ref: 'perfect-5', criteria: { type: 'perfect_session', min_total: 5 } },
  { slug: 'accuracy-hot-hand-10', name: '10 in a Row', family: 'ACCURACY', icon_ref: 'streak-10', criteria: { type: 'correct_in_row', min_row: 10 } },
  { slug: 'accuracy-sharpshooter-80', name: 'Sharpshooter 80%', family: 'ACCURACY', icon_ref: 'acc-80', criteria: { type: 'overall_accuracy', min_accuracy: 0.8, min_attempts: 30 } },
  { slug: 'accuracy-lockdown-90', name: 'Lockdown 90%', family: 'ACCURACY', icon_ref: 'acc-90', criteria: { type: 'overall_accuracy', min_accuracy: 0.9, min_attempts: 50 } },
  { slug: 'accuracy-snap-read', name: 'Snap Read', family: 'ACCURACY', icon_ref: 'speed', criteria: { type: 'fast_correct_count', max_time_ms: 3000, min_count: 25 } },
]

async function seedStarterBadges(tx: Prisma.TransactionClient): Promise<void> {
  await Promise.all(STARTER_BADGES.map((badge: BadgeSeed) => tx.badge.upsert({
    where: { slug: badge.slug },
    create: badge,
    update: {
      name: badge.name,
      family: badge.family,
      icon_ref: badge.icon_ref,
      criteria: badge.criteria,
    },
  })))
}

export async function checkAndAward(
  tx: Prisma.TransactionClient,
  input: { userId: string; sessionId: string },
): Promise<Array<{ slug: string; family: BadgeFamily }>> {
  await seedStarterBadges(tx)

  const [profile, userBadges, masteries, attempts, sessions] = await Promise.all([
    tx.profile.findUnique({ where: { user_id: input.userId } }),
    tx.userBadge.findMany({ where: { user_id: input.userId }, include: { badge: true } }),
    tx.mastery.findMany({ where: { user_id: input.userId } }),
    tx.attempt.findMany({ where: { user_id: input.userId }, orderBy: { created_at: 'asc' } }),
    tx.sessionRun.findMany({ where: { user_id: input.userId } }),
  ])

  const typedUserBadges = userBadges as UserBadgeWithBadge[]
  const typedMasteries = masteries as MasteryRow[]
  const typedAttempts = attempts as AttemptRow[]
  const typedSessions = sessions as SessionRow[]

  const earned = new Set(typedUserBadges.map((userBadge: UserBadgeWithBadge) => userBadge.badge.slug))
  const candidateBadges = await tx.badge.findMany() as BadgeRow[]
  const awarded: Array<{ slug: string; family: BadgeFamily }> = []

  const accuracy = typedAttempts.length
    ? typedAttempts.filter((attempt: AttemptRow) => attempt.is_correct).length / typedAttempts.length
    : 0

  let currentCorrectRun = 0
  let bestCorrectRun = 0
  for (const attempt of typedAttempts) {
    if (attempt.is_correct) {
      currentCorrectRun += 1
      bestCorrectRun = Math.max(bestCorrectRun, currentCorrectRun)
    } else {
      currentCorrectRun = 0
    }
  }

  const fastCorrectCount = typedAttempts.filter((attempt: AttemptRow) => attempt.is_correct && attempt.time_ms < 3000).length
  const latestSession = typedSessions.find((session: SessionRow) => session.id === input.sessionId)
  const sessionPerfect = !!latestSession && latestSession.scenario_ids.length >= 5 && latestSession.correct_count === latestSession.scenario_ids.length

  for (const badge of candidateBadges) {
    if (earned.has(badge.slug)) continue
    const criteria = badge.criteria as Record<string, unknown>
    const type = String(criteria.type ?? '')

    let shouldAward = false

    if (type === 'concept_mastery') {
      const concept = String(criteria.concept ?? '')
      const minAccuracy = Number(criteria.min_accuracy ?? 0.8)
      const minAttempts = Number(criteria.min_attempts ?? 10)
      shouldAward = typedMasteries.some((mastery: MasteryRow) => mastery.concept_id === concept && mastery.rolling_accuracy >= minAccuracy && mastery.attempts_count >= minAttempts)
    } else if (type === 'scenario_count') {
      shouldAward = typedAttempts.length >= Number(criteria.min_attempts ?? 0)
    } else if (type === 'xp_total') {
      shouldAward = (profile?.xp_total ?? 0) >= Number(criteria.min_xp ?? 0)
    } else if (type === 'level') {
      shouldAward = (profile?.level ?? 1) >= Number(criteria.min_level ?? 0)
    } else if (type === 'streak') {
      shouldAward = (profile?.current_streak ?? 0) >= Number(criteria.min_streak ?? 0)
    } else if (type === 'perfect_session') {
      shouldAward = sessionPerfect
    } else if (type === 'correct_in_row') {
      shouldAward = bestCorrectRun >= Number(criteria.min_row ?? 0)
    } else if (type === 'overall_accuracy') {
      shouldAward = typedAttempts.length >= Number(criteria.min_attempts ?? 0) && accuracy >= Number(criteria.min_accuracy ?? 0)
    } else if (type === 'fast_correct_count') {
      shouldAward = fastCorrectCount >= Number(criteria.min_count ?? 0)
    }

    if (shouldAward) {
      await tx.userBadge.create({
        data: {
          user_id: input.userId,
          badge_id: badge.id,
        },
      })
      awarded.push({ slug: badge.slug, family: badge.family })
    }
  }

  return awarded
}

export { STARTER_BADGES }
