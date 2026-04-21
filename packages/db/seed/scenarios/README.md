# Scenario Seed Authoring Guide

This folder stores CourtIQ MVP scenario content as JSON. Files are the source of truth for authored scenarios before they are seeded into Postgres.

## Workflow: DRAFT → REVIEW → LIVE

1. **DRAFT (author)**
   - Add/update scenario JSON in `packages/db/seed/scenarios/*.json`.
   - Keep `status` set to `DRAFT` while authoring.
2. **REVIEW (SME)**
   - Basketball SME verifies correctness, realism, and distractor quality.
   - Reviewer can flip scenario status to `REVIEW` if your process tracks in-progress review.
3. **LIVE (publish)**
   - After sign-off, SME or content lead flips `status` to `LIVE` in JSON and re-runs seed.
   - This pass intentionally ships all scenarios as `DRAFT`; release promotion happens separately.

## Zod schema enforced by `scripts/seed-scenarios.ts`

Every scenario must include these required fields (aligned to `CONTENT_SYSTEM.md §3.1` and product/architecture schema):

- `id`
- `version`
- `status`
- `category`
- `concept_tags` (at least 1)
- `sub_concepts`
- `difficulty` (1..5)
- `user_role`
- `court_state`
  - `offense` (exactly 5 players)
  - `defense` (exactly 5 players)
  - `ball_location`
- `prompt` (max 140 chars)
- `choices` (3 or 4)
  - each choice requires `id`, `label`, `is_correct`, `feedback_text`, `order`
  - exactly **one** choice must have `is_correct: true`
  - `order` must be sequential (1..N)
- `explanation_md`
- `xp_reward`
- `mastery_weight`
- `render_tier`
- `media_refs`

## Adding new scenarios

1. Add new entries to an existing concept file or create a new `*.json` file in this directory.
2. Use stable, unique scenario IDs (recommended: `<concept_slug>_<nn>`).
3. Keep prompts short and basketball-specific. Include instructional feedback on every distractor.
4. Run the seed script:

```bash
pnpm exec tsx scripts/seed-scenarios.ts
```

5. If validation fails, fix the JSON fields reported by Zod and rerun.

## Idempotency behavior

The seed script is safe to rerun:

- `Scenario` records are **upserted by `id`**.
- Existing `ScenarioChoice` rows for that scenario are deleted and recreated from JSON.
- Re-seeding updates content without creating duplicates.
