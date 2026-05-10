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
  proseBankSchema,
  templateSchema,
  variantSchema,
  variationSignature,
  type ProseBank,
  type Template,
  type Variant,
} from '../packages/db/seed/scenarios/templates/_schema'

const TEMPLATES_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios', 'templates')
const PACKS_DIR = path.join(process.cwd(), 'packages', 'db', 'seed', 'scenarios', 'packs')

interface Loaded {
  template: Template
  variants: Variant[]
  /** Pack 2 §3.3 — optional per-template prose bank. Loaded lazily;
   *  `null` means the file is absent (the template hasn't authored a
   *  bank yet). The lint surfaces missing-bank cases as warnings. */
  proseBank: ProseBank | null
  /** Path to the template directory (for error messages). */
  templateDir: string
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
    const proseBank = await tryLoadProseBank(dir, template.id)
    out.push({ template, variants, proseBank, templateDir: dir })
  }
  return out
}

/**
 * Pack 2 §3.3 — load the optional `<template-dir>/prose-bank.json`.
 * Returns `null` when absent; throws if present-but-malformed (a typo
 * in a slot identifier or an unknown quality must fail loudly so the
 * author sees it before merging the bank).
 */
async function tryLoadProseBank(
  dir: string,
  templateId: string,
): Promise<ProseBank | null> {
  const bankPath = path.join(dir, 'prose-bank.json')
  let raw: string
  try {
    raw = await fs.readFile(bankPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  const parsed = proseBankSchema.parse(JSON.parse(raw))
  if (parsed.template !== templateId) {
    throw new Error(
      `Prose bank ${path.relative(process.cwd(), bankPath)} declares template "${parsed.template}" but lives under "${templateId}".`,
    )
  }
  return parsed
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

// ---------------------------------------------------------------------------
// Pack 2 Teaching-Quality F7 — wrong-demo divergence lint.
//
// Risk H6 in docs/pack-2-teaching-quality-risk-report.md: the schema
// requires every wrong choice to declare wrongDemos movements, but it
// does not require those movements to visually differ from the
// answerDemo. A wrong choice that plays a path indistinguishable from
// the right choice teaches nothing — the player can't tell which path
// was correct.
//
// F7 enforces a minimum endpoint divergence: for each (template,
// wrongDemo), the union of moved player slots across both demos is
// computed; if EVERY moved slot's final destination in the wrongDemo
// lies within `WRONG_DEMO_MIN_DIVERGENCE_FT` of the same slot's final
// destination in the answerDemo, the wrong demo is flagged. A slot
// moved in one demo but absent from the other counts as structural
// divergence (no false-positive on asymmetric demos).
//
// Endpoint comparison is the audit's spirit ("at +500ms after freeze")
// applied to the cheapest-to-implement signal that catches the worst
// authoring failure (a copy-pasted wrongDemo). Per-tick interpolation
// would catch additional same-endpoint-via-different-path cases; the
// endpoint check is a lower bound that gates the obvious bugs without
// requiring a kinematics simulator in the lint script.
// ---------------------------------------------------------------------------

const WRONG_DEMO_MIN_DIVERGENCE_FT = 1.5

interface CourtPoint {
  x: number
  z: number
}

interface DemoMovementLike {
  playerSlot: string
  to: CourtPoint
  delayMs?: number
  durationMs?: number
}

/** For each playerSlot moved by `movements`, return the destination
 *  of the latest-ending movement. Movements without an explicit
 *  durationMs are treated as 600ms long (the renderer default). */
function _finalDestinationsBySlot(
  movements: ReadonlyArray<DemoMovementLike>,
): Map<string, CourtPoint> {
  const latestByEnd = new Map<string, { endMs: number; to: CourtPoint }>()
  for (const m of movements) {
    const endMs = (m.delayMs ?? 0) + (m.durationMs ?? 600)
    const prev = latestByEnd.get(m.playerSlot)
    if (!prev || endMs >= prev.endMs) {
      latestByEnd.set(m.playerSlot, { endMs, to: m.to })
    }
  }
  const out = new Map<string, CourtPoint>()
  for (const [slot, entry] of latestByEnd) out.set(slot, entry.to)
  return out
}

function _euclideanFt(a: CourtPoint, b: CourtPoint): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

function lintWrongDemoDivergence(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template } of loaded) {
    const answerDests = _finalDestinationsBySlot(template.scene.answerDemo)
    if (answerDests.size === 0) continue
    for (const wrongDemo of template.scene.wrongDemos) {
      if (wrongDemo.movements.length === 0) continue
      const wrongDests = _finalDestinationsBySlot(wrongDemo.movements)
      const allSlots = new Set<string>([
        ...answerDests.keys(),
        ...wrongDests.keys(),
      ])
      let diverged = false
      for (const slot of allSlots) {
        const a = answerDests.get(slot)
        const w = wrongDests.get(slot)
        // Slot moved in one demo but not the other → structural divergence.
        if (!a || !w) {
          diverged = true
          break
        }
        if (_euclideanFt(a, w) >= WRONG_DEMO_MIN_DIVERGENCE_FT) {
          diverged = true
          break
        }
      }
      if (!diverged) {
        issues.push({
          severity: 'error',
          message:
            `Template ${template.id}: wrong-demo "${wrongDemo.outcome}" does not visibly ` +
            `diverge from the answer demo — every moved player ends within ` +
            `${WRONG_DEMO_MIN_DIVERGENCE_FT}ft of the answer's destination. The wrong-demo ` +
            `plays a silent failure that teaches nothing. Move at least one player's ` +
            `final destination ≥ ${WRONG_DEMO_MIN_DIVERGENCE_FT}ft from the answer demo's.`,
        })
      }
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// Pack 2 Teaching-Quality F3 — Hard gate on empty preset decoders.
//
// Risk H3 (pack-2-teaching-quality-risk-report.md §2): a LIVE D4/D5
// READ_THE_COVERAGE / HUNT_THE_ADVANTAGE variant can render with zero
// pre-answer cues today because the decoder presets in
// `apps/web/lib/scenario3d/decoderOverlayPresets.ts` ship with
// `preAnswer: []` stubs. The seeder's "level=high needs status=approved"
// check is a soft gate; it does not stop a REVIEW or LIVE variant whose
// teaching surface is empty by construction.
//
// Policy: any variant on a decoder whose preset preAnswer is empty must
// stay in DRAFT (or RETIRED). DRAFT lets authoring proceed against the
// stub; REVIEW/LIVE require the preset to be filled in first.
// ---------------------------------------------------------------------------

/** A decoder whose preset preAnswer cluster is currently empty (Pack 2 stub). */
function isEmptyPresetDecoder(decoderTag: string): boolean {
  const allowed = PRESET_PRE_ANSWER_KINDS_BY_DECODER[decoderTag]
  return allowed != null && allowed.size === 0
}

function lintEmptyPresetPromotionGate(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template, variants } of loaded) {
    if (!isEmptyPresetDecoder(template.decoder_tag)) continue
    for (const v of variants) {
      if (v.status !== 'REVIEW' && v.status !== 'LIVE') continue
      issues.push({
        severity: 'error',
        message:
          `Variant ${template.id}:${v.id} is ${v.status} but decoder ` +
          `${template.decoder_tag} ships an empty pre-answer preset. ` +
          `Promotion past DRAFT would render the freeze with zero teaching cues. ` +
          `Either keep the variant in DRAFT, or fill in the preset's preAnswer ` +
          `cluster in apps/web/lib/scenario3d/decoderOverlayPresets.ts (and mirror ` +
          `the kinds in PRESET_PRE_ANSWER_KINDS_BY_DECODER below).`,
      })
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

// ---------------------------------------------------------------------------
// Pack 2 §3.2 — disguise progression integrity.
//
// Two silent-pass risks the schema cannot catch on its own:
//
//   1. Non-monotonic difficulty progression. The disguise menu is
//      ordered none → light → moderate → heavy by design. If `light`
//      has a higher difficultyBump than `moderate`, the progression
//      reads backwards to the spaced-rep router (the variant labelled
//      "moderate" is actually easier). Schema only bounds each bump in
//      isolation; the cross-level relationship is invisible to it.
//
//   2. removePre targets that don't match any pre overlay. The
//      materializer's removeSet quietly filters; a typo (`onSlot:
//      "deny_dev"` instead of `"deny_def"`) silently does nothing,
//      shipping a "disguise" that doesn't actually disguise. Authors
//      see the variant pass and assume the harder difficulty is real.
//      Same family as the screenshot-gate bug: warn-and-pass hides the
//      defect.
//
// Both checks land at severity='error' — every existing template is
// already conformant (verified at landing), so a new template that
// trips either rule is almost certainly broken. The error message
// names the disguise level + the unmatched target so the fix is one
// edit away.
// ---------------------------------------------------------------------------

const DISGUISE_LEVELS = ['none', 'light', 'moderate', 'heavy'] as const

function lintDisguiseProgression(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template } of loaded) {
    // (1) Monotonic non-decreasing difficultyBump along the menu order.
    let prevLevel: (typeof DISGUISE_LEVELS)[number] | null = null
    let prevBump = 0
    for (const level of DISGUISE_LEVELS) {
      const cfg = template.disguises[level]
      if (!cfg) continue
      const bump = cfg.difficultyBump ?? 0
      if (prevLevel && bump < prevBump) {
        issues.push({
          severity: 'error',
          message:
            `Template ${template.id}: disguise progression is non-monotonic — ` +
            `"${level}" difficultyBump=${bump} is below "${prevLevel}" difficultyBump=${prevBump}. ` +
            `Order the menu so heavier disguises bump difficulty at least as much as lighter ones.`,
        })
      }
      prevLevel = level
      prevBump = bump
    }

    // (2) Every removePre target must match a real pre overlay.
    //     Match rule mirrors the materializer's removeSet: a target
    //     with `onSlot` matches the same (kind,onSlot) pair; a target
    //     without `onSlot` matches any pre overlay of that kind.
    const preIndex = new Map<string, Set<string>>() // kind → set of onSlots
    for (const o of template.overlays.pre) {
      const onSlot = (o as { onSlot?: string }).onSlot ?? ''
      const slots = preIndex.get(o.kind) ?? new Set<string>()
      slots.add(onSlot)
      preIndex.set(o.kind, slots)
    }
    for (const level of DISGUISE_LEVELS) {
      const cfg = template.disguises[level]
      if (!cfg) continue
      for (const target of cfg.removePre) {
        const slots = preIndex.get(target.kind)
        if (!slots) {
          issues.push({
            severity: 'error',
            message:
              `Template ${template.id}: disguise "${level}" removes overlay kind "${target.kind}" ` +
              `but no pre-answer overlay of that kind exists. The disguise is a silent no-op.`,
          })
          continue
        }
        if (target.onSlot && !slots.has(target.onSlot)) {
          issues.push({
            severity: 'error',
            message:
              `Template ${template.id}: disguise "${level}" removes "${target.kind}" on slot "${target.onSlot}" ` +
              `but no matching pre-answer overlay exists (existing onSlots: {${Array.from(slots).filter(Boolean).join(', ') || '—'}}). ` +
              `The disguise is a silent no-op.`,
          })
        }
      }
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

// ---------------------------------------------------------------------------
// Pack 2 §3.3 — Prose-bank lint skeleton (warn-first).
//
// Three discrete checks. None are runtime-load-bearing yet — variant
// runtime consumption is still data-only — but landing the lint now
// keeps authors honest while the bank shape stabilises.
//
//   1. lintProseBankCoverage — per-template, every choice quality
//      declared by the template (best/acceptable/wrong) should have
//      at least one prose-bank entry covering it. If the template
//      has no prose-bank.json, this is a single per-template warning,
//      NOT a fanout per choice — keeps the warning count flat.
//
//   2. lintUnresolvedSlotTokens — variant copy must not ship literal
//      `{slot}` tokens. The runtime today doesn't expand them; an
//      author who copies a skeleton straight out of the bank without
//      filling its slots will leak `{cue_atom_short_desc}` into the
//      UI. Severity tiered by status:
//         LIVE   → error (cannot ship literal braces to users)
//         REVIEW → error (SME-ready means prose is ready)
//         DRAFT  → warn  (scaffolder leaves TODOs; author will iterate)
//
//   3. The schema itself (proseBankSchema.superRefine) already errors
//      on unknown slot identifiers, so a typo is caught at parse time,
//      not here.
//
// "Detect missing required slot fills" / "unchanged placeholder prose
// in REVIEW/LIVE" are the two visible authoring hazards; this lint
// addresses both at the variant boundary.
// ---------------------------------------------------------------------------

function lintProseBankCoverage(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { template, proseBank, variants } of loaded) {
    // If the template has any non-DRAFT variants but no bank, surface
    // a single warn-level reminder. DRAFT-only templates can defer the
    // bank — the gold-standard workflow is: scaffold variant DRAFT →
    // author bank → fill prose → promote to REVIEW.
    const hasNonDraft = variants.some((v) => v.status !== 'DRAFT' && v.status !== 'RETIRED')
    if (!proseBank) {
      if (hasNonDraft) {
        issues.push({
          severity: 'warn',
          message: `Template ${template.id}: missing prose-bank.json; required before any variant promotes past DRAFT.`,
        })
      }
      continue
    }
    const required = new Set(template.choices.map((c) => c.quality))
    const have = new Set(proseBank.entries.map((e) => e.quality))
    for (const q of required) {
      if (!have.has(q)) {
        issues.push({
          severity: 'warn',
          message: `Template ${template.id}: prose-bank has no entry for quality "${q}" (template declares a "${q}" choice). Add at least one skeleton.`,
        })
      }
    }
  }
  return issues
}

const SLOT_TOKEN_LITERAL = /\{[a-z][a-z0-9_]*\}/g

function lintUnresolvedSlotTokens(loaded: Loaded[]): Issue[] {
  const issues: Issue[] = []
  for (const { variants } of loaded) {
    for (const v of variants) {
      if (v.status === 'RETIRED') continue
      const json = JSON.stringify(v.copy)
      const matches = json.match(SLOT_TOKEN_LITERAL)
      if (!matches || matches.length === 0) continue
      const uniq = [...new Set(matches)].sort()
      const sample = uniq.slice(0, 4).join(', ')
      const more = uniq.length > 4 ? ` (+${uniq.length - 4} more)` : ''
      const msg = `Variant ${v.id}: unresolved prose-bank slot tokens in copy → ${sample}${more}. Replace with concrete prose before promoting.`
      if (v.status === 'LIVE' || v.status === 'REVIEW') {
        issues.push({ severity: 'error', message: msg })
      } else {
        issues.push({ severity: 'warn', message: msg })
      }
    }
  }
  return issues
}

async function main(): Promise<void> {
  const showCoverage = process.argv.includes('--coverage')
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
    ...lintEmptyPresetPromotionGate(loaded),
    ...lintWrongDemoDivergence(loaded),
    ...lintDisguiseProgression(loaded),
    ...lintTodoProse(loaded),
    ...lintProseBankCoverage(loaded),
    ...lintUnresolvedSlotTokens(loaded),
  ]
  const cov = lintCoverage(loaded)
  issues.push(...cov.issues)

  // Coverage matrix is verbose authoring feedback. Print only when
  // explicitly requested (`pnpm templates:lint --coverage`); CI runs
  // the lint without the flag for terser logs. Coverage gap warnings
  // still surface unconditionally as part of `issues` below.
  if (showCoverage) {
    console.log('\n' + cov.matrix)
  }

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
