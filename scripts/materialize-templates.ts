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

// Pack 2 §3.6 — difficulty-aware authoring overlay caps. The runtime
// (apps/web/lib/scenario3d/overlayLevel.ts) caps by USER pathway mode
// (beginner / intermediate / advanced) at render time; that is a
// DIFFERENT axis from the AUTHOR-DISCIPLINE caps below. The author
// cap stops a difficulty-3 scenario from shipping a difficulty-1
// overlay surface area; the user cap drops overlays at render based
// on the player's earned level. Both must apply.
//
// Per the blueprint (§3.6):
//
//   Difficulty | pre cap | post cap
//   --------------------------------
//        1     |    3    |    3
//        2     |    3    |    4
//        3     |    2    |    4
//        4     |    2    |    5
//        5     |    1    |    5
//
// The cap is a hard ceiling enforced at materialize time; the variant
// schema's `.max(16)` is the absolute outer bound. Adjusting this table
// requires re-validating every authored template that lives at the
// affected difficulty.
const AUTHORING_OVERLAY_CAPS_BY_DIFFICULTY: Readonly<
  Record<number, { pre: number; post: number }>
> = Object.freeze({
  1: { pre: 3, post: 3 },
  2: { pre: 3, post: 4 },
  3: { pre: 2, post: 4 },
  4: { pre: 2, post: 5 },
  5: { pre: 1, post: 5 },
})

// ---------------------------------------------------------------------------
// Pack 2 Teaching-Quality F1 — per-difficulty cognition hold floor.
//
// Mirror of `COGNITION_HOLD_FLOOR_MS_BY_DIFFICULTY` in
// apps/web/lib/scenario3d/freezeFrameCognition.ts. We duplicate the
// (small) table here rather than importing from apps/web because
// materialize-templates is a node script and apps/web ships next.js
// surface (the lint-variants.ts pattern). Any change to the per-D
// floor must update BOTH tables in lockstep.
//
// The schemas (template + runtime) admit the absolute floor (800ms);
// this helper narrows that to the per-D floor at materialize time
// when effective difficulty is known.
// ---------------------------------------------------------------------------

const COGNITION_HOLD_FLOOR_MS_BY_DIFFICULTY: Readonly<Record<number, number>> =
  Object.freeze({
    1: 1100,
    2: 1100,
    3: 1100,
    4: 1000,
    5: 800,
  })

function _cognitionHoldFloorForDifficulty(effectiveDifficulty: number): number {
  // Same out-of-band semantics as the apps/web helper: clamp into
  // [1, 5], collapse to D1 (loosest) when non-finite. The variant
  // schema bounds difficulty to 1..5 already, so the clamp is
  // belt-and-braces.
  if (!Number.isFinite(effectiveDifficulty)) return 1100
  const rounded = Math.round(effectiveDifficulty)
  const d = rounded < 1 ? 1 : rounded > 5 ? 5 : rounded
  return COGNITION_HOLD_FLOOR_MS_BY_DIFFICULTY[d] ?? 1100
}

