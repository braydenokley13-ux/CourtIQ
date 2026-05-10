-- Phase γ (HUNT) — per-beat correctness on Attempt.
-- HUNT scenarios are chained two-beat: a player can get beat 1 right
-- and beat 2 wrong (or vice versa). The replay teaching timeline
-- gains a third `partial_chain` cadence (see
-- apps/web/lib/scenario3d/replayTeachingTimeline.ts) which needs to
-- know *which* beat was missed to over-emphasize the right cue
-- cluster. This column persists the per-beat outcome so the replay
-- can reconstruct the partial-chain path from the attempt record.
-- Shape: `Array<{ beatIndex: number; correct: boolean }>`. Null for
-- single-beat scenarios so existing decoders are unaffected.
-- Forward-only.

ALTER TABLE "Attempt"
  ADD COLUMN "beat_results" JSONB;
