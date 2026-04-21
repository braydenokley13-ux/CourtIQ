export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C' | 'ALL'
export type SkillLevel = 'ROOKIE' | 'VARSITY' | 'ELITE'
export type UserRole = 'PLAYER' | 'PARENT' | 'COACH' | 'TRAINER' | 'ADMIN'
export type Category = 'OFFENSE' | 'DEFENSE' | 'TRANSITION' | 'SITUATIONAL'
export type ScenarioStatus = 'DRAFT' | 'REVIEW' | 'LIVE' | 'RETIRED'
export type BadgeFamily = 'CONCEPT' | 'MILESTONE' | 'ACCURACY'

export interface IQDelta {
  before: number
  after: number
  delta: number
  source: 'scenario' | 'calibration'
}

export interface XPAward {
  amount: number
  reason: string
  level_before: number
  level_after: number
}

const DIFFICULTY_MULTIPLIER: Record<number, number> = {
  1: 0.6,
  2: 0.8,
  3: 1,
  4: 1.3,
  5: 1.7,
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dayDiff(lastDate: Date, today: Date): number {
  const last = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate())
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.floor((current - last) / 86_400_000)
}

export const iq = {
  applyAttempt(
    scenario: { difficulty: number },
    choice: { isCorrect: boolean },
    timeMs: number,
    currentIq: number,
  ): { delta: number; before: number; after: number; speedMultiplier: number } {
    const base = 8
    const difficultyMultiplier = DIFFICULTY_MULTIPLIER[scenario.difficulty] ?? 1
    const correctness = choice.isCorrect ? 1 : -0.5
    const speedMultiplier =
      timeMs < 3000 ? 1.2 :
      timeMs < 7000 ? 1 :
      timeMs < 15000 ? 0.9 :
      0.75

    const iqDelta = Math.round(base * difficultyMultiplier * correctness * speedMultiplier)
    const after = clamp(currentIq + iqDelta, 0, 2000)

    return {
      before: currentIq,
      after,
      delta: after - currentIq,
      speedMultiplier,
    }
  },
}

export const xp = {
  award(amount: number, difficulty: number): number {
    const difficultyMultiplier = DIFFICULTY_MULTIPLIER[difficulty] ?? 1
    return Math.round(amount * difficultyMultiplier)
  },
}

export const mastery = {
  update(
    rolling: { attempts: number; accuracy: number },
    isCorrect: boolean,
  ): { attempts: number; accuracy: number } {
    const attempts = rolling.attempts + 1
    const accuracy = ((rolling.accuracy * rolling.attempts) + (isCorrect ? 1 : 0)) / attempts
    return { attempts, accuracy }
  },
}

export const streak = {
  tick(
    lastDate: Date | null,
    today: Date,
    current = 0,
  ): { current: number; extended: boolean; broken: boolean; unchanged: boolean; dateKey: string } {
    const dateKey = toUtcDateKey(today)
    if (!lastDate) {
      return { current: Math.max(1, current), extended: true, broken: false, unchanged: false, dateKey }
    }

    const diff = dayDiff(lastDate, today)
    if (diff <= 0) {
      return { current, extended: false, broken: false, unchanged: true, dateKey }
    }

    if (diff === 1) {
      return { current: current + 1, extended: true, broken: false, unchanged: false, dateKey }
    }

    return { current: 1, extended: false, broken: true, unchanged: false, dateKey }
  },
}

export const level = {
  fromXp(xpTotal: number): number {
    return clamp(Math.floor(Math.max(0, xpTotal) / 100) + 1, 1, 50)
  },

  rankLabel(levelNumber: number): string {
    if (levelNumber <= 5) return 'Rookie'
    if (levelNumber <= 15) return 'Starter'
    if (levelNumber <= 25) return 'Sixth Man of the Year'
    if (levelNumber <= 35) return 'All-Star'
    if (levelNumber <= 45) return 'Floor General'
    return 'Maestro'
  },
}
