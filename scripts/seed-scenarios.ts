import { PrismaClient, Category, ScenarioStatus } from '@prisma/client';
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

const courtStateSchema = z.object({
  offense: z.array(playerSchema).length(5),
  defense: z.array(playerSchema).length(5),
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

function deriveIsCorrect(choice: { is_correct?: boolean; quality?: ChoiceQuality }): boolean {
  if (choice.is_correct !== undefined) return choice.is_correct;
  return choice.quality !== 'wrong' && choice.quality !== undefined;
}

type ChoiceQuality = z.infer<typeof choiceQualitySchema>;

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

const scenarioSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive().default(1),
    status: z.nativeEnum(ScenarioStatus).default(ScenarioStatus.DRAFT),
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
    // Phase B additions. Validated and stored in-memory; the Prisma
    // columns that back them land in Phase C (`add_decoder_and_quality`
    // migration). The seeder ignores these fields at upsert time today.
    decoder_tag: decoderTagSchema.optional(),
    coach_validation: coachValidationSchema.optional(),
  })
  .superRefine((scenario, ctx) => {
    const correctCount = scenario.choices.filter((c) => deriveIsCorrect(c)).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['choices'],
        message: `Exactly one choice must be correct; found ${correctCount}.`,
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
  });

// CLI flag — populated in main(). Read inside the schema so the gate is
// enforced at parse time rather than after upsert.
let ALLOW_UNVALIDATED = false;

const scenarioFileSchema = z.array(scenarioSchema);

type SeedScenario = z.infer<typeof scenarioSchema>;

async function loadScenarioFiles(): Promise<SeedScenario[]> {
  const entries = await fs.readdir(SCENARIOS_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(SCENARIOS_DIR, entry.name))
    .sort();

  if (jsonFiles.length === 0) {
    throw new Error(`No scenario JSON files found in ${SCENARIOS_DIR}`);
  }

  const scenarios: SeedScenario[] = [];

  for (const filePath of jsonFiles) {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const parsedJson = JSON.parse(fileContent) as unknown;
    const parsed = scenarioFileSchema.parse(parsedJson);
    scenarios.push(...parsed);
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
    await tx.scenario.upsert({
      where: { id: scenario.id },
      create: {
        id: scenario.id,
        version: scenario.version,
        status: scenario.status,
        category: scenario.category,
        concept_tags: scenario.concept_tags,
        sub_concepts: scenario.sub_concepts,
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
      // Phase B compat: derive `is_correct` from `quality` when only the
      // new field is authored. The Prisma `quality` column itself lands
      // in Phase C; until then we keep the existing column populated so
      // legacy code paths (attempt scoring, mastery write) keep working.
      data: scenario.choices.map((choice) => ({
        scenario_id: scenario.id,
        label: choice.label,
        is_correct: deriveIsCorrect(choice),
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
