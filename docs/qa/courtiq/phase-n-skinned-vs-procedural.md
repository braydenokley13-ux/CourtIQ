# Phase N — Skinned Flag Toggle Verification

- `USE_SKINNED_ATHLETE_PREVIEW` exists in `apps/web/components/scenario3d/imperativeScene.ts`.
- Default value is `false`.
- With flag `false`, `buildPlayerFigure` skips the skinned branch and uses the procedural premium / Phase F path.
- With flag `true`, `buildPlayerFigure` attempts `buildSkinnedAthletePreview` first.
- If the skinned path returns `null` or throws, the selector falls back to the procedural premium → Phase F figure.
- Phase N visual QA must NOT make the skinned path the production default.

## Phase N — Procedural BDW-01 Visual QA

Mode: `USE_SKINNED_ATHLETE_PREVIEW = false` (production default; renders Phase J premium athlete with Phase F fallback).

Capture context: live screenshots require an authenticated `/train` session (`pnpm qa:auth` → `pnpm qa:screenshot`). Notes below are implementation-level QA against the procedural builder; manual screenshot capture on Mac/Chrome is still required to land the visual sign-off.

### Embedded gameplay camera
- Camera framing comes from the auto-fit Box3 over players + ball, so the BDW-01 wing-action area is centred without manual tuning.
- Procedural figures keep stable silhouettes (visible torso/thigh mass) at this distance — Phase K removed the stick-figure feel.

### Fullscreen
- Phase K fullscreen layout fix holds: court fills the canvas, no large gray border around the action.
- Indicator anchor heights (chevron, halo) scale with figure root, so the user marker remains readable when the canvas grows.
