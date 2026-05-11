/**
 * Template + Variant Zod schemas.
 *
 * Templates are the source of tactical truth. Variants supply prose and
 * select variation knobs. Both compile down to the existing scenario JSON
 * shape via scripts/materialize-templates.ts; the runtime seeder
 * (scripts/seed-scenarios.ts) is unchanged.
 */
import { z } from 'zod'

// -----------------------------------------------------------------------------
// Shared primitives (kept in lockstep with scripts/seed-scenarios.ts)
// -----------------------------------------------------------------------------

export const courtPointSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
})

// Pack 2 (3.1.11) adds READ_THE_COVERAGE (DROP) and HUNT_THE_ADVANTAGE
// (HUNT). Order is significant for snapshot-style outputs (lint coverage
// matrix), so new entries land at the end. Founder four stay first so
// existing fixtures that hash decoder order do not drift.
export const decoderTagSchema = z.enum([
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
  'ADVANTAGE_OR_RESET',
  'READ_THE_COVERAGE',
  'HUNT_THE_ADVANTAGE',
])

export const categorySchema = z.enum(['OFFENSE', 'DEFENSE', 'TRANSITION', 'SITUATIONAL'])

export const movementKindSchema = z.enum([
  'cut',
  'closeout',
  'rotation',
  'lift',
  'drift',
  'pass',
  'drive',
  'stop_ball',
  'back_cut',
  'baseline_sneak',
  'skip_pass',
  'rip',
  'jab',
])

export const overlayKindSchema = z.enum([
  'passing_lane_open',
  'passing_lane_blocked',
  'defender_vision_cone',
  'defender_hip_arrow',
  'defender_foot_arrow',
  'defender_chest_line',
  'defender_hand_in_lane',
  'open_space_region',
  'help_pulse',
  'drive_cut_preview',
  'label',
  'timing_pulse',
])

export const choiceQualitySchema = z.enum(['best', 'acceptable', 'wrong'])

// Controlled vocabulary for `concept_tags` (Phase 3.1.1). Pack 2 grows
// the tag surface area ~4× and a typo would silently route attempts
// to the wrong spaced-rep bucket. The seeder mirrors this enum so
// templates and legacy founder fixtures both fail loudly on unknown
// tags. New tags must land in this list before any scenario using
// them can seed.
//
// Authoring rule: every tag is `lower_snake_case`. Multi-word tags use
// underscores; family prefixes (`pnr_…`, `transition_…`) make the tag
// self-grouping in the coverage matrix.
//
// Pack 2 expansion targets — see blueprint Phase 3.4:
//   - `pnr_*` (DROP family: ball-handler / screener reads)
//   - `chained_*` (HUNT family: kick / swing decisions)
//   - `transition_*` (TRA-coded scenarios)
//   - `late_clock_*` and `closeout_chain` (cross-decoder boss territory)
export const conceptTagSchema = z.enum([
  // Founder / Pack 1 vocabulary (currently authored across founder-v0).
  'catch_and_read',
  'closeout_read',
  'off_ball_movement',
  'passing',
  'post_play',
  'reading_denial',
  'reading_help',
  'screen_action',
  'shot_selection',
  'spacing',
  'timing',
  'transition_advantage',
  // Pack 2 — DROP family (PnR ball-handler reads coverage).
  'pnr_ball_handler_read',
  'pnr_screener_read',
  'screen_defender_coverage_read',
  // Pack 2 — HUNT family (chained second-read).
  'chained_kick_decision',
  'chained_swing_decision',
  'closeout_chain',
  'helper_overcommit_punish',
  // Pack 2 — HUNT family (chained read / mismatch / decoy taxonomy).
  // These appear on hunt-decoder-v0 base scenarios; they were used in
  // authoring before being landed in the controlled vocabulary, which
  // broke `seed:scenarios --dry-run`. Adding them here re-aligns the
  // enum with what HUNT-01..03 actually ship.
  'hunt_chained_read',
  'mismatch_exploit',
  'force_switch',
  'decoy_action',
  // Pack 2 — situational / transition.
  'transition_secondary_break',
  'transition_stop_ball',
  'late_clock_mismatch_hunt',
])

