/**
 * Pack 2 §3.1.14 / Replay-1 — visual regression diff summary helper.
 *
 * Pure helper extracted from `scripts/screenshot-scenario.ts` so the
 * "missing baseline ⇒ exit code" decision can be unit-tested without
 * spinning up Playwright.
 *
 * Contract:
 *   - Any phase-hash mismatch is a hard failure (exit 1).
 *   - A missing baseline in `diff` mode is a hard failure by default
 *     (exit 1) because the regression gate cannot certify a scenario
 *     it never compared.
 *   - `allowMissingBaseline=true` (wired from the `ALLOW_MISSING_BASELINE=1`
 *     env var) demotes the missing-baseline branch from fail to warn so
 *     a soft CI gate can run before any baselines have been captured.
 *     Real hash mismatches still fail loud — only the missing-baseline
 *     branch is relaxed.
 *   - A clean run (zero missing, zero mismatches) is exit 0.
 *
 * No I/O, no globals; safe to call from tests in the `node` env.
 */
export interface DiffSummaryInput {
  mismatchCount: number
  missingBaselineIds: ReadonlyArray<string>
  allowMissingBaseline?: boolean
}

export interface DiffSummaryResult {
  exitCode: 0 | 1
  summaryLines: string[]
}

export function summarizeDiffOutcome(
  args: DiffSummaryInput,
): DiffSummaryResult {
  const lines: string[] = []
  const missing = args.missingBaselineIds
  const allowMissing = args.allowMissingBaseline === true
  if (missing.length > 0) {
    lines.push('')
    lines.push(`${missing.length} scenario(s) without baseline:`)
    for (const id of missing) lines.push(`  - ${id}`)
    if (allowMissing) {
      lines.push(
        '[soft] ALLOW_MISSING_BASELINE=1 — missing baselines reported but not failing.',
      )
      lines.push(
        'Capture them with `pnpm qa:preview:baseline --id <ID>` when ready.',
      )
    } else {
      lines.push('Run `pnpm qa:screenshot baseline` for these IDs first.')
    }
  }
  if (args.mismatchCount > 0) {
    lines.push('')
    lines.push(`${args.mismatchCount} mismatch(es). See paths above.`)
  }
  const missingFails = !allowMissing && missing.length > 0
  const failed = missingFails || args.mismatchCount > 0
  if (!failed) {
    lines.push('')
    lines.push('clean ✓')
  }
  return { exitCode: failed ? 1 : 0, summaryLines: lines }
}
