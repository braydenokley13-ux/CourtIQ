/**
 * FR-5 — Adaptive Cue Overlays.
 *
 * Pure helper for the overlay-level model. The same authored scenario
 * should read differently across Pathways modes — Learn the Cue mounts
 * the full cue cluster, Boss Challenge mounts nothing. Per the plan
 * (Section 9.2 / 9.3) this is data, not policy: the renderer reads the
 * level the Pathways layer chose and projects the scene's authored
 * overlay arrays through this filter.
 *
 * Architecture lock:
 *   - Pure functions. No THREE.js, no scene reads, no clocks, no I/O.
 *   - Same inputs always produce the same outputs. The input arrays are
 *     never mutated; new arrays are returned even when nothing was
 *     dropped, so callers can rely on referential identity changes to
 *     trigger re-mounts.
 *   - Pre-answer filter never widens past `PRE_ANSWER_OVERLAY_KINDS` —
 *     the schema-side allow-list is the source of truth and this
 *     helper is defense in depth.
 */

import {
  PRE_ANSWER_OVERLAY_KINDS,
  isAllowedPreAnswerOverlay,
  type DecoderTag,
  type OverlayPrimitive,
} from './schema'

export type OverlayLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'none'
  | 'review'

export const DEFAULT_OVERLAY_LEVEL: OverlayLevel = 'beginner'

/**
 * Per-level budget for the pre-answer (cue cluster) and post-answer
 * (reveal) overlay sets. The plan's §9.2 table is the source of truth:
 *
 * | Mode (Pathways) | Pre | Post |
 * | --- | --- | --- |
 * | Learn the Cue (beginner)     | 3 | 3 |
 * | Freeze-Frame Read (intermed.)| 2 | 2 |
 * | No-Hint Rep (advanced)       | 1 | 1 |
 * | Boss Challenge (none)        | 0 | 0 |
 * | Film Room Review (review)    | ∞ | ∞ |
 *
 * `Infinity` denotes "no cap" — `applyOverlayLevel` short-circuits
 * the slice when the budget is `Infinity`.
 */
export interface OverlayBudget {
  /** Maximum pre-answer overlays after filtering. */
  preMax: number
  /** Maximum post-answer overlays after filtering. */
  postMax: number
}

const BUDGETS: Readonly<Record<OverlayLevel, OverlayBudget>> = Object.freeze({
  beginner: { preMax: 3, postMax: 3 },
  intermediate: { preMax: 2, postMax: 2 },
  advanced: { preMax: 1, postMax: 1 },
  none: { preMax: 0, postMax: 0 },
  review: { preMax: Number.POSITIVE_INFINITY, postMax: Number.POSITIVE_INFINITY },
})

export function getOverlayBudget(level: OverlayLevel): OverlayBudget {
  return BUDGETS[level]
}

/**
 * Pack 2 Teaching-Quality F4 — single difficulty axis at runtime.
 *
 * Resolves the authored overlay count, the runtime Pathways cap, and a
 * mandatory cue floor into one effective budget. Used by
 * `applyOverlayLevel` so the two historically independent axes
 * (authoring difficulty caps in `materialize-templates.ts` and runtime
 * Pathways caps here) compose into a single coherent answer per scene.
 *
 * Semantics:
 *   - Never returns more than `authoredCount` — the helper cannot
 *     invent overlays.
 *   - Never returns less than `min(authoredCount, mandatoryCueFloor)` —
 *     the floor is bounded by what was actually authored, so an empty
 *     authored list still resolves to 0 even if the floor is 1.
 *   - Otherwise honours `pathwayCap` as the ceiling.
 *
 * Inputs are clamped to non-negative integers; `Infinity` for
 * `pathwayCap` (review mode) is preserved through the math and
 * collapses to `authoredCount` via the final `Math.min`.
 *
 * Policy lives in the caller — this helper is a pure clamp. The
 * caller decides which floor to pass for which (level, phase). For
 * `applyOverlayLevel` today: pre-answer uses floor=1 except in
 * `none` (Boss Challenge) where floor=0; post-answer uses floor=0
 * everywhere (priority sort already preserves the §9.8 reveal cue
 * within a non-zero cap).
 */
