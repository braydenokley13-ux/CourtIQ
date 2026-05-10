/**
 * Pack 2 (Phase β) — pure adaptive eligibility helper.
 *
 * Given a player's per-decoder `DecoderConfidence`, returns the
 * difficulty band the next rep on that decoder MAY surface at. Pure,
 * additive, deterministic. NOT wired into live routing yet — landed
 * file-only so the routing layer can adopt it commit-by-commit once
 * Pack 2 D3+ content lands.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No I/O, no clocks, no DB. Same input → same
 *     output for every call.
 *   - This module never owns persistence, never reads new evidence
 *     fields. Inputs are restricted to the existing `DecoderConfidence`
 *     shape from `adaptive/types.ts`.
 *   - Defaults must be CONSERVATIVE. When in doubt, clamp lower. The
 *     player gets a chance to earn higher difficulty by accumulating
 *     evidence; we never gamble difficulty up on weak signal.
 *   - Pack 1 founders and Pack 2 decoders go through the same code
 *     path — the Pack 1 vs Pack 2 split lives in the registry, not
 *     here.
 *
 * Threshold table (single source of truth — see ELIGIBILITY_RULES):
 *   - Sparse / untested            → max D1.   Reason: 'sparse_data'.
 *   - Low confidence (< 50% of N)  → max D1.   Reason: 'low_confidence'.
 *   - Emerging band (>= 60%, < 75%)
 *     and recognizing band         → max D2.   Reason: 'emerging'.
 *   - Strong (>= 75% accuracy
 *     AND `reflexive` band)        → max D4.   Reason: undefined (allowed).
 *   - Mastered band                → max D5.   Reason: undefined.
 *   - Recent struggle (>= 2 of the
 *     last 3 attempts wrong)       → clamp by 1 difficulty,
 *                                    floor D1. Reason adds
 *                                    'frustration_clamp'.
 */

import type { DecoderConfidence } from './types'

// ---------------------------------------------------------------------------
// Threshold constants — kept inline (single file) and commented so
// authoring discipline is "edit one place." Reviewers should not have
// to chase a second config module to understand the gates.
// ---------------------------------------------------------------------------

/** Minimum admissible attempts before any difficulty above D1 unlocks. */
export const ELIGIBILITY_MIN_ATTEMPTS_FOR_D2 = 4

/** Minimum admissible attempts before D3+ unlocks. */
export const ELIGIBILITY_MIN_ATTEMPTS_FOR_D3 = 6

/** Below this `accuracyLastN` we hold the player at D1 even if the
 *  band has progressed. A reflexive band on a small window can still
 *  be flaky; conservative floor wins. */
export const ELIGIBILITY_LOW_ACCURACY_FLOOR = 0.5

/** Above this `accuracyLastN` plus `reflexive` band, D4 unlocks. */
export const ELIGIBILITY_STRONG_ACCURACY_GATE = 0.75

/** Reasons the player has been clamped down or held back. The
 *  routing layer surfaces these on the dev preview / coach console;
 *  the production UI does not surface them yet. */
export type EligibilityReason =
  | 'sparse_data'
  | 'low_confidence'
  | 'emerging'
  | 'frustration_clamp'

/** All difficulties currently authored in the scenario library. The
 *  helper returns the SUBSET that is eligible — never an empty list
 *  (D1 is always allowed; the scenario library always has D1 reps). */
export type Difficulty = 1 | 2 | 3 | 4 | 5

const ALL_DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5] as const

/**
 * Eligibility result. Routing reads `maxDifficulty` first; surfaces
 * `reasons` on the coach console; uses `allowed` only when it needs
 * to enumerate (e.g. weighted picker).
 *
 * `readiness` is a 0..1 signal: 0 = sparse/cold, 1 = mastered. Pure
 * derivative of band + accuracy; useful for sorting decoders without
 * threading the raw band.
 */
