import { PrismaClient, Category, ChoiceQuality, DecoderTag, ScenarioStatus } from '@prisma/client';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SCENARIOS_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios');

const playerSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  role: z.string().min(1),
  hasBall: z.boolean().optional(),
});

// Pack 1 / Phase F adds 4-on-4 decoder scenarios (BDW-01, ESC-01, AOR-01,
// SKR-01). Every existing fixture ships full 5-on-5, so the lower bound of
// 4 is purely additive — legacy data parses unchanged.
const courtStateSchema = z.object({
  offense: z.array(playerSchema).min(4).max(5),
  defense: z.array(playerSchema).min(4).max(5),
  ball_location: z.object({ x: z.number(), y: z.number() }),
  defender_orientation: z.unknown().optional(),
  motion_cues: z.unknown().optional(),
});

// Phase B additions — choice quality + decoder taxonomy (Section 4.1/4.2).
// Mirrored from apps/web/lib/scenario3d/schema.ts so the seed validator and
// the runtime stay in lockstep.
const choiceQualitySchema = z.enum(['best', 'acceptable', 'wrong']);

const decoderTagSchema = z.enum([
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
  'ADVANTAGE_OR_RESET',
]);

// Choice schema accepts BOTH legacy (`is_correct: boolean`) and new
// (`quality: ChoiceQuality`) shapes. At least one must be present;
// when both are present they must agree (`is_correct === quality !==
// 'wrong'`). The seeder derives the missing field at write time so the
// existing Prisma `is_correct` column stays valid for legacy code paths
// (Phase C is what adds the `quality` column to Prisma).
const choiceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    is_correct: z.boolean().optional(),
    quality: choiceQualitySchema.optional(),
    feedback_text: z.string().min(1),
    partial_feedback_text: z.string().min(1).optional(),
    order: z.number().int().min(1),
  })
  .superRefine((c, ctx) => {
    if (c.is_correct === undefined && c.quality === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `choice "${c.id}" must declare is_correct or quality.`,
      });
      return;
    }
    if (c.is_correct !== undefined && c.quality !== undefined) {
      const expected = c.quality !== 'wrong';
      if (expected !== c.is_correct) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `choice "${c.id}" is_correct=${c.is_correct} disagrees with quality=${c.quality}.`,
        });
      }
    }
  });

function deriveIsCorrect(choice: { is_correct?: boolean; quality?: ZodChoiceQuality }): boolean {
  if (choice.is_correct !== undefined) return choice.is_correct;
  return choice.quality !== 'wrong' && choice.quality !== undefined;
}

/**
 * Derives the new `quality` column from whichever fields the JSON ships.
 * When `quality` is authored, it wins; when only `is_correct` is present,
 * `true` becomes `'best'` and `false` becomes `'wrong'` per Section 4.2's
 * back-compat rule. Returns the Prisma enum value so the caller can
 * write it directly with no extra casting.
 */
function deriveQuality(choice: {
  is_correct?: boolean
  quality?: ZodChoiceQuality
}): ChoiceQuality {
  if (choice.quality !== undefined) return choice.quality as ChoiceQuality;
  return choice.is_correct ? ChoiceQuality.best : ChoiceQuality.wrong;
}

type ZodChoiceQuality = z.infer<typeof choiceQualitySchema>;

// --- Optional 3D scene block ----------------------------------------------
const courtPointSchema = z.object({ x: z.number().finite(), z: z.number().finite() });

const scenePlayerSchema = z.object({
  id: z.string().min(1),
  team: z.enum(['offense', 'defense']),
  role: z.string().min(1),
  label: z.string().min(1).max(8).optional(),
  start: courtPointSchema,
  isUser: z.boolean().optional(),
  hasBall: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,8}$/, 'color must be a hex like #3BE383')
    .optional(),
});

const sceneBallSchema = z.object({
  start: courtPointSchema,
  holderId: z.string().min(1).optional(),
});

const movementKindSchema = z.enum([
  // Existing kinds.
  'cut',
  'closeout',
  'rotation',
  'lift',
  'drift',
  'pass',
  'drive',
  'stop_ball',
  // Phase B additions — mirror of apps/web/lib/scenario3d/schema.ts.
  'back_cut',
  'baseline_sneak',
  'skip_pass',
  'rip',
  'jab',
]);

const sceneMovementSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  kind: movementKindSchema,
  to: courtPointSchema,
  delayMs: z.number().int().nonnegative().max(10_000).optional(),
  durationMs: z.number().int().positive().max(8_000).optional(),
  caption: z.string().max(80).optional(),
});

// --- Phase B additive scene schemas (mirror of apps/web/lib/scenario3d/schema.ts)

const freezeMarkerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('atMs'),
    atMs: z.number().int().nonnegative().max(60_000),
  }),
  z.object({
    kind: z.literal('beforeMovementId'),
    movementId: z.string().min(1),
  }),
]);

const wrongDemoSchema = z.object({
  choiceId: z.string().min(1),
  movements: z.array(sceneMovementSchema).max(32),
  caption: z.string().max(80).optional(),
});

const overlayPrimitiveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('passing_lane_open'), from: z.string().min(1), to: z.string().min(1) }),
  z.object({ kind: z.literal('passing_lane_blocked'), from: z.string().min(1), to: z.string().min(1) }),
  z.object({
    kind: z.literal('defender_vision_cone'),
    playerId: z.string().min(1),
    targetId: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('defender_hip_arrow'), playerId: z.string().min(1) }),
  z.object({ kind: z.literal('defender_foot_arrow'), playerId: z.string().min(1) }),
  z.object({ kind: z.literal('defender_chest_line'), playerId: z.string().min(1) }),
  z.object({ kind: z.literal('defender_hand_in_lane'), playerId: z.string().min(1) }),
  z.object({
    kind: z.literal('open_space_region'),
    anchor: courtPointSchema,
    radiusFt: z.number().positive().max(20).default(4),
  }),
  z.object({
    kind: z.literal('help_pulse'),
    playerId: z.string().min(1),
    role: z.enum(['tag', 'low_man', 'nail', 'stunter', 'overhelp']),
  }),
  z.object({
    kind: z.literal('drive_cut_preview'),
    playerId: z.string().min(1),
    path: z.array(courtPointSchema).min(2).max(8),
  }),
  z.object({ kind: z.literal('label'), anchor: courtPointSchema, text: z.string().min(1).max(24) }),
  z.object({
    kind: z.literal('timing_pulse'),
    anchor: courtPointSchema,
    durationMs: z.number().int().positive().max(10_000),
  }),
]);

const PRE_ANSWER_OVERLAY_KINDS = new Set([
  'defender_vision_cone',
  'defender_hip_arrow',
  'defender_foot_arrow',
  'defender_chest_line',
  'defender_hand_in_lane',
  'help_pulse',
  'label',
]);

const coachValidationSchema = z
  .object({
    level: z.enum(['low', 'medium', 'high']),
    status: z.enum(['not_needed', 'needed', 'reviewed', 'approved']),
    notes: z.string().optional(),
    reviewerId: z.string().min(1).optional(),
    reviewedAt: z.string().datetime().optional(),
  })
  .superRefine((cv, ctx) => {
    if (cv.level === 'high' && cv.status === 'not_needed') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'level=high requires explicit review (not_needed is invalid).',
      });
    }
  });

