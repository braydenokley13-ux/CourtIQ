# CourtIQ imported animation clips

This folder contains single-intent GLB animation clips for the CourtIQ
athlete renderer. The renderer samples the clips for presentation while
simulation positions remain owned by the basketball model.

## Runtime and review

`apps/web/components/courtiq/world/renderer/importedClipLoader.ts` loads
these clips and strips root/hip translation so animation cannot move an
athlete off its modeled route. The loader also caches each parsed clip.

Use `/dev/glb-debug` to check bundled asset availability and loader
fallbacks. Use `/dev/athlete-studio` to review athlete motion and
presentation. These development routes are hidden in production unless
`ENABLE_DEV_ROUTES=1` is set.

## Closeout (`closeout.glb`)

- **Intent:** defender closeout with short steps, a raised hand and a
  decelerating posture.
- **Source animation:** `Shield_Dash_RM` from Quaternius UAL2 Standard.
- **License and provenance:** CC0. See
  [`../ATTRIBUTION.md`](../ATTRIBUTION.md) and [`../LICENSE.txt`](../LICENSE.txt).

## Back cut (`back_cut.glb`)

- **Intent:** an offensive cutter accelerates behind the defender.
- **Source animation:** `NinjaJump_Start` from Quaternius UAL2 Standard.
- **License and provenance:** CC0. See
  [`../ATTRIBUTION.md`](../ATTRIBUTION.md) and [`../LICENSE.txt`](../LICENSE.txt).

Keep each clip attributable and compatible with the renderer's supported
rig. Root motion must remain stripped by the shared loader.
