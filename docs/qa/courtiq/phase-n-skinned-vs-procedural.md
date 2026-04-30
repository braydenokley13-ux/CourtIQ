# Phase N — Skinned Flag Toggle Verification

- `USE_SKINNED_ATHLETE_PREVIEW` exists in `apps/web/components/scenario3d/imperativeScene.ts`.
- Default value is `false`.
- With flag `false`, `buildPlayerFigure` skips the skinned branch and uses the procedural premium / Phase F path.
- With flag `true`, `buildPlayerFigure` attempts `buildSkinnedAthletePreview` first.