export function resolveEffectiveOverlayBudget(
  authoredCount: number,
  pathwayCap: number,
  mandatoryCueFloor: number,
): number {
  const safeAuthoredCount = Math.max(0, Math.floor(authoredCount))
  const safePathwayCap = Math.max(0, Math.floor(pathwayCap))
  const safeMandatoryCueFloor = Math.max(0, Math.floor(mandatoryCueFloor))

  const floor = Math.min(safeAuthoredCount, safeMandatoryCueFloor)
  const cap = Math.max(safePathwayCap, floor)
  return Math.min(safeAuthoredCount, cap)
}

/**
 * Pre-answer filter — defense-in-depth. The schema validator already
 * rejects any pre-answer overlay outside `PRE_ANSWER_OVERLAY_KINDS`,
 * but this helper is called by the renderer with arrays that may
 * have been hand-built by tests or future authors who skip
 * validation. Drop anything outside the allow-list before applying
 * the budget so the filtering pipeline can never silently leak an
 * answer-revealing primitive into the freeze cluster.
 */
function filterPreAnswerKinds(
  overlays: readonly OverlayPrimitive[],
): OverlayPrimitive[] {
  const out: OverlayPrimitive[] = []
  for (const o of overlays) {
    if (isAllowedPreAnswerOverlay(o.kind)) out.push(o)
  }
  return out
}

/**
 * Pre-answer priority order. When the budget is tight (advanced =
 * 1), we want the cue overlay to win over the body-language
 * disambiguators. The decoder cue across all four founder families
 * is a vision cone or a help pulse; the secondary cues are body-
 * language arrows. Sort stably so equal-priority kinds keep their
 * authored order.
 */
const PRE_ANSWER_PRIORITY: Record<
  (typeof PRE_ANSWER_OVERLAY_KINDS)[number],
  number
> = {
  defender_vision_cone: 0,
  help_pulse: 0,
  defender_hand_in_lane: 1,
  defender_hip_arrow: 2,
  defender_foot_arrow: 2,
  defender_chest_line: 2,
  label: 3,
}

function comparePreAnswerPriority(a: OverlayPrimitive, b: OverlayPrimitive): number {
  const pa = PRE_ANSWER_PRIORITY[a.kind as (typeof PRE_ANSWER_OVERLAY_KINDS)[number]] ?? 99
  const pb = PRE_ANSWER_PRIORITY[b.kind as (typeof PRE_ANSWER_OVERLAY_KINDS)[number]] ?? 99
  return pa - pb
}

// ---------------------------------------------------------------------------
// Pack 2 Teaching-Quality F6 — decoder-cue priority dominance.
//
// Risk M1 in docs/pack-2-teaching-quality-risk-report.md: the generic
// PRE_ANSWER_PRIORITY ranks defender_vision_cone and help_pulse both
// at priority 0. When the budget is tight (advanced = 1) and a template
// authors BOTH (e.g. SKR with help_pulse as the decoder cue and a
// distractor vision_cone), the stable sort breaks the tie by authored
// order — but only if authors were disciplined enough to put the
// decoder cue first. A distractor authored ahead of the decoder's
// own cue silently wins truncation and the cue identifying the read
// is dropped.
//
// F6 promotes the decoder's primary cue kind to a "priority-(-1)" rank
// when applyOverlayLevel knows which decoder the scene belongs to.
// The mapping mirrors the first preAnswer kind in
// apps/web/lib/scenario3d/decoderOverlayPresets.ts. DROP / HUNT have
// no entry today (Pack 2 stubs) — F3 already gates them out of
// REVIEW/LIVE, and absent here means we fall through to the generic
// priority comparator.
//
// When the decoderTag is `undefined` (legacy / preset / synthetic
// scenes that have no scenario context — see scene.ts:130-136), the
// behaviour is exactly the previous comparator: priority sort + stable
// authored-order tiebreak. F6 is opt-in by passing decoderTag.
// ---------------------------------------------------------------------------

const PRIMARY_PRE_CUE_KIND_BY_DECODER: Readonly<
  Partial<Record<DecoderTag, OverlayPrimitive['kind']>>
> = Object.freeze({
  BACKDOOR_WINDOW: 'defender_vision_cone',
  EMPTY_SPACE_CUT: 'defender_vision_cone',
  SKIP_THE_ROTATION: 'help_pulse',
  ADVANTAGE_OR_RESET: 'defender_vision_cone',
  // READ_THE_COVERAGE / HUNT_THE_ADVANTAGE: undefined — Pack 2 stubs.
  // F3 (lint-variants empty-preset gate) blocks REVIEW/LIVE promotion
  // until the presets are filled in, so this map naturally extends
  // when 3.1.2 lands the DROP/HUNT primary cue.
})

