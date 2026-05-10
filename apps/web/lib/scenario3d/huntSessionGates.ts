/**
 * Phase γ — HUNT session-generator soft gates.
 *
 * Pure helpers (no DB, no clock, no globals) the session generator
 * runs over a planned scenario bundle to enforce the cognitive-load
 * gates from `docs/curriculum/HUNT_DECODER_DESIGN.md` §5.4–§5.8 and
 * `PACK2_ARCHITECTURE_RISKS_AND_NEXT_STEPS.md` §1.7–§1.8.
 *
 * Why session-level (not template-lint):
 *   These rules are about the *shape of a session* (what's queued
 *   together, in what order). Template lint can only see one scenario
 *   at a time. Bundling is a session-generator concern, hence:
 *   `scenarioService.generateSessionBundle` runs each planned bundle
 *   through these gates after weighted selection but before persisting
 *   the `SessionRun`.
 *
 * Gate summary (each implemented as a single pure function):
 *
 *   1. `isHuntEligibleForUser` — keep HUNT out of the candidate pool
 *      for under-calibrated users (IQ < 700 within their first 60
 *      days). Implemented as a deweight-to-zero, not a hard exclude;
 *      callers wire it as an early-stage filter on the decoder pool.
 *
 *   2. `dedupeBackToBackHunt` — the chained two-beat envelope (~5.5s)
 *      makes back-to-back HUNT exhausting. Reorder so no two HUNT
 *      scenarios sit adjacent in the bundle. Degenerate input
 *      (all-HUNT) is returned unchanged.
 *
 *   3. `enforceHuntCountCap` — for users with HUNT mastery < 0.6,
 *      cap HUNT count at 1 per 5-scenario session. Mastery ≥ 0.6
 *      removes the cap.
 *
 *   4. `excludeSkrWhenHuntPresent` — implements LINT-HUNT-06: below
 *      HUNT mastery 0.6, HUNT and SKR (`SKIP_THE_ROTATION`) cannot
 *      co-occur in the same bundle. Drop HUNT, keep SKR (SKR is the
 *      more established decoder; we'd rather teach what the player
 *      already half-knows than confuse them with the chained variant).
 *
 *   5. `huntXpMultiplier` — D3+ HUNT awards proportionally more XP
 *      so per-XP time stays reasonable for the longer envelope. The
 *      multiplier is a pure function over difficulty; wiring into
 *      xpService is a follow-up.
 *
 * All five are pure: same input ⇒ same output, no I/O. Tests live in
 * `huntSessionGates.test.ts`.
 */

import type { DecoderTag } from './schema'

/** Decoder tag for HUNT scenarios. Aliased for readability. */
const HUNT: DecoderTag = 'HUNT_THE_ADVANTAGE'
/** Decoder tag for SKR (skip-the-rotation). LINT-HUNT-06 conflict pair. */
const SKR: DecoderTag = 'SKIP_THE_ROTATION'

/** Minimum scenario shape the gates need. Kept structural (no Prisma)
 *  so callers can pass either DB rows or planned-pick descriptors. */
export interface PlannedScenario {
  id: string
  decoder_tag: DecoderTag | null
}

/** Calibration window during which under-700-IQ users get HUNT
 *  filtered out of their candidate pool. */
export const HUNT_CALIBRATION_DAYS = 60

/** IQ floor below which HUNT is filtered during the calibration
 *  window. Above this floor, HUNT is always eligible regardless of
 *  calibration age. */
export const HUNT_IQ_FLOOR = 700

/** Mastery threshold below which session-shape gates engage (count
 *  cap, SKR co-occurrence ban). At/above this threshold the gates
 *  no-op. */
export const HUNT_MASTERY_THRESHOLD = 0.6

/** Pure HUNT eligibility check. Returns false only when the user is
 *  *both* under the IQ floor AND still in their calibration window.
 *  A user past 60 days is always eligible (the calibration window
 *  has closed); a user above the IQ floor is always eligible
 *  regardless of calibration age.
 *
 *  Caller must pre-compute `daysSinceCalibration` so this stays
 *  clock-free. Pass `Number.POSITIVE_INFINITY` (or any value > 60)
 *  for users without a calibration timestamp — they fall outside
 *  the window by definition. */
export function isHuntEligibleForUser(profile: {
  iq_score: number
  daysSinceCalibration: number
}): boolean {
  if (profile.iq_score >= HUNT_IQ_FLOOR) return true
  if (profile.daysSinceCalibration >= HUNT_CALIBRATION_DAYS) return true
  return false
}

