/**
 * Phase D — Part 2C (seed)
 * Freeze-Frame Cognition Pass — pure-data choreography.
 *
 * Owns the deterministic schedule for the 2.3-second window centered
 * on `scene.freezeAtMs`. Emits the canonical
 *
 *     cue → action → advantage
 *
 * three-beat sequence per decoder, plus the timing offsets the
 * pre-freeze ramp and the cognition hold are paced from. Built on
 * top of the Part 2B readability layer; produces FreezeBeatTemplates
 * which the renderer hydrates into OverlayBeats with concrete player
 * ids / anchor points so the existing `OverlayBeat` choreography
 * sort + clutter pipeline can ingest them without adapter code.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No THREE.js. No clocks. No imports of
 *     renderer code or the imperative scene.
 *   - Same inputs → same outputs. Determinism is the contract.
 *   - This module never owns x/z routes, never owns scenario timing,
 *     never owns clip selection. It only schedules WHEN existing
 *     overlay primitives fade in / out around freeze, and exposes
 *     the helpers callers need to compute pre-freeze ramp progress
 *     and cognition-hold progress without re-deriving them.
 *   - Beat counts capped at 3 per decoder per freeze. Caller is
 *     trusted to honour the cap; tests below assert it on the
 *     emitted templates.
 *   - Off-axis decoders / missing decoder collapse to an empty
 *     template list. Never throws, never returns undefined.
 *   - Templates use the SCHEMA's existing OverlayPrimitive kinds —
 *     no new primitive types are introduced.
 *
 * Consumers (none yet wired — landed file-only as the seed):
 *   - imperativeTeachingOverlay  reads `getFreezeBeatTemplates(decoder)`
 *                                at freeze entry, hydrates each
 *                                template with concrete refs from
 *                                the scene, and forwards to its
 *                                existing OverlayBeat scheduler.
 *   - cameraPresets              reads `FREEZE_RAMP_WINDOW_MS` to
 *                                start the camera ease 600ms before
 *                                freezeAtMs.
 *   - imperativeScene            reads `cognitionScaleAt(...)` to
 *                                pace the freeze emphasis quaternion
 *                                during the cognition hold.
 */

import type { DecoderTag, OverlayPrimitive } from './schema'
import type { CourtPoint } from './coords'
import type { OverlayBeat, OverlayTeachingQuestion } from './overlayBeats'

// --- timing constants ------------------------------------------------------

/** Pre-freeze tension ramp window. Posture emphasis, camera ease,
 *  and cue foreshadow all begin at (freezeAtMs - this) ms. */
export const FREEZE_RAMP_WINDOW_MS = 600

/** First-overlay foreshadow offset (low-opacity). Negative offset
 *  means BEFORE freeze. Authored relative to freezeAtMs. */
export const FREEZE_FORESHADOW_OFFSET_MS = -200

/** Cognition hold — how long the freeze pose / camera / overlay
 *  schedule peaks before the choice tray takes over. */
export const FREEZE_COGNITION_HOLD_MS = 1400

/** Handoff window — emphasis / overlays decay to 0 over this many
 *  ms after cognition hold ends. */
export const FREEZE_HANDOFF_WINDOW_MS = 300

/** Convenience — total freeze envelope from ramp start to handoff
 *  end. Useful for test fixtures and timeline budget asserts. */
export const FREEZE_TOTAL_ENVELOPE_MS =
  FREEZE_RAMP_WINDOW_MS + FREEZE_COGNITION_HOLD_MS + FREEZE_HANDOFF_WINDOW_MS

// --- per-beat offsets (relative to freezeAtMs) -----------------------------
//
// All offsets relative to freezeAtMs. The schedule is identical across
// decoders by design — only the primitives differ. This keeps the
// cognitive cadence consistent so users learn ONE rhythm.

/** Cue beat full-opacity reveal. */
export const CUE_BEAT_AT_MS = 200
/** Plain-English label fade-in. */
export const LABEL_BEAT_AT_MS = 600
/** Action overlay fade-in. */
export const ACTION_BEAT_AT_MS = 700
/** Advantage overlay fade-in. */
export const ADVANTAGE_BEAT_AT_MS = 1100
/** Choice tray opens — informational; the controller owns it. */
export const CHOICE_TRAY_AT_MS = 1400

