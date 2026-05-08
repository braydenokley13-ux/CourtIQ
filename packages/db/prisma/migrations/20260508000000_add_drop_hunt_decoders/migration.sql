-- Pack 2 (Phase 3.1.11) — extend the DecoderTag enum with the two new
-- decoder families. Forward-only and additive: existing rows are not
-- touched, queries against the existing four values are unaffected.
--
-- READ_THE_COVERAGE = DROP family (PnR ball-handler reads coverage call).
-- HUNT_THE_ADVANTAGE = HUNT family (chained-decision second-read scenarios).

ALTER TYPE "DecoderTag" ADD VALUE IF NOT EXISTS 'READ_THE_COVERAGE';
ALTER TYPE "DecoderTag" ADD VALUE IF NOT EXISTS 'HUNT_THE_ADVANTAGE';
