# Phase A — Audit confirmation

Read-only sanity-check of `docs/courtiq-phase-1-decoder-foundations.md` Section 9
Phase A. Confirms current file layout, exported names, and Zod / Prisma shape so
Phase B can extend without drift. No code changes.

## 1. Current export surface

### `apps/web/lib/scenario3d/schema.ts`
- `export const sceneSchema` — Zod schema with `.superRefine` for
  uniqueness / referential checks.
- `export type SceneInput = z.infer<typeof sceneSchema>`.
- Internal (un-exported) sub-schemas: `courtPointSchema`, `scenePlayerSchema`,
  `sceneBallSchema`, `movementKindSchema`, `sceneMovementSchema`.
- Movement-kind enum (8 today): `cut, closeout, rotation, lift, drift, pass,
  drive, stop_ball`.
- Camera enum (3 today): `teaching_angle, defense, top_down`.
- No `decoder_tag`, `choices[].quality`, `freezeMarker`, `wrongDemos`,
  `OverlayPrimitive`, or `CoachValidation` yet.

### `apps/web/lib/scenario3d/scene.ts`
- Types: `SceneTeam, ScenePlayer, SceneBall, SceneMovement, Scene3D`.
- Functions: `buildScene(scenario)`, `createDefaultScene(id?)`.
- `Scene3D.synthetic: boolean` flags scenes built from presets / `court_state`
  fallback.
- Duplicates the movement-kind union inline at scene.ts:39 — must be kept in
  step with `schema.ts`’s Zod enum.
- No freeze-marker awareness; `normaliseAuthoredScene` and `sanitiseScene` only
  carry players / ball / movements / answerDemo.

### `apps/web/lib/scenario3d/timeline.ts`
- Types: `ResolvedMovement, Timeline`.
- Functions: `buildTimeline(scene, movements)`, `resolveBallStart(scene)`,
  `samplePlayer(scene, timeline, playerId, t)`.
- Movements chain serially per `playerId` (next `startMs` = previous `endMs +
  delayMs`); no concept of pause / freeze.

### `apps/web/lib/scenario3d/presets.ts`
- Functions: `getPresetForConcept(scenarioId, conceptTags)` returning
  `Scene3D | null`; `KNOWN_CONCEPT_PRESETS: string[]`.
- Six concept-keyed builders: `closeouts, cutting_relocation,
  help_defense_basics, low_man_rotation, spacing_fundamentals,
  transition_stop_ball`. Each authors its own `movements` (intro) +
  `answerDemo`.

### `apps/web/components/scenario3d/Scenario3DCanvas.tsx`
- Default export-equivalent: `export function Scenario3DCanvas(props)`.
- Props: `fallback, children, className, height, scene, concept, replayMode,
  resetCounter, onCaption, onPhase, showPaths, cameraMode, playbackRate,
  paused, quality, onQualityChange`.
- Production path is **imperative** (`simpleMode=true`): camera = `CameraController`,
  motion = `MotionController`, overlay = `TeachingOverlayController`, all
  stored in refs and ticked from a parent-owned rAF loop. The JSX
  `ScenarioReplayController` only runs in the legacy `?simple=0` branch.
- Re-exports `Scene3D, ReplayMode, ReplayPhase`.

### `apps/web/components/scenario3d/ScenarioReplayController.tsx`
- Exports: `ScenarioReplayController` (component), types `ReplayMode = 'static'
  | 'intro' | 'answer'`, `ReplayPhase = 'idle' | 'playing' | 'done'`,
  `ReplayHandle`.
- Phase machine today: `idle → playing → done`. Resets when
  `scene.id / mode / resetCounter` change.

### `apps/web/components/scenario3d/imperativeTeachingOverlay.ts`
- Exports: `class TeachingOverlayController` with public `group`,
  `setVisible(visible)`, `tick(nowMs)`, `dispose()`.
- Builds movement paths, defensive read cues, spacing labels into a single
  THREE.Group attached to the scene root.

### `scripts/seed-scenarios.ts`
- Inlines a **second copy** of the `sceneSchema` (lines 33–124), structurally
  identical to `apps/web/lib/scenario3d/schema.ts`. No shared module.
- `scenarioSchema` is the source of truth for seed JSON validation;
  enforces exactly one `is_correct: true` per scenario and sequential
  `choices[].order`.
- Upserts `Scenario`, deletes+recreates `ScenarioChoice` rows per scenario.

### `packages/db/prisma/schema.prisma`
- `Scenario`: `concept_tags String[], sub_concepts String[], scene Json?` — no
  `decoder_tag` column.
- `ScenarioChoice`: `is_correct Boolean, feedback_text, order` — no `quality`.
- `Mastery`: PK `(user_id, concept_id)`, fields `rolling_accuracy,
  attempts_count, last_seen_at, spaced_rep_due_at` — no `dimension`.
- Enums today: `Position, SkillLevel, UserRole, Category, ScenarioStatus,
  BadgeFamily`. No `DecoderTag, ChoiceQuality, MasteryDimension`.

### `packages/db/seed/scenarios/*.json`
- Six fixtures: `closeouts, cutting_relocation, help_defense_basics,
  low_man_rotation, spacing_fundamentals, transition_stop_ball`. **No
  `bdw-01.json` yet.**
- None of them author a `scene` block. Every fixture relies on the concept
  preset registry (`presets.ts`) to dress the 3D scene, so the production seed
  has zero JSON-authored scenes today.

### `apps/web/app/train/page.tsx`
- Drives `Scenario3DView` with `scene, replayMode, resetCounter, showPaths,
  onCaption`. `replayMode` is `'intro'` while answering, `'answer'` after
  feedback. Re-running the demo bumps `replayCounter`. No freeze, no
  per-choice consequence demo today.