/** Default fade durations. Authors may override per beat. */
export const DEFAULT_BEAT_FADE_IN_MS = 300
export const DEFAULT_BEAT_FADE_OUT_MS = 200

// --- Pack 2 Teaching-Quality F5 — difficulty-aware beat schedule -----------
//
// Risk H5 in docs/pack-2-teaching-quality-risk-report.md: with the schema
// floor of cognitionHoldMs = 1100 and the module constant
// ADVANTAGE_BEAT_AT_MS = 1100, an override that pulls the cognition hold to
// the floor opens the choice tray at the same instant the advantage beat
// starts fading in. The "why this read works" explanation arrives the same
// instant the player must commit. F5 moves the offsets from a single
// schedule shared across difficulties to a per-difficulty mapping so D4
// and D5 (which the blueprint calls for ≤ 1000ms / ≤ 800ms holds) get a
// compressed beat cadence that always lands the advantage strictly before
// the choice tray opens.
//
// The decoder parameter is reserved for forward compatibility — DROP /
// HUNT presets may want their own cadence (e.g. HUNT's chained second
// read needs a tighter first-beat). Today every decoder shares the
// difficulty-keyed schedule; the parameter shape is locked so a future
// decoder-specific table can land without changing call sites.
//
// Existing callers that read the module constants directly (cue / action /
// advantage / label `*_BEAT_AT_MS`) still see the default D1-D3 schedule
// — `getFreezeBeatTemplates(decoder)` is unchanged. New callers that
// thread `effectiveDifficulty` resolve the per-difficulty schedule via
// `beatSchedule(decoder, effectiveDifficulty)` or pull templates through
// `getFreezeBeatTemplatesAtDifficulty(decoder, effectiveDifficulty)`.

/** Resolved per-(decoder, difficulty) freeze-beat schedule. All offsets
 *  relative to freezeAtMs, in milliseconds. */
export interface BeatSchedule {
  cueAtMs: number
  labelAtMs: number
  actionAtMs: number
  advantageAtMs: number
  /** Default fade-in for beats that do not author their own. */
  fadeInMs: number
  /** Default fade-out for beats that do not author their own. */
  fadeOutMs: number
}

/** Per-difficulty schedule table.
 *
 *  Invariant (H5): `advantageAtMs(D) < schemaFloorHoldMs(D)` for every D
 *  — the advantage beat must START fading in strictly before the choice
 *  tray opens, never simultaneously. Today the schema floor is 1100ms
 *  for every difficulty; F1 will lower it per-difficulty (D≤3=1100,
 *  D4=1000, D5=800). The schedule below already satisfies the future
 *  per-difficulty floors so F1 lands without revisiting these numbers.
 *
 *  Cadence design (cue → label → action → advantage):
 *    - D1-D3: 200 / 600 / 700 / 1000 — advantage tightened from the
 *             legacy 1100 so it lands strictly before the 1100ms floor
 *             at any difficulty. Default cognition hold (1400ms) keeps
 *             the surface feel of Pack 1.
 *    - D4:    150 / 400 / 500 / 700  — fast-read; advantage fires
 *             300ms ahead of the future 1000ms hold.
 *    - D5:    100 / 300 / 350 / 500  — flash-read; advantage fires
 *             300ms ahead of the future 800ms hold.
 *  Fade-ins shrink at D4/D5 so the visible cadence stays brisk; even
 *  with shorter fade-ins the advantage's final-opacity moment still
 *  arrives before the tray at typical (non-floor) holds. Fade-outs
 *  follow in step so post-beat decay also fits inside the compressed
 *  envelope. */
