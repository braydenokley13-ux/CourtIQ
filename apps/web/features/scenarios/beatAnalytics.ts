/**
 * Phase delta-Telemetry (WS-T) — pure analytics helpers over
 * Attempt.beat_results (JSONB).
 *
 * Source-of-truth shape, per `parseBeatResults` in
 * apps/web/app/api/session/[id]/attempt/route.ts:
 *
 *   Array<{ beatIndex: number; correct: boolean }>
 *
 * The JSONB column is optional and may be:
 *   - null / undefined (single-beat scenarios)
 *   - an empty array
 *   - the canonical array described above
 *   - a future-extended shape carrying first-action timing
 *     (`firstActionMs` or `latencyMs` — see note below)
 *
 * Phase gamma persisted *correctness* only. The prompt for Phase delta
 * names "per-beat first-action latency" as a derived metric, but no
 * latency field exists in the stored shape yet. The helpers here are
 * therefore future-ready: if a row carries an optional `firstActionMs`
 * (preferred) or `latencyMs` number on a beat entry, it is surfaced;
 * otherwise latency is reported as `null`. Aggregation skips the nulls.
 * No DB calls, no process.env reads, no I/O — all helpers are pure
 * functions over already-fetched data.
 */

export interface BeatResultEntry {
  beatIndex: number
  correct: boolean
  /** Future field — milliseconds between beat start and the user's
   *  first input on that beat. Absent on Phase gamma data. */
  firstActionMs?: number
  /** Alias accepted defensively in case future writers use this name. */
  latencyMs?: number
}

export type BeatResults = ReadonlyArray<BeatResultEntry> | null | undefined

interface RawBeatEntry {
  beatIndex?: unknown
  correct?: unknown
  firstActionMs?: unknown
  latencyMs?: unknown
}

/**
 * Defensive coercion. Anything that does not match the contract shape
 * is treated as `null` (no signal) rather than thrown. Callers may pass
 * the raw JSONB value as returned by Prisma.
 */
function coerceBeatResults(input: unknown): BeatResultEntry[] | null {
  if (input === null || input === undefined) return null
  if (!Array.isArray(input)) return null
  const out: BeatResultEntry[] = []
  for (const raw of input as RawBeatEntry[]) {
    if (raw === null || typeof raw !== 'object') return null
    const beatIndex = raw.beatIndex
    const correct = raw.correct
    if (typeof beatIndex !== 'number' || !Number.isFinite(beatIndex)) return null
    if (!Number.isInteger(beatIndex) || beatIndex < 0) return null
    if (typeof correct !== 'boolean') return null
    const entry: BeatResultEntry = { beatIndex, correct }
    if (typeof raw.firstActionMs === 'number' && Number.isFinite(raw.firstActionMs) && raw.firstActionMs >= 0) {
      entry.firstActionMs = raw.firstActionMs
    }
    if (typeof raw.latencyMs === 'number' && Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0) {
      entry.latencyMs = raw.latencyMs
    }
    out.push(entry)
  }
  return out
}

function pickLatencyMs(entry: BeatResultEntry): number | null {
  if (typeof entry.firstActionMs === 'number') return entry.firstActionMs
  if (typeof entry.latencyMs === 'number') return entry.latencyMs
  return null
}

/**
 * Per-beat first-action latency. Returns one row per beat present in
 * `beatResults`. `latencyMs` is `null` when the beat carries no timing
 * (Phase gamma rows, or a future row that did not record a first
 * action). Malformed input yields an empty array.
 */
export function computeFirstActionLatencyMs(
  beatResults: BeatResults,
): Array<{ beatIndex: number; latencyMs: number | null }> {
  const beats = coerceBeatResults(beatResults)
  if (beats === null) return []
  return beats.map((b) => ({ beatIndex: b.beatIndex, latencyMs: pickLatencyMs(b) }))
}

/**
 * Decoder-confusion flag — true iff the player picked a wrong-read
 * choice on a *non-final* beat (HUNT-style chained cognition).
 *
 * `scenarioBeatCount` is the authored beat count for the scenario; a
 * single-beat scenario (count <= 1) has no non-final beat and always
 * returns false. The "non-final" check is structural: any beat whose
 * `beatIndex < scenarioBeatCount - 1` is a non-final beat.
 *
 * Malformed or null beat_results returns false (no signal).
 */
export function computeDecoderConfusionFlag(
  beatResults: BeatResults,
  scenarioBeatCount: number,
): boolean {
  if (!Number.isFinite(scenarioBeatCount) || scenarioBeatCount <= 1) return false
  const beats = coerceBeatResults(beatResults)
  if (beats === null || beats.length === 0) return false
  const finalIndex = scenarioBeatCount - 1
  for (const beat of beats) {
    if (beat.beatIndex < finalIndex && beat.correct === false) return true
  }
  return false
}

/**
 * Percentile over a numeric sample using nearest-rank
 * (P = ceil(p * n)). Returns null on an empty sample.
 */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  const rank = Math.max(1, Math.ceil(p * sortedAsc.length))
  return sortedAsc[Math.min(rank, sortedAsc.length) - 1]
}

/**
 * Aggregate per-beat first-action latency across a set of attempt rows.
 * Pure — same inputs produce same outputs. Rows with malformed or null
 * beat_results contribute nothing. Beats missing a latency value
 * contribute to `n` only through rows that *do* have a latency for
 * that beat (the rest are skipped from the percentile sample).
 */
export function aggregateLatencyByBeat(
  rows: ReadonlyArray<{ beat_results: BeatResults }>,
): Array<{ beatIndex: number; n: number; p50Ms: number | null; p95Ms: number | null }> {
  const buckets = new Map<number, number[]>()
  for (const row of rows) {
    const beats = coerceBeatResults(row.beat_results)
    if (beats === null) continue
    for (const beat of beats) {
      const ms = pickLatencyMs(beat)
      if (ms === null) continue
      const bucket = buckets.get(beat.beatIndex)
      if (bucket) {
        bucket.push(ms)
      } else {
        buckets.set(beat.beatIndex, [ms])
      }
    }
  }
  const out: Array<{ beatIndex: number; n: number; p50Ms: number | null; p95Ms: number | null }> = []
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b)
  for (const key of keys) {
    const sample = buckets.get(key)!.slice().sort((a, b) => a - b)
    out.push({
      beatIndex: key,
      n: sample.length,
      p50Ms: percentile(sample, 0.5),
      p95Ms: percentile(sample, 0.95),
    })
  }
  return out
}

/**
 * Decoder-confusion rate across a set of attempt rows. Single-beat
 * rows (`scenarioBeatCount <= 1`) are included in `n` but never flag
 * as confused — matching the per-row helper. Returns `confusionRate`
 * in `[0, 1]`, or `0` when `n` is zero.
 */
export function decoderConfusionRate(
  rows: ReadonlyArray<{ beat_results: BeatResults; scenarioBeatCount: number }>,
): { n: number; confusionRate: number } {
  let n = 0
  let confused = 0
  for (const row of rows) {
    n += 1
    if (computeDecoderConfusionFlag(row.beat_results, row.scenarioBeatCount)) confused += 1
  }
  return { n, confusionRate: n === 0 ? 0 : confused / n }
}
