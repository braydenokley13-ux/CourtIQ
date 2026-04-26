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

const choiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  is_correct: z.boolean(),
  feedback_text: z.string().min(1),
  order: z.number().int().min(1),
});

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
  'cut',
  'closeout',
  'rotation',
  'lift',
  'drift',
  'pass',
  'drive',
  'stop_ball',
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

const sceneSchema = z
  .object({
    type: z.string().min(1).max(48).optional(),
    court: z.enum(['half', 'full']).default('half'),
    camera: z.enum(['teaching_angle', 'defense', 'top_down']).default('teaching_angle'),
    players: z.array(scenePlayerSchema).min(1).max(10),
    ball: sceneBallSchema,
    movements: z.array(sceneMovementSchema).max(32).default([]),
    answerDemo: z.array(sceneMovementSchema).max(32).default([]),
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
    choices: z.array(choiceSchema).min(3).max(4),
    explanation_md: z.string().min(1),
    xp_reward: z.number().int().positive().default(10),
    mastery_weight: z.number().positive().default(1),
    render_tier: z.number().int().positive().default(1),
    media_refs: z.array(z.string()).default([]),
    scene: sceneSchema.optional(),
  })
  .superRefine((scenario, ctx) => {
    const correctCount = scenario.choices.filter((choice) => choice.is_correct).length;
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
  });

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
      data: scenario.choices.map((choice) => ({
        scenario_id: scenario.id,
        label: choice.label,
        is_correct: choice.is_correct,
        feedback_text: choice.feedback_text,
        order: choice.order,
      })),
    });
  });
  return action;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[seed:scenarios] DATABASE_URL is not set. Refusing to run.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const start = Date.now();

  try {
    console.log(`[seed:scenarios] loading from ${SCENARIOS_DIR}`);
    const scenarios = await loadScenarioFiles();
    console.log(`[seed:scenarios] validated ${scenarios.length} scenarios across seed files.`);

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

main().catch((error) => {
  console.error('[seed:scenarios] failed:', error);
  process.exit(1);
});
