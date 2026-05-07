-- Phase 8 — wire the spine.
-- Adds a `SessionMode` enum + `SessionRun.mode` column so the
-- scenarioService composer can record which routing path produced a
-- given session (training / first_session / return_loop /
-- daily_challenge). Existing rows keep the historical default
-- ("training") so analytics can read pre-migration sessions
-- unchanged. Forward-only — nothing existing is dropped.

CREATE TYPE "SessionMode" AS ENUM ('training', 'first_session', 'return_loop', 'daily_challenge');

ALTER TABLE "SessionRun"
  ADD COLUMN "mode" "SessionMode" NOT NULL DEFAULT 'training';
