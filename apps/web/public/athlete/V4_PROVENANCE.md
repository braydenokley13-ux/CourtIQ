# V4 Premium Athlete Asset Upgrade — Provenance & Notes

This document records every asset/material/geometry change that
landed under the **V4 Premium Athlete Asset Upgrade** packet. Read
alongside `apps/web/public/athlete/ATTRIBUTION.md` (which covers the
existing CC0-licensed GLB assets shipped before V4).

## Scope

V4 is the visual / motion review's "premium pass" packet. The brief
allowed adding **original assets** but explicitly forbade NBA likenesses,
team branding, copyrighted 2K assets, or unlicensed animation packs.

In practice, V4 ships **zero new external asset files**. Every new
visual added is either:

  - 100% original code-built primitives (cylinders, boxes, lathes,
    tori, rings, planes), or
  - 100% original procedural canvas-generated textures (no external
    image content), or
  - 100% original deterministic per-frame transforms (rotations,
    translations, opacity multipliers).

This means there is **no new licensing burden**, no new third-party
asset to audit, and no new bundle weight beyond the small JS code
footprint of the new builders.

## What landed

### V4-F — Premium gym environment shell

**Pendant lighting fixtures** (commit `0527e2a`):

  - 2 × 3 grid of hung pendant fixtures below the rafter grid.
  - Each pendant = housing (`MeshStandardMaterial`, dark steel) +
    emissive lens + dark cable up to ceiling.
  - Visual-only — emissive material gives the fixtures a "real
    venue light" feel without adding extra `THREE.Light` objects.
  - Geometry shared across the grid; per-pendant cost is 3 small
    meshes referencing 3 shared materials.

**Provenance:** 100% original code-built primitives. Constants
(`PENDANT_HOUSING_COLOR`, `PENDANT_LENS_COLOR`,
`PENDANT_CABLE_COLOR`) defined inline in `imperativeScene.ts`.

### V4-A — Premium athlete kit

**Socks, biceps cuffs, shoe side stripes, user headband**
(commit `a871509`):

  - White sock band above each shoe (8-segment cylinder, 32 tris).
  - Thin biceps cuff on each upper arm (4 × 10 torus, 80 tris).
  - Generic shoe side stripe — diagonal accent slab on each shoe
    side, reads as a "swoosh shape" but is intentionally a
    primitive box (12 tris) with no real-brand silhouette.
  - User-only headband at the brow line in the user halo color
    (4 × 12 torus, 96 tris) with subtle emissive lift.

**Provenance:** 100% original code-built primitives. The white kit
material is per-figure unique (one new `MeshStandardMaterial`); shoe
side stripes reuse the existing accent material. **Side-stripe
geometry is intentionally a generic box at a diagonal — not a
sculpted swoosh, checkmark, three-stripe, or any registered brand
mark.** No external asset.

### V4-C — Premium materials + rim lighting

**Atmospheric depth fog + side rim light** (commit `114cbc9`):

  - `THREE.Fog` (linear, near = 80 ft, far = 180 ft) blended to the
    canvas background tint. Close-up players stay crisp; distant
    gym walls and bleachers gain a soft falloff.
  - Lighting rig now ships a second front rim light at 0.42
    intensity. The back rim moves 0.65 → 0.85 to catch shoulders
    and sneakers from behind.

**Provenance:** 100% original — Three.js built-in `Fog` and
`DirectionalLight` parameters. No external asset.

### V4-B — Basketball movement upgrade

**Cornering bank + per-player stride phase** (commit `36a0b60`):

  - Lateral cornering bank: when an explosive segment has a
    significant x-component, the figure root banks INTO the corner
    via `rotation.z`, gated by the same triangular envelope as the
    forward lean. Peak ≤ ~4° (kind-dependent).
  - Per-player stride phase offset: bob's `|sin(2πu)|` becomes
    `|sin(2π(u + offset))|` where offset is a deterministic djb2
    hash of `playerId`. Multiple players moving in lock-step no
    longer all bounce on the same frame.

**Provenance:** 100% original deterministic motion code. Pure
function of (player id, t, segment). No new asset, no licensed
animation pack.

### V4-D — Player presence

**Key-defender heat-ring pulse** (commit `4851e3f`):

  - `getKeyDefenderPulseAlpha(nowMs)` — pure deterministic helper,
    period 1.6s (~38 BPM) with ±25% amplitude.
  - Per-frame loop multiplies the ring's authored opacity by the
    helper's output. Always ≥ 0.75× authored, never blinks off.
  - Figure builder tags the heat ring with
    `name = 'key-defender-heat-ring'` and stamps
    `userData.baseOpacity` so the loop can find it without a
    global registry.

**Provenance:** 100% original — pure math. No external asset.

## What was NOT added

- **No new GLB files.** The existing `mannequin.glb`, `closeout.glb`,
  and `back_cut.glb` (all CC0 from Quaternius UAL2) are unchanged.
  See `apps/web/public/athlete/ATTRIBUTION.md` for their provenance.
- **No new image textures.** Every new texture is canvas-generated
  at runtime (the existing pre-V4 `makeHardwoodTexture`,
  `makeJerseyNumberTexture`, `makeVerticalDarkenTexture`, and
  `makeSoftCircleTexture` helpers still own the procedural texture
  surface; V4 added no new ones).
- **No new audio.** No sound effects bundled with V4.
- **No NBA player likenesses, team logos, or 2K assets.**

## What would still require a real AAA art pipeline

These items are explicitly out of scope under "no new GLB / no
licensed packs / no Blender pipeline":

1. **Replacing the procedural athlete with a fully-rigged premium
   character mesh.** The current Quaternius CC0 mannequin is a
   reasonable basketball-style stand-in, but a true NBA-broadcast
   feel needs a higher-poly mesh with athletic proportions, jersey
   shaders, and shoe geometry that a code-built lathe cannot
   replicate.
2. **Real animation library.** The current 6 retargeted clips +
   2 imported clips cover the founder-v0 decoder vocabulary, but
   V4 added no new clips. EMPTY_SPACE_CUT, JAB_OR_RIP, and
   PASS_FOLLOWTHROUGH still collapse onto `cut_sprint`.
3. **Per-player face / hair variation.** The procedural figure
   uses one head sphere + one hair cap mesh shared across all
   players in a scene.
4. **Sneaker mesh detail.** V4 added side stripes to the existing
   block-shoe geometry, but a true premium sneaker would have a
   sculpted upper, lace eyelets, and a separate sole.
5. **Crowd / fans.** The bleachers are empty silhouettes — no
   fan figures, no animated crowd loops.
6. **Real reflective floor.** The hardwood is matte. A premium
   broadcast floor would have a subtle spec response from the
   pendant lights.

These items are flagged as "v5-future" in the codebase comments
where applicable.
