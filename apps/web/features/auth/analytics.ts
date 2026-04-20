/**
 * WS-1 Auth analytics — call these at the exact moment the event fires.
 *
 * auth_signup  → after supabase.auth.signUp / signInWithOAuth resolves OK
 * identify     → after the session is confirmed (onAuthStateChange SIGNED_IN)
 * resetIdentity → on SIGNED_OUT
 */
import { track, identify, resetIdentity } from '@/lib/analytics/events'

export function trackSignup(method: 'email' | 'google'): void {
  track('auth_signup', { method })
}

export { identify, resetIdentity }
