-- Phase 11 — replay-view telemetry on Attempt.
-- The adaptive routing layer (Phase 4) reads `recentReplayViews`
-- to decide when to flip the next rep into Mystery Mode (`mystery-
-- mode` probe). Until now the value was hardcoded to 0 in the
-- glue layer because no per-attempt replay counter was persisted.
-- This column closes the loop: /train reports the count at submit
-- time, /api/session/[id]/attempt writes it, and
-- buildDecoderConfidences sums the last 5 to drive the probe.
-- Defaults to 0 so historical rows read as "no replays seen".
-- Forward-only.

ALTER TABLE "Attempt"
  ADD COLUMN "replay_count" INTEGER NOT NULL DEFAULT 0;
