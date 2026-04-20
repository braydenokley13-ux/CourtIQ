/**
 * WS-4 Progression analytics — call from the matching service functions:
 *
 * iq_updated        → iqService.applyAttempt (after DB write)
 * level_up          → xpService.award (when new level is detected)
 * streak_extended   → streakService.tick (streak++ branch)
 * streak_broken     → streakService.tick (reset branch, no freeze available)
 * streak_freeze_used → streakService.tick (freeze consumed branch)
 * badge_earned      → badgeService.checkAndAward (each newly awarded badge)
 * module_started    → masteryService.update (first attempt against a module)
 * module_completed  → masteryService.update (rolling_accuracy >= 0.80 && attempts_count >= 10)
 */
import { track } from '@/lib/analytics/events'
import type { BadgeFamily } from '@courtiq/core'

export function trackIqUpdated(props: {
  iq_before: number
  iq_after: number
  delta: number
  source: 'scenario' | 'calibration'
}): void {
  track('iq_updated', props)
}

export function trackLevelUp(props: {
  level_before: number
  level_after: number
  xp_total: number
}): void {
  track('level_up', props)
}

export function trackStreakExtended(streak_current: number): void {
  track('streak_extended', { streak_current })
}

export function trackStreakBroken(streak_previous: number): void {
  track('streak_broken', { streak_previous })
}

export function trackStreakFreezeUsed(streak_current: number): void {
  track('streak_freeze_used', { streak_current })
}

export function trackBadgeEarned(badge_slug: string, family: BadgeFamily): void {
  track('badge_earned', { badge_slug, family })
}

export function trackModuleStarted(module_slug: string): void {
  track('module_started', { module_slug })
}

export function trackModuleCompleted(module_slug: string, mastery_score: number): void {
  track('module_completed', { module_slug, mastery_score })
}
