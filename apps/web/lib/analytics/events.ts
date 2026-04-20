'use client'

import type { Position, SkillLevel, BadgeFamily } from '@courtiq/core'

type EventMap = {
  // Auth & onboarding
  auth_signup: { method: 'email' | 'google' }
  onboarding_completed: {
    age: number | 'hidden'
    position: Position
    skill: SkillLevel
    goal: string
    starting_iq: number
  }

  // Session lifecycle
  session_started: { session_run_id: string; scenario_count: number; user_iq: number }
  scenario_presented: {
    session_run_id: string
    scenario_id: string
    difficulty: number
    concept_tags: string[]
    order: number
  }
  scenario_answered: {
    session_run_id: string
    scenario_id: string
    choice_id: string
    is_correct: boolean
    time_ms: number
    iq_delta: number
    xp_delta: number
  }
  session_completed: {
    session_run_id: string
    correct_count: number
    total: number
    xp_earned: number
    iq_delta: number
    duration_ms: number
  }

  // Progression
  iq_updated: { iq_before: number; iq_after: number; delta: number; source: 'scenario' | 'calibration' }
  level_up: { level_before: number; level_after: number; xp_total: number }
  streak_extended: { streak_current: number }
  streak_broken: { streak_previous: number }
  streak_freeze_used: { streak_current: number }
  badge_earned: { badge_slug: string; family: BadgeFamily }
  module_started: { module_slug: string }
  module_completed: { module_slug: string; mastery_score: number }

  // Social / retention
  share_click: { surface: string }
  leaderboard_view: { period: 'weekly'; scope: 'global' | 'friends' }

  // Monetization (v1+)
  paywall_shown: { trigger: string }
  subscription_started: { plan: 'pro_monthly' | 'pro_annual' }
  subscription_cancelled: { plan: string; tenure_days: number }
}

export async function track<E extends keyof EventMap>(
  event: E,
  properties: EventMap[E]
): Promise<void> {
  if (typeof window === 'undefined') return
  const posthog = await import('posthog-js').then((m) => m.default)
  posthog.capture(event, properties)
}
