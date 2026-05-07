/**
 * V3 P9 — first-rep ("first great session") helpers.
 *
 * Pure helpers that decide when /train should run in cold-start mode —
 * the player's very first scenario of their very first session.
 *
 * Cold-start mode strips out chrome that telegraphs the answer or
 * competes with the canvas (decoder pill + one-liner, phase tracker,
 * XP/IQ/streak chips, difficulty tag, timer) and reveals the decoder
 * name only AFTER the rep, so the player feels recognition instead of
 * being told what to look for. The intent is the V3 emotional arc:
 *
 *   confusion → recognition → understanding → satisfaction → momentum
 *
 * Suppression is intentionally restricted to:
 *   - the player has zero prior attempts (brand new), AND
 *   - this is the first scenario of the session (idx === 0), AND
 *   - the run isn't a boss / mixed challenge mode (those already hide
 *     the decoder pill themselves; we don't fight them here).
 *
 * Once the player has a single rep on the books, every subsequent rep
 * runs in normal mode — the player has earned the dashboard.
 */

export interface FirstRepInput {
  /** Total prior attempts on the user's profile. `null` = unknown
   *  (still loading); we treat that as not-first so we don't flash
   *  cold-start chrome and then snap back. */
  attemptsCount: number | null
  /** Index of the current scenario in the active session run. */
  scenarioIndex: number
  /** True when the active run is a Pathway boss / mixed-reads mode.
   *  Those modes already strip the decoder pill themselves; we don't
   *  layer on top of them. */
  isChallengeMode: boolean
}

export function isFirstRep(input: FirstRepInput): boolean {
  if (input.isChallengeMode) return false
  if (input.attemptsCount === null) return false
  if (input.attemptsCount > 0) return false
  return input.scenarioIndex === 0
}

export interface FirstRepCues {
  /** Eyebrow shown above the canvas in place of the decoder pill. */
  eyebrow: string
  /** Soft framing line — replaces the pre-freeze "Read · ..." copy. */
  framing: string
  /** Headline shown in the WinBurst when the player gets the read on
   *  rep 1. Names the decoder for the FIRST time, so the player
   *  experiences recognition instead of pre-loaded labelling. */
  recognitionHeadline: (decoderLabel: string) => string
  /** Sub-line under the recognition headline. The basketball-language
   *  one-liner the rest of the app already owns is the right voice
   *  here, so callers pass it in instead of duplicating copy. */
  recognitionSub: (decoderOneLiner: string) => string
  /** Headline shown in the FeedbackPanel when the player misses. We
   *  still want to NAME the pattern after the rep — they need a noun
   *  for what they just saw on the replay. */
  recoveryHeadline: (decoderLabel: string) => string
}

export const FIRST_REP_CUES: FirstRepCues = {
  eyebrow: 'Your first read',
  framing: 'Watch the play. Pick what should happen.',
  recognitionHeadline: (label) => `You saw the ${label}.`,
  recognitionSub: (oneLiner) => oneLiner,
  recoveryHeadline: (label) => `That was the ${label}.`,
}

/** Convenience wrapper used by /train so the JSX doesn't re-read the
 *  module-level constant. */
export function getFirstRepCues(): FirstRepCues {
  return FIRST_REP_CUES
}
