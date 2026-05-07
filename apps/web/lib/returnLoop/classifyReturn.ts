/**
 * Phase 6 — Return Loop classifier.
 *
 * Maps (days since last session, lifetime attempts) → one of six
 * deterministic return contexts. Each context has a tuned bundle
 * shape and banner copy authored in ./composeReturn.ts.
 *
 * Pure function. No I/O. No randomness.
 */

export type ReturnContext =
  /** Player has 0 lifetime attempts. The first-session arc owns this
   *  case (Phase 5); we surface this context only so callers can
   *  branch into the firstSession composer. */
  | 'fresh-cold'
  /** A second session inside the same UTC day. */
  | 'next-session-same-day'
  /** 1–2 days since last session. */
  | 'next-day'
  /** 3–7 days. */
  | 'within-week'
  /** 8–14 days. */
  | 'lapsed'
  /** 15–29 days. */
  | 'long-lapsed'
  /** 30+ days. Treated as a re-introduction; decoder bands are
   *  preserved but the bundle reuses the first-session arc. */
  | 'dormant'

export interface ClassifyReturnInput {
  /** Total lifetime Attempt rows for this user. 0 = brand-new player. */
  lifetimeAttempts: number
  /** Whole days since last session start. 0 = same day. null when the
   *  user has no prior sessions. */
  daysSinceLastSession: number | null
}

export function classifyReturn(input: ClassifyReturnInput): ReturnContext {
  if (input.lifetimeAttempts === 0 || input.daysSinceLastSession === null) {
    return 'fresh-cold'
  }
  const d = input.daysSinceLastSession
  if (d <= 0) return 'next-session-same-day'
  if (d <= 2) return 'next-day'
  if (d <= 7) return 'within-week'
  if (d <= 14) return 'lapsed'
  if (d <= 29) return 'long-lapsed'
  return 'dormant'
}

/** Convenience: human-readable banner copy per context. The
 *  composeReturn module owns the bundle shape; the banner lives
 *  alongside the classifier so it's never out-of-sync. */
export function returnBanner(ctx: ReturnContext): string | null {
  switch (ctx) {
    case 'fresh-cold':
      return null // first-session arc carries its own framing
    case 'next-session-same-day':
      return 'Stay sharp.'
    case 'next-day':
      return 'Picking up where you left off.'
    case 'within-week':
      return "Still seeing it. Let's keep building."
    case 'lapsed':
      return "Welcome back. Let's read three you already know."
    case 'long-lapsed':
      return "It's been a minute. One read at a time."
    case 'dormant':
      return null // composeReturn names a specific decoder
  }
}
