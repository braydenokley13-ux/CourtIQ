import { PrismaClient, Category } from '@prisma/client';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LESSONS_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'lessons');

const lessonBodySchema = z.object({
  order: z.number().int().min(1).default(1),
  title: z.string().min(1),
  body_md: z.string().min(1),
  media_refs: z.array(z.string()).default([]),
});

const moduleSchema = z.object({
  module_slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase, hyphenated'),
  title: z.string().min(1),
  concept_id: z.string().min(1),
  category: z.nativeEnum(Category),
  order: z.number().int().min(1),
  prerequisite_module_ids: z.array(z.string().min(1)).default([]),
  lesson: lessonBodySchema,
});

type SeedModule = z.infer<typeof moduleSchema>;

async function loadModuleFiles(): Promise<SeedModule[]> {
  const entries = await fs.readdir(LESSONS_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(LESSONS_DIR, entry.name))
    .sort();

  if (jsonFiles.length === 0) {
    throw new Error(`No lesson JSON files found in ${LESSONS_DIR}`);
  }

  const modules: SeedModule[] = [];
  for (const filePath of jsonFiles) {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const parsedJson = JSON.parse(fileContent) as unknown;
    modules.push(moduleSchema.parse(parsedJson));
  }

  const slugs = new Set<string>();
  for (const m of modules) {
    if (slugs.has(m.module_slug)) {
      throw new Error(`Duplicate module_slug detected: ${m.module_slug}`);
    }
    slugs.add(m.module_slug);
  }

  // Validate prerequisite slugs all exist
  for (const m of modules) {
    for (const prereq of m.prerequisite_module_ids) {
      if (!slugs.has(prereq)) {
        throw new Error(`Module "${m.module_slug}" references unknown prerequisite "${prereq}"`);
      }
    }
  }

  return modules;
}

async function upsertModule(
  prisma: PrismaClient,
  m: SeedModule,
): Promise<'created' | 'updated'> {
  let action: 'created' | 'updated' = 'created';
  await prisma.$transaction(async (tx) => {
    const existing = await tx.module.findUnique({ where: { slug: m.module_slug }, select: { id: true } });
    action = existing ? 'updated' : 'created';

    const moduleRow = await tx.module.upsert({
      where: { slug: m.module_slug },
      create: {
        slug: m.module_slug,
        title: m.title,
        concept_id: m.concept_id,
        order: m.order,
        prerequisite_ids: m.prerequisite_module_ids,
      },
      update: {
        title: m.title,
        concept_id: m.concept_id,
        order: m.order,
        prerequisite_ids: m.prerequisite_module_ids,
      },
    });

    // Idempotent lesson: replace lessons for this module so reseeding stays clean.
    await tx.lesson.deleteMany({ where: { module_id: moduleRow.id } });
    await tx.lesson.create({
      data: {
        module_id: moduleRow.id,
        order: m.lesson.order,
        title: m.lesson.title,
        body_md: m.lesson.body_md,
        media_refs: m.lesson.media_refs,
      },
    });
  });
  return action;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[seed:lessons] DATABASE_URL is not set. Refusing to run.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const start = Date.now();

  try {
    console.log(`[seed:lessons] loading from ${LESSONS_DIR}`);
    const modules = await loadModuleFiles();
    console.log(`[seed:lessons] validated ${modules.length} modules.`);

    let created = 0;
    let updated = 0;
    for (const m of modules) {
      const action = await upsertModule(prisma, m);
      if (action === 'created') created += 1;
      else updated += 1;
    }

    const moduleCount = await prisma.module.count();
    const lessonCount = await prisma.lesson.count();

    console.log(
      `[seed:lessons] done in ${Date.now() - start}ms — ` +
        `created=${created} updated=${updated} modules_in_db=${moduleCount} lessons_in_db=${lessonCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[seed:lessons] failed:', error);
  process.exit(1);
});