const BEAT_SCHEDULES_BY_DIFFICULTY: Readonly<Record<number, BeatSchedule>> =
  Object.freeze({
    1: Object.freeze({
      cueAtMs: CUE_BEAT_AT_MS,
      labelAtMs: LABEL_BEAT_AT_MS,
      actionAtMs: ACTION_BEAT_AT_MS,
      advantageAtMs: 1000,
      fadeInMs: DEFAULT_BEAT_FADE_IN_MS,
      fadeOutMs: DEFAULT_BEAT_FADE_OUT_MS,
    }),
    2: Object.freeze({
      cueAtMs: CUE_BEAT_AT_MS,
      labelAtMs: LABEL_BEAT_AT_MS,
      actionAtMs: ACTION_BEAT_AT_MS,
      advantageAtMs: 1000,
      fadeInMs: DEFAULT_BEAT_FADE_IN_MS,
      fadeOutMs: DEFAULT_BEAT_FADE_OUT_MS,
    }),
    3: Object.freeze({
      cueAtMs: CUE_BEAT_AT_MS,
      labelAtMs: LABEL_BEAT_AT_MS,
      actionAtMs: ACTION_BEAT_AT_MS,
      advantageAtMs: 1000,
      fadeInMs: DEFAULT_BEAT_FADE_IN_MS,
      fadeOutMs: DEFAULT_BEAT_FADE_OUT_MS,
    }),
    4: Object.freeze({
      cueAtMs: 150,
      labelAtMs: 400,
      actionAtMs: 500,
      advantageAtMs: 700,
      fadeInMs: 250,
      fadeOutMs: 200,
    }),
    5: Object.freeze({
      cueAtMs: 100,
      labelAtMs: 300,
      actionAtMs: 350,
      advantageAtMs: 500,
      fadeInMs: 200,
      fadeOutMs: 150,
    }),
  })

/** Fallback schedule for out-of-band difficulties — the loosest of the
 *  table. Used by `_clampDifficulty` callers when a non-finite or
 *  outside-[1,5] value reaches `beatSchedule`. */
const DEFAULT_BEAT_SCHEDULE: BeatSchedule = BEAT_SCHEDULES_BY_DIFFICULTY[1]!

/** Clamp an effective difficulty to the [1, 5] integer domain. Non-finite
 *  or out-of-band values fall back to D1 (the loosest, safest schedule). */
function _clampDifficulty(effectiveDifficulty: number): number {
  if (!Number.isFinite(effectiveDifficulty)) return 1
  const rounded = Math.round(effectiveDifficulty)
  if (rounded < 1) return 1
  if (rounded > 5) return 5
  return rounded
}

/**
 * Returns the resolved freeze-beat schedule for a (decoder, effectiveD)
 * pair. Pure — same inputs always produce the same output. The schedule
 * is decoder-parametrised for forward compatibility; today every decoder
 * uses the difficulty-keyed table.
 *
 * `effectiveDifficulty` is the variant's resolved D after applying any
 * disguise difficultyBump and the schema clamp (1..5). Out-of-band
 * inputs collapse to D1 rather than throwing — a renderer that lost
 * track of difficulty should fall back to the slowest (most readable)
 * cadence, not crash the freeze.
 */
export function beatSchedule(
  decoder: DecoderTag | undefined,
  effectiveDifficulty: number,
): BeatSchedule {
  // `decoder` is intentionally unused at this milestone — see comment
  // above. Reading it here keeps the parameter declared so call sites
  // that thread the decoder don't need to change when a per-decoder
  // table lands.
  void decoder
  const d = _clampDifficulty(effectiveDifficulty)
  return BEAT_SCHEDULES_BY_DIFFICULTY[d] ?? DEFAULT_BEAT_SCHEDULE
}

// --- types -----------------------------------------------------------------

export type CognitionPhase =
  /** > FREEZE_RAMP_WINDOW_MS before freezeAtMs, or scenario has no freeze. */
  | 'pre'
  /** Within the ramp window, before freezeAtMs. */
  | 'ramp'
  /** At freezeAtMs; held during cognition window. */
  | 'hold'
  /** Within the handoff window, after cognition hold ends. */
  | 'handoff'
  /** After the handoff has fully decayed. */
  | 'post'

/** Which sub-beat this overlay is. The renderer treats them all as
 *  `phase: 'freeze'` OverlayBeats — this is just an authoring tag
 *  so the cognition module's emit fn stays self-documenting. */
export type FreezeBeatKind = 'cue' | 'label' | 'action' | 'advantage'

/** Symbolic role anchors. The renderer hydrates these to concrete
 *  player IDs / court points at emit time. Pure data — no scene
 *  reads required to author a template. */