// Cue atoms — controlled vocabulary from the strategy doc taxonomy.
// Pack 2 (3.1.12) adds DROP / HUNT body-language atoms. Order is
// stable; new atoms land at the end so existing materialized templates
// hash identically. Any new atom must be:
//   - referenced from at least one decoder overlay preset OR template,
//   - added to the lesson connection that teaches it, and
//   - covered by a wrong-demo when it is the cue for a 'best' choice.
export const cueAtomSchema = z.enum([
  'hand_in_lane',
  'foot_in_lane',
  'chest_line_blocking',
  'hips_turned_to_ball',
  'top_lock',
  'vision_cone_on_ball',
  'jumped_lane',
  'stunt_and_recover',
  'gap_sit',
  'nail_help',
  'low_man_tag',
  'short_closeout',
  'flying_closeout',
  'balanced_closeout',
  'drop_coverage',
  'over_screen',
  'under_screen',
  'switch_signal',
  'double_team_dig',
  'x_out_recovery',
  // Pack 2 — DROP family (PnR coverage reads).
  'screen_defender_drop',
  'screen_defender_hedge',
  'tag_recovery_late',
  // Pack 2 — HUNT family (chained-decision second reads).
  'helper_overhelp_chain',
  'closeout_chain_first_beat',
  'closeout_chain_second_beat',
])

// -----------------------------------------------------------------------------
// Template player / movement / overlay primitives — slot-keyed
// -----------------------------------------------------------------------------

export const templatePlayerSchema = z.object({
  /** Stable semantic slot. Becomes the player id at materialization. */
  slot: z.string().regex(/^[a-z][a-z0-9_]*$/, 'slot must be lower_snake_case'),
  team: z.enum(['offense', 'defense']),
  /** Animation/role substring used by the renderer's intent dispatcher. */
  role: z.string().min(1),
  label: z.string().min(1).max(8).optional(),
  start: courtPointSchema,
  hasBall: z.boolean().optional(),
})

/** Movement is slot-anchored (`playerSlot`) — materializer rewrites to id. */
export const templateMovementSchema = z.object({
  id: z.string().min(1),
  playerSlot: z.string().min(1),
  kind: movementKindSchema,
  to: courtPointSchema,
  delayMs: z.number().int().nonnegative().max(10_000).optional(),
  durationMs: z.number().int().positive().max(8_000).optional(),
  caption: z.string().max(80).optional(),
})

export const templateOverlaySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('passing_lane_open'), fromSlot: z.string(), toSlot: z.string() }),
  z.object({ kind: z.literal('passing_lane_blocked'), fromSlot: z.string(), toSlot: z.string() }),
  z.object({
    kind: z.literal('defender_vision_cone'),
    onSlot: z.string(),
    targetSlot: z.string().optional(),
  }),
  z.object({ kind: z.literal('defender_hip_arrow'), onSlot: z.string() }),
  z.object({ kind: z.literal('defender_foot_arrow'), onSlot: z.string() }),
  z.object({ kind: z.literal('defender_chest_line'), onSlot: z.string() }),
  z.object({ kind: z.literal('defender_hand_in_lane'), onSlot: z.string() }),
  z.object({
    kind: z.literal('open_space_region'),
    anchor: courtPointSchema,
    radiusFt: z.number().positive().max(20).default(4),
  }),
  z.object({
    kind: z.literal('help_pulse'),
    // `mismatch` named the HUNT pack's mismatch defender; it shipped in
    // the runtime schema (`apps/web/lib/scenario3d/schema.ts`) but the
    // seed-side mirror was missed, breaking `seed:scenarios --dry-run`
    // for every HUNT scenario that uses it.
    onSlot: z.string(),
    role: z.enum(['tag', 'low_man', 'nail', 'stunter', 'overhelp', 'mismatch']),
  }),
  z.object({
    kind: z.literal('drive_cut_preview'),
    onSlot: z.string(),
    path: z.array(courtPointSchema).min(2).max(8),
  }),
  z.object({ kind: z.literal('label'), anchor: courtPointSchema, text: z.string().min(1).max(24) }),
  z.object({
    kind: z.literal('timing_pulse'),
    anchor: courtPointSchema,
    durationMs: z.number().int().positive().max(10_000),
  }),
])