/** Returns the decoder's primary cue overlay kind, or undefined if
 *  the decoder is unknown / has no canonical cue (Pack 2 DROP/HUNT
 *  stubs). Pure — same input always produces the same output. */
export function getDecoderPrimaryCueKind(
  decoder: DecoderTag | undefined,
): OverlayPrimitive['kind'] | undefined {
  if (!decoder) return undefined
  return PRIMARY_PRE_CUE_KIND_BY_DECODER[decoder]
}

/** Builds a comparator that promotes the decoder's primary cue kind
 *  to priority -1, beating the generic priority-0 ties. Falls back
 *  to `comparePreAnswerPriority` when the decoder is unknown or has
 *  no canonical cue. */
function makePreAnswerComparatorWithDecoder(
  decoder: DecoderTag | undefined,
): (a: OverlayPrimitive, b: OverlayPrimitive) => number {
  const promoted = getDecoderPrimaryCueKind(decoder)
  if (!promoted) return comparePreAnswerPriority
  return (a, b) => {
    // Priority is -1 for the decoder's primary cue, otherwise the
    // generic table's priority. Lower wins.
    const pa = a.kind === promoted ? -1 : (
      PRE_ANSWER_PRIORITY[a.kind as (typeof PRE_ANSWER_OVERLAY_KINDS)[number]] ?? 99
    )
    const pb = b.kind === promoted ? -1 : (
      PRE_ANSWER_PRIORITY[b.kind as (typeof PRE_ANSWER_OVERLAY_KINDS)[number]] ?? 99
    )
    return pa - pb
  }
}

/**
 * Post-answer priority order. The §9.8 invariants require the reveal
 * to include at least one of: open-space region, passing lane,
 * drive-cut preview. Surface those first when the budget is tight,
 * then short labels, then anything else.
 */
const POST_ANSWER_PRIORITY: Partial<Record<OverlayPrimitive['kind'], number>> = {
  open_space_region: 0,
  passing_lane_open: 0,
  passing_lane_blocked: 0,
  drive_cut_preview: 1,
  label: 2,
  timing_pulse: 2,
}

function comparePostAnswerPriority(a: OverlayPrimitive, b: OverlayPrimitive): number {
  const pa = POST_ANSWER_PRIORITY[a.kind] ?? 3
  const pb = POST_ANSWER_PRIORITY[b.kind] ?? 3
  return pa - pb
}

/**
 * Stable sort that preserves authored order among equal-priority items.
 * Native `Array.prototype.sort` is stable in modern engines but we
 * keep this helper explicit so the contract is self-documenting.
 */
function stableSort<T>(
  arr: readonly T[],
  cmp: (a: T, b: T) => number,
): T[] {
  return arr
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      const c = cmp(a.value, b.value)
      return c !== 0 ? c : a.index - b.index
    })
    .map((entry) => entry.value)
}

export interface AppliedOverlayLevel {
  level: OverlayLevel
  preAnswer: OverlayPrimitive[]
  postAnswer: OverlayPrimitive[]
  /** Number of overlays dropped from the input arrays for any reason
   *  (kind not allowed, over budget). Surfaced for the FR-5 debug
   *  badge so QA can spot unintended truncation. */
  droppedPre: number
  droppedPost: number
}

/**
 * Applies an overlay level to the scene's authored overlay arrays.
 *
 * Behavior per level:
 *   - `'beginner'`   →  full 3-overlay cluster (cap 3 / 3)
 *   - `'intermediate'` →  smaller cluster (cap 2 / 2)
 *   - `'advanced'`   →  cue-only / minimal (cap 1 / 1)
 *   - `'none'`       →  zero overlays (Boss mode)
 *   - `'review'`     →  uncapped (Film Room Review)
 *
 * The function never mutates input arrays. It applies the
 * pre-answer kind allow-list as defense-in-depth, then sorts by the
 * decoder priority above so the most diagnostic primitive always
 * survives a tight budget, then slices to the level's cap.
 */