/** Returns a new array with no two HUNT scenarios adjacent. Walks the
 *  array left-to-right; when it spots a HUNT directly after another
 *  HUNT, swaps the second HUNT with the next non-HUNT scenario it can
 *  find ahead in the bundle. If no swap candidate exists (e.g. the
 *  whole bundle is HUNT), returns the input untouched — callers should
 *  treat that as the degenerate "we tried, can't fix it" case rather
 *  than dropping reps. */
export function dedupeBackToBackHunt<T extends PlannedScenario>(
  plannedScenarios: readonly T[],
): T[] {
  const out = [...plannedScenarios]
  const isHunt = (s: T | undefined): boolean => s?.decoder_tag === HUNT

  for (let i = 1; i < out.length; i++) {
    if (!isHunt(out[i]) || !isHunt(out[i - 1])) continue
    // Find the next non-HUNT to swap with.
    let swapIdx = -1
    for (let j = i + 1; j < out.length; j++) {
      if (!isHunt(out[j])) {
        swapIdx = j
        break
      }
    }
    if (swapIdx === -1) {
      // Degenerate: only HUNTs remain. Bail out without mutating.
      return [...plannedScenarios]
    }
    const tmp = out[i]!
    out[i] = out[swapIdx]!
    out[swapIdx] = tmp
  }

  return out
}

/** Caps HUNT count at 1 when HUNT mastery is below threshold. The
 *  first HUNT is kept (preserving order); subsequent HUNTs are
 *  dropped. Returns the bundle untouched when mastery is at/above
 *  threshold. The player's pool is preserved otherwise — non-HUNT
 *  scenarios pass through. */
export function enforceHuntCountCap<T extends PlannedScenario>(
  plannedScenarios: readonly T[],
  huntMasteryRollingAccuracy: number,
): T[] {
  if (huntMasteryRollingAccuracy >= HUNT_MASTERY_THRESHOLD) {
    return [...plannedScenarios]
  }
  const out: T[] = []
  let huntSeen = 0
  for (const s of plannedScenarios) {
    if (s.decoder_tag === HUNT) {
      if (huntSeen > 0) continue
      huntSeen++
    }
    out.push(s)
  }
  return out
}

/** LINT-HUNT-06 enforcer. When HUNT mastery is below threshold AND
 *  both HUNT and SKR appear in the bundle, drop the HUNT scenarios.
 *  Rationale: SKR is the more established decoder; for a confused
 *  learner, drilling the half-known decoder is more productive than
 *  mixing it with its chained cousin. At/above mastery threshold,
 *  no-op (the player can disambiguate them). */
export function excludeSkrWhenHuntPresent<T extends PlannedScenario>(
  plannedScenarios: readonly T[],
  huntMasteryRollingAccuracy: number,
): T[] {
  if (huntMasteryRollingAccuracy >= HUNT_MASTERY_THRESHOLD) {
    return [...plannedScenarios]
  }
  const hasHunt = plannedScenarios.some((s) => s.decoder_tag === HUNT)
  const hasSkr = plannedScenarios.some((s) => s.decoder_tag === SKR)
  if (!hasHunt || !hasSkr) return [...plannedScenarios]
  return plannedScenarios.filter((s) => s.decoder_tag !== HUNT)
}

/** Per-difficulty XP multiplier for HUNT scenarios. Soft requirement
 *  from §1.8: HUNT D3+ awards proportionally more XP so the player's
 *  perceived time-per-XP stays reasonable across the longer chained
 *  envelope. Out-of-range difficulties clamp to [1, 5].
 *
 *  Ladder (per design §5.1):
 *    D1, D2 → 1.0× (no bonus; the cognitive load increase is small)
 *    D3     → 1.4×
 *    D4     → 1.5×
 *    D5     → 1.7×
 *
 *  This is a multiplier *only* — callers gate it on
 *  `decoderTag === 'HUNT_THE_ADVANTAGE'` before applying. */
export function huntXpMultiplier(difficulty: number): number {
  // Clamp + integer-coerce so e.g. NaN/Infinity/floats don't slip
  // through. We treat "unknown" as D1 (the conservative floor).
  const d = Number.isFinite(difficulty)
    ? Math.max(1, Math.min(5, Math.round(difficulty)))
    : 1
  switch (d) {
    case 3:
      return 1.4
    case 4:
      return 1.5
    case 5:
      return 1.7
    default:
      // D1, D2 (and clamped sub-1 / >5 inputs)
      return 1.0
  }
}
