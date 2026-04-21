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

async function upsertScenario(prisma: PrismaClient, scenario: SeedScenario): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const scenarios = await loadScenarioFiles();

    for (const scenario of scenarios) {
      await upsertScenario(prisma, scenario);
    }

    console.log(`Seeded ${scenarios.length} scenarios from ${SCENARIOS_DIR}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
