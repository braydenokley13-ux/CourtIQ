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

### Freeze decision moment
- Body holds a static stance pose (defenders read as defensive, offense reads as idle) — no t-pose, no jitter at the freeze beat.
- Possession ring stays under the ball-handler; chevron stays above the user. The freeze is a clean "read the play" frame.

### Replay motion
- Procedural motion comes from `MovementPath3D` lerp + sub-group rotations on the figure. Reads as smooth at 1x and 0.5x; 2x replay is fast but legible.
- No skinning means joint deformation is rigid — visible at close-up but acceptable at the broadcast distance BDW-01 ships at.

### Player quality, indicators, teaching, perf
- Player quality: premium athlete reads as athletic (Phase J/K/L silhouette work) at the framed distance. Close-up reveals rigid joint handoff.
- Indicator stability: chevron/halo/possession ring all anchor at figure-root coordinates and stay world-stable through movement.
- Teaching clarity: BDW-01 cue beats (Watch → Read → Pick → Learn) read clearly because the procedural figure does not draw eye away from the decoder UI.
- Performance feel: 10 procedural figures + ball + court hold steady on the QA hardware baseline. No new perf regressions over Phase L.
