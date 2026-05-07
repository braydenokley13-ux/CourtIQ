/**
 * Phase 6 — Recognition Surface: the "you got faster" callout.
 *
 * The single most addictive metric in the product. Computed as the
 * delta between two latency windows. Strict rules:
 *
 *   - One-directional. We never tell the player they got slower.
 *   - Confidence-gated. ≥ 8 admissible attempts in each window.
 *   - Threshold-gated. Delta must be ≥ 200ms to be honest.
 *   - Single sentence ceiling.
 *
 * The two windows are recent vs prior — typically last 7 days vs the
 * 7 days before that, but the function is window-agnostic so callers
 * can use 30/30 for monthly summaries.
 */
import type { AdaptiveAttempt } from '../adaptive/types'
import { decoderLabel } from './copyForBand'

export interface LatencyWindow {
  /** Median latency in ms across correct admissible attempts in this
   *  window. null when there's not enough data. */
  p50LatencyMs: number | null
  /** Number of correct admissible attempts that contributed to p50. */
  count: number
}

export interface FasterCalloutInput {
  /** Most recent window (e.g. last 7 days). */
  recent: LatencyWindow
  /** Comparison window (e.g. the prior 7 days). */
  prior: LatencyWindow
  /** When set, the callout names the decoder the improvement is on.
   *  Otherwise the line is generic ("the floor"). */
  decoderTag?: string | null
}

export interface FasterCallout {
  /** The single line shown to the player, or null when the callout
   *  shouldn't render. */
  line: string | null
  /** Magnitude of the improvement, in ms. Surfaced for analytics. */
  improvedMs: number | null
}

const MIN_ATTEMPTS_PER_WINDOW = 8
const MIN_IMPROVEMENT_MS = 200

export function fasterCallout(input: FasterCalloutInput): FasterCallout {
  const { recent, prior } = input

  if (
    recent.p50LatencyMs === null ||
    prior.p50LatencyMs === null ||
    recent.count < MIN_ATTEMPTS_PER_WINDOW ||
    prior.count < MIN_ATTEMPTS_PER_WINDOW
  ) {
    return { line: null, improvedMs: null }
  }

  const improvedMs = prior.p50LatencyMs - recent.p50LatencyMs
  if (improvedMs < MIN_IMPROVEMENT_MS) {
    // Strictly one-directional — never surface "got slower".
    return { line: null, improvedMs: improvedMs }
  }

  const target = input.decoderTag ? decoderLabel(input.decoderTag) : 'the floor'
  return {
    line: `You read ${target} ${(improvedMs / 1000).toFixed(1)}s faster this week.`,
    improvedMs,
  }
}

/**
 * Compute a LatencyWindow from raw AdaptiveAttempt[]. Filters to
 * correct attempts within the date range, returns p50 + count.
 *
 * Caller passes the date boundaries; this function is timezone-agnostic.
 */
export function latencyWindow(
  attempts: readonly AdaptiveAttempt[],
  rangeStart: Date,
  rangeEnd: Date,
): LatencyWindow {
  const inRange = attempts.filter(
    (a) =>
      a.isCorrect &&
      a.createdAt >= rangeStart &&
      a.createdAt < rangeEnd,
  )
  if (inRange.length === 0) return { p50LatencyMs: null, count: 0 }
  const sorted = inRange.map((a) => a.timeMs).sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length / 2)]!
  return { p50LatencyMs: p50, count: sorted.length }
}
