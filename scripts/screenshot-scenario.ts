/**
 * Pack 2 §3.1.14 — Visual regression baseline + diff system.
 *
 * Replaces the v1 single-scenario screenshot harness with a
 * deterministic, manifest-keyed regression tool that protects Pack 1
 * and is ready for Pack 2's 75-scenario matrix.
 *
 * Modes
 * -----
 * BASELINE — capture-and-record. Writes screenshots to
 *   docs/screenshots/<id>/baseline/<phase>.png and updates
 *   docs/screenshots/<id>/baseline/manifest.json with SHA-256 hashes.
 *   Run by an author when intentionally re-baselining a scenario; the
 *   git diff on the manifest is the audit trail.
 *
 * DIFF     — capture-and-compare. Writes screenshots to
 *   docs/screenshots/<id>/actual/<phase>.png and compares each hash
 *   against the baseline manifest. Exits 1 on any mismatch so CI can
 *   gate it. Per-file mismatches are listed with both paths so a
 *   reviewer can open the GitHub image diff side-by-side.
 *
 * Naming convention
 * -----------------
 *   docs/screenshots/<id>/baseline/load.png       — initial render, network idle
 *   docs/screenshots/<id>/baseline/freeze.png     — freeze marker held
 *   docs/screenshots/<id>/baseline/after.png      — post-freeze answer surface
 *   docs/screenshots/<id>/baseline/manifest.json  — { phase: { sha256, capturedAt, viewport } }
 *
 *   docs/screenshots/<id>/actual/<phase>.png      — produced by `diff` runs
 *
 * Determinism
 * -----------
 *   - Viewport + DPR locked: 1440×900 @ 1.0
 *   - Auth state: replayed from .auth/courtiq-user.json (qa:auth)
 *   - Phase signals: prefer DOM data-attributes when present; today
 *     the renderer doesn't expose freeze / choice phase as a stable
 *     attribute, so the script falls back to wall-clock waits gated
 *     by ENV (PHASE_LOAD_DELAY_MS, PHASE_FREEZE_DELAY_MS,
 *     PHASE_AFTER_DELAY_MS). The fallback is documented as a
 *     determinism risk; once the renderer emits `data-cqi-phase`,
 *     this script's waits switch to selector-based and the wall-clock
 *     environment knobs are deleted.
 *
 * Pack matrix (Pack 2 forward-compatibility)
 * ------------------------------------------
 *   - --id <scenario-id>   : capture / diff a single scenario
 *   - --pack <pack-slug>   : iterate over every scenario in a pack
 *                            manifest (packages/db/seed/scenarios/
 *                            packs/<slug>/pack.json)
 *
 * Usage
 * -----
 *   pnpm qa:screenshot baseline --id BDW-01
 *   pnpm qa:screenshot diff --id BDW-01
 *   pnpm qa:screenshot baseline --pack founder-v0
 *   pnpm qa:screenshot diff --pack founder-v0      # for CI
 *
 * Exit codes
 * ----------
 *   0 — clean (baseline written, or diff matched everywhere)
 *   1 — diff found mismatches OR baseline write failed OR setup error
 *   2 — invalid arguments
 *
 * Architecture lock (read once, never violate):
 *   - No new npm dependency. Hash-manifest diff uses node's crypto.
 *   - Pure data flow: screenshot → SHA-256 → manifest. No mutation
 *     of unrelated state, no DB access, no telemetry emission.
 *   - The script is the same for Pack 1 and Pack 2. Adding Pack 2
 *     scenarios to QA_MATRIX_IDS is the only new step.
 */
