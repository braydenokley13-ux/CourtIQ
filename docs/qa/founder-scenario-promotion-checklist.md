# Founder Scenario LIVE Promotion Checklist

**Status:** P3.3 — all four founder scenarios are LIVE for **controlled production testing**. This is **not a public launch**. Owns the path from `status: "DRAFT"` to `status: "LIVE"` and back for every founder scenario in `packages/db/seed/scenarios/packs/founder-v0/`.

A scenario does not become LIVE because the code passes — it becomes LIVE because **the teaching is right**. Code-level validation (schema parse, overlay allow-list, freeze window, decoder primitive coverage, runtime smoke) is necessary but not sufficient.

---

## Current founder status (P3.3)

| Scenario | Decoder | Status | Difficulty | Coach validation | Notes |
|---|---|---|---|---|---|
| BDW-01 | Backdoor Window | **LIVE** | 1 | `low / approved` | Locked. Re-review only on rendering or curriculum change. |
| AOR-01 | Advantage or Reset | **LIVE** | 1 | `low / approved` (P3.3) | Cluster size (6/6) over the P3.0 advisory beginner cap (3/3); follow-up packet may drop one label and one body cue. Approved as-is for prod test. |
| ESC-01 | Empty-Space Cut | **LIVE** | 1 | `low / approved` (P3.3) | Pre/post both at the beginner cap (3/3). c4 wrongDemo spacing tuned in P3.2. Freeze at 1500 ms; revisit if prod QA shows mid-step (~1200 ms) reads better. |
| SKR-01 | Skip the Rotation | **LIVE** | 2 | `low / approved` (P3.3) | Pre/post both at the beginner cap (3/3). Difficulty 2 retained — the user is the passer, the only on-ball founder rep. |

> **P3.3 promotion scope: controlled production testing, not public launch.** The four scenarios are LIVE so the founder can exercise them through the real prod scenario-loading flow (`/api/session/start`, the `/train` page, the academy modules). It is not a marketing-launch gate. Roll back any scenario to DRAFT instantly if prod QA surfaces a problem — see the rollback procedure below.

---

## What "LIVE" means

A LIVE scenario:

- ships in the founder pack to every player who reaches its position in the progression,
- can be assigned to a lesson without an extra `--allow-unvalidated` flag,
- is a load-bearing example for `decoder_teaching_point` copy and `lesson_connection` modules,
- gets exercised by the existing CI suite on every PR.

A DRAFT scenario:

- still seeds (the seeder accepts DRAFT),
- is gated from the player-facing UI by the `status` filter on scenario list endpoints,
- can be promoted to LIVE by editing the `status` field — no schema migration needed.

---

## Code-level pre-flight (already enforced by tests)

These run on every PR. A failure here blocks LIVE promotion mechanically; nothing else is needed.

- [x] `apps/web/lib/scenario3d/founderScenarios.test.ts` — 61 assertions across all four founders. Locks decoder tag, freeze window, choice quality discipline, wrongDemos coverage, pre-answer allow-list, decoder primitive map's `requiredAnswerDemoKinds`, single-user / single-ball-holder, overlay referential integrity, finite geometry, replay duration ≤ 4 s, pack registration.
- [x] `apps/web/lib/scenario3d/founderScenariosRuntime.test.ts` — 9 assertions. Walks every founder through `buildScene` → `TeachingOverlayController.setAuthoredOverlays` → `setPhase('pre' | 'post' | 'hidden')` → `tick` → `dispose`. Catches NaN material opacity, orphaned root children, dispose leaks across decoders.
- [x] `apps/web/lib/scenario3d/aor01Seed.test.ts` — 11 AOR-specific assertions (P1.5).
- [x] `apps/web/lib/scenario3d/decoderOverlayPresets.test.ts` — 10 P3.0 preset assertions.
- [x] `apps/web/lib/scenario3d/overlayBeats.test.ts` — 8 P3.0 beat-spec assertions.

---

## Coach pre-flight (per-scenario, must be reviewed before LIVE)

Every founder scenario must pass the items below before its `status` flips to LIVE. Mark with the coach's initials and date when complete.

### Universal items (all four)

- [ ] Read the `decoder_teaching_point` copy. Does it match what a 11–13 yo player should learn?
- [ ] Read `feedback.correct`, `feedback.partial`, `feedback.wrong`. Each is plain English, no jargon.
- [ ] Watch the answer demo at 1.0× in `/dev/scene-preview`. Does the cue → action → advantage sequence read?
- [ ] Watch each wrong-demo. Does the consequence visibly answer *why* the chosen read failed in under 4 s?
- [ ] Toggle paths off. Are the overlays still readable without movement paths?
- [ ] Toggle camera modes (FOLLOW / REPLAY / BROADCAST / AUTO). Does each mode keep the cue actor and the decision-maker in frame?