export const wrongDemoMovementSchema = templateMovementSchema

export const templateWrongDemoSchema = z.object({
  /** Outcome key — joins to template.choices[*].outcome. */
  outcome: z.string().regex(/^[a-z][a-z0-9_]*$/, 'outcome must be lower_snake_case'),
  movements: z.array(wrongDemoMovementSchema).max(32),
  caption: z.string().max(80).optional(),
})

/**
 * Pack 2 Teaching-Quality F11 — `acceptable` choice demo path.
 *
 * Risk M4: the schema declares an `acceptable` quality but the replay
 * model has no slot for it — the player can never see what
 * "second-best" looks like. F11 adds an optional list of demo
 * movements parallel to wrongDemos, indexed by the same outcome key,
 * but joining to choices whose quality is `acceptable`. Authors opt
 * in per template; absence is fine — the controller short-circuits
 * to the answer leg as today.
 *
 * Same shape as templateWrongDemoSchema so the runtime/materializer
 * paths can mirror the wrong-demo plumbing.
 */
export const templateAcceptableDemoSchema = z.object({
  /** Outcome key — joins to template.choices[*].outcome where quality === 'acceptable'. */
  outcome: z.string().regex(/^[a-z][a-z0-9_]*$/, 'outcome must be lower_snake_case'),
  movements: z.array(wrongDemoMovementSchema).max(32),
  caption: z.string().max(80).optional(),
})

export const templateChoiceSchema = z.object({
  /** Stable semantic key the variant uses to attach prose. */
  outcome: z.string().regex(/^[a-z][a-z0-9_]*$/, 'outcome must be lower_snake_case'),
  quality: choiceQualitySchema,
  /** Sequential order, 1..N. Exactly one quality=best required. */
  order: z.number().int().min(1).max(4),
})

// -----------------------------------------------------------------------------
// Freeze marker, timing overrides, beat spec (Phase 3.1.4)
// -----------------------------------------------------------------------------

/** Discriminated freeze-marker — `atMs` for absolute placement, or
 *  `beforeMovementId` to anchor to a movement boundary. The seeder
 *  schema in scripts/seed-scenarios.ts mirrors this shape. */
export const freezeMarkerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('atMs'), atMs: z.number().int().nonnegative().max(60_000) }),
  z.object({ kind: z.literal('beforeMovementId'), movementId: z.string().min(1) }),
])

/**
 * Per-scenario hold targets the runtime applies on top of the module-
 * level defaults in `freezeFrameCognition.ts`. Every field is optional;
 * the renderer falls back to the default when a field is absent.
 *
 *   - cognitionHoldMs       — replaces FREEZE_COGNITION_HOLD_MS (1400)
 *   - choiceTrayAtMs        — replaces CHOICE_TRAY_AT_MS (1400)
 *   - cueRepaintHoldCorrectMs — replaces CUE_REPAINT_HOLD_CORRECT_MS (600)
 *   - cueRepaintHoldWrongMs   — replaces CUE_REPAINT_HOLD_WRONG_MS (400)
 *
 * Floors:
 *   - cognitionHoldMs ≥ 800ms (the absolute floor across every
 *     difficulty — see `ABSOLUTE_COGNITION_HOLD_FLOOR_MS` in
 *     freezeFrameCognition.ts). Pack 2 Teaching-Quality F1: the
 *     per-difficulty narrowing (D1-D3=1100, D4=1000, D5=800) is
 *     enforced in the materializer (scripts/materialize-templates.ts)
 *     against the variant's effective difficulty
 *     (`cognitionHoldFloorForDifficulty`). The schema only enforces
 *     the absolute floor so a template can be parsed in isolation
 *     before its variants are joined.
 *   - All hold values capped at 4_000ms — anything longer should split
 *     into a HUNT chained-read instead of stretching one freeze.
 */
export const timingOverridesSchema = z.object({
  cognitionHoldMs: z.number().int().min(800).max(4_000).optional(),
  choiceTrayAtMs: z.number().int().min(0).max(4_000).optional(),
  cueRepaintHoldCorrectMs: z.number().int().min(200).max(4_000).optional(),
  cueRepaintHoldWrongMs: z.number().int().min(200).max(4_000).optional(),
})