export type FreezeBeatAnchorRole =
  | 'cue_defender'        // BDW deny defender, ESC helper, SKR helpers, AOR closeout
  | 'cue_offensive'       // SKR open_player, AOR receiver
  | 'cutter'
  | 'receiver'
  | 'open_player'
  | 'passer'
  | 'vacated_zone'        // ESC / SKR — anchor is geometric, not a player
  | 'open_rim_zone'       // BDW backdoor catch zone
  | 'closeout_target'     // AOR — between closeout defender + receiver

/** Pure-data freeze beat. The renderer hydrates `primitive_kind +
 *  anchor_role` into a concrete OverlayPrimitive at emit time using
 *  scene player ids and authored court points. */
export interface FreezeBeatTemplate {
  kind: FreezeBeatKind
  /** Time relative to freezeAtMs (ms). */
  at_phase_ms: number
  /** OverlayPrimitive `kind` selector — must match the schema's
   *  discriminated union. */
  primitive_kind: OverlayPrimitive['kind']
  /** Symbolic anchor role(s) the renderer fills in. Single-anchor
   *  primitives use only `anchor`; two-anchor primitives (passing
   *  lanes, drive cut previews) use `anchor` + `target_anchor`. */
  anchor: FreezeBeatAnchorRole
  target_anchor?: FreezeBeatAnchorRole
  /** Help-pulse role label, if the primitive is `help_pulse`. */
  help_pulse_role?: 'tag' | 'low_man' | 'nail' | 'stunter' | 'overhelp'
  clutter_priority: number
  fade_in_ms: number
  fade_out_ms: number
  /** Teaching-question tag for the overlay scheduler. */
  teaching_question: OverlayTeachingQuestion
}

// --- per-decoder beat templates --------------------------------------------
//
// Each decoder gets exactly three semantic beats (cue/action/advantage).
// `clutter_priority` is ascending (1=cue, 2=action, 3=advantage) so if
// the renderer is forced to drop one, the cue is preserved.

const BDW_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'defender_vision_cone',
    anchor: 'cue_defender',
    target_anchor: 'cutter',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'passing_lane_open',
    anchor: 'passer',
    target_anchor: 'cutter',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    anchor: 'open_rim_zone',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

const ESC_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'defender_hip_arrow',
    anchor: 'cue_defender',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'drive_cut_preview',
    anchor: 'cutter',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    anchor: 'vacated_zone',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

const SKR_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'help_pulse',
    anchor: 'cue_defender',
    help_pulse_role: 'overhelp',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'passing_lane_open',
    anchor: 'passer',
    target_anchor: 'open_player',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    // open_space_region hydrates from a court-point anchor only
    // (_anchorPoint accepts vacated_zone / open_rim_zone /
    // closeout_target). The space the skip exposes is the spot the
    // over-helper vacated, so vacated_zone is the right point.
    anchor: 'vacated_zone',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

const AOR_TEMPLATES: ReadonlyArray<FreezeBeatTemplate> = [
  {
    kind: 'cue',
    at_phase_ms: CUE_BEAT_AT_MS,
    primitive_kind: 'defender_chest_line',
    anchor: 'cue_defender',
    clutter_priority: 1,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_changed',
  },
  {
    kind: 'action',
    at_phase_ms: ACTION_BEAT_AT_MS,
    primitive_kind: 'drive_cut_preview',
    anchor: 'receiver',
    clutter_priority: 2,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_is_best_read',
  },
  {
    kind: 'advantage',
    at_phase_ms: ADVANTAGE_BEAT_AT_MS,
    primitive_kind: 'open_space_region',
    anchor: 'closeout_target',
    clutter_priority: 3,
    fade_in_ms: DEFAULT_BEAT_FADE_IN_MS,
    fade_out_ms: DEFAULT_BEAT_FADE_OUT_MS,
    teaching_question: 'what_space_opened',
  },
]

// Pack 2 stub. DROP and HUNT freeze-beat templates intentionally collapse
// to the empty-array sentinel until 3.1.2 / 3.1.4 design the full beat
// schedule (DROP: screen-defender depth + ball-handler attack arrow;
// HUNT: chained two-beat freeze). The contract at the top of the file
// already says "missing decoder collapses to an empty list, never throws"
// — DROP/HUNT exercise that path until their templates land.
const DROP_TEMPLATES_PACK2_STUB: ReadonlyArray<FreezeBeatTemplate> = []
const HUNT_TEMPLATES_PACK2_STUB: ReadonlyArray<FreezeBeatTemplate> = []

