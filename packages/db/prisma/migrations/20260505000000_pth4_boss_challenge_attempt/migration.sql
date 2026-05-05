-- PTH-4 — server-persisted boss / mixed-reads challenge attempts.
-- Forward-only migration. Adds a single new table; nothing existing
-- is touched. Safe to deploy ahead of the application code rollout.

-- CreateTable
CREATE TABLE "BossChallengeAttempt" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pathway_slug" TEXT NOT NULL,
    "chapter_slug" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "challenge_slug" TEXT NOT NULL,
    "session_run_id" TEXT,
    "best_count" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "scenario_ids" TEXT[],
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BossChallengeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BossChallengeAttempt_user_id_pathway_slug_chapter_slug_idx" ON "BossChallengeAttempt"("user_id", "pathway_slug", "chapter_slug");

-- CreateIndex
CREATE INDEX "BossChallengeAttempt_user_id_challenge_slug_attempted_at_idx" ON "BossChallengeAttempt"("user_id", "challenge_slug", "attempted_at");