/**
 * Pack 2 HUNT chained-read scenarios use two freeze beats. The first
 * beat resolves; camera holds for ~400ms on the result; the second
 * beat starts. If `beatSpec` is present, the runtime treats the
 * scenario as multi-beat: schema requires `firstBeat`; `secondBeat`
 * is optional so the spec can ship without breaking single-beat
 * scenarios that opt-in for the data shape.
 */
export const beatSpecSchema = z.object({
  firstBeat: freezeMarkerSchema,
  secondBeat: freezeMarkerSchema.optional(),
})

// -----------------------------------------------------------------------------
// Disguise menu
// -----------------------------------------------------------------------------

export const disguiseLevelSchema = z.object({
  /** Overlay kinds (with optional onSlot match) to remove from `overlays.pre`. */
  removePre: z
    .array(
      z.object({
        kind: overlayKindSchema,
        /** When set, only remove overlays whose anchor slot matches. */
        onSlot: z.string().optional(),
      }),
    )
    .default([]),
  /** Pack 2 Teaching-Quality F2: shifts the freezeMarker EARLIER by
   *  this many ms when freezeMarker.kind === 'atMs'. Renamed from the
   *  legacy `freezeCompressMs` whose name implied it compressed the
   *  cognition hold — it does not (the hold is fixed by
   *  cognitionHoldMs). The renamed field accurately describes the
   *  behaviour: the freeze marker moves earlier in the possession,
   *  the player gets less time to read pre-freeze motion before the
   *  freeze hits. To compress thinking time itself, use
   *  `cognitionHoldCompressMs` below. */
  freezeShiftEarlierMs: z.number().int().nonnegative().max(2_000).optional(),
  /** Pack 2 Teaching-Quality F2: subtracts this many ms from the
   *  resolved cognition hold (template default OR scene
   *  timingOverrides.cognitionHoldMs) when this disguise level is
   *  applied. Heavy disguise can now compose two effects: shift
   *  the freeze earlier (less pre-freeze read time) AND tighten
   *  thinking time (less cognition hold). The materializer enforces
   *  the per-D F1 floor on the resolved hold so a heavy disguise
   *  cannot drag a D1 variant below 1100ms. */
  cognitionHoldCompressMs: z
    .number()
    .int()
    .nonnegative()
    .max(2_000)
    .optional(),
  /** Difficulty bump applied on top of variation.difficulty if author leaves it default. */
  difficultyBump: z.number().int().nonnegative().max(3).default(0),
})

export const disguiseMenuSchema = z.object({
  none: disguiseLevelSchema.default({ removePre: [], difficultyBump: 0 }),
  light: disguiseLevelSchema.optional(),
  moderate: disguiseLevelSchema.optional(),
  heavy: disguiseLevelSchema.optional(),
})

// -----------------------------------------------------------------------------
// Coach validation (mirror of seed-scenarios.ts)
// -----------------------------------------------------------------------------

export const coachValidationSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  status: z.enum(['not_needed', 'needed', 'reviewed', 'approved']),
  notes: z.string().optional(),
})

// -----------------------------------------------------------------------------
// Template
// -----------------------------------------------------------------------------

