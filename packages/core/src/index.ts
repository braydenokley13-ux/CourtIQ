export type Position = 'pg' | 'sg' | 'sf' | 'pf' | 'c' | 'guard' | 'wing' | 'big' | 'unknown'

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'pro'

export type BadgeFamily = 'streak' | 'mastery' | 'iq' | 'volume' | 'special'

export const level = {
  fromXp(totalXp: number): number {
    return Math.max(1, Math.floor(totalXp / 100) + 1)
  },

  rankLabel(levelValue: number): string {
    if (levelValue >= 40) return 'Hall of Fame'
    if (levelValue >= 30) return 'All-Star'
    if (levelValue >= 20) return 'Starter'
    if (levelValue >= 10) return 'Rotation'
    return 'Rookie'
  },
}

export const xp = {
  award(baseAmount: number, difficulty: number): number {
    const normalizedBase = Math.max(1, Math.round(baseAmount))
    const difficultyBonus = Math.max(0, Math.round((difficulty - 1) * 2))
    return normalizedBase + difficultyBonus
  },
}

export const iq = {
  applyAttempt(
    scenario: { difficulty: number },
    attempt: { isCorrect: boolean },
    timeMs: number,
    currentIq: number,
  ): { after: number; delta: number } {
    const difficultyFactor = Math.max(1, scenario.difficulty)
    const speedFactor = timeMs <= 4000 ? 1 : 0
    const correctnessDelta = attempt.isCorrect ? 4 + difficultyFactor : -(3 + difficultyFactor)
    const delta = correctnessDelta + (attempt.isCorrect ? speedFactor : 0)
    const after = Math.max(0, currentIq + delta)
    return { after, delta }
  },
}

export const mastery = {
  update(
    current: { attempts: number; accuracy: number },
    isCorrect: boolean,
  ): { attempts: number; accuracy: number } {
    const attempts = current.attempts + 1
    const correctAttemptsEstimate = current.accuracy * current.attempts + (isCorrect ? 1 : 0)
    const accuracy = Number((correctAttemptsEstimate / attempts).toFixed(4))
    return { attempts, accuracy }
  },
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function daysBetween(left: Date, right: Date): number {
  const l = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate())
  const r = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate())
  return Math.round((r - l) / (24 * 60 * 60 * 1000))
}

export const streak = {
  tick(lastEventDate: Date | null, today: Date, currentStreak: number) {
    if (!lastEventDate) {
      return {
        dateKey: toDateKey(today),
        current: 1,
        extended: true,
        broken: false,
        unchanged: false,
      }
    }

    const diff = daysBetween(lastEventDate, today)

    if (diff <= 0) {
      return {
        dateKey: toDateKey(today),
        current: currentStreak,
        extended: false,
        broken: false,
        unchanged: true,
      }
    }

    if (diff === 1) {
      return {
        dateKey: toDateKey(today),
        current: currentStreak + 1,
        extended: true,
        broken: false,
        unchanged: false,
      }
    }

    return {
      dateKey: toDateKey(today),
      current: 1,
      extended: false,
      broken: true,
      unchanged: false,
    }
  },
}
