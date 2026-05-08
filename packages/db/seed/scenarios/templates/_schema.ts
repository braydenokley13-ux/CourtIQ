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
    onSlot: z.string(),
    role: z.enum(['tag', 'low_man', 'nail', 'stunter', 'overhelp']),
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
 *   - cognitionHoldMs has a 1100ms floor (qa-checklist §6 readability).
 *   - All hold values capped at 4_000ms — anything longer should split
 *     into a HUNT chained-read instead of stretching one freeze.
 */
export const timingOverridesSchema = z.object({
  cognitionHoldMs: z.number().int().min(1100).max(4_000).optional(),
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
  /** Compress freeze duration when freezeMarker.kind === 'atMs'. */
  freezeCompressMs: z.number().int().nonnegative().max(2_000).optional(),
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
 *  are forbidden in the same template. */
export function variationSignature(v: Variant, template: Template): string {
  const userSlot = v.variation.user_slot ?? template.tactical.user_slot_default
  return [
    v.variation.mirror ? 'mirror' : 'orig',
    `slot:${userSlot}`,
    `d:${v.variation.difficulty ?? template.tactical.difficulty_default}`,
    `disg:${v.variation.disguise}`,
    `clk:${v.variation.clock_pressure}`,
  ].join('|')
}