const sceneSchema = z
  .object({
    type: z.string().min(1).max(48).optional(),
    court: z.enum(['half', 'full']).default('half'),
    camera: z
      .enum(['teaching_angle', 'defense', 'top_down', 'passer_side_three_quarter'])
      .default('teaching_angle'),
    players: z.array(scenePlayerSchema).min(1).max(10),
    ball: sceneBallSchema,
    movements: z.array(sceneMovementSchema).max(32).default([]),
    answerDemo: z.array(sceneMovementSchema).max(32).default([]),
    freezeMarker: freezeMarkerSchema.optional(),
    wrongDemos: z.array(wrongDemoSchema).max(8).default([]),
    preAnswerOverlays: z.array(overlayPrimitiveSchema).max(16).default([]),
    postAnswerOverlays: z.array(overlayPrimitiveSchema).max(16).default([]),
  })
  .superRefine((scene, ctx) => {
    const userPlayers = scene.players.filter((p) => p.isUser);
    if (userPlayers.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['players'],
        message: `At most one player may be marked isUser; found ${userPlayers.length}.`,
      });
    }
    const ids = new Set<string>();
    for (const p of scene.players) {
      if (ids.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['players'],
          message: `Duplicate player id "${p.id}".`,
        });
      }
      ids.add(p.id);
    }
    if (scene.ball.holderId && !ids.has(scene.ball.holderId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ball', 'holderId'],
        message: `holderId "${scene.ball.holderId}" does not match any player id.`,
      });
    }
    const validTargets = new Set([...ids, 'ball']);
    const movementIds = new Set<string>();
    for (const list of [scene.movements, scene.answerDemo]) {
      for (const m of list) {
        if (!validTargets.has(m.playerId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['movements'],
            message: `movement "${m.id}" references unknown playerId "${m.playerId}".`,
          });
        }
      }
    }
    for (const m of scene.movements) movementIds.add(m.id);

    for (let i = 0; i < scene.wrongDemos.length; i++) {
      const demo = scene.wrongDemos[i]!;
      for (const m of demo.movements) {
        if (!validTargets.has(m.playerId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['wrongDemos', i, 'movements'],
            message: `wrongDemos[${i}].movement "${m.id}" references unknown playerId "${m.playerId}".`,
          });
        }
      }
    }

    if (scene.freezeMarker?.kind === 'beforeMovementId') {
      if (!movementIds.has(scene.freezeMarker.movementId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['freezeMarker', 'movementId'],
          message: `freezeMarker.movementId "${scene.freezeMarker.movementId}" does not match any scene.movements[*].id.`,
        });
      }
    }

    for (let i = 0; i < scene.preAnswerOverlays.length; i++) {
      const ov = scene.preAnswerOverlays[i]!;
      if (!PRE_ANSWER_OVERLAY_KINDS.has(ov.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['preAnswerOverlays', i, 'kind'],
          message: `pre-answer overlay "${ov.kind}" is not in the allow-list.`,
        });
      }
    }
  });

// --- Phase F authoring fields (Section 4.3 / 7) --------------------------
// These mirror the planning doc's `ScenarioSchema` content fields. They are
// validated at seed time but not persisted to Prisma yet — Phase I/J wire
// the lesson panel, self-review checklist, and decoder mastery against the
// real DB columns. Today they are kept here so authoring discipline (and
// the BDW-01 fail-fast rule) is enforced at the JSON boundary.
const scenarioFeedbackSchema = z.object({
  correct: z.string().min(1),
  partial: z.string().min(1).optional(),
  wrong: z.string().min(1),
});

const progressionMetadataSchema = z.object({
  unlocks: z.array(z.string().min(1)).default([]),
  prerequisites: z.array(z.string().min(1)).default([]),
});

const scenarioSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive().default(1),
    status: z.nativeEnum(ScenarioStatus).default(ScenarioStatus.DRAFT),
    title: z.string().min(1).max(80).optional(),
    category: z.nativeEnum(Category),
    concept_tags: z.array(z.string().min(1)).min(1),
    sub_concepts: z.array(z.string().min(1)).default([]),
    difficulty: z.number().int().min(1).max(5),
    user_role: z.string().min(1),
    court_state: courtStateSchema,
    prompt: z.string().min(1).max(140),
    choices: z.array(choiceSchema).min(2).max(4),
    explanation_md: z.string().min(1),
    xp_reward: z.number().int().positive().default(10),
    mastery_weight: z.number().positive().default(1),
    render_tier: z.number().int().positive().default(1),
    media_refs: z.array(z.string()).default([]),
    scene: sceneSchema.optional(),
    // Phase B / C: decoder_tag is persisted on Scenario as of the
    // `add_decoder_and_quality` migration. Optional — legacy fixtures
    // omit it, and Prisma stores them with NULL.
    decoder_tag: decoderTagSchema.optional(),
    // coach_validation is validated here but is NOT persisted on
    // Scenario yet. The seeder uses it for the gating rule below; the
    // backing column is intentionally deferred to a later phase to
    // avoid forcing a per-row migration today.
    coach_validation: coachValidationSchema.optional(),
    // Phase F authoring fields. Optional at the schema level so legacy
    // fixtures parse unchanged; required-when-decoder is enforced in the
    // superRefine below.
    game_context: z.string().min(1).optional(),
    possession_setup: z.string().min(1).optional(),
    decision_moment: z.string().min(1).optional(),
    visible_cue: z.string().min(1).optional(),
    best_read: z.string().min(1).optional(),
    acceptable_reads: z.array(z.string().min(1)).default([]),
    bad_reads: z.array(z.string().min(1)).default([]),
    common_miss_reason: z.string().min(1).optional(),
    why_best_read_works: z.string().min(1).optional(),
    decoder_teaching_point: z.string().min(1).optional(),
    lesson_connection: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'lesson_connection must be a lowercase, hyphenated module slug')
      .optional(),
    feedback: scenarioFeedbackSchema.optional(),
    self_review_checklist: z.array(z.string().min(1)).min(2).max(6).optional(),
    source_research_basis: z.string().optional(),
    progression_metadata: progressionMetadataSchema.optional(),
  })
  .superRefine((scenario, ctx) => {
    // Phase B/C: with three-quality choices, "exactly one correct" becomes
    // "exactly one quality=best". Legacy fixtures (no `quality`) derive
    // `quality='best'` only when `is_correct: true`, so this remains a
    // strict generalisation of the old rule.
    const bestCount = scenario.choices.filter((c) => deriveQuality(c) === ChoiceQuality.best).length;
    if (bestCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices'],
        message: `Exactly one choice must be quality='best'; found ${bestCount}.`,
      });
    }

    const sorted = [...scenario.choices].sort((a, b) => a.order - b.order);
    sorted.forEach((choice, index) => {
      if (choice.order !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['choices', index, 'order'],
          message: 'Choice order must be sequential starting at 1.',
        });
      }
    });

    // wrongDemos[].choiceId must reference an actual choice on this
    // scenario. Scene-level superRefine can't see choices; cross-field
    // checks live here.
    if (scenario.scene?.wrongDemos && scenario.scene.wrongDemos.length > 0) {
      const choiceIds = new Set(scenario.choices.map((c) => c.id));
      scenario.scene.wrongDemos.forEach((wd, i) => {
        if (!choiceIds.has(wd.choiceId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scene', 'wrongDemos', i, 'choiceId'],
            message: `wrongDemos[${i}].choiceId "${wd.choiceId}" does not match any choice on this scenario.`,
          });
        }
      });
    }

    // Coach-validation gating (Section 4.6). LIVE + level=high +
    // status !== 'approved' is rejected unless the operator passes
    // --allow-unvalidated. medium/low fall through silently here; the
    // seeder logs warnings for medium at write time.
    if (
      scenario.status === ScenarioStatus.LIVE &&
      scenario.coach_validation?.level === 'high' &&
      scenario.coach_validation.status !== 'approved' &&
      !ALLOW_UNVALIDATED
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coach_validation', 'status'],
        message:
          'LIVE scenarios with coach_validation.level=high require status=approved (or pass --allow-unvalidated).',
      });
    }

    // Section 4.9 / 10.2 — decoder authoring discipline. Any scenario that
    // declares a `decoder_tag` (i.e., a Pack 1+ decoder scenario) must ship
    // the full teaching surface: best-read text, decoder teaching point,
    // lesson connection, feedback for correct + wrong, a self-review
    // checklist, and at least one `wrongDemos` entry to keep the
    // consequence-replay path exercised.
    if (scenario.decoder_tag) {
      const decoderRequired: Array<[string, unknown]> = [
        ['best_read', scenario.best_read],
        ['decoder_teaching_point', scenario.decoder_teaching_point],
        ['lesson_connection', scenario.lesson_connection],
        ['feedback', scenario.feedback],
        ['self_review_checklist', scenario.self_review_checklist],
      ];
      for (const [field, value] of decoderRequired) {
        if (value === undefined || value === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `decoder scenarios require "${field}".`,
          });
        }
      }
      if (!scenario.scene?.wrongDemos || scenario.scene.wrongDemos.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scene', 'wrongDemos'],
          message: 'decoder scenarios require at least one wrongDemos entry.',
        });
      }
    }
  });

// CLI flag — populated in main(). Read inside the schema so the gate is
// enforced at parse time rather than after upsert.
let ALLOW_UNVALIDATED = false;

// Each pack ships a `pack.json` manifest declaring an ordered scenario
// list. Manifests are validated; the seeder reads each scenario file in
// declared order so progression unlocks (Section 8) stay deterministic.
const packScenarioEntrySchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  prerequisites: z.array(z.string().min(1)).default([]),
});

const packManifestSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'pack slug must be lowercase, hyphenated'),
  title: z.string().min(1),
  description: z.string().optional(),
  scenarios: z.array(packScenarioEntrySchema).min(1),
});

const PACKS_DIR = path.join(SCENARIOS_DIR, 'packs');

