/**
 * Pack 2 §3.1.14 / Replay-1 — locks the soft-vs-strict missing-baseline
 * branch in the visual regression summary helper.
 *
 * The Replay-1 follow-up (`pnpm qa:preview:diff:soft`) added the
 * `allowMissingBaseline` opt-in so a CI step can be wired up before any
 * preview baselines have been captured. This test pins the contract
 * that:
 *
 *   1. Default (strict) mode: missing baseline ⇒ exit 1.
 *   2. Soft mode: missing baseline ⇒ exit 0, but a real hash mismatch
 *      still fails (exit 1).
 *   3. Soft mode messaging tells the operator how to capture the
 *      baseline.
 *   4. The "clean ✓" branch is unchanged.
 */
import { describe, it, expect } from 'vitest'
import { summarizeDiffOutcome } from './diffSummary'

describe('summarizeDiffOutcome', () => {
  it('returns exit 0 and a clean line when there is nothing to report', () => {
    const result = summarizeDiffOutcome({
      mismatchCount: 0,
      missingBaselineIds: [],
    })
    expect(result.exitCode).toBe(0)
    expect(result.summaryLines.join('\n')).toContain('clean ✓')
  })

  it('fails strict by default when a baseline is missing', () => {
    const result = summarizeDiffOutcome({
      mismatchCount: 0,
      missingBaselineIds: ['BDW-T2-01'],
    })
    expect(result.exitCode).toBe(1)
    const text = result.summaryLines.join('\n')
    expect(text).toContain('1 scenario(s) without baseline')
    expect(text).toContain('BDW-T2-01')
    expect(text).toContain('Run `pnpm qa:screenshot baseline`')
    expect(text).not.toContain('[soft]')
  })

  it('demotes missing-baseline to a non-failing warning when allowMissingBaseline is true', () => {
    const result = summarizeDiffOutcome({
      mismatchCount: 0,
      missingBaselineIds: ['BDW-T2-01', 'ESC-01'],
      allowMissingBaseline: true,
    })
    expect(result.exitCode).toBe(0)
    const text = result.summaryLines.join('\n')
    expect(text).toContain('2 scenario(s) without baseline')
    expect(text).toContain('BDW-T2-01')
    expect(text).toContain('ESC-01')
    expect(text).toContain('[soft] ALLOW_MISSING_BASELINE=1')
    expect(text).toContain('pnpm qa:preview:baseline --id <ID>')
  })

  it('still fails loud on a real hash mismatch even in soft mode', () => {
    const result = summarizeDiffOutcome({
      mismatchCount: 1,
      missingBaselineIds: ['BDW-T2-01'],
      allowMissingBaseline: true,
    })
    expect(result.exitCode).toBe(1)
    const text = result.summaryLines.join('\n')
    expect(text).toContain('1 mismatch(es)')
    expect(text).toContain('[soft]')
  })

  it('reports both missing baselines and mismatches together in strict mode', () => {
    const result = summarizeDiffOutcome({
      mismatchCount: 2,
      missingBaselineIds: ['BDW-T2-01'],
    })
    expect(result.exitCode).toBe(1)
    const text = result.summaryLines.join('\n')
    expect(text).toContain('1 scenario(s) without baseline')
    expect(text).toContain('2 mismatch(es)')
  })
})
