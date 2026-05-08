/**
 * Variant repetition + coverage lint.
 *
 * Runs after materialization to flag content-quality risks the schema
 * cannot catch:
 *
 *   1. Variation-axis collision — two variants in different templates
 *      that share (decoder_tag, user_role, mirror, primary_cue_atom,
 *      difficulty). These would feel like the same rep to a player.
 *
 *   2. Single-axis spread — a template whose variants only differ on
 *      mirror flips. Lint warns; lift to error once the library is
 *      mature.
 *
 *   3. Decoder/difficulty coverage — surfaces gaps in the matrix so
 *      authors can see where to add templates next.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  decoderTagSchema,
  templateSchema,
  variantSchema,
  variationSignature,
  type Template,
  type Variant,
} from '../packages/db/seed/scenarios/templates/_schema'

const TEMPLATES_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios', 'templates')
const PACKS_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios', 'packs')

interface Loaded {
  template: Template
  variants: Variant[]
}

async function load(): Promise<Loaded[]> {
  const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true })
  const out: Loaded[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue
    const dir = path.join(TEMPLATES_DIR, e.name)
    const tplPath = path.join(dir, 'template.json')
    let raw: string
    try {
      raw = await fs.readFile(tplPath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw err
    }
    const template = templateSchema.parse(JSON.parse(raw))
    const variantsDir = path.join(dir, 'variants')
    const files = (await fs.readdir(variantsDir, { withFileTypes: true }))
      .filter((f) => f.isFile() && f.name.endsWith('.json'))
      .map((f) => path.join(variantsDir, f.name))
      .sort()
    const variants = await Promise.all(
      files.map(async (f) => variantSchema.parse(JSON.parse(await fs.readFile(f, 'utf8')))),
    )
    out.push({ template, variants })
  }
  return out
}

interface Issue {
  severity: 'warn' | 'error'
  message: string
}

function lintAxisSpread(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template, variants } of loaded) {
    if (variants.length < 2) continue
    const axes = {
      mirror: new Set<boolean>(),
      user_slot: new Set<string>(),
      disguise: new Set<string>(),
      clock_pressure: new Set<string>(),
      difficulty: new Set<number>(),
    }
    for (const v of variants) {
      axes.mirror.add(v.variation.mirror)
      axes.user_slot.add(v.variation.user_slot ?? template.tactical.user_slot_default)
      axes.disguise.add(v.variation.disguise)
      axes.clock_pressure.add(v.variation.clock_pressure)
      axes.difficulty.add(effectiveDifficulty(v, template))
    }
    const usedAxes = Object.values(axes).filter((s) => s.size > 1).length
    if (variants.length >= 4 && usedAxes < 3) {
      issues.push({
        severity: 'warn',
        message: `Template ${template.id}: ${variants.length} variants spread across only ${usedAxes} axes. Diversify (mirror is not enough).`,
      })
    }
  }
  return issues
}

function effectiveDifficulty(v: Variant, template: Template): number {
  if (typeof v.variation.difficulty === 'number') return v.variation.difficulty
  const bump = template.disguises[v.variation.disguise]?.difficultyBump ?? 0
  return Math.min(5, template.tactical.difficulty_default + bump)
}

function lintCrossTemplateCollision(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  const buckets = new Map<string, string[]>()
  for (const { template, variants } of loaded) {
    for (const v of variants) {
      const userSlot = v.variation.user_slot ?? template.tactical.user_slot_default
      const userRole = template.scene.players.find((p) => p.slot === userSlot)?.role ?? userSlot
      const cue = template.tactical.cue_atoms[0]
      const d = effectiveDifficulty(v, template)
      const key = [template.decoder_tag, userRole, v.variation.mirror, cue, d].join('|')
      const arr = buckets.get(key) ?? []
      arr.push(`${template.id}:${v.id}`)
      buckets.set(key, arr)
    }
  }
  for (const [key, ids] of buckets) {
    if (ids.length > 1) {
      // Phase 3.1.7 — promoted from warn → error. Two scenarios that
      // share (decoder|role|mirror|cue|d) feel like the same rep to a
      // player; the spaced-rep router cannot tell them apart. Pack 2
      // ships 75 scenarios across the same six decoders — without a
      // hard gate the matrix is statistically guaranteed to collide.
      // To allow a deliberate collision (e.g. an intentional remix
      // with new prose only), set the variants' user_slot or disguise
      // to differ; the signature picks them up.
      issues.push({
        severity: 'error',
        message: `Cross-template collision on (decoder|role|mirror|cue|d) = ${key} → ${ids.join(', ')}. Differentiate user_slot, disguise, clock_pressure, or cue_atom to break the tie.`,
      })
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// Phase 3.1.8 — cross-pack duplicate signature check.
//
// Loads scenario JSONs from `packs/<pack>/` (excluding the
// auto-generated templates pack) and computes a coarse signature per
// authored scenario. Any new template variant that lands on the same
// `(decoder_tag, user_role, difficulty)` triple as an existing pack
// scenario is flagged. The signature is intentionally coarser than
// the cross-template check because Pack 1 founder fixtures pre-date
// the cue_atom + mirror axes.
// ---------------------------------------------------------------------------

interface ExistingPackScenario {
  id: string
  packSlug: string
  decoder_tag: string | null
  user_role: string
  difficulty: number
}

async function loadExistingPackScenarios(): Promise<ExistingPackScenario[]> {
  const out: ExistingPackScenario[] = []
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = (await fs.readdir(PACKS_DIR, { withFileTypes: true })) as never
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return out
    throw err
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Skip the auto-generated `templates-*` packs — they ARE the
    // variants we're linting, not a separate authoring surface.
    if (entry.name.startsWith('templates-')) continue
    const packDir = path.join(PACKS_DIR, entry.name)
    const manifestPath = path.join(packDir, 'pack.json')
    let manifestRaw: string
    try {
      manifestRaw = await fs.readFile(manifestPath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw err
    }
    const manifest = JSON.parse(manifestRaw) as {
      slug?: string
      scenarios?: Array<{ id?: string; file?: string }>
    }
    const slug = manifest.slug ?? entry.name
    for (const item of manifest.scenarios ?? []) {
      if (!item.file) continue
      const scenarioPath = path.join(packDir, item.file)
      const raw = await fs.readFile(scenarioPath, 'utf8')
      const parsed = JSON.parse(raw) as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const s of list) {
        const id = (s.id as string | undefined) ?? item.id ?? '<unknown>'
        const dt = (s.decoder_tag as string | null | undefined) ?? null
        const ur = (s.user_role as string | undefined) ?? '<unknown>'
        const d = (s.difficulty as number | undefined) ?? -1
        out.push({ id, packSlug: slug, decoder_tag: dt, user_role: ur, difficulty: d })
      }
    }
  }
  return out
}

function lintCrossPackCollision(
  loaded: Loaded[],
  existingPackScenarios: ExistingPackScenario[],
): Issue[] {
  const issues: Issue[] = []
  // Build a coarse-key map of existing-pack scenarios.
  const existingByKey = new Map<string, string[]>()
  for (const s of existingPackScenarios) {
    if (!s.decoder_tag) continue
    const key = [s.decoder_tag, s.user_role, s.difficulty].join('|')
    const arr = existingByKey.get(key) ?? []
    arr.push(`${s.packSlug}:${s.id}`)
    existingByKey.set(key, arr)
  }
  for (const { template, variants } of loaded) {
    for (const v of variants) {
      // Only flag LIVE / REVIEW variants — DRAFT may legitimately re-use
      // a Pack 1 cell during scaffolding before the author differentiates.
      if (v.status === 'DRAFT' || v.status === 'RETIRED') continue
      // Variant id pattern is `^[A-Z]{3,4}-T\d+-\d{2}$` (templateSchema).
      // T1 = founder generation; founder-v0 cells are deliberately
      // re-authored as T1 templates, so a T1↔founder-v0 cell match is
      // expected. The cross-pack rule fires only on T2+ variants.
      const generationMatch = /-T(\d+)-/.exec(v.id)
      const generation = generationMatch ? Number.parseInt(generationMatch[1] ?? '0', 10) : 0
      if (generation < 2) continue
      const userSlot = v.variation.user_slot ?? template.tactical.user_slot_default
      const userRole = template.scene.players.find((p) => p.slot === userSlot)?.role ?? userSlot
      const d = effectiveDifficulty(v, template)
      const key = [template.decoder_tag, userRole, d].join('|')
      const collisions = existingByKey.get(key)
      if (collisions && collisions.length > 0) {
        issues.push({
          severity: 'error',
          message: `Cross-pack collision: variant ${template.id}:${v.id} (${template.decoder_tag}|${userRole}|d${d}) duplicates existing pack scenario(s) ${collisions.join(', ')}. Differentiate user_slot or difficulty.`,
        })
      }
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// Phase 3.1.3 — camera preset drift lint.
//
// Per blueprint §3.6, each decoder has a canonical camera preset. We
// duplicate the (small) map here rather than importing from apps/web
// because lint-variants is a node script and apps/web exports type-
// only modules through next.js. The map is identical to
// `DECODER_CAMERA_PRESETS.firstBeat` in apps/web/lib/scenario3d/
// decoderCameraPresets.ts.
// ---------------------------------------------------------------------------

const DECODER_CAMERA_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  BACKDOOR_WINDOW: 'passer_side_three_quarter',
  EMPTY_SPACE_CUT: 'teaching_angle',
  SKIP_THE_ROTATION: 'top_down',
  ADVANTAGE_OR_RESET: 'defense',
  READ_THE_COVERAGE: 'top_down',
  HUNT_THE_ADVANTAGE: 'teaching_angle',
})

// ---------------------------------------------------------------------------
// Phase 3.1.2 — decoder overlay preset conformance lint.
//
// Blueprint §3.6 says pre-answer overlays must be a subset of the
// decoder's preset. The runtime preset map lives in apps/web (web-only
// import); this lint duplicates the small allowlist by decoder + phase
// so the script stays decoupled from next.js/react.
//
// Severity: warn — a template MAY add a kind outside the preset when
// a scenario's cue cluster genuinely needs it; the lint just surfaces
// the diff. Schema-level enforcement of the broader pre-answer kinds
// allowlist (`PRE_ANSWER_OVERLAY_KINDS`) still fires as a hard error.
//
// The preset table mirrors apps/web/lib/scenario3d/decoderOverlayPresets.ts.
// ---------------------------------------------------------------------------

const PRESET_PRE_ANSWER_KINDS_BY_DECODER: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  BACKDOOR_WINDOW: new Set([
    'defender_vision_cone',
    'defender_hip_arrow',
    'defender_hand_in_lane',
  ]),
  EMPTY_SPACE_CUT: new Set([
    'defender_vision_cone',
    'defender_hip_arrow',
    'help_pulse',
  ]),
  SKIP_THE_ROTATION: new Set([
    'help_pulse',
    'defender_hip_arrow',
    'defender_chest_line',
  ]),
  ADVANTAGE_OR_RESET: new Set([
    'defender_vision_cone',
    'defender_hip_arrow',
    'defender_foot_arrow',
  ]),
  // Pack 2 — DROP / HUNT preset kinds are in flight (scaffolds in
  // apps/web/lib/scenario3d/decoderOverlayPresets.ts ship as empty
  // arrays). Until 3.1.2 part 2 fills them in, an empty allowlist
  // means EVERY pre-answer overlay on a DROP/HUNT template will warn
  // — that's the correct signal: don't ship Pack 2 templates that
  // bypass the preset before the preset is designed.
  READ_THE_COVERAGE: new Set<string>(),
  HUNT_THE_ADVANTAGE: new Set<string>(),
})

function lintOverlayPresetConformance(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template } of loaded) {
    const allowed = PRESET_PRE_ANSWER_KINDS_BY_DECODER[template.decoder_tag]
    if (!allowed) continue
    for (const overlay of template.overlays.pre) {
      if (!allowed.has(overlay.kind)) {
        issues.push({
          severity: 'warn',
          message:
            `Template ${template.id}: pre-answer overlay kind "${overlay.kind}" is outside ` +
            `the ${template.decoder_tag} preset. ` +
            (allowed.size === 0
              ? `Pack 2 stub preset is empty — wait for 3.1.2 to fill in DROP/HUNT presets.`
              : `Allowed: {${Array.from(allowed).sort().join(', ')}}.`),
        })
      }
    }
  }
  return issues
}

function lintCameraPreset(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template } of loaded) {
    const expected = DECODER_CAMERA_DEFAULTS[template.decoder_tag]
    if (!expected) continue
    if (template.scene.camera !== expected) {
      issues.push({
        severity: 'warn',
        message:
          `Template ${template.id}: camera "${template.scene.camera}" differs from decoder default "${expected}". ` +
          `Justify the override in tactical.notes or revert to match.`,
      })
    }
  }
  return issues
}

function lintCoverage(loaded: Loaded[]): { matrix: string; issues: Issue[] } {
  // Decoder × difficulty coverage.
  const cells = new Map<string, number>()
  for (const { template, variants } of loaded) {
    for (const v of variants) {
      const d = effectiveDifficulty(v, template)
      const key = `${template.decoder_tag}|${d}`
      cells.set(key, (cells.get(key) ?? 0) + 1)
    }
  }
  // Derive decoders from the Zod enum so Pack 2 / Pack 3 additions surface
  // automatically. Hardcoding the founder four meant a new decoder was a
  // silent coverage gap until the matrix was updated by hand.
  const decoders = decoderTagSchema.options
  const lines: string[] = ['Decoder × difficulty coverage:']
  lines.push('  ' + ['', 'D1', 'D2', 'D3', 'D4', 'D5'].join('\t'))
  const issues: Issue[] = []
  // Pack 2 (3.1.11) — DROP / HUNT decoders are gated to D≥3 by design.
  // Reporting D1 / D2 gaps for them would be a false positive, so the
  // floor difficulty for the gap warning is decoder-specific.
  const D_GE_3_ONLY: ReadonlySet<string> = new Set(['READ_THE_COVERAGE', 'HUNT_THE_ADVANTAGE'])
  for (const dec of decoders) {
    const row = [dec]
    for (let d = 1; d <= 5; d++) {
      const n = cells.get(`${dec}|${d}`) ?? 0
      row.push(String(n))
      if (d <= 2 && n === 0 && !D_GE_3_ONLY.has(dec)) {
        issues.push({ severity: 'warn', message: `Coverage gap: ${dec} has no D${d} variant.` })
      }
    }
    lines.push('  ' + row.join('\t'))
  }
  return { matrix: lines.join('\n'), issues }
}

function lintVariationSignatureUnique(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template, variants } of loaded) {
    const seen = new Map<string, string>()
    for (const v of variants) {
      const sig = variationSignature(v, template)
      if (seen.has(sig)) {
        issues.push({
          severity: 'error',
          message: `Template ${template.id}: variants ${seen.get(sig)} and ${v.id} share signature "${sig}".`,
        })
      } else seen.set(sig, v.id)
    }
  }
  return issues
}

/**
 * Phase 3.1.5 — promote TODO markers from a LIVE-only error to a
 * staged rule:
 *   - LIVE   with TODO  →  error  (blocks merge)
 *   - REVIEW with TODO  →  error  (REVIEW means SME-ready; TODOs are
 *                                  authoring debt that must clear
 *                                  before review — see blueprint §3.1)
 *   - DRAFT  with TODO  →  warn   (scaffolder writes TODOs intentionally)
 *   - RETIRED with TODO →  ignore (retired prose is read-only)
 *
 * TODO detection scans `copy` recursively (already covered by
 * JSON.stringify) AND flags TODOs anywhere in the variant — including
 * `variation.overrides`, choice prose, etc.
 */
