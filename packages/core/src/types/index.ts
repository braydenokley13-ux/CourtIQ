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

/** Calculates IQ delta using ELO-style formula. Difficulty 1–5. */
export function calcIQDelta(
  userIQ: number,
  difficulty: number,
  isCorrect: boolean,
  timeMs: number
): number {
  const K = 32
  const scenarioDifficulty = 400 + difficulty * 80
  const expected = 1 / (1 + Math.pow(10, (scenarioDifficulty - userIQ) / 400))
  const actual = isCorrect ? 1 : 0
  const speedBonus = isCorrect && timeMs < 8000 ? 2 : 0
  return Math.round(K * (actual - expected) + speedBonus)
}

/** XP reward for a scenario attempt. */
export function calcXP(isCorrect: boolean, xpReward: number, streak: number): number {
  if (!isCorrect) return Math.round(xpReward * 0.2)
  const streakMultiplier = streak >= 5 ? 1.5 : streak >= 3 ? 1.25 : 1
  return Math.round(xpReward * streakMultiplier)
}

/** Level thresholds — level = floor(sqrt(xp_total / 50)) + 1, capped at 100. */
export function xpToLevel(xpTotal: number): number {
  return Math.min(100, Math.floor(Math.sqrt(xpTotal / 50)) + 1)
}
