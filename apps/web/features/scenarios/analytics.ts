/**
 * WS-3 Scenario / Session analytics — call at these exact moments:
 *
 * session_started    → client receives the POST /api/session/start response
 * scenario_presented → scenario component mounts (useEffect on scenario index change)
 * scenario_answered  → POST /api/session/:id/attempt responds with iq_delta + xp_delta
 * session_completed  → client receives the POST /api/session/:id/complete response
 */
import { track } from '@/lib/analytics/events'

export function trackSessionStarted(props: {
  session_run_id: string
  scenario_count: number
  user_iq: number
}): void {
  track('session_started', props)
}

export function trackScenarioPresented(props: {
  session_run_id: string
  scenario_id: string
  difficulty: number
  concept_tags: string[]
  order: number
}): void {
  track('scenario_presented', props)
}

export function trackScenarioAnswered(props: {
  session_run_id: string
  scenario_id: string
  choice_id: string
  is_correct: boolean
  time_ms: number
  iq_delta: number
  xp_delta: number
}): void {
  track('scenario_answered', props)
}

export function trackSessionCompleted(props: {
  session_run_id: string
  correct_count: number
  total: number
  xp_earned: number
  iq_delta: number
  duration_ms: number
}): void {
  track('session_completed', props)
}
