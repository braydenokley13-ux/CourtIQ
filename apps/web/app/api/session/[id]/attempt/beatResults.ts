import { z } from 'zod'

// Phase γ (HUNT) — per-beat correctness for chained two-beat scenarios.
// Optional + nullable: present only for HUNT (and any future chained-
// beat decoder), null/absent for single-beat scenarios so the replay
// teaching layer falls back to the legacy correct / wrong cadences.
// Persisted on Attempt.beat_results for downstream replay dispatch.
const BeatResultSchema = z.object({
  beatIndex: z.number().int().nonnegative(),
  correct: z.boolean(),
})
const BeatResultsSchema = z.array(BeatResultSchema).optional()

export function parseBeatResults(input: unknown):
  | Array<{ beatIndex: number; correct: boolean }>
  | undefined {
  const parsed = BeatResultsSchema.safeParse(input)
  if (!parsed.success) return undefined
  return parsed.data
}
