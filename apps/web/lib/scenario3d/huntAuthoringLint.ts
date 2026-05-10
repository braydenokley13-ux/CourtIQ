/**
 * Pack 2 (Phase γ) — HUNT authoring lint rules.
 *
 * Five quality checks for HUNT / HUNT_THE_ADVANTAGE chained-read
 * scenarios. The rules complement the runtime scene schema (which
 * gates structural validity) by catching HUNT-specific authoring
 * mistakes the schema cannot see. Mirrors the shape of
 * `dropAuthoringLint.ts`.
 *
 * Specs come from `docs/curriculum/HUNT_DECODER_DESIGN.md` §7:
 *
 *   LINT-HUNT-01  Beat cue caps. Beat 1 pre-overlay cluster ≤ 2 for
 *                 D1–D2 (≤ 3 for D3+). Beat 2 pre-overlay cluster
 *                 ≤ 2 for D1–D2 (≤ 3 for D3+). Total unique cue
 *                 primitives across both beats ≤ 4 for D1–D2 (≤ 5
 *                 for D3+). Each cue beyond the cap overflows the
 *                 1100ms beat 1 floor.
 *
 *   LINT-HUNT-02  Inter-beat determinism. All movements during the
 *                 inter-beat window (between firstBeat.atMs and
 *                 secondBeat.atMs) MUST have explicit `delayMs` and
 *                 `durationMs`. Schema defaults during the window
 *                 ship a non-deterministic chained read.
 *
 *   LINT-HUNT-03  beatSpec required. HUNT scenarios MUST author both
 *                 `scene.beatSpec.firstBeat` AND
 *                 `scene.beatSpec.secondBeat`. A HUNT scenario without
 *                 a second beat is structurally a different decoder.
 *
 *   LINT-HUNT-04  Cognition hold floor. HUNT scenarios MUST author
 *                 `timingOverrides.cognitionHoldMs` AND the value MUST
 *                 be ≤ 1200 (so beat 1 hits the 1100ms floor while
 *                 beat 2 keeps the default 1400ms).
 *
 *   LINT-HUNT-05  Coach validation gate. HUNT scenarios at D3+ MUST
 *                 have `coach_validation.level: 'high'` AND
 *                 `coach_validation.status: 'approved'`. The seeder
 *                 enforces high+approved for shipping; this lint
 *                 catches missing reviews at template-author time.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No I/O, no DB, no Three.js. The lint takes
 *     a parsed scenario + variant meta + difficulty and returns a
 *     pass/fail per rule.
 *   - Each validator returns the discriminated-union shape
 *     `{ ok: true } | { ok: false; rule; message }` so callers can
 *     enumerate the failures without re-running every rule.
 *   - The lint accepts ANY scenario; non-HUNT scenarios produce
 *     `{ ok: true }` from every rule. That makes it cheap to run
 *     across the whole pack library without a decoder filter.
 */

/** Beat 1 cognition-hold floor in ms (matches HUNT_DECODER_DESIGN §2.3). */
export const HUNT_BEAT1_COGNITION_HOLD_FLOOR_MS = 1100

/** Maximum `timingOverrides.cognitionHoldMs` a HUNT scenario may
 *  declare. Equals the design-doc ceiling: anything above 1200 means
 *  beat 1 is no longer at the readability floor and the chained
 *  envelope balloons beyond 6 seconds. */
export const HUNT_COGNITION_HOLD_CEILING_MS = 1200

/** Cluster cap on either beat for beginner difficulty (D1 / D2). */
export const HUNT_PER_BEAT_CUE_CAP_BEGINNER = 2
/** Cluster cap on either beat for D3+. */
export const HUNT_PER_BEAT_CUE_CAP_ADVANCED = 3

/** Cap on total unique cue primitives across beats 1 + 2 for D1 / D2. */
export const HUNT_TOTAL_UNIQUE_CUE_CAP_BEGINNER = 4
/** Cap on total unique cue primitives across beats 1 + 2 for D3+. */
export const HUNT_TOTAL_UNIQUE_CUE_CAP_ADVANCED = 5

export type HuntLintRule =
  | 'LINT-HUNT-01'
  | 'LINT-HUNT-02'
  | 'LINT-HUNT-03'
  | 'LINT-HUNT-04'
  | 'LINT-HUNT-05'

/** Result of a single rule run. */
export type HuntLintResult =
  | { ok: true }
  | { ok: false; rule: HuntLintRule; message: string }

