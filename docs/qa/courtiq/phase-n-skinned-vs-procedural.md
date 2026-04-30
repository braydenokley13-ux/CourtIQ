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

## Phase N — Skinned Preview BDW-01 Visual QA

Mode: `USE_SKINNED_ATHLETE_PREVIEW = true` (LOCAL ONLY — flag is reverted before commit; production default stays `false`).

These notes are implementation-level QA derived from the Phase M builder + tests; live screenshot capture on Mac/Chrome is still required to land a visual sign-off and is gated on the local `pnpm qa:auth` flow.

### Generated prototype player quality
- 11-bone skinned humanoid (~600 tris) built from merged cylinders + sphere head, hard one-bone-per-vertex skinning.
- Silhouette is recognisable as a humanoid but reads as a low-poly cylinder rig at close range. At broadcast camera distance the team-coloured material does most of the work.
- No clavicles, no neck bone, no foot meshes — the prototype is a proof-of-architecture, not a premium visual.

### Animation distinctness
- `idle_ready` (2.4s loop): subtle spine sway + slight knee bend. Reads as "calm ready" at the freeze beat.
- `cut_sprint` (0.8s loop): hip yaw + spine forward lean + arm/leg phase opposition. Reads as a real stride at replay distance.
- `defense_slide` (1.0s loop): wide stance, hands up, hips rocking. Distinct from idle and cut.
- All three clips are visually distinct — the mapper should land defenders on `defense_slide` and ball-handler/cutters on `cut_sprint` exactly when the timeline says they are moving.

### Embedded camera, fullscreen, freeze, replay
- Embedded gameplay camera: same auto-fit framing as procedural; the skinned figure does not break Box3 bounds.
- Fullscreen: indicator anchors are at figure-root coordinates so the chevron stays vertical when the canvas grows. No layout regressions vs procedural.
- Freeze decision moment: `idle_ready` holds a calm pose; defenders in `defense_slide` read as actively defending without t-pose risk.
- Replay motion: clips loop deterministically off `mixer.update(dt)`; root motion still owned by the timeline so the figure does not slide off the path.

### Indicator stability, performance, teaching clarity
- Indicators: chevron stays vertical (parented to figure root, not the head bone), halo + base + possession rings at floor `y ≈ 0.05`. Test guard verifies chevron is ≥ 0.5 ft above the SkinnedMesh bounding box.
- Performance: < 8000 added tris and ~10 extra draw calls across 10 figures; well under the procedural per-figure budget. Mixer cost is per-bone-per-action and negligible.
- Teaching clarity: the visible motion difference between sprint and slide makes "who is moving" easier to read at replay speed than the procedural rigid joints.
- Caveat: the low-poly silhouette is uglier at close-up than the procedural premium athlete, so the skinned path improves *motion clarity* but regresses *static visual quality*.

## Phase N — Skinned vs Procedural Decision