export const templateSchema = z.object({
  id: z.string().regex(/^[A-Z]{3,4}\.[a-z][a-z0-9-]*$/, 'template id must be DEC.kebab'),
  decoder_tag: decoderTagSchema,
  category: categorySchema,
  concept_tags: z.array(conceptTagSchema).min(1),
  sub_concepts: z.array(z.string().min(1)).default([]),

  tactical: z.object({
    cue_atoms: z.array(cueAtomSchema).min(1).max(4),
    primary_defender_slot: z.string().min(1),
    user_slot_default: z.string().min(1),
    teaching_point: z.string().min(1),
    common_miss_reason: z.string().min(1),
    why_best_read_works: z.string().min(1),
    lesson_connection: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'lesson_connection must be a lowercase, hyphenated module slug'),
    /** Default difficulty for `disguise: 'none'`. */
    difficulty_default: z.number().int().min(1).max(5),
    /**
     * Pack 2 Teaching-Quality F10 — handedness sensitivity declaration.
     *
     *   - 'symmetric'           — the read teaches the same concept on
     *     either handedness; mirror=true variants are safe.
     *   - 'right-handed-only'   — the read assumes a right-handed
     *     finish (e.g. a back-cut to a right-handed layup). Lint
     *     rejects mirror=true variants because the mirrored cut
     *     becomes a left-handed cut, which is cognitively harder
     *     without being tactically harder (audit Q7 / M2).
     *   - 'left-handed-only'    — the symmetric case for left-hand finishes.
     *   - 'review-each-mirror'  — explicit author sign-off required;
     *     each mirror=true variant must declare a non-empty
     *     `variation.mirror_review_note` so the lint can confirm a
     *     human looked at the mirrored play.
     *
     * Defaults to 'symmetric' so existing templates keep their current
     * mirror behaviour until an author opts into stricter handling.
     */
    mirror_safety: z
      .enum([
        'symmetric',
        'right-handed-only',
        'left-handed-only',
        'review-each-mirror',
      ])
      .default('symmetric'),
  }),

  scene: z.object({
    type: z.string().min(1).max(48).optional(),
    court: z.enum(['half', 'full']).default('half'),
    camera: z
      .enum(['teaching_angle', 'defense', 'top_down', 'passer_side_three_quarter'])
      .default('teaching_angle'),
    players: z.array(templatePlayerSchema).min(4).max(10),
    ball: z.object({ holderSlot: z.string().min(1) }),
    movements: z.array(templateMovementSchema).max(32).default([]),
    answerDemo: z.array(templateMovementSchema).max(32).default([]),
    freezeMarker: freezeMarkerSchema.optional(),
    wrongDemos: z.array(templateWrongDemoSchema).max(8).default([]),
    /** Pack 2 Teaching-Quality F11 — optional demo paths for choices
     *  with quality === 'acceptable'. Indexed by outcome (mirrors the
     *  wrongDemos shape). When present and the player picks the
     *  matching `acceptable` choice, the replay controller plays the
     *  acceptable-demo as the consequence leg before transitioning to
     *  the answer demo. Absence preserves Pack 1 behaviour: acceptable
     *  picks short-circuit to the answer leg. */
    acceptableDemos: z.array(templateAcceptableDemoSchema).max(8).default([]),
    // Phase 3.1.4 — per-scenario timing override block. The blueprint
    // §2.3 specifies per-difficulty cognition hold targets (D1-D2 =
    // 1400ms, D3 = 1200, D4 = 1000, D5 = 800). Authors opt in by
    // setting any subset of these fields; absent fields fall back to
    // the renderer's module-level constants. The 1100ms floor is
    // enforced here at parse time so a typo cannot land below the
    // basketball-readability floor specified in qa-checklist §6.
    timingOverrides: timingOverridesSchema.optional(),
    // Phase 3.1.4 — HUNT chained-read scenarios use two freeze beats.
    // beatSpec.firstBeat is the primary read; beatSpec.secondBeat is
    // the chained second read. When present, both beats independently
    // satisfy QA framing rules (qa-checklist §3) and overlay caps.
    beatSpec: beatSpecSchema.optional(),
  }),

  overlays: z.object({
    pre: z.array(templateOverlaySchema).max(16).default([]),
    post: z.array(templateOverlaySchema).max(16).default([]),
  }),

  choices: z.array(templateChoiceSchema).min(2).max(4),

  disguises: disguiseMenuSchema.default({ none: { removePre: [], difficultyBump: 0 } }),

  coach_validation: coachValidationSchema,

  /**
   * Animation / xp defaults. Variants may override per scenario.
   */
  defaults: z
    .object({
      xp_reward: z.number().int().positive().default(12),
      mastery_weight: z.number().positive().default(1),
      render_tier: z.number().int().positive().default(1),
    })
    .default({}),
})

// -----------------------------------------------------------------------------
// Variant
// -----------------------------------------------------------------------------

export const variantChoiceCopySchema = z.object({
  label: z.string().min(1).max(120),
  feedback_text: z.string().min(1),
  partial_feedback_text: z.string().min(1).optional(),
})

