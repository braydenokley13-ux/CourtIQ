/**
 * Pack 2 §3.1.14 / Replay-1 — visual regression phase ↔ DOM selector
 * mapping.
 *
 * The preview surface (`/dev/scenario-preview`) mirrors the live
 * `ReplayPhase` onto `<main data-replay-phase="…">`. The screenshot
 * harness reads that attribute to decide WHEN to capture each phase
 * frame deterministically — without guessing with wall-clock waits.
 *
 * This module is the single source of truth for that mapping and is
 * pure (no DOM access, no Playwright dep) so the contract can be
 * unit-tested in the node env. The Playwright caller composes
 * `phaseDomMatches` against the live attribute via `page.waitForFunction`.
 *
 * Why each phase accepts MULTIPLE ReplayPhase values:
 *
 *   - `load` — captures the intro before the freeze marker. Anything
 *      before `'frozen'` is acceptable: the canvas is up, lighting
 *      and the deterministic basketball texture are stable, no
 *      animation cue has fired. The set is `idle | setup | playing`.
 *   - `freeze` — captures the freeze pose specifically. Only
 *      `'frozen'` matches; the controller holds this state until a
 *      choice is picked or the leg expires.
 *   - `after` — captures whatever the controller transitions into
 *      AFTER the freeze marker. In intro mode (the preview default),
 *      the controller short-circuits to `'done'`. The
 *      consequence/replay legs cycle through `'consequence' →
 *      'cueRepaint' → 'replaying' → 'done'`; any of those four
 *      counts as "after" since they are all post-freeze observable
 *      states. The harness picks the FIRST one reached so its frame
 *      is reproducible.
 */
export type VisualPhase = 'load' | 'freeze' | 'after'

export type ReplayPhaseToken =
  | 'idle'
  | 'setup'
  | 'playing'
  | 'frozen'
  | 'consequence'
  | 'cueRepaint'
  | 'replaying'
  | 'done'

export const PHASE_DOM_MATCH: Readonly<
  Record<VisualPhase, ReadonlyArray<ReplayPhaseToken>>
> = {
  load: ['idle', 'setup', 'playing'],
  freeze: ['frozen'],
  after: ['consequence', 'cueRepaint', 'replaying', 'done'],
}

/**
 * Pure predicate the Playwright `waitForFunction` body composes against
 * a live attribute value.
 *
 *   - `false` — current phase exists but is not accepted yet; keep
 *     polling.
 *   - `true`  — current phase is accepted; harness can capture.
 *
 * `null` (no attribute, attribute empty) is the caller's responsibility
 * to detect — the harness treats that as "fall back to wall-clock"
 * rather than "wait forever," so we deliberately do NOT collapse it
 * into `false` here.
 */
export function phaseDomMatches(
  target: VisualPhase,
  current: string | null | undefined,
): boolean {
  if (current == null || current.length === 0) return false
  const accepted = PHASE_DOM_MATCH[target]
  return accepted.includes(current as ReplayPhaseToken)
}
