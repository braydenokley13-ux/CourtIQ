-- Phase delta-Telemetry (WS-T) — descending index on Attempt.created_at.
-- The /api/admin/analytics/beat-aggregates endpoint scans the most
-- recent N attempt rows (cap = 1000) and pipes them through pure
-- aggregation. Without an index on created_at the cap requires a
-- full-table scan + sort once Attempt grows past dev volume. The
-- existing @@index([user_id, created_at]) only helps when filtered
-- by user_id; the admin aggregate is cross-user.
--
-- IF NOT EXISTS so a hand-applied index in a downstream environment
-- doesn't block the migration. Forward-only.

CREATE INDEX IF NOT EXISTS "Attempt_created_at_idx" ON "Attempt"("created_at" DESC);