const DECODER_TEMPLATES: Record<DecoderTag, ReadonlyArray<FreezeBeatTemplate>> = {
  BACKDOOR_WINDOW: BDW_TEMPLATES,
  EMPTY_SPACE_CUT: ESC_TEMPLATES,
  SKIP_THE_ROTATION: SKR_TEMPLATES,
  ADVANTAGE_OR_RESET: AOR_TEMPLATES,
  READ_THE_COVERAGE: DROP_TEMPLATES_PACK2_STUB,
  HUNT_THE_ADVANTAGE: HUNT_TEMPLATES_PACK2_STUB,
}

// --- per-scenario timing resolution (Phase 3.1.4) -------------------------
//
// Pack 2 D≥3 scenarios opt in to shorter cognition holds; HUNT chained
// scenarios opt in to faster cue-repaint cadences. Authors declare the
// override in `scene.timingOverrides` (validated at parse time with
// floors). Runtime callers resolve effective timings via
// `resolveFreezeTiming(scene)` instead of reading the raw module
// constants — that way the override path is type-checked and the
// fallback path keeps Pack 1's behavior bit-identical.
//
// This helper is intentionally additive: existing callers that read
// the module constants continue to work unchanged. New callers (or
// migrated existing callers) gain per-scenario flexibility.

/** Frozen, per-scenario effective timing values. Same shape as the
 *  module constants but with overrides applied. */
export interface ResolvedFreezeTiming {
  cognitionHoldMs: number
  choiceTrayAtMs: number
  cueRepaintHoldCorrectMs: number
  cueRepaintHoldWrongMs: number
}

/** Default timing config — module constants. Used when a scenario
 *  authors no `timingOverrides` block. */
export const DEFAULT_FREEZE_TIMING: ResolvedFreezeTiming = Object.freeze({
  cognitionHoldMs: FREEZE_COGNITION_HOLD_MS,
  choiceTrayAtMs: CHOICE_TRAY_AT_MS,
  // CUE_REPAINT_HOLD_* live in replayTeachingTimeline.ts; we duplicate
  // the values here as inert defaults so this module is the single
  // source of truth for "what timing does the renderer use right
  // now?" Callers that resolve the timing pull from this struct
  // rather than threading two constants from two modules.
  cueRepaintHoldCorrectMs: 600,
  cueRepaintHoldWrongMs: 400,
})

/**
 * Per-scenario timing override input. Mirrors the schema's
 * `timingOverridesSchema` (apps/web/lib/scenario3d/schema.ts) but
 * loosened to a plain object so this module does not import the
 * scene schema directly (architecture lock — pure data, no schema
 * coupling).
 */
export interface FreezeTimingOverrideInput {
  cognitionHoldMs?: number
  choiceTrayAtMs?: number
  cueRepaintHoldCorrectMs?: number
  cueRepaintHoldWrongMs?: number
}

/**
 * Resolves an effective timing config from optional per-scenario
 * overrides. Pure — same input always produces the same output.
 *
 * Floors are NOT re-applied here. Schema validation already enforces
 * the floors at parse time (cognitionHoldMs ≥ 1100, all values ≤
 * 4_000). Re-applying would silently mask a schema bug; we want a
 * loud failure if an unvalidated value reaches the renderer.
 */
export function resolveFreezeTiming(
  override?: FreezeTimingOverrideInput,
): ResolvedFreezeTiming {
  if (!override) return DEFAULT_FREEZE_TIMING
  return {
    cognitionHoldMs: override.cognitionHoldMs ?? DEFAULT_FREEZE_TIMING.cognitionHoldMs,
    choiceTrayAtMs: override.choiceTrayAtMs ?? DEFAULT_FREEZE_TIMING.choiceTrayAtMs,
    cueRepaintHoldCorrectMs:
      override.cueRepaintHoldCorrectMs ?? DEFAULT_FREEZE_TIMING.cueRepaintHoldCorrectMs,
    cueRepaintHoldWrongMs:
      override.cueRepaintHoldWrongMs ?? DEFAULT_FREEZE_TIMING.cueRepaintHoldWrongMs,
  }
}