## 2. Smallest extension points for Phase B

- **`schema.ts`** — extend the existing `sceneSchema.object({...})` with new
  optional fields (`freezeMarker`, `wrongDemos`, `coachValidation`,
  `overlays?`) and lift movement-kind / camera enums by adding entries; keep
  every new field optional / defaulted so the six existing fixtures parse
  unchanged.
- **`scenarioSchema` (top-level in `seed-scenarios.ts`)** — add sibling
  `decoder_tag` (optional) and `choices[].quality` (optional, derive from
  `is_correct` when missing) here, mirrored from the TS-side schema.
- **`scene.ts`** — add a single `freezeAtMs?: number` to `Scene3D`, resolved
  inside `normaliseAuthoredScene` from either `freezeMarker.atMs` or
  `freezeMarker.beforeMovementId` (look up against the resolved timeline).
  Movement-kind union at scene.ts:39 must gain the new kinds in lockstep with
  the Zod enum.
- **`timeline.ts`** — new readers only: `samplePlayer` already accepts an
  arbitrary `t`, so freeze sampling is just clamping `t = freezeAtMs`. No
  signature change needed in Phase B.
- **`ScenarioReplayController.tsx` / `imperativeScene.ts`** — Phase D, not B.
  Note that `MotionController` (imperative) is the live path, not
  `ScenarioReplayController`. Both will need the new state machine.
- **`prisma/schema.prisma`** — Phase C only. Extension surface is additive
  columns + three new enums.

## 3. Deltas from PR-1 / planning-doc assumptions

- **Imperative pipeline confirmed.** The planning doc treats
  `ScenarioReplayController` as the runtime owner, but production has long
  since moved to the imperative `MotionController` /
  `TeachingOverlayController` (`Scenario3DCanvas.tsx`, `simpleMode=true` is
  the default). Phase D (`Add freeze-frame and replay state machine`) must
  land on the imperative path or it never reaches users; its file list in
  the planning doc should be read as “plus `imperativeScene.ts`”.
- **Schema duplication is real.** `sceneSchema` is copy-pasted into
  `scripts/seed-scenarios.ts`. The planning doc calls this out for Phase B,
  and the duplication is exact today — no drift to repair, but Phase B must
  edit both files in the same commit.
- **Movement-kind union exists in three places** (Zod in `schema.ts`, Zod in
  `seed-scenarios.ts`, TS union literal at `scene.ts:39`). Adding `back_cut,
  baseline_sneak, skip_pass, rip, jab` requires touching all three.
- **Camera enum.** The authored scene `camera` enum (`teaching_angle, defense,
  top_down`) is **not** the same surface as the runtime `CameraMode` in
  `imperativeScene.ts` (`auto, broadcast, tactical, follow, replay`). Phase
  B’s `passer_side_three_quarter` extends the authored enum; it does not
  need a runtime CameraMode entry until Phase E/G chooses to wire it through.
- **No JSON-authored scenes ship today.** All six seed fixtures hit the
  preset fallback. Adding a `scene` block to BDW-01 in Phase F will be the
  first time the JSON path is exercised end-to-end in production data.
- **Mastery PK.** Section 9 Phase C plans a `dimension` discriminator on
  `Mastery`. The current PK is composite `(user_id, concept_id)` — adding
  `dimension` to the PK is a non-trivial migration (Postgres requires drop +
  add for composite PKs), worth flagging before Phase C kicks off.
- **`bdw-01.json` does not exist.** Phase F will create it; the four-pack in
  Section 8 (BDW-01 / ESC-01 / AOR-01 / SKR-01) is fully greenfield.

## 4. Risks / notes before schema work begins

- **Lockstep edits.** Any new movement kind or camera value must land in
  `schema.ts`, `scene.ts:39` union, and `scripts/seed-scenarios.ts` in the
  same commit; CI has no cross-file enforcement, so type errors will surface
  in `pnpm typecheck` rather than at validation time.
- **Optional-everywhere principle.** The six existing fixtures must keep
  parsing untouched in Phase B. Every Phase B field needs to be optional or
  carry a Zod `.default()`, and the seeder must not throw on JSONs that omit
  the new keys.
- **Imperative path is canonical.** Phase D / G work that targets the JSX
  `ScenarioReplayController` alone will silently no-op in production (the
  user’s canvas is in `simpleMode`). Treat `MotionController` (and the
  parent rAF loop in `Scenario3DCanvas.tsx`) as the load-bearing surface.
- **Freeze resolution timing.** `freezeBeforeMovementId` needs the resolved
  timeline to map a movement id to a `startMs`. Resolving inside
  `normaliseAuthoredScene` is fine, but the resolution depends on
  `buildTimeline`’s ordering rules — keep the helper next to `buildTimeline`
  so they cannot drift.
- **Seed-side `is_correct`.** Phase C bridges `is_correct ↔ quality`, but
  Phase B already needs to read the optional `quality` if it is present so
  the schema enforces "best ⇒ is_correct=true" later. Keep the cross-field
  check in `scenarioSchema.superRefine`, not in the seeder body.
- **Mastery dimension migration.** Mentioned above; consider drafting the
  Phase C migration as `--create-only` first so the staging plan can be
  reviewed before it hits Supabase.
- **Renderer polish branches still merging.** The renderer has had two
  polish passes since PR-1 (atmosphere, dust motes, FPS guard, teaching
  overlay polish). None of them changed the schema surface, but a Phase B
  rebase may pick up incidental imports / quality types — re-run
  `pnpm typecheck` after rebase, not just after edits.