import { chromium, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ROOT = process.cwd()
const AUTH_FILE = path.resolve(ROOT, '.auth/courtiq-user.json')
const SCREENSHOTS_ROOT = path.resolve(ROOT, 'docs/screenshots')
const PACKS_ROOT = path.resolve(
  ROOT,
  'packages/db/seed/scenarios/packs',
)

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const PHASE_LOAD_DELAY_MS = Number.parseInt(
  process.env.PHASE_LOAD_DELAY_MS ?? '500',
  10,
)
const PHASE_FREEZE_DELAY_MS = Number.parseInt(
  process.env.PHASE_FREEZE_DELAY_MS ?? '2500',
  10,
)
const PHASE_AFTER_DELAY_MS = Number.parseInt(
  process.env.PHASE_AFTER_DELAY_MS ?? '4500',
  10,
)

const VIEWPORT = { width: 1440, height: 900 } as const
const DEVICE_SCALE_FACTOR = 1

type Mode = 'baseline' | 'diff'
type Phase = 'load' | 'freeze' | 'after'
/**
 * Pack 2 §3.1.4 — capture surface.
 *
 *   train   — `/train?scenario=<id>` (default). Requires Supabase auth
 *             and a LIVE-status DB row. Used for Pack 1 (founder-v0).
 *   preview — `/dev/scenario-preview?id=<id>`. Renders any seed JSON
 *             across both founder-v0 and templates-v1 without auth or
 *             a DB read. Required for Pack 2 baselines while variants
 *             are still DRAFT (BDW-T2-01 and similar).
 *
 * The screenshot pipeline is otherwise identical — same viewport,
 * same phase timings, same hash manifest. Capture surface is metadata
 * the manifest records so a reviewer can tell which path produced the
 * baseline.
 */
type CaptureSurface = 'train' | 'preview'

const PHASES: ReadonlyArray<Phase> = ['load', 'freeze', 'after'] as const

interface CliArgs {
  mode: Mode
  ids: string[]
  via: CaptureSurface
}

interface PhaseHash {
  sha256: string
  capturedAt: string
  viewport: { width: number; height: number; dpr: number }
}

type Manifest = Record<Phase, PhaseHash>

function usage(): never {
  console.error(
    [
      'Usage:',
      '  pnpm qa:screenshot <baseline|diff> --id <scenario-id> [--via train|preview]',
      '  pnpm qa:screenshot <baseline|diff> --pack <pack-slug>  [--via train|preview]',
      '',
      '  --via train    (default) /train?scenario=<id>; needs auth + LIVE seed',
      '  --via preview          /dev/scenario-preview?id=<id>; no auth, any pack',
    ].join('\n'),
  )
  process.exit(2)
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  const modeRaw = args[0]
  if (modeRaw !== 'baseline' && modeRaw !== 'diff') usage()
  const mode = modeRaw

  let ids: string[] | null = null
  let via: CaptureSurface = 'train'
  for (let i = 1; i < args.length; i++) {
    const flag = args[i]
    const val = args[i + 1]
    if (flag === '--id' && val) {
      ids = [val]
      i++
    } else if (flag === '--pack' && val) {
      ids = null
      // Defer pack expansion to async — main() will resolve.
      ids = ['__pack__:' + val]
      i++
    } else if (flag === '--via' && (val === 'train' || val === 'preview')) {
      via = val
      i++
    } else if (flag === '--via') {
      console.error(`--via must be "train" or "preview" (got "${val ?? ''}")`)
      process.exit(2)
    }
  }
  if (!ids || ids.length === 0) usage()
  return { mode, ids, via }
}

function urlFor(id: string, via: CaptureSurface): string {
  if (via === 'preview') {
    return `${BASE_URL}/dev/scenario-preview?id=${encodeURIComponent(id)}`
  }
  return `${BASE_URL}/train?scenario=${encodeURIComponent(id)}`
}

async function expandPackIds(ids: string[]): Promise<string[]> {
  const out: string[] = []
  for (const item of ids) {
    if (!item.startsWith('__pack__:')) {
      out.push(item)
      continue
    }
    const slug = item.slice('__pack__:'.length)
    const manifestPath = path.join(PACKS_ROOT, slug, 'pack.json')
    const raw = await readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      scenarios?: Array<{ id?: string }>
    }
    for (const s of parsed.scenarios ?? []) {
      if (typeof s.id === 'string') out.push(s.id)
    }
  }
  return out
}

async function sha256OfFile(p: string): Promise<string> {
  const buf = await readFile(p)
  return createHash('sha256').update(buf).digest('hex')
}