export const variantOverrideSchema = z.object({
  players: z
    .array(
      z.object({
        slot: z.string().min(1),
        start: courtPointSchema,
      }),
    )
    .max(8)
    .default([]),
  movements: z
    .array(
      z.object({
        id: z.string().min(1),
        to: courtPointSchema.optional(),
        delayMs: z.number().int().nonnegative().max(10_000).optional(),
        durationMs: z.number().int().positive().max(8_000).optional(),
      }),
    )
    .max(8)
    .default([]),
})

export const variationSchema = z.object({
  user_slot: z.string().min(1).optional(),
  mirror: z.boolean().default(false),
  difficulty: z.number().int().min(1).max(5).optional(),
  disguise: z.enum(['none', 'light', 'moderate', 'heavy']).default('none'),
  clock_pressure: z.enum(['none', 'shot_clock', 'game_clock']).default('none'),
  overrides: variantOverrideSchema.default({ players: [], movements: [] }),
  /**
   * Pack 2 Teaching-Quality F10 — required when the parent template
   * declares `tactical.mirror_safety: 'review-each-mirror'` AND
   * `mirror: true`. The note records the author's confirmation that
   * the mirrored play teaches the same concept (e.g. "right-hand
   * back-cut mirrors to a left-hand back-cut; both are taught in
   * Module 4"). The lint enforces presence; freeform string so
   * authors can capture nuance without a controlled vocabulary.
   */
  mirror_review_note: z.string().min(1).max(280).optional(),
})

export const variantSchema = z.object({
  id: z.string().regex(/^[A-Z]{3,4}-T\d+-\d{2}$/, 'variant id must be DEC-T<n>-NN (e.g. BDW-T1-01)'),
  template: z.string().min(1),
  status: z.enum(['DRAFT', 'REVIEW', 'LIVE', 'RETIRED']).default('DRAFT'),
  version: z.number().int().positive().default(1),

  copy: z.object({
    title: z.string().min(1).max(80),
    prompt: z.string().min(1).max(140),
    game_context: z.string().min(1),
    possession_setup: z.string().min(1),
    decision_moment: z.string().min(1),
    visible_cue: z.string().min(1),
    best_read: z.string().min(1),
    explanation_md: z.string().min(1),
    feedback: z.object({
      correct: z.string().min(1),
      partial: z.string().min(1).optional(),
      wrong: z.string().min(1),
    }),
    self_review_checklist: z.array(z.string().min(1)).min(2).max(6),
    acceptable_reads: z.array(z.string().min(1)).default([]),
    bad_reads: z.array(z.string().min(1)).default([]),
    /** Keyed by template choice outcome. */
    choices: z.record(z.string(), variantChoiceCopySchema),
  }),

  variation: variationSchema.default({
    mirror: false,
    disguise: 'none',
    clock_pressure: 'none',
    overrides: { players: [], movements: [] },
  }),

  xp_reward: z.number().int().positive().optional(),
  mastery_weight: z.number().positive().optional(),
  render_tier: z.number().int().positive().optional(),
})

// -----------------------------------------------------------------------------
// Pack 2 §3.3 — Prose bank
// -----------------------------------------------------------------------------
//
// The prose-bank is a per-template library of slot-fillable feedback
// skeletons. The bank is data-only at this milestone; runtime variant
// consumption is deferred to a follow-up phase. The schema landing
// here gives the scaffolder + future linters a stable parse target.
//
// Slot identifiers are validated against `PROSE_BANK_SLOT_IDS` from
// `_proseBankSlots.ts`. The validation is performed by a superRefine
// rather than `z.enum` because skeletons are free-text strings that
// happen to contain `{slot}` tokens; the brace-stripping happens via
// `findProseBankSlotsIn`.
//
// Bank file layout
// ----------------
//   <template-dir>/prose-bank.json
//
// Bank shape
// ----------
//   {
//     "template": "BDW.denied-wing",
//     "version": 1,
//     "entries": [
//       {
//         "quality": "best",
//         "tone": "encouraging",
//         "skeletons": ["...{cue_atom_short_desc}..."]
//       }
//     ]
//   }

import {
  PROSE_BANK_TONES,
  PROSE_BANK_SLOT_ID_SET,
  findProseBankSlotsIn,
} from './_proseBankSlots'

