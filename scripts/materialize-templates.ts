/**
 * Template + Variant materializer.
 *
 * Reads:  packages/db/seed/scenarios/templates/<template>/{template.json,variants/*.json}
 * Writes: packages/db/seed/scenarios/packs/templates-v1/{<id>.json,pack.json}
 *
 * The output pack is then seeded by scripts/seed-scenarios.ts unchanged.
 *
 * Determinism: same inputs always produce byte-identical outputs (no
 * Date.now, no Math.random, sorted keys). Materialization runs in CI as
 * `--check` mode to fail PRs that haven't committed regenerated output.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  templateSchema,
  variantSchema,
  variationSignature,
  type Template,
  type Variant,
} from '../packages/db/seed/scenarios/templates/_schema'

const TEMPLATES_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios', 'templates')
const OUTPUT_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios', 'packs', 'templates-v1')
const OUTPUT_PACK_ID = 'pack-templates-v1'
const OUTPUT_PACK_SLUG = 'templates-v1'

interface Args {
  check: boolean
  filter: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { check: false, filter: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--check') args.check = true
    else if (a === '--template' && argv[i + 1]) {
      args.filter = argv[++i] ?? null
    }
  }
  return args
}

interface LoadedTemplate {
  template: Template
  variants: Variant[]
  templateDir: string
}

async function loadAllTemplates(filter: string | null): Promise<LoadedTemplate[]> {
  const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true })
  const templateDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => path.join(TEMPLATES_DIR, e.name))
    .filter((p) => (filter ? path.basename(p) === filter : true))
    .sort()

  const loaded: LoadedTemplate[] = []
  for (const templateDir of templateDirs) {
    const templatePath = path.join(templateDir, 'template.json')
    let templateRaw: string
    try {
      templateRaw = await fs.readFile(templatePath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw err
    }
    const parsed = templateSchema.safeParse(JSON.parse(templateRaw))
    if (!parsed.success) {
      throw new Error(
        `Template ${path.basename(templateDir)} failed schema:\n${formatZodIssues(parsed.error.issues)}`,
      )
    }
    const template = parsed.data

    const variantsDir = path.join(templateDir, 'variants')
    const variantFiles = (await fs.readdir(variantsDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => path.join(variantsDir, e.name))
      .sort()

    const variants: Variant[] = []
    for (const file of variantFiles) {
      const raw = await fs.readFile(file, 'utf8')
      const v = variantSchema.safeParse(JSON.parse(raw))
      if (!v.success) {
        throw new Error(
          `Variant ${path.relative(process.cwd(), file)} failed schema:\n${formatZodIssues(
            v.error.issues,
          )}`,
        )
      }
      if (v.data.template !== template.id) {
        throw new Error(
          `Variant ${v.data.id} declares template "${v.data.template}" but lives under "${template.id}".`,
        )
      }
      variants.push(v.data)
    }

    enforceTemplateInvariants(template, variants)
    loaded.push({ template, variants, templateDir })
  }
  return loaded
}

function formatZodIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .map((i) => `  • ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n')
}

function enforceTemplateInvariants(template: Template, variants: Variant[]): void {
  // Variants must reference template-declared outcomes only.
  const outcomes = new Set(template.choices.map((c) => c.outcome))
  for (const v of variants) {
    const variantOutcomes = new Set(Object.keys(v.copy.choices))
    for (const o of outcomes) {
      if (!variantOutcomes.has(o)) {
        throw new Error(`Variant ${v.id} is missing prose for outcome "${o}".`)
      }
    }
    for (const o of variantOutcomes) {
      if (!outcomes.has(o)) {
        throw new Error(`Variant ${v.id} declares outcome "${o}" not in template ${template.id}.`)
      }
    }
    if (v.variation.disguise !== 'none' && !template.disguises[v.variation.disguise]) {
      throw new Error(
        `Variant ${v.id} requests disguise "${v.variation.disguise}" not declared by template ${template.id}.`,
      )
    }
    if (v.variation.user_slot && !template.scene.players.find((p) => p.slot === v.variation.user_slot)) {
      throw new Error(
        `Variant ${v.id} user_slot "${v.variation.user_slot}" not in template ${template.id}.`,
      )
    }

    // Phase 3.1.5 — defence in depth. lint-variants is the primary
    // gate, but a materialize call can be invoked directly (e.g. from
    // `pnpm seed:content` or a future CI dry-run). Refuse to emit a
    // pack JSON for a LIVE / REVIEW variant carrying TODO: prose so the
    // gap cannot be back-doored by skipping the lint step.
    if (v.status === 'LIVE' || v.status === 'REVIEW') {
      const json = JSON.stringify(v)
      if (json.includes('TODO:')) {
        throw new Error(
          `Variant ${v.id} (${v.status}) still contains TODO: prose; refusing to materialize. Resolve the TODOs or set status to DRAFT.`,
        )
      }
    }
  }

  // Repetition lint: no two variants with identical signature.
  const signatures = new Map<string, string>()
  for (const v of variants) {
    const sig = variationSignature(v, template)
    if (signatures.has(sig)) {
      throw new Error(
        `Variant ${v.id} duplicates variation signature of ${signatures.get(sig)} in template ${template.id}: ${sig}`,
      )
    }
    signatures.set(sig, v.id)
  }

  // Disguise monotonicity: heavier disguise must not have lower difficulty than lighter.
  const order = { none: 0, light: 1, moderate: 2, heavy: 3 } as const
  const byDifficulty = variants
    .map((v) => ({
      id: v.id,
      level: order[v.variation.disguise],
      d: v.variation.difficulty ?? template.tactical.difficulty_default,
    }))
    .sort((a, b) => a.level - b.level)
  for (let i = 1; i < byDifficulty.length; i++) {
    const lo = byDifficulty[i - 1]!
    const hi = byDifficulty[i]!
    if (hi.level > lo.level && hi.d < lo.d) {
      throw new Error(
        `Disguise monotonicity violated in template ${template.id}: ${hi.id} (disguise=${hi.level}, d=${hi.d}) < ${lo.id} (disguise=${lo.level}, d=${lo.d}).`,
      )
    }
  }
}

// -----------------------------------------------------------------------------
// Materialization
// -----------------------------------------------------------------------------

interface MaterializedScenario {
  id: string
  output: Record<string, unknown>
}

function flipX<T extends { x: number; z: number }>(p: T, mirror: boolean): T {
  return mirror ? ({ ...p, x: -p.x } as T) : p
}

function applyPlayerOverrides(
  template: Template,
  variant: Variant,
): { id: string; team: string; role: string; label?: string; start: { x: number; z: number }; isUser?: boolean; hasBall?: boolean }[] {
  const userSlot = variant.variation.user_slot ?? template.tactical.user_slot_default
  const overrideMap = new Map(variant.variation.overrides.players.map((p) => [p.slot, p]))
  return template.scene.players.map((p) => {
    const override = overrideMap.get(p.slot)
    const start = flipX(override?.start ?? p.start, variant.variation.mirror)
    return {
      id: p.slot,
      team: p.team,
      role: p.role,
      ...(p.label ? { label: p.label } : {}),
      start,
      ...(p.slot === userSlot ? { isUser: true } : {}),
      ...(p.hasBall ? { hasBall: true } : {}),
    }
  })
}

function applyMovementOverrides(
  movements: Template['scene']['movements'],
  variant: Variant,
  mirror: boolean,
): { id: string; playerId: string; kind: string; to: { x: number; z: number }; delayMs?: number; durationMs?: number; caption?: string }[] {
  const overrideMap = new Map(variant.variation.overrides.movements.map((m) => [m.id, m]))
  return movements.map((m) => {
    const override = overrideMap.get(m.id)
    return {
      id: m.id,
      playerId: m.playerSlot,
      kind: m.kind,
      to: flipX(override?.to ?? m.to, mirror),
      ...(typeof (override?.delayMs ?? m.delayMs) === 'number' ? { delayMs: override?.delayMs ?? m.delayMs } : {}),
      ...(typeof (override?.durationMs ?? m.durationMs) === 'number'
        ? { durationMs: override?.durationMs ?? m.durationMs }
        : {}),
      ...(m.caption ? { caption: m.caption } : {}),
    }
  })
}

function resolveOverlay(
  o: ReturnType<typeof JSON.parse>,
  mirror: boolean,
): Record<string, unknown> {
  // The slot-keyed template overlay has fromSlot/toSlot/onSlot/targetSlot/anchor/path —
  // the materializer rewrites those to the seeder's flat shape.
  switch (o.kind) {
    case 'passing_lane_open':
    case 'passing_lane_blocked':
      return { kind: o.kind, from: o.fromSlot, to: o.toSlot }
    case 'defender_vision_cone':
      return {
        kind: o.kind,
        playerId: o.onSlot,
        ...(o.targetSlot ? { targetId: o.targetSlot } : {}),
      }
    case 'defender_hip_arrow':
    case 'defender_foot_arrow':
    case 'defender_chest_line':
    case 'defender_hand_in_lane':
      return { kind: o.kind, playerId: o.onSlot }
    case 'open_space_region':
      return { kind: o.kind, anchor: flipX(o.anchor, mirror), radiusFt: o.radiusFt ?? 4 }
    case 'help_pulse':
      return { kind: o.kind, playerId: o.onSlot, role: o.role }
    case 'drive_cut_preview':
      return {
        kind: o.kind,
        playerId: o.onSlot,
        path: (o.path as { x: number; z: number }[]).map((p) => flipX(p, mirror)),
      }
    case 'label':
      return { kind: o.kind, anchor: flipX(o.anchor, mirror), text: o.text }
    case 'timing_pulse':
      return { kind: o.kind, anchor: flipX(o.anchor, mirror), durationMs: o.durationMs }
    default:
      throw new Error(`Unknown overlay kind: ${o.kind}`)
  }
}

const BEGINNER_PRE_OVERLAY_CAP = 3
const BEGINNER_POST_OVERLAY_CAP = 3

function materialize(template: Template, variant: Variant): MaterializedScenario {
  const mirror = variant.variation.mirror
  const players = applyPlayerOverrides(template, variant)
  const ballHolder = template.scene.ball.holderSlot
  const ballStart = flipX(
    template.scene.players.find((p) => p.slot === ballHolder)?.start ?? { x: 0, z: 0 },
    mirror,
  )
  const movements = applyMovementOverrides(template.scene.movements, variant, mirror)
  const answerDemo = applyMovementOverrides(template.scene.answerDemo, variant, mirror)

  // Choices: stitch template scaffold + variant prose. Order is by template.choices[*].order.
  const sortedChoices = [...template.choices].sort((a, b) => a.order - b.order)
  const outcomeToChoiceId = new Map<string, string>()
  const builtChoices = sortedChoices.map((c) => {
    const id = `c${c.order}`
    outcomeToChoiceId.set(c.outcome, id)
    const prose = variant.copy.choices[c.outcome]!
    return {
      id,
      label: prose.label,
      quality: c.quality,
      feedback_text: prose.feedback_text,
      ...(prose.partial_feedback_text ? { partial_feedback_text: prose.partial_feedback_text } : {}),
      order: c.order,
    }
  })

  // Wrong demos: keyed by outcome in template; rewrite to choiceId.
  const wrongDemos = template.scene.wrongDemos.map((wd) => {
    const choiceId = outcomeToChoiceId.get(wd.outcome)
    if (!choiceId) {
      throw new Error(
        `Template ${template.id} wrong demo references outcome "${wd.outcome}" with no choice.`,
      )
    }
    return {
      choiceId,
      ...(wd.caption ? { caption: wd.caption } : {}),
      movements: wd.movements.map((m) => ({
        id: m.id,
        playerId: m.playerSlot,
        kind: m.kind,
        to: flipX(m.to, mirror),
        ...(typeof m.delayMs === 'number' ? { delayMs: m.delayMs } : {}),
        ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
        ...(m.caption ? { caption: m.caption } : {}),
      })),
    }
  })

  // Disguise application: filter pre overlays + maybe compress freeze.
  const disguise = template.disguises[variant.variation.disguise]
  const removeSet = new Set(
    (disguise?.removePre ?? []).map((r) => `${r.kind}|${r.onSlot ?? ''}`),
  )
  const filteredPre = template.overlays.pre.filter((o) => {
    const onSlot = (o as { onSlot?: string }).onSlot ?? ''
    return !removeSet.has(`${o.kind}|${onSlot}`) && !removeSet.has(`${o.kind}|`)
  })

  if (filteredPre.length > BEGINNER_PRE_OVERLAY_CAP) {
    throw new Error(
      `Variant ${variant.id} exceeds beginner pre-overlay cap (${filteredPre.length} > ${BEGINNER_PRE_OVERLAY_CAP}).`,
    )
  }
  if (template.overlays.post.length > BEGINNER_POST_OVERLAY_CAP) {
    throw new Error(
      `Template ${template.id} exceeds beginner post-overlay cap (${template.overlays.post.length} > ${BEGINNER_POST_OVERLAY_CAP}).`,
    )
  }

  const preAnswerOverlays = filteredPre.map((o) => resolveOverlay(o, mirror))
  const postAnswerOverlays = template.overlays.post.map((o) => resolveOverlay(o, mirror))

  // Freeze marker — disguise can compress.
  let freezeMarker = template.scene.freezeMarker
  if (
    freezeMarker?.kind === 'atMs' &&
    typeof disguise?.freezeCompressMs === 'number' &&
    disguise.freezeCompressMs > 0
  ) {
    freezeMarker = {
      kind: 'atMs',
      atMs: Math.max(0, freezeMarker.atMs - disguise.freezeCompressMs),
    }
  }

  // Difficulty: explicit variant override > template default + disguise bump.
  const difficulty =
    variant.variation.difficulty ??
    Math.min(5, template.tactical.difficulty_default + (disguise?.difficultyBump ?? 0))

  // Cue atoms surface as sub_concepts (decoder strategy doc §11).
  const cueAtomTags = template.tactical.cue_atoms.map((a) => `cue:${a}`)
  const generationTags = [
    `tpl:${template.id}`,
    `sig:${variationSignature(variant, template)}`,
  ]

  // court_state — derive from scene.players (the legacy 2D shape).
  const COURT_SCALE = 10 // feet → roughly the unit used in seed.court_state
  const COURT_OFFSET_X = 250
  const COURT_OFFSET_Y = 0
  const courtState = {
    offense: players
      .filter((p) => p.team === 'offense')
      .map((p) => ({
        id: p.id,
        x: Math.round(p.start.x * COURT_SCALE + COURT_OFFSET_X),
        y: Math.round(p.start.z * COURT_SCALE + COURT_OFFSET_Y),
        role: p.role,
        ...(p.id === ballHolder ? { hasBall: true } : { hasBall: false }),
      })),
    defense: players
      .filter((p) => p.team === 'defense')
      .map((p) => ({
        id: p.id,
        x: Math.round(p.start.x * COURT_SCALE + COURT_OFFSET_X),
        y: Math.round(p.start.z * COURT_SCALE + COURT_OFFSET_Y),
        role: p.role,
        hasBall: false,
      })),
    ball_location: {
      x: Math.round(ballStart.x * COURT_SCALE + COURT_OFFSET_X),
      y: Math.round(ballStart.z * COURT_SCALE + COURT_OFFSET_Y),
    },
  }

  const scenario: Record<string, unknown> = {
    id: variant.id,
    version: variant.version,
    status: variant.status,
    title: variant.copy.title,
    category: template.category,
    decoder_tag: template.decoder_tag,
    concept_tags: template.concept_tags,
    sub_concepts: [...template.sub_concepts, ...cueAtomTags, ...generationTags],
    difficulty,
    user_role: template.scene.players.find(
      (p) => p.slot === (variant.variation.user_slot ?? template.tactical.user_slot_default),
    )!.role,
    game_context: variant.copy.game_context,
    possession_setup: variant.copy.possession_setup,
    decision_moment: variant.copy.decision_moment,
    visible_cue: variant.copy.visible_cue,
    court_state: courtState,
    prompt: variant.copy.prompt,
    choices: builtChoices,
    best_read: variant.copy.best_read,
    acceptable_reads: variant.copy.acceptable_reads,
    bad_reads: variant.copy.bad_reads,
    common_miss_reason: template.tactical.common_miss_reason,
    why_best_read_works: template.tactical.why_best_read_works,
    decoder_teaching_point: template.tactical.teaching_point,
    lesson_connection: template.tactical.lesson_connection,
    explanation_md: variant.copy.explanation_md,
    feedback: variant.copy.feedback,
    self_review_checklist: variant.copy.self_review_checklist,
    coach_validation: template.coach_validation,
    progression_metadata: { unlocks: [], prerequisites: [] },
    xp_reward: variant.xp_reward ?? template.defaults.xp_reward,
    mastery_weight: variant.mastery_weight ?? template.defaults.mastery_weight,
    render_tier: variant.render_tier ?? template.defaults.render_tier,
    media_refs: [],
    scene: {
      ...(template.scene.type ? { type: template.scene.type } : {}),
      court: template.scene.court,
      camera: template.scene.camera,
      players: players.map((p) => ({
        id: p.id,
        team: p.team,
        role: p.role,
        ...(p.label ? { label: p.label } : {}),
        start: p.start,
        ...(p.isUser ? { isUser: true } : {}),
        ...(p.hasBall ? { hasBall: true } : {}),
      })),
      ball: { start: ballStart, holderId: ballHolder },
      movements,
      answerDemo,
      ...(freezeMarker ? { freezeMarker } : {}),
      wrongDemos,
      preAnswerOverlays,
      postAnswerOverlays,
    },
    _generated: {
      template: template.id,
      signature: variationSignature(variant, template),
    },
  }

  return { id: variant.id, output: scenario }
}

// -----------------------------------------------------------------------------
// Output writing — deterministic, sorted, idempotent
// -----------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  // JSON.stringify with `indent=2`. Object keys are emitted in insertion
  // order; we control insertion order in `materialize()` so output is
  // stable run-over-run.
  return JSON.stringify(value, null, 2) + '\n'
}

async function writeOrCheck(filePath: string, content: string, check: boolean): Promise<boolean> {
  let existing: string | null = null
  try {
    existing = await fs.readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  if (existing === content) return false
  if (check) {
    console.error(`✗ drift: ${path.relative(process.cwd(), filePath)} is out of date.`)
    process.exitCode = 1
    return false
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
  return true
}

async function pruneStaleFiles(keep: Set<string>, check: boolean): Promise<void> {
  let entries: import('node:fs').Dirent[] = []
  try {
    entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name === 'pack.json' || entry.name === '_GENERATED.md') continue
    if (entry.name.endsWith('.json') && !keep.has(entry.name)) {
      const filePath = path.join(OUTPUT_DIR, entry.name)
      if (check) {
        console.error(`✗ stale: ${path.relative(process.cwd(), filePath)} should be removed.`)
        process.exitCode = 1
      } else {
        await fs.unlink(filePath)
        console.log(`  removed stale ${entry.name}`)
      }
    }
  }
}

const GENERATED_NOTE = `# Generated pack — do not edit by hand

Files in this directory are produced by \`scripts/materialize-templates.ts\` from
\`packages/db/seed/scenarios/templates/\`.

To change a scenario, edit its template or variant under \`templates/\`, then run:

\`\`\`sh
pnpm exec tsx scripts/materialize-templates.ts
\`\`\`

CI runs the same script with \`--check\` and fails if regenerated output drifts.
`

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  console.log(`materialize-templates: scanning ${path.relative(process.cwd(), TEMPLATES_DIR)}`)
  const loaded = await loadAllTemplates(args.filter)
  if (loaded.length === 0) {
    console.log('  no templates found.')
    return
  }

  const allMaterialized: MaterializedScenario[] = []
  for (const { template, variants } of loaded) {
    console.log(`\n  template: ${template.id} (${variants.length} variants)`)
    for (const variant of variants) {
      const m = materialize(template, variant)
      allMaterialized.push(m)
      console.log(`    → ${m.id}  [${variationSignature(variant, template)}]`)
    }
  }

  // Globally unique scenario ids.
  const seen = new Set<string>()
  for (const m of allMaterialized) {
    if (seen.has(m.id)) throw new Error(`Duplicate materialized scenario id: ${m.id}`)
    seen.add(m.id)
  }

  // Write each scenario file.
  const keep = new Set<string>()
  let writeCount = 0
  for (const m of allMaterialized.sort((a, b) => a.id.localeCompare(b.id))) {
    const fileName = `${m.id}.json`
    keep.add(fileName)
    const filePath = path.join(OUTPUT_DIR, fileName)
    if (await writeOrCheck(filePath, stableStringify([m.output]), args.check)) writeCount++
  }

  // Pack manifest — declares the materialized order.
  const manifest = {
    id: OUTPUT_PACK_ID,
    slug: OUTPUT_PACK_SLUG,
    title: 'Templates v1 / Generated Variants',
    description:
      'Auto-generated from packages/db/seed/scenarios/templates/. Do not edit by hand. Re-run scripts/materialize-templates.ts after changing a template or variant.',
    scenarios: allMaterialized
      .map((m) => ({ id: m.id, file: `${m.id}.json`, prerequisites: [] as string[] }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
  if (await writeOrCheck(path.join(OUTPUT_DIR, 'pack.json'), stableStringify(manifest), args.check)) {
    writeCount++
  }
  if (await writeOrCheck(path.join(OUTPUT_DIR, '_GENERATED.md'), GENERATED_NOTE, args.check)) {
    writeCount++
  }

  await pruneStaleFiles(keep, args.check)

  if (args.check) {
    if (process.exitCode === 1) {
      console.error('\nmaterialize-templates --check FAILED. Run without --check and commit.')
    } else {
      console.log('\nmaterialize-templates --check OK.')
    }
  } else {
    console.log(`\nmaterialize-templates: wrote ${writeCount} file(s) → ${path.relative(process.cwd(), OUTPUT_DIR)}`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