async function captureScenario(
  page: Page,
  id: string,
  outRoot: string,
  via: CaptureSurface,
): Promise<Manifest> {
  const url = urlFor(id, via)
  console.log(`  → ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await page
    .waitForSelector('canvas', { timeout: 30_000 })
    .catch(() => {
      console.log(`  [warn] <canvas> never appeared for ${id}`)
    })
  await page
    .waitForLoadState('networkidle', { timeout: 30_000 })
    .catch(() => {
      console.log(`  [warn] network did not idle for ${id}`)
    })

  const manifest: Manifest = {} as Manifest
  // Per-phase capture. Wait deltas are pulled from ENV so a future
  // selector-based wait can replace them without changing the call
  // sites; the architecture lock above documents this as a known
  // determinism gap.
  const delays: Record<Phase, number> = {
    load: PHASE_LOAD_DELAY_MS,
    freeze: PHASE_FREEZE_DELAY_MS,
    after: PHASE_AFTER_DELAY_MS,
  }
  for (const phase of PHASES) {
    if (phase !== 'load') {
      // Each phase delay is RELATIVE to the prior phase's wait so
      // total wallclock is the sum of the individual delays. This
      // keeps the 'after' screenshot at PHASE_AFTER_DELAY_MS from
      // the freeze, not from page load.
      const prior = phase === 'freeze' ? delays.load : delays.freeze
      const here = delays[phase]
      const delta = Math.max(0, here - prior)
      await page.waitForTimeout(delta)
    } else {
      await page.waitForTimeout(delays.load)
    }
    const filePath = path.join(outRoot, `${phase}.png`)
    await page.screenshot({ path: filePath, fullPage: true })
    const sha256 = await sha256OfFile(filePath)
    manifest[phase] = {
      sha256,
      capturedAt: new Date().toISOString(),
      viewport: { ...VIEWPORT, dpr: DEVICE_SCALE_FACTOR },
    }
    console.log(`    ${phase}.png  ${sha256.slice(0, 12)}…`)
  }
  return manifest
}

async function runBaseline(
  ids: string[],
  via: CaptureSurface,
): Promise<number> {
  // Auth is only required for `--via train`. The /dev/scenario-preview
  // surface is server-rendered without a Supabase session, so a
  // missing auth state is fine when capturing Pack 2 DRAFT variants
  // (which can't reach /train yet anyway).
  if (via === 'train' && !existsSync(AUTH_FILE)) {
    console.error(`auth state missing at ${AUTH_FILE} (run pnpm qa:auth)`)
    return 1
  }
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { ...VIEWPORT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    ...(via === 'train' ? { storageState: AUTH_FILE } : {}),
  })
  const page = await context.newPage()
  let exitCode = 0
  try {
    for (const id of ids) {
      console.log(`baseline ${id} (via=${via})`)
      const baseDir = path.join(SCREENSHOTS_ROOT, id, 'baseline')
      await mkdir(baseDir, { recursive: true })
      const manifest = await captureScenario(page, id, baseDir, via)
      const manifestPath = path.join(baseDir, 'manifest.json')
      await writeFile(
        manifestPath,
        JSON.stringify({ id, via, phases: manifest }, null, 2) + '\n',
      )
      console.log(`  → manifest ${manifestPath}`)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    exitCode = 1
  } finally {
    await browser.close()
  }
  return exitCode
}

async function runDiff(
  ids: string[],
  via: CaptureSurface,
): Promise<number> {
  if (via === 'train' && !existsSync(AUTH_FILE)) {
    console.error(`auth state missing at ${AUTH_FILE} (run pnpm qa:auth)`)
    return 1
  }
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { ...VIEWPORT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    ...(via === 'train' ? { storageState: AUTH_FILE } : {}),
  })
  const page = await context.newPage()
  let mismatchCount = 0
  let missingBaselineCount = 0
  try {
    for (const id of ids) {
      console.log(`diff ${id} (via=${via})`)
      const baseDir = path.join(SCREENSHOTS_ROOT, id, 'baseline')
      const actualDir = path.join(SCREENSHOTS_ROOT, id, 'actual')
      const manifestPath = path.join(baseDir, 'manifest.json')
      if (!existsSync(manifestPath)) {
        console.log(`  [missing-baseline] no baseline at ${manifestPath}`)
        missingBaselineCount++
        continue
      }
      const baselineRaw = await readFile(manifestPath, 'utf8')
      const baseline = JSON.parse(baselineRaw) as {
        id?: string
        via?: CaptureSurface
        phases?: Manifest
      }
      // Diff must use the same capture surface that produced the
      // baseline, otherwise the hashes will never match. If the CLI
      // disagrees with the manifest, prefer the manifest's record.
      const effectiveVia = baseline.via ?? via
      // Wipe + recreate actual/ so a previous run's leftover doesn't
      // pollute the comparison.
      await rm(actualDir, { recursive: true, force: true })
      await mkdir(actualDir, { recursive: true })
      const actual = await captureScenario(page, id, actualDir, effectiveVia)
      for (const phase of PHASES) {
        const baseHash = baseline.phases?.[phase]?.sha256
        const actualHash = actual[phase]?.sha256
        if (!baseHash) {
          console.log(`  [missing] no baseline phase ${phase}`)
          mismatchCount++
          continue
        }
        if (baseHash !== actualHash) {
          console.log(
            `  [mismatch] ${phase}: baseline=${baseHash.slice(
              0,
              12,
            )}… actual=${actualHash.slice(0, 12)}…`,
          )
          console.log(
            `             baseline ${path.join(baseDir, `${phase}.png`)}`,
          )
          console.log(
            `             actual   ${path.join(actualDir, `${phase}.png`)}`,
          )
          mismatchCount++
        } else {
          console.log(`  [ok] ${phase}`)
        }
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    await browser.close()
    return 1
  }
  await browser.close()
  if (missingBaselineCount > 0) {
    console.log(
      `\n${missingBaselineCount} scenario(s) without baseline. Run \`pnpm qa:screenshot baseline\` first.`,
    )
  }
  if (mismatchCount > 0) {
    console.log(`\n${mismatchCount} mismatch(es). See paths above.`)
    return 1
  }
  console.log('\nclean ✓')
  return 0
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const ids = await expandPackIds(args.ids)
  if (ids.length === 0) {
    console.error('no scenario ids resolved')
    process.exit(2)
  }
  const exitCode =
    args.mode === 'baseline'
      ? await runBaseline(ids, args.via)
      : await runDiff(ids, args.via)
  process.exit(exitCode)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