### ESC-01 specific

- [ ] **Help-tag timing.** The freeze lands at 1500 ms; the help (`x2_tag_help`) ends at 1000 ms. Confirm the freeze moment communicates the cue at the right beat for an 11–13 yo player. If the freeze should land closer to 1200 ms (catching the help mid-step), edit `scene.freezeMarker.atMs`.
- [ ] **c4 wrongDemo spacing.** P3.2 adjusted the user's wrong-cut endpoint from `(12, 6)` to `(14, 5)` so x2 visibly walls off the cut at `(12, 5)` instead of overlapping the user. Confirm the 2 ft separation reads as "you ran into a defender" rather than "you stopped two feet short for no reason."
- [ ] **Cut-into-traffic teaching.** Is the wrong choice's wording clear that the user cut into bodies, not into space?

### SKR-01 specific

- [ ] **Difficulty 2 vs 1.** Confirm the user-as-passer rep belongs at intermediate difficulty. If a coach decides skip-the-rotation should be a difficulty-1 starting concept, edit `difficulty` and the gating metadata.
- [ ] **Skip-pass mechanics.** The seed declares `kind: 'skip_pass'`; the renderer applies a deterministic pass arc. Confirm the visual reads as a one-handed push or overhead skip — not a chest pass — for a middle-school player. If a specific pass type is required, that is a renderer-level decision, not a seed-level one.
- [ ] **`label` overlay copy.** "Skip past the help" reads at 20 chars. Confirm the wording. The schema enforces a 24-char max; future translations will need re-anchoring if longer.
- [ ] **`o4_catch_and_shoot` movement.** The shooter movement is `kind: 'lift'` with the same `to` as the start, used as a catch-and-shoot pose. Confirm the shooter's body language reads as "set, ready to shoot" at the moment the ball arrives.

### AOR-01 specific (legacy)

- [ ] **Cluster size.** AOR-01 carries 6 pre-answer + 6 post-answer overlays (advisory caps are 3/3 for beginner). Two of the six pre-answer entries are `label`s; they are textual anchors and don't crowd the action, but a coach may decide to drop one. Tracked in `docs/phase-p3-teaching-overlays.md` Section 7.
- [ ] **Closeout cushion read.** The defender (`x2`) closes from `(6, 5)` to `(14, 8)` over 750 ms. Confirm the closeout body language reads as "short and under control" — not "off-balance fly-by" — at the freeze.

---

## Promotion procedure

Once a scenario passes both pre-flights:

1. Edit `packages/db/seed/scenarios/packs/founder-v0/<id>.json`:
   - `"status": "LIVE"`
   - `"coach_validation": { "level": "low", "status": "approved", "reviewerId": "<coach handle>", "reviewedAt": "<ISO timestamp>", "notes": "..." }`
2. Run `pnpm --filter web test` — `founderScenarios.test.ts` and `founderScenariosRuntime.test.ts` must remain green. Edit nothing else.
3. Update this doc's "Current founder status" table.
4. Open a PR titled `chore(p3.x): promote <id> to LIVE`. Link the QA notes in the PR body.

> **Do not** flip `coach_validation.level` from `low` to `high` without a written coach review attached. The seeder's superRefine rejects `level: high` + `status: not_needed`, but does not reject `level: low` + `status: approved` without a reviewer ID. Authoring discipline is the gate, not the schema.

---

## Manual QA routes (local + dev)

Use these in local / dev environments. Confirm each renders cleanly with paths on, paths off, and across all four camera modes.

| Scenario | Route |
|---|---|
| BDW-01 | `/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1` |
| AOR-01 | `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1` |
| ESC-01 | `/dev/scene-preview?scenario=ESC-01&glb=1` |
| SKR-01 | `/dev/scene-preview?scenario=SKR-01&glb=1` |

> **Production gating.** `/dev/scene-preview` is 404'd when `NODE_ENV === 'production'` unless `ENABLE_DEV_ROUTES=1` is set on the server. See `apps/web/app/dev/scene-preview/page.tsx:53`.

---

## Production QA (P3.3 — controlled production test)

The four founder scenarios are LIVE in the database. The prod application loads them through the standard lesson / training flow; there is no separate "preview" surface in prod by default.

### How prod loads LIVE scenarios

| Surface | Path | Loader |
|---|---|---|
| Training session start | `/api/session/start` (POST, optionally `?concept=`) | Filters Prisma `scenario.status = 'LIVE'`. See `apps/web/app/api/session/start/route.ts:50`. |
| `/train` page | `/train` (also `/train/summary`) | Calls `/api/session/start`; renders the chosen LIVE scenario through the same `Scenario3DCanvas` pipeline the dev preview uses. |
| `/academy` modules | `/academy/[slug]` | `academyService.findModuleScenarios` filters `status: 'LIVE'` joined to module concept tags. See `apps/web/lib/services/academyService.ts:128`. |

