# CourtIQ gym equipment pipeline

Original Blender-authored equipment for a restrained maple, graphite, petrol, and ivory gym. The saved source contains separate named components, bevel modifiers, weighted normals, PBR materials, and a CPU Cycles art-review stage. The browser receives static meshes joined by material. No textures, animation loops, external geometry, add-ons, or compression decoders are involved.

The hoop includes a ballast chassis, upholstered column, triangulated support, board clamps and bolts, regulation 72 × 42 inch glass backboard, corner padding, breakaway enclosure, 18 inch rim, twelve welded net hooks, and a five-row woven nylon net. The four-seat maple bench has eased slats, splayed legs, countersunk fittings, and nonmarking feet. A sewn wall-pad module can be instanced around the gym.

## Rebuild the authored design

From the repository root with Blender 4.3+ installed:

```sh
blender --background --factory-startup --python scripts/environment/build_gym_assets.py -- --render
node scripts/environment/verify_runtime.mjs
```

`--render` writes an offline CPU Cycles reference image. Omit it for export-only work. The script rejects any asset over 20,000 triangles, 500,000 bytes, or five material draws. The runtime verification additionally limits the **entire** equipment download to 500,000 bytes and uses the application's Three.js GLTFLoader to check geometry, normalized normals, indices, material culling, transparency, actual bounds, and origins.

## Edit the source without discarding artist changes

Open `source/courtiq-gym-equipment.blend`, edit the named components in collections 01–03, then export that saved file:

```sh
blender --background scripts/environment/source/courtiq-gym-equipment.blend --python scripts/environment/export_saved_gym_assets.py
node scripts/environment/verify_runtime.mjs
```

Collection 04 contains only reference lights, floor, and camera and is excluded from export. Bench and wall-pad collections have an `asset_preview_offset` property, so their review-sheet arrangement is subtracted at export and their reusable local origins remain at floor level. Export duplicates preserve the editable source and apply modifiers only to disposable copies.

## Runtime contract

All GLBs use metres and glTF's Y-up axis. Their geometry is visual presentation; simulation and court analytics remain independent.

| Asset | Placement | Meshes / material draws |
| --- | --- | --- |
| `/environment/courtiq-hoop.glb` | World origin, no rotation. Rim `(0, 3.048, 1.575)`, board plane `z=1.18`, baseline `z=0`. | 5 |
| `/environment/courtiq-bench.glb` | Local floor origin; front is `+Z`. Suggested sideline instances: `(-9.25,0,5.6)` rotated `+π/2`, `(9.25,0,5.6)` rotated `-π/2` around Y. | 3 |
| `/environment/courtiq-wall-pad.glb` | Local floor origin; front is `+Z`; width `.9`, height `1.4`. Rear-wall center at `z=-3.94`. Instance with `.94` spacing. | 1 |

The glass is a thin closed mesh using alpha blend and front-face culling. It does not use physical transmission or require a separate render target. Exported materials use linear-space PBR colors, and closed opaque meshes also cull back faces. Join-by-material eliminates per-fitting draw calls while preserving hard-edge shading and rounded bevels.

Actual exported sizes, triangle counts, origins, and bounds are recorded in `apps/web/public/environment/manifest.json`. Coach quality can reduce instance count and disable environment shadows without changing the assets. The 7.4k-triangle basket is already below a typical tactical athlete budget, so a second LOD was not added solely to create a pipeline artifact.

## Provenance

Every mesh was authored specifically for CourtIQ by the script in this directory. No third-party models, fonts, textures, or borrowed CAD files were used. Equipment meshes and their original materials are dedicated to the public domain under CC0 1.0. This dedication applies to these asset files only, not the CourtIQ application. See `LICENSE.txt`.