// --- public API ------------------------------------------------------------

/** Returns the canonical freeze-phase template list for a decoder.
 *  Returns `[]` for an undefined decoder. Never throws.
 *
 *  Uses the Pack 1 default cadence (cue=200, action=700, advantage=1100,
 *  fade-in=300). New callers that want F5's difficulty-aware cadence
 *  should use `getFreezeBeatTemplatesAtDifficulty(decoder, D)` instead.
 *  This entry point stays stable so existing callers / fixtures do not
 *  shift offsets under their feet. */
export function getFreezeBeatTemplates(
  decoder: DecoderTag | undefined,
): ReadonlyArray<FreezeBeatTemplate> {
  if (!decoder) return []
  return DECODER_TEMPLATES[decoder] ?? []
}

/**
 * F5 — Returns the freeze-phase template list for a decoder with
 * `at_phase_ms`, `fade_in_ms`, and `fade_out_ms` re-stamped from
 * `beatSchedule(decoder, effectiveDifficulty)`. Each template's
 * cue / label / action / advantage `kind` selects the corresponding
 * offset from the schedule.
 *
 * Pure — same inputs always produce the same outputs. Returns `[]`
 * for an undefined or unknown decoder. Never throws.
 *
 * Templates with a `kind` outside the four canonical beats fall back
 * to their authored `at_phase_ms` (today every template uses one of
 * the four kinds, so the fallback path is reachable only by future
 * additions). Authored fade durations on individual templates are
 * preserved when they differ from the default; the schedule's defaults
 * only apply when the template was authored against the constants.
 */
export function getFreezeBeatTemplatesAtDifficulty(
  decoder: DecoderTag | undefined,
  effectiveDifficulty: number,
): ReadonlyArray<FreezeBeatTemplate> {
  if (!decoder) return []
  const base = DECODER_TEMPLATES[decoder] ?? []
  if (base.length === 0) return base
  const schedule = beatSchedule(decoder, effectiveDifficulty)
  return base.map((t) => ({
    ...t,
    at_phase_ms: _scheduleOffsetFor(t.kind, schedule, t.at_phase_ms),
    fade_in_ms:
      t.fade_in_ms === DEFAULT_BEAT_FADE_IN_MS ? schedule.fadeInMs : t.fade_in_ms,
    fade_out_ms:
      t.fade_out_ms === DEFAULT_BEAT_FADE_OUT_MS
        ? schedule.fadeOutMs
        : t.fade_out_ms,
  }))
}

function _scheduleOffsetFor(
  kind: FreezeBeatKind,
  schedule: BeatSchedule,
  fallback: number,
): number {
  switch (kind) {
    case 'cue':
      return schedule.cueAtMs
    case 'label':
      return schedule.labelAtMs
    case 'action':
      return schedule.actionAtMs
    case 'advantage':
      return schedule.advantageAtMs
    default:
      return fallback
  }
}

/**
 * Renderer-side anchors. The imperativeScene resolves symbolic roles
 * to concrete player ids / court points and passes this map to
 * `hydrateFreezeBeats` to produce schema-valid OverlayBeats.
 *
 * Any anchor a decoder's templates do not reference may be omitted.
 * Missing required anchors cause `hydrateFreezeBeats` to skip that
 * beat — never throw, never emit an invalid primitive.
 */
export interface FreezeBeatAnchors {
  cue_defender?: string
  cue_offensive?: string
  cutter?: string
  receiver?: string
  open_player?: string
  passer?: string
  vacated_zone?: CourtPoint
  open_rim_zone?: CourtPoint
  closeout_target?: CourtPoint
}

export interface HydrateOptions {
  visibility?: { beginner: boolean; intermediate: boolean; advanced: boolean }
  /** Override the default open-space radius (default 4 ft). */
  open_space_radius_ft?: number
}

const DEFAULT_VISIBILITY = {
  beginner: true,
  intermediate: true,
  advanced: true,
} as const

/**
 * Hydrates a list of templates into schema-valid OverlayBeats by
 * filling in concrete player ids / court points from `anchors`.
 *
 * Templates whose required anchors are missing are silently skipped
 * (never thrown). The caller's QA matrix is responsible for catching
 * authoring gaps before runtime.
 */
