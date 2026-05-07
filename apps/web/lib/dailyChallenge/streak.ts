/**
 * Phase 7 — Daily Challenge: completion-based streak.
 *
 * Independent from the training streak. Rules:
 *   - Completed today (any score, including 0/5) → +1
 *   - Skipped today (no completion) → reset to 0
 *   - Completing again same day → no change (idempotent)
 *
 * Pure function. The caller passes the previous streak + the last
 * completion date + today's UTC date.
 */

export interface DailyStreakInput {
  /** Previous daily-challenge streak count. 0 for new players. */
  previous: number
  /** UTC date string ("YYYY-MM-DD") of the player's last daily
   *  completion. null when the player has never completed one. */
  lastCompletedDate: string | null
  /** UTC date string for today. */
  todayDate: string
}

export interface DailyStreakResult {
  current: number
  /** True when this completion extended the streak. */
  extended: boolean
  /** True when the streak reset to 1 due to a missed day. */
  reset: boolean
  /** True when the player already completed today's daily and we
   *  no-op'd. */
  idempotent: boolean
}

export function tickDailyStreak(input: DailyStreakInput): DailyStreakResult {
  if (input.lastCompletedDate === input.todayDate) {
    return { current: input.previous, extended: false, reset: false, idempotent: true }
  }

  if (input.lastCompletedDate === null) {
    // First-ever completion.
    return { current: 1, extended: true, reset: false, idempotent: false }
  }

  const days = utcDayDiff(input.lastCompletedDate, input.todayDate)
  if (days === 1) {
    return { current: input.previous + 1, extended: true, reset: false, idempotent: false }
  }
  // Missed at least one day → reset to 1 (today's completion still
  // counts as the start of a new streak).
  return { current: 1, extended: false, reset: true, idempotent: false }
}

/** Days from `from` to `to`. Negative when `to` precedes `from`. */
function utcDayDiff(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  return Math.round((toMs - fromMs) / 86400000)
}
