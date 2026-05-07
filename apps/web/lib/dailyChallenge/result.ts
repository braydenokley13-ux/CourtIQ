/**
 * Phase 7 — Daily Challenge: shareable result.
 *
 * Turns 5 attempts into:
 *   - a recognition strip (5 dots, green/black)
 *   - a "X/5" score
 *   - a total time in seconds
 *   - a single shareable string suitable for SMS / Slack / Twitter
 *
 * The string is intentionally short, decoder-free, and meaningless to
 * anyone who hasn't done today's. That's what makes it a hook.
 */
import { classifyAttempt } from '../adaptive/classifyAttempt'
import type { AdaptiveAttempt } from '../adaptive/types'

export interface DailyResultDot {
  /** True when the attempt produced a `recognized` or `resolved` class. */
  hit: boolean
}

export interface DailyResult {
  date: string // "YYYY-MM-DD"
  hits: number
  total: number
  totalTimeMs: number
  dots: DailyResultDot[]
  /** Single shareable string. Includes emoji ONLY in this field — see
   *  Phase 7 strategy §3. */
  shareString: string
}

export function buildDailyResult(input: {
  date: string
  attempts: readonly AdaptiveAttempt[]
}): DailyResult {
  const dots: DailyResultDot[] = input.attempts.map((a, i) => {
    const c = classifyAttempt(a, { decoderAttemptsBefore: i })
    const hit = c.class === 'recognized' || c.class === 'resolved'
    return { hit }
  })
  const hits = dots.filter((d) => d.hit).length
  const total = dots.length
  const totalTimeMs = input.attempts.reduce((acc, a) => acc + a.timeMs, 0)
  const shareString = formatShareString({
    date: input.date,
    dots,
    hits,
    total,
    totalTimeMs,
  })
  return { date: input.date, hits, total, totalTimeMs, dots, shareString }
}

function formatShareString(input: {
  date: string
  dots: DailyResultDot[]
  hits: number
  total: number
  totalTimeMs: number
}): string {
  const monthName = monthLabel(input.date)
  const day = parseInt(input.date.slice(8, 10), 10)
  const strip = input.dots.map((d) => (d.hit ? '🟢' : '⚫')).join('')
  const seconds = (input.totalTimeMs / 1000).toFixed(1)
  return `CourtIQ Daily — ${monthName} ${day}\n${strip}   ${input.hits}/${input.total} · ${seconds}s`
}

function monthLabel(date: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const idx = parseInt(date.slice(5, 7), 10) - 1
  return months[idx] ?? '???'
}

/**
 * In-app result card copy. Uses no emoji and no formatting tricks —
 * the share-string is the only place those live.
 */
export function inAppResultLines(result: DailyResult): {
  headline: string
  sub: string
} {
  const headline = `Today's daily — ${result.hits} of ${result.total} read.`
  const sub = `${(result.totalTimeMs / 1000).toFixed(1)}s total.`
  return { headline, sub }
}
