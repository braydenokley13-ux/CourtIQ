-- Phase 10 — denormalize ScenarioChoice.quality onto Attempt.
-- The spine glue layer currently approximates choice quality as
-- `is_correct ? 'best' : 'wrong'`, which collapses the
-- `missed_acceptable` cognitive class into `missed_wrong`. This
-- column lets the routing layer (buildDecoderConfidences) drive
-- band promotion off the real signal that was already authored on
-- ScenarioChoice. Nullable so historical Attempt rows continue to
-- read as legacy — the glue falls back to the proxy when this
-- column is NULL. Forward-only; no backfill required.

ALTER TABLE "Attempt"
  ADD COLUMN "choice_quality" "ChoiceQuality";