function authoringOverlayCap(
  phase: 'pre' | 'post',
  difficulty: number,
): number {
  const cell = AUTHORING_OVERLAY_CAPS_BY_DIFFICULTY[difficulty]
  // The variant schema bounds difficulty to 1..5, so a missing cell
  // means a caller computed an out-of-band difficulty (e.g. an
  // unbounded `template.tactical.difficulty_default + difficultyBump`
  // that escaped the Math.min(5, ...) clamp). The previous behaviour
  // silently returned D1's (loosest) cap, which is the wrong-direction
  // failure: an out-of-band difficulty would relax the cap. Same
  // silent-pass family as the screenshot regression gate. Fail loud
  // so the bad math surfaces at materialize time, not as a downstream
  // overlay-budget surprise.
  if (!cell) {
    throw new Error(
      `authoringOverlayCap: no cap row for difficulty=${difficulty}. ` +
        `Difficulty must be 1..5; check the variant schema and any ` +
        `Math.min(5, …) clamp on disguise difficultyBump.`,
    )
  }
  return phase === 'pre' ? cell.pre : cell.post
}

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

  // Pack 2 §3.6 — cap is per-difficulty, not per-tier. The variant's
  // effective difficulty (template default + disguise bump + variant
  // override) decides the ceiling, so a heavier disguise that pushes
  // a D2 base into D3 inherits the D3 cap.
  const effectiveDifficultyForCap =
    variant.variation.difficulty ??
    Math.min(
      5,
      template.tactical.difficulty_default + (disguise?.difficultyBump ?? 0),
    )
  const preCap = authoringOverlayCap('pre', effectiveDifficultyForCap)
  const postCap = authoringOverlayCap('post', effectiveDifficultyForCap)
  if (filteredPre.length > preCap) {
    throw new Error(
      `Variant ${variant.id} exceeds D${effectiveDifficultyForCap} pre-overlay cap (${filteredPre.length} > ${preCap}). See blueprint §3.6.`,
    )
  }
  if (template.overlays.post.length > postCap) {
    throw new Error(
      `Template ${template.id} (used by ${variant.id} at D${effectiveDifficultyForCap}) exceeds post-overlay cap (${template.overlays.post.length} > ${postCap}). See blueprint §3.6.`,
    )
  }

  // Pack 2 Teaching-Quality F1 — per-difficulty cognition hold floor.
  // Schemas admit ≥800ms (the absolute floor); the per-D narrowing
  // (D1-D3=1100, D4=1000, D5=800) is enforced here at materialize time
  // because only the materializer knows the variant's effective
  // difficulty. A D2 variant authoring an 800ms hold is rejected; a D5
  // variant authoring 800ms is accepted.
  const authoredHoldMs = template.scene.timingOverrides?.cognitionHoldMs
  if (typeof authoredHoldMs === 'number') {
    const cognitionFloor = _cognitionHoldFloorForDifficulty(effectiveDifficultyForCap)
    if (authoredHoldMs < cognitionFloor) {
      throw new Error(
        `Template ${template.id} (used by ${variant.id} at D${effectiveDifficultyForCap}) ` +
          `cognitionHoldMs=${authoredHoldMs} is below the per-D floor (${cognitionFloor}ms). ` +
          `Per-D floors: D1-D3=1100, D4=1000, D5=800. See ` +
          `cognitionHoldFloorForDifficulty in apps/web/lib/scenario3d/freezeFrameCognition.ts.`,
      )
    }
  }

  const preAnswerOverlays = filteredPre.map((o) => resolveOverlay(o, mirror))
  const postAnswerOverlays = template.overlays.post.map((o) => resolveOverlay(o, mirror))

  // Pack 2 Teaching-Quality F2 — disguise can shift the freeze marker
  // earlier in the possession (renamed from the legacy `freezeCompressMs`,
  // which mis-named the behaviour as "compression"). The marker moves
  // earlier; the cognition hold itself stays the same unless
  // `cognitionHoldCompressMs` is also set (handled below).
  let freezeMarker = template.scene.freezeMarker
  if (
    freezeMarker?.kind === 'atMs' &&
    typeof disguise?.freezeShiftEarlierMs === 'number' &&
    disguise.freezeShiftEarlierMs > 0
  ) {
    freezeMarker = {
      kind: 'atMs',
      atMs: Math.max(0, freezeMarker.atMs - disguise.freezeShiftEarlierMs),
    }
  }

  // Pack 2 Teaching-Quality F2 — disguise can also tighten thinking
  // time itself by subtracting from the resolved cognition hold.
  // Composes with `freezeShiftEarlierMs`: heavy disguise can both
  // move the freeze earlier AND give the player less time to read it.
  // The F1 per-D floor is enforced after the subtraction so a heavy
  // disguise cannot drag the hold below the difficulty's floor.
  let resolvedTimingOverrides = template.scene.timingOverrides
  if (
    typeof disguise?.cognitionHoldCompressMs === 'number' &&
    disguise.cognitionHoldCompressMs > 0
  ) {
    // Default cognition hold is FREEZE_COGNITION_HOLD_MS = 1400 (Pack 1
    // module constant in apps/web/lib/scenario3d/freezeFrameCognition.ts).
    // Mirror the value here as a literal so the materializer stays
    // node-only (architecture lock); update both in lockstep when the
    // default ever changes.
    const PACK_1_DEFAULT_HOLD_MS = 1400
    const baseHold =
      template.scene.timingOverrides?.cognitionHoldMs ?? PACK_1_DEFAULT_HOLD_MS
    const compressed = Math.max(0, baseHold - disguise.cognitionHoldCompressMs)
    const cognitionFloor = _cognitionHoldFloorForDifficulty(
      effectiveDifficultyForCap,
    )
    if (compressed < cognitionFloor) {
      throw new Error(
        `Template ${template.id} (used by ${variant.id} at D${effectiveDifficultyForCap}) ` +
          `disguise "${variant.variation.disguise}" cognitionHoldCompressMs=` +
          `${disguise.cognitionHoldCompressMs} drives the resolved cognition hold ` +
          `to ${compressed}ms, below the per-D floor (${cognitionFloor}ms). ` +
          `Reduce cognitionHoldCompressMs or raise the template's ` +
          `timingOverrides.cognitionHoldMs.`,
      )
    }
    resolvedTimingOverrides = {
      ...(template.scene.timingOverrides ?? {}),
      cognitionHoldMs: compressed,
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
      // Phase 3.1.4 — pass through opt-in timing override + multi-beat
      // spec. Both fields are optional in the template schema; we
      // forward them only when authored so materialized JSONs stay
      // diff-stable for templates that don't use them.
      // Pack 2 Teaching-Quality F2 — `resolvedTimingOverrides` includes
      // any disguise-driven cognitionHoldCompressMs subtraction
      // applied above; if no compression and no template override,
      // we forward nothing.
      ...(resolvedTimingOverrides
        ? { timingOverrides: resolvedTimingOverrides }
        : {}),
      ...(template.scene.beatSpec ? { beatSpec: template.scene.beatSpec } : {}),
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