/** Aggregate result returned by `lintHuntVariant`. */
export interface HuntLintAggregate {
  ok: boolean
  failures: Array<{ rule: HuntLintRule; message: string }>
}

/** Minimal subset of the scene needed by the lint. The lint module
 *  does not own the schema; callers pass already-parsed scenario JSON
 *  so this stays a pure helper. */
export interface HuntLintSceneInput {
  /** Pre-answer overlays. Each may carry an optional `beat` (1 or 2)
   *  identifying which freeze cluster the cue belongs to. Cues with
   *  no `beat` are conservatively counted toward beat 1 — that's the
   *  beat at the 1100ms readability floor where over-stuffing hurts
   *  most, so the strictest cap is the safest default. */
  preAnswerOverlays?: ReadonlyArray<{ kind: string; beat?: 1 | 2 }>
  /** Movement list. `delayMs` and `durationMs` may be omitted at the
   *  schema level; LINT-HUNT-02 fails when an inter-beat movement
   *  omits either. */
  movements?: ReadonlyArray<{
    id?: string
    delayMs?: number
    durationMs?: number
  }>
  /** Two-beat freeze marker. */
  beatSpec?: {
    firstBeat?: { kind?: 'atMs'; atMs?: number } | null
    secondBeat?: { kind?: 'atMs'; atMs?: number } | null
  }
  /** Per-scenario timing overrides (cognitionHoldMs etc.). */
  timingOverrides?: {
    cognitionHoldMs?: number
  }
}

/** Variant-level metadata the lint needs. Coach-validation lives at
 *  the variant / template level in the seed schema; the lint receives
 *  it explicitly so it does not have to know which layer it came
 *  from. */
export interface HuntLintVariantMeta {
  /** Used for the `decoder_tag === 'HUNT_THE_ADVANTAGE'` guard. */
  decoder_tag?: string | null
  /** Identifier used in lint messages so authors can locate the file. */
  id?: string
  coach_validation?: {
    level?: 'low' | 'medium' | 'high'
    status?: 'not_needed' | 'needed' | 'reviewed' | 'approved'
  }
}

/** Returns true when the scenario is a HUNT chained-read. */
function isHuntScenario(meta: HuntLintVariantMeta): boolean {
  return meta.decoder_tag === 'HUNT_THE_ADVANTAGE'
}

/** Identifier used in error messages when no variant id is supplied. */
function describe(meta: HuntLintVariantMeta): string {
  return meta.id ?? '<unknown>'
}

// ---------------------------------------------------------------------------
// LINT-HUNT-01 — Beat cue caps
// ---------------------------------------------------------------------------

/**
 * Per-beat AND total-unique cue caps. The caps are tighter for D1/D2
 * because beat 1 sits at the 1100ms readability floor; an extra cue
 * exhausts attention before the reaction animation even starts.
 *
 * Cluster membership uses the optional `beat` field on each pre-answer
 * overlay. Overlays without a `beat` are counted as beat 1 — the
 * stricter default surfaces stuffed clusters before they ship.
 */
