/**
 * Phase 7 — Daily Challenge.
 *
 * The 5-rep, Mystery-Mode, globally-seeded daily ritual that runs
 * parallel to the training loop. Composes a deterministic per-UTC-day
 * bundle from the LIVE catalog, allows exactly one per-user
 * personalization swap (transfer-probe), and produces a shareable
 * result string.
 *
 * Daily challenge attempts:
 *   - DO write Attempt rows (analytics)
 *   - DO tick the daily-challenge streak (independent from training)
 *   - DO NOT update mastery bands or training streak
 *   - DO NOT trigger lesson-refresh routing
 */
export {
  seedDailyChallenge,
  STANDARD_DAILY_SHAPE,
  BOSS_SUNDAY_SHAPE,
} from './seed'
export type { DailySeedInput, DailySeedResult, DailyCatalogScenario, DailySlot } from './seed'

export { composeDailyChallenge } from './compose'
export type { ComposeDailyInput, DailyChallengeBundle } from './compose'

export { buildDailyResult, inAppResultLines } from './result'
export type { DailyResult, DailyResultDot } from './result'

export { tickDailyStreak } from './streak'
export type { DailyStreakInput, DailyStreakResult } from './streak'