export function hydrateFreezeBeats(
  decoder: DecoderTag,
  templates: ReadonlyArray<FreezeBeatTemplate>,
  anchors: FreezeBeatAnchors,
  options?: HydrateOptions,
): OverlayBeat[] {
  const visibility = options?.visibility ?? DEFAULT_VISIBILITY
  const radiusFt = options?.open_space_radius_ft ?? 4
  const out: OverlayBeat[] = []
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i]!
    const primitive = _hydratePrimitive(t, anchors, radiusFt)
    if (!primitive) continue
    out.push({
      beat_id: `freeze_${decoder}_${t.kind}_${i}`,
      decoder,
      phase: 'freeze',
      at_phase_ms: t.at_phase_ms,
      teaching_question: t.teaching_question,
      primitive,
      clutter_priority: t.clutter_priority,
      visibility: { ...visibility },
      fade_in_ms: t.fade_in_ms,
      fade_out_ms: t.fade_out_ms,
    })
  }
  return out
}

/** Resolves a single anchor role to either a player id or a court
 *  point. Returns the literal value if found; undefined otherwise. */
function _anchorPlayerId(
  role: FreezeBeatAnchorRole,
  a: FreezeBeatAnchors,
): string | undefined {
  switch (role) {
    case 'cue_defender': return a.cue_defender
    case 'cue_offensive': return a.cue_offensive
    case 'cutter': return a.cutter
    case 'receiver': return a.receiver
    case 'open_player': return a.open_player
    case 'passer': return a.passer
    default: return undefined
  }
}

function _anchorPoint(
  role: FreezeBeatAnchorRole,
  a: FreezeBeatAnchors,
): CourtPoint | undefined {
  switch (role) {
    case 'vacated_zone': return a.vacated_zone
    case 'open_rim_zone': return a.open_rim_zone
    case 'closeout_target': return a.closeout_target
    default: return undefined
  }
}

/**
 * Build the schema-valid OverlayPrimitive for a template. Returns
 * undefined if the required anchors are not present in `anchors` —
 * the caller filters these out.
 */
function _hydratePrimitive(
  t: FreezeBeatTemplate,
  a: FreezeBeatAnchors,
  radiusFt: number,
): OverlayPrimitive | undefined {
  switch (t.primitive_kind) {
    case 'defender_vision_cone': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      const targetId = t.target_anchor
        ? _anchorPlayerId(t.target_anchor, a)
        : undefined
      return targetId
        ? { kind: 'defender_vision_cone', playerId, targetId }
        : { kind: 'defender_vision_cone', playerId }
    }
    case 'defender_hip_arrow': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_hip_arrow', playerId }
    }
    case 'defender_foot_arrow': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_foot_arrow', playerId }
    }
    case 'defender_chest_line': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_chest_line', playerId }
    }
    case 'defender_hand_in_lane': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      return { kind: 'defender_hand_in_lane', playerId }
    }
    case 'help_pulse': {
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId || !t.help_pulse_role) return undefined
      return { kind: 'help_pulse', playerId, role: t.help_pulse_role }
    }
    case 'passing_lane_open': {
      const from = _anchorPlayerId(t.anchor, a)
      const to = t.target_anchor ? _anchorPlayerId(t.target_anchor, a) : undefined
      if (!from || !to) return undefined
      return { kind: 'passing_lane_open', from, to }
    }
    case 'passing_lane_blocked': {
      const from = _anchorPlayerId(t.anchor, a)
      const to = t.target_anchor ? _anchorPlayerId(t.target_anchor, a) : undefined
      if (!from || !to) return undefined
      return { kind: 'passing_lane_blocked', from, to }
    }
    case 'drive_cut_preview': {
      // Cognition module does not author the polyline; the renderer
      // hydrates a 2-point preview from the player's active segment.
      // We emit a zero-length placeholder satisfying the schema's
      // min(2) constraint so the beat survives hydrateFreezeBeats —
      // the renderer overrides `path` before the overlay scheduler
      // consumes it. Returning undefined here would silently drop
      // the action beat for both ESC and AOR.
      const playerId = _anchorPlayerId(t.anchor, a)
      if (!playerId) return undefined
      const placeholder: CourtPoint = { x: 0, z: 0 }
      return { kind: 'drive_cut_preview', playerId, path: [placeholder, placeholder] }
    }
    case 'open_space_region': {
      const anchor = _anchorPoint(t.anchor, a)
      if (!anchor) return undefined
      return { kind: 'open_space_region', anchor, radiusFt }
    }
    case 'label': {
      // Cognition module does not author label text — that's owned
      // by replayTeachingTimeline.getDecoderTeachingLabel. Skip;
      // the renderer schedules the label separately.
      return undefined
    }
    case 'timing_pulse': {
      const anchor = _anchorPoint(t.anchor, a)
      if (!anchor) return undefined
      return { kind: 'timing_pulse', anchor, durationMs: 600 }
    }
    default: return undefined
  }
}

