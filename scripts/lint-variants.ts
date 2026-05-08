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
      issues.push({
        severity: 'warn',
        message: `Cross-template collision on (decoder|role|mirror|cue|d) = ${key} → ${ids.join(', ')}`,
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
  console.log(`lint-variants: ${loaded.length} templates loaded`)
  const issues: Issue[] = [
    ...lintVariationSignatureUnique(loaded),
    ...lintAxisSpread(loaded),
    ...lintCrossTemplateCollision(loaded),
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