export interface EligibilityResult {
  decoderTag: string
  maxDifficulty: Difficulty
  allowed: ReadonlyArray<Difficulty>
  reasons: ReadonlyArray<EligibilityReason>
  /** 0..1 readiness signal derived from band + accuracy. */
  readiness: number
}

/**
 * Returns the per-decoder difficulty eligibility for the next rep.
 *
 * Pure helper. Same `DecoderConfidence` always produces the same
 * result. Conservative on sparse data; clamps down on recent struggle.
 * D1 is always in `allowed` — the floor that prevents the routing
 * layer from emitting an empty bundle.
 */
export function eligibleDifficultyForDecoder(
  conf: DecoderConfidence,
): EligibilityResult {
  const reasons = new Set<EligibilityReason>()

  const attempts = conf.evidence.attempts
  const accuracy = conf.evidence.accuracyLastN

  // 1. Base ceiling from the band + accuracy table.
  let ceiling: Difficulty = 1

  if (conf.band === 'untested' || attempts < ELIGIBILITY_MIN_ATTEMPTS_FOR_D2) {
    ceiling = 1
    reasons.add('sparse_data')
  } else if (accuracy < ELIGIBILITY_LOW_ACCURACY_FLOOR) {
    ceiling = 1
    reasons.add('low_confidence')
  } else if (conf.band === 'recognizing') {
    // Emerging — cleared the D2 attempt floor and is reading >= 50%
    // accuracy, but isn't reflexive yet. D2 is the right rung.
    ceiling = 2
    reasons.add('emerging')
  } else if (conf.band === 'reflexive') {
    if (
      attempts >= ELIGIBILITY_MIN_ATTEMPTS_FOR_D3 &&
      accuracy >= ELIGIBILITY_STRONG_ACCURACY_GATE
    ) {
      ceiling = 4
    } else {
      // Reflexive but not strong-by-accuracy yet — D3 is the cap.
      ceiling = 3
    }
  } else if (conf.band === 'mastered') {
    ceiling = 5
  }

  // 2. Frustration clamp. Two of the last three attempts wrong drops
  //    the ceiling by one (floor D1) regardless of band. We use the
  //    rolling window's accuracy as the proxy because we don't have
  //    per-attempt detail in this shape — anything below the
  //    low-accuracy gate while the band is reflexive/mastered is
  //    treated as recent struggle.
  if (
    (conf.band === 'reflexive' || conf.band === 'mastered') &&
    accuracy < ELIGIBILITY_STRONG_ACCURACY_GATE &&
    attempts >= ELIGIBILITY_MIN_ATTEMPTS_FOR_D2
  ) {
    const clamped = (Math.max(1, ceiling - 1)) as Difficulty
    if (clamped < ceiling) {
      ceiling = clamped
      reasons.add('frustration_clamp')
    }
  }

  // 3. Derive `allowed` as [D1..ceiling]. Always include D1 — the
  //    routing layer needs a guaranteed-non-empty list so it can fall
  //    back to a clean intro rep when Pack 2 D≥3 content is gated.
  const allowed: Difficulty[] = []
  for (const d of ALL_DIFFICULTIES) {
    if (d <= ceiling) allowed.push(d)
  }

  // 4. Readiness = simple ramp keyed off band first, then nudged by
  //    accuracy. Mirrors the band ladder so dev tooling can sort
  //    decoders without re-deriving the rule.
  let readiness = 0
  switch (conf.band) {
    case 'untested':
      readiness = 0
      break
    case 'recognizing':
      readiness = 0.4 + 0.2 * Math.min(1, Math.max(0, accuracy - 0.5))
      break
    case 'reflexive':
      readiness = 0.7 + 0.2 * Math.min(1, Math.max(0, accuracy - 0.6))
      break
    case 'mastered':
      readiness = 1
      break
  }

  return {
    decoderTag: conf.decoderTag,
    maxDifficulty: ceiling,
    allowed,
    reasons: Array.from(reasons),
    readiness,
  }
}