const scenarioFileSchema = z.union([
  z.array(scenarioSchema),
  scenarioSchema.transform((s) => [s]),
]);

type SeedScenario = z.infer<typeof scenarioSchema>;

async function readScenarioFile(filePath: string): Promise<SeedScenario[]> {
  const fileContent = await fs.readFile(filePath, 'utf8');
  const parsedJson = JSON.parse(fileContent) as unknown;
  return scenarioFileSchema.parse(parsedJson);
}

async function loadLegacyScenarioFiles(): Promise<SeedScenario[]> {
  const entries = await fs.readdir(SCENARIOS_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(SCENARIOS_DIR, entry.name))
    .sort();

  const scenarios: SeedScenario[] = [];
  for (const filePath of jsonFiles) {
    scenarios.push(...(await readScenarioFile(filePath)));
  }
  return scenarios;
}

async function loadPackScenarios(): Promise<SeedScenario[]> {
  let packDirs: string[] = [];
  try {
    const entries = await fs.readdir(PACKS_DIR, { withFileTypes: true });
    packDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(PACKS_DIR, e.name))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const scenarios: SeedScenario[] = [];
  for (const packDir of packDirs) {
    const manifestPath = path.join(packDir, 'pack.json');
    let manifestContent: string;
    try {
      manifestContent = await fs.readFile(manifestPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Pack directory "${packDir}" is missing a pack.json manifest.`);
      }
      throw err;
    }
    const manifest = packManifestSchema.parse(JSON.parse(manifestContent));

    for (const entry of manifest.scenarios) {
      const scenarioPath = path.join(packDir, entry.file);
      const parsed = await readScenarioFile(scenarioPath);
      if (parsed.length !== 1) {
        throw new Error(
          `Pack "${manifest.slug}" scenario file "${entry.file}" must contain exactly one scenario; found ${parsed.length}.`,
        );
      }
      const [scenario] = parsed;
      if (scenario.id !== entry.id) {
        throw new Error(
          `Pack "${manifest.slug}" manifest declares scenario id "${entry.id}" but "${entry.file}" parsed as "${scenario.id}".`,
        );
      }
      scenarios.push(scenario);
    }
  }
  return scenarios;
}

async function loadScenarioFiles(): Promise<SeedScenario[]> {
  const legacy = await loadLegacyScenarioFiles();
  const packed = await loadPackScenarios();
  const scenarios = [...legacy, ...packed];

  if (scenarios.length === 0) {
    throw new Error(`No scenario JSON files found in ${SCENARIOS_DIR}`);
  }

  const ids = new Set<string>();
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) {
      throw new Error(`Duplicate scenario id detected: ${scenario.id}`);
    }
    ids.add(scenario.id);
  }

  return scenarios;
}

async function upsertScenario(
  prisma: PrismaClient,
  scenario: SeedScenario,
): Promise<'created' | 'updated'> {
  let action: 'created' | 'updated' = 'created'
  await prisma.$transaction(async (tx) => {
    const existing = await tx.scenario.findUnique({ where: { id: scenario.id }, select: { id: true } })
    action = existing ? 'updated' : 'created'
    // Phase C: decoder_tag is persisted as a Scenario column. The cast
    // through DecoderTag keeps the @prisma/client types in lockstep with
    // the Zod-parsed enum value (which is a string literal).
    const decoderTag: DecoderTag | null = scenario.decoder_tag
      ? (scenario.decoder_tag as DecoderTag)
      : null;
    await tx.scenario.upsert({
      where: { id: scenario.id },
      create: {
        id: scenario.id,
        version: scenario.version,
        status: scenario.status,
        category: scenario.category,
        concept_tags: scenario.concept_tags,
        sub_concepts: scenario.sub_concepts,
        decoder_tag: decoderTag,
        difficulty: scenario.difficulty,
        user_role: scenario.user_role,
        court_state: scenario.court_state,
        scene: (scenario.scene ?? null) as never,
        prompt: scenario.prompt,
        explanation_md: scenario.explanation_md,
        xp_reward: scenario.xp_reward,
        mastery_weight: scenario.mastery_weight,
        render_tier: scenario.render_tier,
        media_refs: scenario.media_refs,
      },
      update: {
        version: scenario.version,
        status: scenario.status,
        category: scenario.category,
        concept_tags: scenario.concept_tags,
        sub_concepts: scenario.sub_concepts,
        decoder_tag: decoderTag,
        difficulty: scenario.difficulty,
        user_role: scenario.user_role,
        court_state: scenario.court_state,
        scene: (scenario.scene ?? null) as never,
        prompt: scenario.prompt,
        explanation_md: scenario.explanation_md,
        xp_reward: scenario.xp_reward,
        mastery_weight: scenario.mastery_weight,
        render_tier: scenario.render_tier,
        media_refs: scenario.media_refs,
      },
    });

    await tx.scenarioChoice.deleteMany({ where: { scenario_id: scenario.id } });
    await tx.scenarioChoice.createMany({
      // Phase C: persist both `is_correct` (legacy) and `quality` (new).
      // When only `is_correct` is authored, `quality` is back-filled to
      // 'best' / 'wrong'. When only `quality` is authored, `is_correct`
      // is derived. When both are present, the schema-level superRefine
      // already enforced agreement, so either is safe to use.
      data: scenario.choices.map((choice) => ({
        scenario_id: scenario.id,
        label: choice.label,
        is_correct: deriveIsCorrect(choice),
        quality: deriveQuality(choice),
        feedback_text: choice.feedback_text,
        order: choice.order,
      })),
    });
  });
  return action;
}

async function main(): Promise<void> {
  if (process.argv.includes('--allow-unvalidated')) {
    ALLOW_UNVALIDATED = true;
    console.warn('[seed:scenarios] --allow-unvalidated set — coach-validation gating disabled.');
  }
  // Phase B addition. `--dry-run` validates the seed JSONs (Zod parse +
  // cross-field rules) without touching the database. Useful for CI and
  // for confirming fixtures still parse after schema changes when no
  // DATABASE_URL is configured.
  const dryRun = process.argv.includes('--dry-run');

  if (!dryRun && !process.env.DATABASE_URL) {
    console.error('[seed:scenarios] DATABASE_URL is not set. Refusing to run.');
    process.exit(1);
  }

  const start = Date.now();

  if (dryRun) {
    console.log(`[seed:scenarios] dry-run: validating ${SCENARIOS_DIR}`);
    const scenarios = await loadScenarioFiles();
    const liveCount = scenarios.filter((s) => s.status === ScenarioStatus.LIVE).length;
    logCoachValidationWarnings(scenarios);
    console.log(
      `[seed:scenarios] dry-run done in ${Date.now() - start}ms — ` +
        `validated=${scenarios.length} live=${liveCount}`,
    );
    return;
  }

  const prisma = new PrismaClient();

  try {
    console.log(`[seed:scenarios] loading from ${SCENARIOS_DIR}`);
    const scenarios = await loadScenarioFiles();
    console.log(`[seed:scenarios] validated ${scenarios.length} scenarios across seed files.`);
    logCoachValidationWarnings(scenarios);

    let created = 0;
    let updated = 0;
    const liveCount = scenarios.filter((s) => s.status === ScenarioStatus.LIVE).length;

    for (const scenario of scenarios) {
      const action = await upsertScenario(prisma, scenario);
      if (action === 'created') created += 1;
      else updated += 1;
    }

    const liveInDb = await prisma.scenario.count({ where: { status: ScenarioStatus.LIVE } });

    console.log(
      `[seed:scenarios] done in ${Date.now() - start}ms — ` +
        `created=${created} updated=${updated} total_in_seed=${scenarios.length} ` +
        `live_in_seed=${liveCount} live_in_db=${liveInDb}`,
    );

    if (liveInDb === 0) {
      console.error('[seed:scenarios] WARNING: 0 LIVE scenarios in DB after seed. Sessions will fail.');
      process.exit(2);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function logCoachValidationWarnings(scenarios: SeedScenario[]): void {
  // Section 4.6: medium-level coach validation warns but doesn't block.
  // Surfaced once per seed run so authors notice scenarios that still
  // need a coach pass before promotion.
  const medium = scenarios.filter((s) => s.coach_validation?.level === 'medium');
  if (medium.length === 0) return;
  console.warn(
    `[seed:scenarios] coach-validation warning: ${medium.length} scenario(s) at level=medium ` +
      `still need a coach review before promotion: ${medium.map((s) => s.id).join(', ')}.`,
  );
}

main().catch((error) => {
  console.error('[seed:scenarios] failed:', error);
  process.exit(1);
});
