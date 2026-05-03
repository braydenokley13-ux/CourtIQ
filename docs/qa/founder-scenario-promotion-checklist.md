# Founder Scenario LIVE Promotion Checklist

**Status:** P3.2 reference. Owns the path from `status: "DRAFT"` to `status: "LIVE"` for every founder scenario in `packages/db/seed/scenarios/packs/founder-v0/`.

A scenario does not become LIVE because the code passes — it becomes LIVE because **the teaching is right**. Code-level validation (schema parse, overlay allow-list, freeze window, decoder primitive coverage, runtime smoke) is necessary but not sufficient.

---

## Current founder status (P3.2)

| Scenario | Decoder | Status | Difficulty | Coach validation | Notes |
|---|---|---|---|---|---|
| BDW-01 | Backdoor Window | **LIVE** | 1 | `low / approved` | Locked. Re-review only on rendering or curriculum change. |
| AOR-01 | Advantage or Reset | DRAFT | 1 | `low / needed` | Authored P1.5; coach review pending. Pre-answer cluster carries 6 entries (advisory cap is 3) — see Phase P3 Section 7. |
| ESC-01 | Empty-Space Cut | DRAFT | 1 | `low / needed` | Authored P3.1. Pre/post both at the beginner cap (3/3). c4 wrongDemo spacing tuned in P3.2. |
| SKR-01 | Skip the Rotation | DRAFT | 2 | `low / needed` | Authored P3.1. Pre/post both at the beginner cap (3/3). Difficulty 2 because the user is the passer, not an off-ball cutter. |

> **Why no LIVE promotion in P3.2.** The user/coach has not provided explicit review notes saying the new scenarios are acceptable. P3.2 fixed visual collisions and added pack-level + runtime smoke tests; promotion to LIVE waits on a human pass.

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

## Manual QA routes

Use these on every promotion, in order. Confirm each renders cleanly with paths on, paths off, and across all four camera modes.

| Scenario | Route |
|---|---|
| BDW-01 | `/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1` |
| AOR-01 | `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1` |
| ESC-01 | `/dev/scene-preview?scenario=ESC-01&glb=1` |
| SKR-01 | `/dev/scene-preview?scenario=SKR-01&glb=1` |

The GLB / closeout / backcut flags are environment-dependent; on a local dev box they should be available. If a flag silently no-ops the test still passes (the route falls back to the bespoke clip path).

---

## Remaining risks (P3.2)

- **No headless WebGL smoke.** `founderScenariosRuntime.test.ts` runs in jsdom. Sprite labels emit `getContext` warnings (cosmetic, from THREE's Canvas-backed sprite path). A future packet should add Playwright coverage that mounts each route on a real browser, screenshots the freeze frame, and diffs against a baseline. Not in scope for P3.2.
- **No animation-clip integration test for ESC/SKR.** P2 added GLB integration tests for back-cut and closeout (the BDW/AOR clips). ESC and SKR rely on the body-language fallbacks (`receive_ready`, `defensive_help_turn`, etc.). When dedicated GLB clips ship for the helper-turn pose, they need integration tests parallel to the existing back-cut / closeout suites.
- **AOR-01 still over the advisory cap.** Promoting it to LIVE before dropping a label or a body cue ships the cluster size with it. Tracked in P3.0 Section 7.
- **No shared `docs/qa/` template for new scenarios.** When a fifth or tenth scenario ships, this checklist should grow into a per-scenario template the author copies. Out of scope for P3.2.

---

## What must be true before public launch

- [ ] All four founder scenarios are LIVE with `coach_validation.status: "approved"`.
- [ ] The four-decoder progression (`BDW-01 → ESC-01 → AOR-01 → SKR-01`, or whichever ordering the coach decides) is wired into the lesson layer.
- [ ] Manual QA on desktop and mobile for every founder × every camera mode × paths on/off.
- [ ] Performance: 60 fps target met on the dev preview's mid-tier device profile.
- [ ] Dispose-leak observed at zero across 50 consecutive scenario plays (existing test covers this for the overlay layer; the figure layer needs its own pass).