export function applyOverlayLevel(input: {
  preAnswer: readonly OverlayPrimitive[]
  postAnswer: readonly OverlayPrimitive[]
  level: OverlayLevel
  /** Pack 2 Teaching-Quality F6 — optional decoder context. When
   *  provided, the pre-answer priority sort promotes the decoder's
   *  canonical primary cue kind ahead of generic priority-0 ties so
   *  a distractor authored ahead of the decoder cue cannot win
   *  truncation. Absent / undefined falls back to the generic
   *  priority comparator (legacy behaviour). */
  decoderTag?: DecoderTag
}): AppliedOverlayLevel {
  const { level, decoderTag } = input
  const budget = BUDGETS[level]

  // Pack 2 Teaching-Quality F4 — mandatory cue floor policy.
  //
  //   - 'none' (Boss Challenge) keeps a hard 0 floor; the whole point
  //     of Boss mode is that the player gets no scaffolding.
  //   - All other levels keep a floor of 1 on the pre-answer cluster:
  //     if the variant authored any pre-answer cue, at least one must
  //     survive truncation. Combined with the priority sort below, the
  //     surviving overlay is the highest-priority kind (the decoder
  //     cue, when decoderTag is known — F6), not whatever happened to
  //     be authored first.
  //   - Post-answer keeps a 0 floor everywhere. The §9.8 reveal-cue
  //     invariant is upheld by `comparePostAnswerPriority` ranking
  //     open-space / passing-lane / drive-cut at priority 0; no
  //     additional floor is needed because non-zero pathway caps
  //     already preserve the top-priority entry.
  const preFloor = level === 'none' ? 0 : 1
  const postFloor = 0

  // Pre-answer: kind allow-list → priority sort (F6 decoder-promoted)
  //           → effective budget.
  const preAllowed = filterPreAnswerKinds(input.preAnswer)
  const preComparator = makePreAnswerComparatorWithDecoder(decoderTag)
  const preSorted = stableSort(preAllowed, preComparator)
  const effectivePreCap = resolveEffectiveOverlayBudget(
    preSorted.length,
    budget.preMax,
    preFloor,
  )
  const preCapped = takeWithCap(preSorted, effectivePreCap)
  const droppedPre = input.preAnswer.length - preCapped.length

  // Post-answer: priority sort → effective budget. No kind allow-list
  // (any kind is allowed during the reveal).
  const postSorted = stableSort(input.postAnswer, comparePostAnswerPriority)
  const effectivePostCap = resolveEffectiveOverlayBudget(
    postSorted.length,
    budget.postMax,
    postFloor,
  )
  const postCapped = takeWithCap(postSorted, effectivePostCap)
  const droppedPost = input.postAnswer.length - postCapped.length

  return {
    level,
    preAnswer: preCapped,
    postAnswer: postCapped,
    droppedPre,
    droppedPost,
  }
}

function takeWithCap<T>(arr: readonly T[], cap: number): T[] {
  if (cap <= 0) return []
  if (!Number.isFinite(cap)) return arr.slice()
  return arr.slice(0, cap)
}

/**
 * Returns true when overlays should be entirely suppressed (no
 * mounted primitives, no decoder pill, no reveal). Used by debug
 * surfaces to surface the suppression state without re-deriving it.
 */
export function isOverlaySuppressed(level: OverlayLevel): boolean {
  return level === 'none'
}

// ---------------------------------------------------------------------------
// Stage-in choreography (Section 9.7).
//
// The freeze should feel like a coach pointing — overlays land in
// sequence, not all at once. `getStageInDelayMs(index)` returns the
// per-primitive delay (relative to phase enter) the renderer applies
// to fade-in animations. Pure: same index → same number, deterministic
// across runs.
//
// Spec timeline:
//   - t=0     world frozen
//   - t=40    first cue overlay (body cue)
//   - t=120   second overlay (disambiguator)
//   - t=220   third overlay (lane / label)
//   - t=320   decoder pill (UI layer, not this controller)
//
// For indices beyond 3 (review mode) the schedule continues at 100ms
// per slot so a 4-overlay cluster lands in 320ms, 5-overlay in 420ms.
// ---------------------------------------------------------------------------

const STAGE_IN_FIXED_DELAYS_MS: readonly number[] = [40, 120, 220]
const STAGE_IN_TAIL_DELTA_MS = 100

export function getStageInDelayMs(index: number): number {
  if (!Number.isFinite(index) || index < 0) return 0
  const i = Math.floor(index)
  if (i < STAGE_IN_FIXED_DELAYS_MS.length) {
    return STAGE_IN_FIXED_DELAYS_MS[i]!
  }
  const last = STAGE_IN_FIXED_DELAYS_MS[STAGE_IN_FIXED_DELAYS_MS.length - 1]!
  return last + (i - (STAGE_IN_FIXED_DELAYS_MS.length - 1)) * STAGE_IN_TAIL_DELTA_MS
}