export const proseBankEntrySchema = z
  .object({
    quality: choiceQualitySchema,
    tone: z.enum(PROSE_BANK_TONES),
    skeletons: z.array(z.string().min(1)).min(1).max(8),
  })
  .superRefine((entry, ctx) => {
    for (let i = 0; i < entry.skeletons.length; i++) {
      const skeleton = entry.skeletons[i] as string
      const slots = findProseBankSlotsIn(skeleton)
      for (const slot of slots) {
        if (!PROSE_BANK_SLOT_ID_SET.has(slot)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['skeletons', i],
            message: `Unknown prose-bank slot "{${slot}}". See PROSE_BANK_SLOT_IDS in _proseBankSlots.ts.`,
          })
        }
      }
    }
  })

export const proseBankSchema = z.object({
  template: z
    .string()
    .regex(/^[A-Z]{3,4}\.[a-z][a-z0-9-]*$/, 'template id must be DEC.kebab'),
  version: z.number().int().positive().default(1),
  entries: z.array(proseBankEntrySchema).min(1).max(24),
})

export type ProseBankEntry = z.infer<typeof proseBankEntrySchema>
export type ProseBank = z.infer<typeof proseBankSchema>

// -----------------------------------------------------------------------------
// Inferred types
// -----------------------------------------------------------------------------

export type Template = z.infer<typeof templateSchema>
export type Variant = z.infer<typeof variantSchema>
export type DisguiseLevel = z.infer<typeof disguiseLevelSchema>
export type CueAtom = z.infer<typeof cueAtomSchema>

// -----------------------------------------------------------------------------
// Variation-signature derivation (lint helper)
// -----------------------------------------------------------------------------

/** Stable signature for repetition lint. Two variants with the same signature
 *  are forbidden in the same template.
 *
 *  Pack 2 Teaching-Quality F9: includes a deterministic content hash of
 *  the resolved disguise level (its removePre set, difficultyBump, and
 *  freezeCompressMs). Two variants that pick the same disguise NAME
 *  always produce the same hash today (disguise content is template-
 *  level, not variant-level), so this is behaviour-preserving for the
 *  current data shape. The forward-compat win: when per-variant
 *  disguise overrides land, or when an existing template's disguise
 *  config is edited mid-cycle, the signature can no longer accidentally
 *  collapse two variants with materially different surviving cues into
 *  the same key.
 */
export function variationSignature(v: Variant, template: Template): string {
  const userSlot = v.variation.user_slot ?? template.tactical.user_slot_default
  return [
    v.variation.mirror ? 'mirror' : 'orig',
    `slot:${userSlot}`,
    `d:${v.variation.difficulty ?? template.tactical.difficulty_default}`,
    `disg:${v.variation.disguise}`,
    `dh:${disguiseContentFingerprint(template, v.variation.disguise)}`,
    `clk:${v.variation.clock_pressure}`,
  ].join('|')
}

/** Deterministic, human-readable fingerprint of a disguise level's
 *  effective content. Two disguise configs with the same removePre set
 *  (order-insensitive), the same difficultyBump, the same
 *  freezeShiftEarlierMs, and the same cognitionHoldCompressMs always
 *  produce identical fingerprints. Used by `variationSignature` so
 *  the deduplicator stays honest when disguise content evolves.
 *
 *  Returns 'absent' for an unmapped disguise level. The variant
 *  schema's default is `disguise: 'none'` and the menu's `none` entry
 *  always exists, so `absent` is a defence-in-depth path.
 */
export function disguiseContentFingerprint(
  template: Template,
  disguiseName: 'none' | 'light' | 'moderate' | 'heavy',
): string {
  const cfg = template.disguises[disguiseName]
  if (!cfg) return 'absent'
  const removeSorted = [...(cfg.removePre ?? [])]
    .map((r) => `${r.kind}|${r.onSlot ?? '_'}`)
    .sort()
    .join(',')
  const bump = cfg.difficultyBump ?? 0
  const shift = cfg.freezeShiftEarlierMs ?? 0
  const cogCompress = cfg.cognitionHoldCompressMs ?? 0
  return `r[${removeSorted}]b${bump}s${shift}h${cogCompress}`
}