// --- progress helpers ------------------------------------------------------

/** Classifies a tick into a CognitionPhase given the freeze entry
 *  tick and the windows above. Pure helper; resolver-friendly so
 *  the scene controller can compute it once per tick.
 *
 *  `msSinceFreezeEnter` is the controller's ms-since-frozen counter
 *  (only valid while in `frozen`). `msSinceHoldEnd` is set once the
 *  cognition hold has ended (handoff window starting). When neither
 *  is provided, the helper uses `t` vs `freezeAtMs`. */
export function classifyCognitionPhase(args: {
  freezeAtMs: number | undefined
  t: number
  msSinceFreezeEnter?: number
  msSinceHoldEnd?: number
}): CognitionPhase {
  const { freezeAtMs, t, msSinceFreezeEnter, msSinceHoldEnd } = args
  if (freezeAtMs === undefined || freezeAtMs < 0) return 'pre'
  if (typeof msSinceHoldEnd === 'number') {
    if (msSinceHoldEnd < FREEZE_HANDOFF_WINDOW_MS) return 'handoff'
    return 'post'
  }
  if (typeof msSinceFreezeEnter === 'number') {
    if (msSinceFreezeEnter <= FREEZE_COGNITION_HOLD_MS) return 'hold'
    return 'handoff'
  }
  if (t < freezeAtMs - FREEZE_RAMP_WINDOW_MS) return 'pre'
  if (t < freezeAtMs) return 'ramp'
  return 'hold'
}

/** Linear ramp progress in [0,1] for the pre-freeze tension ramp.
 *  Returns 0 outside the ramp window. */
export function preFreezeRampProgress(t: number, freezeAtMs: number | undefined): number {
  if (freezeAtMs === undefined || freezeAtMs < 0) return 0
  const start = freezeAtMs - FREEZE_RAMP_WINDOW_MS
  if (t <= start) return 0
  if (t >= freezeAtMs) return 1
  return (t - start) / FREEZE_RAMP_WINDOW_MS
}

/** Cognition-hold scale in [0,1]. Returns 1 throughout the hold,
 *  decays linearly across the handoff window, returns 0 before ramp
 *  and after handoff. The renderer multiplies its peak emphasis by
 *  this scalar so all three coordinated channels (posture, camera,
 *  overlay opacity) decay together. */
export function cognitionScaleAt(args: {
  freezeAtMs: number | undefined
  t: number
  msSinceFreezeEnter?: number
  msSinceHoldEnd?: number
}): number {
  const phase = classifyCognitionPhase(args)
  if (phase === 'pre' || phase === 'post') return 0
  if (phase === 'ramp') return preFreezeRampProgress(args.t, args.freezeAtMs)
  if (phase === 'hold') return 1
  // handoff
  const sinceHold = args.msSinceHoldEnd ?? 0
  const remaining = 1 - sinceHold / FREEZE_HANDOFF_WINDOW_MS
  return remaining < 0 ? 0 : remaining
}

/** Total visible window for the freeze cognition pass relative to
 *  freezeAtMs. Single source of truth — never re-add the constants
 *  by hand. */
export function getFreezeEnvelope(freezeAtMs: number): { startMs: number; endMs: number } {
  return {
    startMs: freezeAtMs - FREEZE_RAMP_WINDOW_MS,
    endMs: freezeAtMs + FREEZE_COGNITION_HOLD_MS + FREEZE_HANDOFF_WINDOW_MS,
  }
}
