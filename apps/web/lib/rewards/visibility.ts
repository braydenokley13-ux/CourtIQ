/**
 * V3 P11 P8 — reward visibility helpers.
 *
 * Centralize the small rules that decide WHEN reward chrome shows up,
 * so the "calm by default, warm only when earned" stance from V3 P11
 * P4 can't drift back into a Vegas HUD.
 *
 * Currently this module owns one rule:
 *
 *   shouldShowStreakChip(streak)
 *     The streak chip only shows past 1. A "1-streak" is just a single
 *     correct rep — surfacing it as a flame chip turns every win into
 *     gamified momentum noise. Two in a row is the smallest read of
 *     genuine momentum.
 *
 * Other helpers will land here as we extract them; keeping them
 * co-located means a future tone-pass can audit the file and see every
 * gate in one place.
 */

export function shouldShowStreakChip(streak: number): boolean {
  return Number.isFinite(streak) && streak > 1
}