The runtime renderer is identical between dev and prod — what changes is which scenarios are loaded, and which preview / debug surfaces are exposed.

### Production QA checklist

Run through this once after the seed migration lands and before sharing the prod URL with anyone outside the founder.

- [ ] **Database state.** Confirm Prisma has 4 rows in `Scenario` with `status = 'LIVE'` and `id IN ('BDW-01', 'AOR-01', 'ESC-01', 'SKR-01')`. From the prod DB shell: `SELECT id, status, decoder_tag FROM "Scenario" WHERE id LIKE '%-01' ORDER BY id;`
- [ ] **`/api/session/start` responds.** From a logged-in browser session, POST to `/api/session/start` (or trigger it via the `/train` "Start" CTA). Expect a JSON response with a scenario id matching one of the four founders.
- [ ] **`/api/session/start?concept=`.** Hit the endpoint four times, once per concept tag (`backdoor_window`, `advantage_or_reset`, `empty_space_cut`, `skip_the_rotation` — confirm tag spelling against the Prisma rows). Expect each call to return the matching founder scenario.
- [ ] **`/train` renders BDW-01.** Open `/train` (or trigger the BDW concept), confirm the scene mounts. Check the browser console: zero unhandled promise rejections, zero React errors, zero THREE warnings about NaN bone transforms.
- [ ] **`/train` renders AOR-01.** Repeat for AOR. Confirm closeout pose reads at the freeze. (Cluster is over the beginner cap — confirm overlays don't crowd the action visually in prod.)
- [ ] **`/train` renders ESC-01.** Repeat for ESC. Confirm the help-tag cue reads at 1500 ms freeze; confirm the c4 wrongDemo (cut-into-help) shows the user walling off at `(14, 5)` against x2 at `(12, 5)` with no body overlap.
- [ ] **`/train` renders SKR-01.** Repeat for SKR. Confirm the `help_pulse(x4, overhelp)` reads, the `passing_lane_open(user → o4)` reveal lands during replay, and the skip-pass arc is deterministic across two consecutive plays of the same scenario.
- [ ] **Answer replay works.** For each founder, choose the best read; confirm the `answerDemo` plays without console error.
- [ ] **Wrong-demo works.** For each founder, choose a wrong read; confirm the `wrongDemo` plays the consequence in under 4 s without console error.
- [ ] **Mobile viewport.** Open `/train` in DevTools mobile emulation (375×812 — iPhone X). Confirm the scene fits, controls are reachable, and the cue reads at thumb scale.
- [ ] **Desktop viewport.** Confirm the scene reads at 1440×900 and at 1920×1080.
- [ ] **No NaN visual glitches.** Look for: figures that vanish, paths that snap to origin, overlays that pulse to invisible. None of these should appear; the schema + runtime smoke test catch them at CI, but prod is the final eye.
- [ ] **No body tangles.** Specifically check ESC-01 c4 wrongDemo (the fixed collision). User and x2 should be ~2 ft apart.
- [ ] **Optional — enable `/dev/scene-preview` in prod for direct testing.** Set `ENABLE_DEV_ROUTES=1` on the prod environment, redeploy, then hit the dev preview routes above. Disable the env var after testing.

### What "controlled production test" means

- The four scenarios are live in prod for the founder to exercise through the real lesson surface.
- The marketing / public-launch announcement has not happened.
- The four-decoder progression is shipping in seed-defined order; no additional gating is in place.
- Roll back instantly if any prod-QA check fails.

---

## Rollback procedure (LIVE → DRAFT)

If production QA reveals a teaching, rendering, or content problem with one or more founder scenarios:

### Per-scenario rollback (recommended)

1. Edit the affected scenario JSON in `packages/db/seed/scenarios/packs/founder-v0/<id>.json`:
   - `"status": "DRAFT"`
   - `"coach_validation"`:
     - `"status": "needed"` (or `"reviewed"` if a coach has already triaged the issue)
     - keep the `reviewerId` and `reviewedAt` from the prior approval, plus add a `notes` line explaining the rollback reason
2. **Update `apps/web/lib/scenario3d/founderScenarios.test.ts`** to match: the `is LIVE with coach_validation.status=approved` test will fail loudly until the scenario returns to LIVE. To temporarily ship a rolled-back scenario, exempt that one founder from the LIVE-gate assertion (add a `requireLive: boolean` field to `FounderSpec` and skip the assertion when `false`). This makes the rollback explicit in code review.
3. Run `pnpm --filter web test`. Both `founderScenarios.test.ts` and `founderScenariosRuntime.test.ts` must remain green.
4. Re-seed: `pnpm seed:scenarios` (or whatever the deploy pipeline runs at startup). The seeder upserts by id, so the affected row's `status` flips to `DRAFT` and the prod scenario loaders (`status: 'LIVE'` filter) silently drop it from the founder pack.
5. Open a PR titled `chore(p3.x): roll back <id> to DRAFT — <one-line reason>`. Link prod-QA evidence in the body.

### Whole-pack rollback (only if all four are broken)

This is a much heavier action. Use it only if a runtime regression makes every founder unrenderable.

1. Run `pnpm --filter web test` first — confirm CI is still green. If CI is red on a runtime-smoke or schema test, that is a code regression, not a content issue; fix the code, not the seeds.
2. Flip every founder JSON to `status: "DRAFT"` and `coach_validation.status: "needed"`.
3. Update the LIVE-gate assertion in `founderScenarios.test.ts` to be opt-in (`requireLive: false` on every founder) and document the reason inline.
4. Re-seed; the `/api/session/start` endpoint returns no scenarios for the four founder concepts. The `/train` page should handle the empty-pack case gracefully (verify before deploying).

### Schema reference

The seeder enforces:
- `coach_validation.level: 'high'` + `coach_validation.status: 'not_needed'` → reject.
- `status: 'LIVE'` + `coach_validation.level: 'high'` + `coach_validation.status !== 'approved'` → reject (unless `--allow-unvalidated`).

Founder scenarios all use `level: 'low'`, so the `LIVE + low + approved` combo is the supported promotion shape. Rolling back to `LIVE + low + needed` is also accepted by the seeder, but the test gate added in P3.3 rejects it — keep `status` and `coach_validation.status` flipped together.

---

## Remaining risks (P3.3)

- **No headless WebGL smoke.** `founderScenariosRuntime.test.ts` runs in jsdom. Sprite labels emit `getContext` warnings (cosmetic, from THREE's Canvas-backed sprite path). A future packet should add Playwright coverage that mounts each route on a real browser, screenshots the freeze frame, and diffs against a baseline. Not in scope for P3.3.
- **No animation-clip integration test for ESC/SKR.** P2 added GLB integration tests for back-cut and closeout (the BDW/AOR clips). ESC and SKR rely on the body-language fallbacks (`receive_ready`, `defensive_help_turn`, etc.). When dedicated GLB clips ship for the helper-turn pose, they need integration tests parallel to the existing back-cut / closeout suites.
- **AOR-01 still over the advisory cap.** Promoted to LIVE without first dropping a label or a body cue. Tracked in P3.0 Section 7; revisit if prod QA shows the cluster crowds the read.
- **No shared `docs/qa/` template for new scenarios.** When a fifth or tenth scenario ships, this checklist should grow into a per-scenario template the author copies. Out of scope for P3.3.
- **Reviewer ID is a placeholder.** All three P3.3-promoted scenarios carry `reviewerId: "courtiq-founder"`. Replace with a real coach handle when a coach pass happens.
- **`reviewedAt` is a doc-time approximation.** Set to `2026-05-03T00:00:00.000Z` (the date of the P3.3 promotion). The schema only requires a valid ISO datetime; future promotions should use the actual review timestamp.
- **`/dev/scene-preview` is not available in prod by default.** Production testing flows through `/train` and `/academy`. Setting `ENABLE_DEV_ROUTES=1` is an explicit, reversible env-var change.

---

## What must be true before public launch

This is the gate **above** P3.3. The current state (LIVE + controlled prod test) is sufficient for the founder to test, not for marketing to announce.

- [ ] Prod QA checklist above passes end-to-end with no findings.
- [ ] `ENABLE_DEV_ROUTES` is confirmed unset in prod.
- [ ] The four-decoder progression (`BDW-01 → ESC-01 → AOR-01 → SKR-01`, or whichever ordering the coach decides) is wired into the lesson layer.
- [ ] Manual QA on desktop and mobile for every founder × every camera mode × paths on/off.
- [ ] Performance: 60 fps target met on a mid-tier mobile device.
- [ ] Dispose-leak observed at zero across 50 consecutive scenario plays (existing test covers the overlay layer; the figure layer needs its own pass).
- [ ] AOR-01 cluster trimmed to ≤ 5 entries per cluster, or coach explicitly accepts the overage on prod evidence.
- [ ] All four scenarios have a real `reviewerId` and a real `reviewedAt` set after a coach pass.
- [ ] Playwright screenshot-diff baseline established for each founder freeze frame.