function lintTodoProse(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { variants } of loaded) {
    for (const v of variants) {
      if (v.status === 'RETIRED') continue
      const json = JSON.stringify(v)
      if (!json.includes('TODO:')) continue

      if (v.status === 'LIVE') {
        issues.push({
          severity: 'error',
          message: `Variant ${v.id} is LIVE but still contains TODO: prose. Promotion to LIVE requires every TODO be resolved.`,
        })
      } else if (v.status === 'REVIEW') {
        issues.push({
          severity: 'error',
          message: `Variant ${v.id} is REVIEW (SME-ready) but contains TODO: prose. Resolve the TODOs before submitting for SME review.`,
        })
      } else {
        // DRAFT — TODOs are expected. Surface as a warning so authors
        // see the count without it blocking merge of an in-flight branch.
        issues.push({
          severity: 'warn',
          message: `Variant ${v.id} (DRAFT) contains TODO: prose — fill in before promoting to REVIEW.`,
        })
      }
    }
  }
  return issues
}

async function main(): Promise<void> {
  const loaded = await load()
  const existingPackScenarios = await loadExistingPackScenarios()
  console.log(
    `lint-variants: ${loaded.length} templates loaded; ` +
      `${existingPackScenarios.length} existing pack scenarios scanned for cross-pack collisions.`,
  )
  const issues: Issue[] = [
    ...lintVariationSignatureUnique(loaded),
    ...lintAxisSpread(loaded),
    ...lintCrossTemplateCollision(loaded),
    ...lintCrossPackCollision(loaded, existingPackScenarios),
    ...lintCameraPreset(loaded),
    ...lintOverlayPresetConformance(loaded),
    ...lintTodoProse(loaded),
  ]
  const cov = lintCoverage(loaded)
  issues.push(...cov.issues)

  console.log('\n' + cov.matrix)

  if (issues.length === 0) {
    console.log('\nlint-variants: clean ✓')
    return
  }
  console.log('')
  let errorCount = 0
  for (const i of issues) {
    const tag = i.severity === 'error' ? '✗' : '!'
    console.log(`  ${tag} [${i.severity}] ${i.message}`)
    if (i.severity === 'error') errorCount++
  }
  if (errorCount > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