export function lintHuntBeatCueCaps(
  scene: HuntLintSceneInput,
  meta: HuntLintVariantMeta,
  difficulty: number,
): HuntLintResult {
  if (!isHuntScenario(meta)) return { ok: true }
  const overlays = scene.preAnswerOverlays ?? []
  const beat1 = overlays.filter((o) => (o.beat ?? 1) === 1)
  const beat2 = overlays.filter((o) => o.beat === 2)
  const perBeatCap =
    difficulty <= 2 ? HUNT_PER_BEAT_CUE_CAP_BEGINNER : HUNT_PER_BEAT_CUE_CAP_ADVANCED
  const totalCap =
    difficulty <= 2
      ? HUNT_TOTAL_UNIQUE_CUE_CAP_BEGINNER
      : HUNT_TOTAL_UNIQUE_CUE_CAP_ADVANCED

  if (beat1.length > perBeatCap) {
    return {
      ok: false,
      rule: 'LINT-HUNT-01',
      message: `HUNT scenario "${describe(meta)}" beat 1 pre-overlay cluster has ${beat1.length} primitives; cap at D${difficulty} is ${perBeatCap}. Beat 1 sits at the 1100ms readability floor — extra cues overflow attention.`,
    }
  }
  if (beat2.length > perBeatCap) {
    return {
      ok: false,
      rule: 'LINT-HUNT-01',
      message: `HUNT scenario "${describe(meta)}" beat 2 pre-overlay cluster has ${beat2.length} primitives; cap at D${difficulty} is ${perBeatCap}.`,
    }
  }
  const uniqueKinds = new Set<string>()
  for (const o of overlays) uniqueKinds.add(o.kind)
  if (uniqueKinds.size > totalCap) {
    return {
      ok: false,
      rule: 'LINT-HUNT-01',
      message: `HUNT scenario "${describe(meta)}" total unique cue primitives across both beats = ${uniqueKinds.size}; cap at D${difficulty} is ${totalCap}. Re-use cues across beats (diff cognition) instead of stacking new ones.`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// LINT-HUNT-02 — Inter-beat determinism
// ---------------------------------------------------------------------------

/**
 * Movements scheduled to fire during the inter-beat window must NOT
 * lean on schema defaults for `delayMs` or `durationMs`. The window
 * is `[firstBeat.atMs, secondBeat.atMs]`; a movement is considered
 * "inter-beat" when its `delayMs` falls inside that span.
 *
 * The rule is permissive about movements outside the window — only
 * the hand-off between beat 1 and beat 2 needs to be deterministic
 * (visual regression CI — the parallel workstream — owns the rest).
 */
export function lintHuntInterBeatDeterminism(
  scene: HuntLintSceneInput,
  meta: HuntLintVariantMeta,
): HuntLintResult {
  if (!isHuntScenario(meta)) return { ok: true }
  const beatSpec = scene.beatSpec
  const first = beatSpec?.firstBeat
  const second = beatSpec?.secondBeat
  // If the beat spec is incomplete, LINT-HUNT-03 catches it. Skip here
  // so authors see one clear failure rather than two cascaded ones.
  if (!first || !second) return { ok: true }
  if (first.kind !== 'atMs' || second.kind !== 'atMs') return { ok: true }
  if (typeof first.atMs !== 'number' || typeof second.atMs !== 'number') {
    return { ok: true }
  }
  const lo = first.atMs
  const hi = second.atMs
  const movements = scene.movements ?? []
  for (const m of movements) {
    if (typeof m.delayMs !== 'number') continue
    if (m.delayMs < lo || m.delayMs > hi) continue
    // Inside inter-beat window — both fields must be explicit.
    if (typeof m.durationMs !== 'number') {
      return {
        ok: false,
        rule: 'LINT-HUNT-02',
        message: `HUNT scenario "${describe(meta)}" movement "${m.id ?? '<unnamed>'}" fires inside the inter-beat window [${lo}, ${hi}]ms but omits durationMs. Make every inter-beat movement deterministic — author both delayMs and durationMs.`,
      }
    }
  }
  // The schema lets `delayMs` itself be optional; if any movement is
  // missing a delay we cannot place it in the window. Conservatively
  // flag movements without delayMs at all when a beatSpec is present:
  // they could land anywhere.
  for (const m of movements) {
    if (typeof m.delayMs !== 'number') {
      return {
        ok: false,
        rule: 'LINT-HUNT-02',
        message: `HUNT scenario "${describe(meta)}" movement "${m.id ?? '<unnamed>'}" omits delayMs. HUNT requires explicit delayMs on every movement so the inter-beat window is reproducible.`,
      }
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// LINT-HUNT-03 — beatSpec required
// ---------------------------------------------------------------------------

/**
 * HUNT scenarios MUST author both `firstBeat` and `secondBeat`. A
 * single-beat HUNT is structurally a different decoder (probably
 * SKR or AOR) and would be silently mis-categorised by the spaced-rep
 * router.
 */
export function lintHuntBeatSpecRequired(
  scene: HuntLintSceneInput,
  meta: HuntLintVariantMeta,
): HuntLintResult {
  if (!isHuntScenario(meta)) return { ok: true }
  const beatSpec = scene.beatSpec
  if (!beatSpec || !beatSpec.firstBeat) {
    return {
      ok: false,
      rule: 'LINT-HUNT-03',
      message: `HUNT scenario "${describe(meta)}" is missing scene.beatSpec.firstBeat. HUNT is a chained two-beat decoder; both firstBeat and secondBeat are required.`,
    }
  }
  if (!beatSpec.secondBeat) {
    return {
      ok: false,
      rule: 'LINT-HUNT-03',
      message: `HUNT scenario "${describe(meta)}" is missing scene.beatSpec.secondBeat. A HUNT scenario with only one beat is structurally SKR/AOR; either add the second beat or change the decoder.`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// LINT-HUNT-04 — Cognition hold floor
// ---------------------------------------------------------------------------

/**
 * HUNT scenarios MUST author `timingOverrides.cognitionHoldMs` and
 * the value MUST be ≤ 1200 so beat 1 hits the 1100ms readability
 * floor. Without the override beat 1 inherits the default 1400ms,
 * the chained envelope blows past 6 seconds, and the player's
 * working memory dissolves between the two reads.
 */
export function lintHuntCognitionHoldFloor(
  scene: HuntLintSceneInput,
  meta: HuntLintVariantMeta,
): HuntLintResult {
  if (!isHuntScenario(meta)) return { ok: true }
  const hold = scene.timingOverrides?.cognitionHoldMs
  if (typeof hold !== 'number') {
    return {
      ok: false,
      rule: 'LINT-HUNT-04',
      message: `HUNT scenario "${describe(meta)}" must author timingOverrides.cognitionHoldMs. Without the override beat 1 inherits the 1400ms default; HUNT's chained-read envelope requires the 1100ms floor on beat 1.`,
    }
  }
  if (hold > HUNT_COGNITION_HOLD_CEILING_MS) {
    return {
      ok: false,
      rule: 'LINT-HUNT-04',
      message: `HUNT scenario "${describe(meta)}" timingOverrides.cognitionHoldMs=${hold} is above the HUNT ceiling ${HUNT_COGNITION_HOLD_CEILING_MS}ms. Beat 1 must compress to the ${HUNT_BEAT1_COGNITION_HOLD_FLOOR_MS}ms floor; beat 2 keeps its 1400ms default.`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// LINT-HUNT-05 — Coach validation gate (D3+)
// ---------------------------------------------------------------------------

/**
 * HUNT scenarios at D3+ MUST have coach_validation.level === 'high'
 * AND coach_validation.status === 'approved'. The seeder already
 * gates shipping on high+approved; this lint surfaces missing
 * reviews at template-author time so authors do not learn at seed
 * time that their scenario is blocked.
 */
export function lintHuntCoachValidation(
  meta: HuntLintVariantMeta,
  difficulty: number,
): HuntLintResult {
  if (!isHuntScenario(meta)) return { ok: true }
  if (difficulty < 3) return { ok: true }
  const cv = meta.coach_validation
  if (!cv) {
    return {
      ok: false,
      rule: 'LINT-HUNT-05',
      message: `HUNT scenario "${describe(meta)}" at D${difficulty} is missing coach_validation. D3+ HUNT requires coach_validation.level='high' and coach_validation.status='approved'.`,
    }
  }
  if (cv.level !== 'high') {
    return {
      ok: false,
      rule: 'LINT-HUNT-05',
      message: `HUNT scenario "${describe(meta)}" at D${difficulty} has coach_validation.level='${cv.level ?? '<missing>'}'. D3+ HUNT requires level='high'.`,
    }
  }
  if (cv.status !== 'approved') {
    return {
      ok: false,
      rule: 'LINT-HUNT-05',
      message: `HUNT scenario "${describe(meta)}" at D${difficulty} has coach_validation.status='${cv.status ?? '<missing>'}'. D3+ HUNT requires status='approved' before merge.`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/**
 * Run every HUNT rule and return the aggregate. `ok` is true when no
 * rule fails. The aggregate keeps each failure's rule code so callers
 * can group output by rule (e.g. lint-variants prints "✗ [LINT-HUNT-XX]
 * <message>" lines).
 *
 * Non-HUNT scenarios always return `{ ok: true, failures: [] }` because
 * each rule short-circuits on the decoder_tag guard.
 */
export function lintHuntVariant(
  scene: HuntLintSceneInput,
  variantMeta: HuntLintVariantMeta,
  difficulty: number,
): HuntLintAggregate {
  const results: HuntLintResult[] = [
    lintHuntBeatCueCaps(scene, variantMeta, difficulty),
    lintHuntInterBeatDeterminism(scene, variantMeta),
    lintHuntBeatSpecRequired(scene, variantMeta),
    lintHuntCognitionHoldFloor(scene, variantMeta),
    lintHuntCoachValidation(variantMeta, difficulty),
  ]
  const failures: Array<{ rule: HuntLintRule; message: string }> = []
  for (const r of results) {
    if (!r.ok) failures.push({ rule: r.rule, message: r.message })
  }
  return { ok: failures.length === 0, failures }
}
