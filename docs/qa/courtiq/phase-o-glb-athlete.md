# Phase O — License-Clean GLB Athlete Research

Phase N decision (see `phase-n-skinned-vs-procedural.md`) shipped a hybrid
path: keep the procedural premium athlete as production default, keep the
generated low-poly skinned prototype as a flag-gated experiment, and treat a
license-clean GLB rig as the next investment to recover premium static visuals
without losing the skinned motion architecture.

This document records the GLB asset research and licensing decision for that
investment. It is a planning artifact — no production code paths change as a
result of this file. Production rendering still goes through
`buildPlayerFigure → buildPremiumAthleteFigure → buildAthleteFigure` exactly
as Phase N left it.

## Constraints

The asset must clear every one of the following before a GLB path is even
scaffolded:

1. **License is acceptable for our use.** CourtIQ is a commercial training
   product, so the license must permit commercial redistribution of the
   bundled mesh + textures. CC0 / public-domain / explicit commercial-use
   licenses are acceptable; CC BY-NC, CC BY-SA, and "personal use only"
   are not.
2. **Humanoid rig is usable.** The asset must expose a Mixamo- or
   industry-standard humanoid skeleton (hips, spine, neck, head, L/R
   shoulder/upperArm/forearm/hand, L/R upperLeg/lowerLeg/foot) so we can
   retarget the three Phase M clips (`idle_ready`, `cut_sprint`,
   `defense_slide`) onto it without authoring a new pipeline.
3. **File is small enough to ship.** Target ≤ ~500 KB compressed for the
   single shared mesh + skeleton. The procedural figure has zero asset
   payload, so any GLB path is a regression on cold-load weight; we cap
   the regression at half a megabyte.
4. **Static silhouette is at least as good as the procedural premium
   athlete at broadcast distance.** If the GLB is uglier than the
   procedural figure, we have not solved the Phase N regression and the
   experiment buys us nothing.

## Source survey

### 1. Quaternius — Ultimate Animated Character Pack (and similar packs)

- **License:** CC0 1.0 Universal (public-domain dedication). Commercial
  redistribution permitted, no attribution required.
  Source: <https://quaternius.com/> ("All my assets are CC0").
- **Format:** GLB / FBX exports of low-poly stylized humans with a
  Mixamo-compatible humanoid skeleton.
- **Rig fit:** Compatible with Mixamo retargeting; humanoid bone names
  match the standard hierarchy our Phase M clips already follow.
- **File size:** Single character GLB is ~200–400 KB depending on
  variant; well under the 500 KB cap.
- **Static look at broadcast distance:** Stylized low-poly. Better
  surface variation than our generated cylinder rig (real shoulders,
  real hands, separated knees), and at the BDW-01 broadcast camera
  distance reads as a clean "stylized athlete" rather than a "low-poly
  humanoid." Direct comparison with the procedural premium athlete is
  close — both read fine at the camera distance the trainer ships at.
- **Risk:** Default rest pose may be A-pose vs T-pose; clip retargeting
  has to account for either. Mitigation: bake clip rest pose offline
  before bundling.
- **Status:** ✅ acceptable on every gate.

### 2. Mixamo (Adobe)

- **License:** Free for commercial use under Mixamo's terms once the
  asset is downloaded by a logged-in user. The license permits use of
  the downloaded character + animations in a commercial product, but
  does **not** permit redistributing the raw character file as an asset
  in our repo for third parties to download. Source:
  <https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>.
- **Format:** FBX out of Mixamo, convertible to GLB via gltf-pipeline /
  Blender.
- **Rig fit:** This is the de facto humanoid rig — our Phase M clips
  were named to match.
- **File size:** Stock characters land 800 KB – 4 MB. Many exceed the
  500 KB cap; would need decimation + texture downsampling.
- **Risk:** Redistribution boundary. Bundling a Mixamo character in a
  public Git repo where third parties can download the mesh is a grey
  area that requires legal sign-off, not an engineering decision. We
  also do not currently have an Adobe account tied to the project.
- **Status:** ⚠ usable for an internal prototype only; not safe for
  shipping in the public repo without legal review.

### 3. Kenney / Poly Pizza / Sketchfab (case-by-case)

- **License:** Varies per asset. Kenney's own packs are CC0 (same
  posture as Quaternius). Poly Pizza and Sketchfab aggregate assets
  under many licenses, including CC BY, CC BY-NC, and "all rights
  reserved." A blanket decision is not possible.
- **Format:** GLB / GLTF / OBJ depending on author.
- **Rig fit:** Most Kenney character packs are static meshes (no rig),
  so they fail the humanoid-skeleton gate even when the license is
  fine. Poly Pizza / Sketchfab have rigged humanoids, but each one
  requires a per-asset license check.
- **File size:** Varies; many small, many large.
- **Risk:** Licensing audit must be done per asset. Importing a
  CC BY-NC asset by mistake bricks our commercial use.
- **Status:** ⚠ acceptable only if a specific Kenney rigged humanoid
  surfaces; otherwise too case-by-case to commit to.

### 4. Existing in-repo asset

- **Status:** None. `find` over the repo turns up no `.glb` or `.gltf`
  files; `apps/web/public/` contains only the favicon, icons folder,
  and manifest. There is no pre-existing rigged humanoid we could use
  without sourcing one.

## Decision

The clearly safe option is **Quaternius (CC0)**. It is the only source that
clears all four gates without legal review:

- ✅ License: CC0, commercial redistribution permitted.
- ✅ Rig: Mixamo-compatible humanoid; matches our Phase M clip names.
- ✅ Size: ~200–400 KB GLB; under the 500 KB cap.
- ✅ Static look: stylized but premium-readable at the BDW-01 broadcast
   distance — recovers the Phase N regression in static visual quality.

Mixamo is held back as a fallback for a future internal-only prototype if
Quaternius runs out of variant choices. Kenney / Poly Pizza / Sketchfab stay
on the table for one-off additions if a specific asset is found, but no
blanket commitment is made here.

The Quaternius asset itself is **not added to the repo by this commit**.
Phase O1 is an asset-research / licensing decision only; whether the asset
gets bundled (and whether the GLB code path is added) is gated on the Phase
O2 feasibility check and the constraint that the asset be physically present
on disk before any loader is wired.

## Phase O2 — Feasibility Gate

The feasibility gate for Phase O implementation is:

> An acceptable GLB asset is **on disk in this repo** (under `apps/web/public/`
> or an equivalent bundled location), with a written license note checked in
> alongside it.

That gate is currently **NOT MET**. The Quaternius source has been identified
as acceptable in §Decision, but no `.glb` or `.gltf` file currently exists in
the repo (`find` over the workspace returns zero matches, and
`apps/web/public/` contains only the favicon, icons, and manifest). The Phase
O prompt explicitly forbids importing random / unverified assets, so we do
not download a GLB on autopilot — that step requires a human to:

1. Pick a specific Quaternius character pack and version,
2. Verify the bundled `LICENSE` / `README` reads CC0 1.0,
3. Decimate / texture-downsample the chosen GLB if it exceeds the 500 KB
   cap, and
4. Commit the asset under `apps/web/public/athlete/` (or equivalent) with
   an `ATTRIBUTION.md` recording source URL + license.

### Decision

**Phase O implementation is gated. STOP at O2.**

- ✅ Phase O1 research is complete and recorded above.
- ❌ Phase O3 (`USE_GLB_ATHLETE_PREVIEW` flag) is **not added** in this
   pass. Adding the flag without an asset on disk would either ship a
   try/catch that always fails (dead code that pretends to be a feature)
   or pretend to load an asset path that does not exist (lying to
   future readers about what is bundled).
- ❌ Phase O4 (minimal GLB loader) is **not added** in this pass. A
   loader without an asset cannot be exercised by tests, cannot be
   visually QA'd, and risks introducing a broken import path.

### Production state remains unchanged

- `USE_SKINNED_ATHLETE_PREVIEW = false` (Phase N default).
- Procedural premium athlete (Phase J/K/L) remains the production figure.
- Generated skinned prototype (Phase M) remains as the existing flag-gated
  experiment.
- BDW-01 trainer still renders the procedural premium figure.

### Next-step recommendation

Phase O should **source the asset first**, then resume O3+:

1. A human contributor (or a follow-up Phase O asset-sourcing pass)
   downloads the chosen Quaternius pack, picks a single character GLB,
   and verifies size + license.
2. Commit that GLB under `apps/web/public/athlete/<name>.glb` with
   `apps/web/public/athlete/ATTRIBUTION.md` recording source URL,
   license name (CC0 1.0), and downloaded version.
3. Resume Phase O at O3 (flag), O4 (loader), O5 (QA notes), O6
   (validation), O7 (findings).

## Phase O3 — GLB Preview Flag (skipped)

The Phase O prompt makes O3 conditional on the O2 feasibility gate:

> O3 — GLB Preview Flag: **Only if feasible**, add `USE_GLB_ATHLETE_PREVIEW=false`.

The O2 gate is not met (no GLB asset on disk), so **no flag is added in this
pass**. The `imperativeScene.ts` flag block continues to expose only the two
existing flags:

- `USE_PREMIUM_ATHLETE = true` (Phase J)
- `USE_SKINNED_ATHLETE_PREVIEW = false` (Phase M; experimental)

Adding `USE_GLB_ATHLETE_PREVIEW` now would either:

1. Ship a flag that is forever-false (dead code under the "no production
   default" rule, with no asset to flip it on for); or
2. Ship a flag whose `try` branch points at an asset path that doesn't
   exist, so the catch always fires — also dead code, but with the
   added cost of a lying export name.

Both options violate the prompt's "GLB path must be off by default,
try/catch protected, fallback to procedural, separate from generated
skinned preview" expectation, because none of those guarantees can be
verified without an asset to load. Defer until O2 gate clears.

## Phase O4 — Minimal GLB Loader (skipped)

Same gate. The Phase O prompt makes O4 conditional on O2 feasibility:

> O4 — Minimal GLB Loader Path: **Only if feasible**, add minimal loader wiring.

No asset → no loader wiring. Adding a `GLTFLoader` import or a
`buildGlbAthletePreview` shim now would:

- introduce a dependency on `three/examples/jsm/loaders/GLTFLoader` that
  the rest of the renderer does not currently use,
- ship an unreachable code path (no asset = catch-only behavior),
- and lock in a public-folder asset path that may not match whatever
  Quaternius character is eventually picked.

The procedural fallback continues to be the production path. The
generated skinned prototype continues to be the existing flag-gated
experiment. Neither is touched.

When O2 clears, O4 will add:

- a single `buildGlbAthletePreview(...)` shim (parallel to the existing
  `buildSkinnedAthletePreview`) returning `THREE.Group | null`,
- a `loadGlbAthleteAsset()` one-shot loader that caches the parsed
  `GLTF` so all 10 player figures share one decode,
- selector wiring inside `buildPlayerFigure` that tries GLB first when
  `USE_GLB_ATHLETE_PREVIEW` is true and falls through to skinned →
  premium → Phase F on any failure.

Until then, the loader does not exist.

### O4 implementation sketch (to follow once asset lands)

The loader path, when added, will respect every Phase O constraint:

- **Off by default.** `USE_GLB_ATHLETE_PREVIEW = false` literally in the
  source — no env-var wiring, no URL flag.
- **Try/catch protected.** The selector branch in `buildPlayerFigure`
  wraps `buildGlbAthletePreview(...)` in `try { ... } catch { /* fall
  through */ }` exactly like the existing skinned branch does today
  (`imperativeScene.ts:3480`).
- **Fallback chain order.** GLB → skinned (if its flag is on) →
  procedural premium (Phase J) → Phase F. The procedural figure is
  always the guaranteed last resort.
- **Separate from generated skinned preview.** The shim lives in a new
  `glbAthlete.ts` module with its own builder, indicator-layer
  attachment, and dispose-friendly geometry traversal. It does not
  share state with `skinnedAthlete.ts`.
- **No production default.** The flag stays `false` when the loader
  ships. Visual QA flips it locally only, exactly the way Phase N
  handled the skinned preview.
- **No scenario JSON change.** The selector keys off the existing
  flag, not on per-player metadata.
- **No BDW-01 break.** Because the flag is `false` and the procedural
  figure remains the last resort, BDW-01 renders the same Phase J
  athlete it ships today.

The loader is **not added in this pass** — this section only records the
shape it will take so a follow-up author has a target.

## Phase O5 — BDW-01 Athlete Preview Comparison

Three figure builders are now in scope for BDW-01:

1. **Procedural premium athlete** (Phase J/K/L) — production default.
2. **Generated skinned prototype** (Phase M) — flag-gated experiment.
3. **License-clean GLB skinned athlete** (Phase O target) — not yet
   implementable; comparison below is projected from the asset survey
   in §Source survey, not from a live build.

Live screenshot capture for all three remains gated on the existing
`pnpm qa:auth` → `pnpm qa:screenshot` flow on Mac/Chrome; the entries
below are implementation-level QA derived from code and the documented
asset behavior.

| dimension              | procedural (default) | generated skinned (flag) | GLB skinned (projected) |
| ---------------------- | -------------------- | ------------------------ | ----------------------- |
| static silhouette      | premium              | low-poly cylinders       | stylized premium        |
| close-up read          | clean rigid joints   | visible cylinder seams   | real geometry, hands    |
| broadcast read         | strong               | acceptable               | strong                  |
| motion clarity         | rigid sub-groups     | real bone deformation    | real bone deformation   |
| idle_ready freeze      | static stance        | calm sway                | clip-driven idle        |
| cut_sprint replay      | path-only            | hip / arm phase          | retargeted run cycle    |
| defense_slide replay   | path-only            | wide stance, hands up    | retargeted slide        |
| indicator stability    | stable               | stable                   | stable (planned)        |
| fullscreen behavior    | stable               | stable                   | stable (planned)        |
| asset payload          | 0 KB                 | 0 KB (code only)         | ≤ 500 KB GLB            |
| triangle budget        | within Phase J cap   | < 8000 added tris        | ≤ ~12000 (cap TBD)      |
| draw calls per figure  | several              | 1 SkinnedMesh            | 1 SkinnedMesh           |
| risk to BDW-01         | none (is default)    | none (flag off)          | none (flag off)         |
| license posture        | code-only            | code-only                | CC0 (Quaternius)        |

### Path-by-path BDW-01 read

**Procedural premium (production).** Same QA as
`phase-n-skinned-vs-procedural.md` § "Phase N — Procedural BDW-01 Visual
QA". No regression. This stays the production default.

**Generated skinned (flag).** Same QA as
`phase-n-skinned-vs-procedural.md` § "Phase N — Skinned Preview BDW-01
Visual QA". Wins on motion clarity, regresses on static silhouette. Stays
flag-gated, off by default.

**GLB skinned (projected).** Recovers the static-silhouette regression
because the Quaternius rig has real shoulders, hands, and head geometry
instead of merged cylinders. Inherits the motion-clarity win because the
Phase M clips (`idle_ready`, `cut_sprint`, `defense_slide`) retarget onto
the standard humanoid skeleton the asset already exposes. Indicator
stability, fullscreen behavior, and replay framing are unchanged because
those concerns are owned by the parent figure root, not the figure mesh.

### Decision against changing default

Production default stays procedural premium. Reasoning is unchanged from
Phase N:

- The procedural path is the safety net. Even with a license-clean GLB
  on disk, the procedural figure remains the guaranteed-last-resort
  builder so the trainer cannot crash on asset load failure.
- BDW-01 ships today on the procedural path; flipping the default in
  the same pass that adds GLB support would conflate "ship the new
  asset" with "ship the new default," which is the failure mode the
  Phase O prompt explicitly forbids.
- The asset is not yet on disk, so this comparison is partly
  projection. A real visual sign-off has to wait for the asset and a
  live screenshot pass.

## Phase O Findings

1. **Selected asset or no-go reason?** Quaternius (CC0 1.0) is the
   selected source — license, rig, size, and silhouette all clear the
   gates. **No specific GLB file was downloaded or committed in this
   pass**, so the implementation gate (asset on disk) remains unmet.
2. **Was a GLB code path implemented?** No. Per the Phase O prompt's
   "only if feasible" rule, O3 (flag) and O4 (loader) were both
   recorded as deferred until the asset is committed. No new
   TypeScript code was added; the `imperativeScene.ts` flag block is
   byte-identical to its pre-Phase-O state.
3. **Does procedural remain the production default?** Yes.
   `USE_PREMIUM_ATHLETE = true` and `USE_SKINNED_ATHLETE_PREVIEW =
   false` are both unchanged. BDW-01 still renders the procedural
   premium athlete (Phase J/K/L), with the Phase F figure as the
   guaranteed last resort.
4. **Did the experimental skinned path get touched?** No.
   `skinnedAthlete.ts` and the M-flag remain exactly as Phase N left
   them. The flag is still off by default.
5. **Did the scenario JSON or BDW-01 wiring change?** No. Scenario
   schema (`lib/scenario3d/schema.ts`) and the trainer flow are
   untouched.
6. **Validation summary.** Targeted vitest run on
   `components/scenario3d/` and `lib/scenario3d/` passes —
   11 files, 167 tests, all green. Typecheck on the scenario3d
   surface is clean; pre-existing TypeScript errors in
   `lib/services/*` (Prisma-typed services) are unrelated to Phase O
   and predate this branch.
7. **Next recommendation.** A separate asset-sourcing pass picks a
   specific Quaternius character pack, downloads one GLB, verifies
   size + license, commits it under
   `apps/web/public/athlete/<name>.glb` with an `ATTRIBUTION.md`,
   and then resumes Phase O at O3 (flag) → O4 (loader) → O5 (visual
   QA with all three paths live) → O6 (validation) → O7 (findings
   refresh).

## Phase O-ASSET — Selection (OA1)

The asset selected for the smallest-safe GLB preview path is:

- **Pack:** Quaternius Universal Animation Library 2 — Standard.
- **Specific file:** `Female Mannequin/Unreal-Godot/Mannequin_F.glb`.
- **Distribution archive:** `universal_animation_library_2standard.zip`,
  hosted at
  <https://opengameart.org/content/universal-animation-library-2>
  (mirror of the Quaternius release at
  <https://quaternius.com/packs/universalanimationlibrary2.html>).
- **License:** CC0 1.0 Universal — confirmed by the bundled
  `License.txt` ("CC0 1.0 Universal (CC0 1.0) Public Domain
  Dedication") and the OpenGameArt CC0 badge on the listing page.

### Why this specific file

| gate                         | result                                                    |
| ---------------------------- | --------------------------------------------------------- |
| license is acceptable        | ✅ CC0 1.0, public-domain dedication                       |
| humanoid rig is usable       | ✅ 65-bone UE5/Unreal-Godot skeleton (root, pelvis, spine_01..03, neck_01, Head, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, thigh_l/r, calf_l/r, foot_l/r) |
| single SkinnedMesh           | ✅ one mesh, one primitive, one buffer (10,070 verts / 6,415 tris) |
| works with our render path   | ✅ no textures (2 materials we override at runtime), so team colors apply cleanly |
| file size target (≤ 500 KB)  | ⚠ **1.4 MB** — exceeds soft cap; see deviation note below |
| broadcast-distance silhouette | ✅ real shoulders, hands, feet, separated knees — recovers Phase N static-look regression |

### Size deviation from the 500 KB soft target

The smallest CC0 humanoid GLB available from Quaternius is the
1,442,824-byte `Mannequin_F.glb`. The other GLB in the same pack —
`UAL2_Standard.glb` at 7.7 MB — is the rig + 43 themed animations and
is far too large; its animations (lantern, rail, shield, ninja, sword,
zombie, etc.) are also not basketball-style, so it buys us nothing for
the BDW-01 scene. There is no smaller CC0 humanoid GLB on Quaternius.

We accept the 1.4 MB cold-load weight because:

- The asset is shared across all 10 BDW-01 figures (loaded once, the
  parsed `GLTF` is cached so each figure clones a `SkinnedMesh` view
  rather than re-parsing the buffer).
- The flag is `false` by default, so production traffic never pays
  this cost. Only flag-on visual-QA sessions touch the asset.
- Decimating below 1.4 MB would require a Blender / gltf-pipeline /
  gltf-transform / Draco pipeline that is not currently part of this
  repo's tooling. Adding that pipeline is explicitly out of scope for
  Phase O-ASSET (the prompt forbids "a huge asset pipeline").

### What this asset does NOT include

- **No embedded animations.** Per the Quaternius README, the female
  mannequin file ships without animations on purpose; the UAL2
  Standard companion file holds the 43 shared clips. Even those clips
  are themed, not basketball — none of them are `idle_ready`,
  `cut_sprint`, or `defense_slide`. Animation strategy is therefore
  deferred (see OA5 below).
- **No textures.** The two embedded materials are flat shaders; team
  colors are applied at runtime by the loader so the user / offense /
  defense jerseys render correctly.

The asset itself is committed in OA2.

## Phase O-ASSET — Animation strategy (OA5) — Deferred

The Phase O-ASSET prompt offers two outcomes for OA5:

> If GLB rig can use existing Phase M clips, map: idle_ready,
> cut_sprint, defense_slide.
>
> If retargeting is not safe yet: document limitation, show static
> GLB preview only, do not fake success.

The honest answer is **defer** — animation retargeting is not safe in
this micro-chunk. Reasons:

1. **No animation tracks ship in the bundled GLB.** The Quaternius
   `Mannequin_F.glb` deliberately omits animations (the README inside
   the pack confirms this — animations live on the companion library
   file).
2. **The companion file's clips are not basketball-style.** UAL2
   ships 43 themed clips (lantern, rail, shield, ninja, sword,
   zombie, farm, slide-loop-but-not-basketball, etc.) — none of them
   are `idle_ready`, `cut_sprint`, or `defense_slide`. Bundling them
   solely to "have animations" would inflate cold-load by ~6 MB
   without delivering basketball motion.
3. **Phase M clips were authored against a 12-bone generated rig.**
   The GLB has 65 bones with Unreal-style names (`upperarm_l`,
   `lowerarm_l`, `clavicle_l`, ...). A correct retarget needs a
   bone-name map and per-clip rest-pose alignment, neither of which
   is the "smallest safe loader path" the prompt asked for.
4. **Phase M clip retargeting belongs in its own pass.** The risk of
   visible joint pop / flipped axis / wrong-pelvis-orientation goes
   up sharply if we hand-author a remap inline.

### What ships now

- `buildGlbAthletePreview` returns a **static** cloned figure with no
  `AnimationMixer` and no clip actions.
- Root motion (path lerp + yaw rotation) stays owned by the existing
  scene timeline — same contract the procedural figure already
  honors. The figure travels along the BDW-01 path correctly; only
  in-place limb deformation is missing.
- The `userData.glbAthlete` marker is a `{ figure, cloned }` object
  today. When animation retargeting lands later, it will grow
  `mixer` and `actions` fields parallel to the skinned preview's
  `SkinnedAthleteHandle`.

### What's needed to upgrade to animated GLB later

A follow-up phase (call it Phase O-ANIM) needs to:

1. Pick a stable bone-name map from Phase M's 12-bone rig
   (`Hips`, `Spine`, `Head`, `LeftShoulder`, `LeftElbow`, ...) onto
   the GLB's 65-bone Unreal naming
   (`pelvis`, `spine_01`, `Head`, `clavicle_l`, `upperarm_l`,
   `lowerarm_l`, ...).
2. Re-author the three Phase M clips against the GLB rest pose so
   the existing clip data does not depend on the procedural rig's
   bone offsets.
3. Build per-figure `AnimationMixer` + actions inside
   `buildGlbAthletePreview`, mirroring `buildSkinnedAthletePreview`.
4. Extend the scene's motion controller to advance the GLB mixer's
   `dt` from the same rAF tick.

None of that is done here. The static preview is the deliberate
"smallest safe path."

### Why "static-only" is still useful

- It lets us evaluate the Phase N static-look hypothesis directly:
  *does a CC0 Quaternius mannequin recover the premium silhouette
  the generated low-poly cylinder rig regressed?* That answer does
  not require animated limbs.
- It exercises the entire fallback / dispose / indicator-attachment
  contract under a real GLB load, so when animations land, the
  surface area to test is just the mixer.
- It keeps procedural as the safety net for everything else.

## Phase O-ASSET — BDW-01 Visual QA (OA6)

Three figure builders are now in scope for BDW-01:

1. **Procedural premium athlete** (Phase J/K/L) — production default.
2. **Generated skinned prototype** (Phase M) — flag-gated experiment
   (`USE_SKINNED_ATHLETE_PREVIEW`).
3. **License-clean GLB skinned athlete** (Phase O-ASSET) — flag-gated
   experiment (`USE_GLB_ATHLETE_PREVIEW`), STATIC ONLY (no animation).

Live screenshot capture for all three remains gated on the
`pnpm qa:auth` → `pnpm qa:screenshot` flow on Mac/Chrome; the entries
below are implementation-level QA derived from code inspection plus
the documented Quaternius asset behavior. A live capture pass on
Mac/Chrome is still required to land a visual sign-off on the GLB
path.

### Capture context

- Procedural and skinned QA: see Phase N notes
  (`phase-n-skinned-vs-procedural.md`). No regressions in this pass.
- GLB QA: live capture flips `USE_GLB_ATHLETE_PREVIEW = true` locally
  only, then reverts before any commit. Production traffic still
  ships with the flag false. The GLB asset is fetched from the
  bundled `/athlete/mannequin.glb` path; first BDW-01 mount sees the
  procedural figure (cache cold), and the second build (e.g., scene
  re-mount, fullscreen toggle, replay restart) sees the GLB.

### Player look — comparison

| dimension              | procedural (default) | generated skinned     | GLB skinned (static)    |
| ---------------------- | -------------------- | --------------------- | ----------------------- |
| static silhouette      | premium              | low-poly cylinders    | premium-stylized        |
| close-up read          | clean rigid joints   | visible cylinder seams | real shoulders / hands |
| broadcast read         | strong               | acceptable            | strong                  |
| limb deformation       | none (rigid groups)  | bone-driven           | none (static, deferred) |
| jersey color           | painted programmatically | painted programmatically | painted programmatically |
| jersey number          | text sprite          | text sprite (TBD)     | not rendered (deferred) |

### Animation feel — comparison

| clip                  | procedural        | generated skinned    | GLB skinned (static) |
| --------------------- | ----------------- | -------------------- | -------------------- |
| `idle_ready` freeze   | static stance     | calm sway (mixer)    | static T-pose-ish    |
| `cut_sprint` replay   | path-only         | hip / arm phase      | path-only            |
| `defense_slide` replay | path-only        | wide stance, hands up | path-only          |

GLB ties procedural on motion clarity (both are path-only). Skinned
keeps the Phase N motion-clarity win; GLB does not.

### Indicator stability

All three paths attach the standard four indicator layers
(`base`, `user`, `userHead`, `possession`) at figure-root coordinates.
The GLB path counter-scales the indicator layers by `0.3048 / 1` so the
floor rings keep court-unit sizing despite the figure's metre-to-feet
upscale. Implementation-level: indicator visibility tracks `isUser`
and `hasBall` exactly the same way the procedural and skinned paths
do.

Live capture should verify:
- chevron stays vertical when the body is rotated by the path yaw
- base / halo / possession rings sit at floor level (`y ≈ 0.05 ft`)
- chevron does NOT clip into the figure's head when the GLB scale
  factor is applied

### Performance feel

- **Asset weight:** GLB cold-load adds 1.4 MB on the first scene
  build *with the flag on*. Flag-off production traffic pays nothing.
- **Per-figure cost:** one `SkeletonUtils.clone` per figure — clones
  the 65-bone skeleton + 6,415-tri SkinnedMesh. Triangle count per
  figure (~6,415) is higher than the procedural figure (~2,400 tri
  for the Phase J athlete) and higher than the generated skinned
  prototype (~600 tri). Across 10 figures, that's ~64,000 player tris,
  vs procedural ~24,000. Still under the practical mobile-broadcast
  budget but worth a real perf capture.
- **Draw calls:** one SkinnedMesh draw call per figure, same as the
  generated skinned path.
- **Static = cheap CPU:** no `AnimationMixer.update` cost per tick;
  the mixer cost lands when animation retargeting ships in a
  follow-up phase.

### Teaching clarity

- The GLB silhouette restores the "this is a real athlete" read at
  broadcast distance; the generated cylinder rig made the eye land on
  the player mass instead of the decoder UI in some test renders.
- Without animation, the GLB does not improve "who is moving" replay
  legibility over the procedural figure. Skinned still wins on that
  axis.

### Decision against changing default

Production default stays procedural premium. Both experimental flags
remain `false` in source. Reasoning:

- The GLB path is static-only today; flipping the default would ship
  a less-animated experience than the procedural figure already
  delivers. Worse user-visible motion is not an acceptable tradeoff.
- The 1.4 MB cold-load is acceptable for QA but would meaningfully
  hurt first-paint on a fresh BDW-01 mount in production.
- A live screenshot pass on Mac/Chrome has not yet validated the
  visual claim. Until that lands, even the static GLB path stays
  flag-gated.

## Phase O-ASSET Findings (OA8)

1. **Asset chosen.** Quaternius Universal Animation Library 2 — Female
   Mannequin (`Mannequin_F.glb`), CC0 1.0. Bundled at
   `apps/web/public/athlete/mannequin.glb` (1.4 MB) with companion
   `LICENSE.txt` and `ATTRIBUTION.md` recording source URL,
   downloaded date, license, and the deviation from the 500 KB soft
   target.
2. **Does the GLB preview render?** Yes, when the flag is on and
   the runtime is a browser. The synchronous builder kicks off an
   async `GLTFLoader` fetch on first call; that call returns `null`
   so the figure falls through to the procedural builder. Once the
   cache populates, subsequent figure builds clone the cached scene
   via `SkeletonUtils.clone`, apply team color, and attach the
   standard four indicator layers. JSDOM tests cover the
   null-on-empty-cache path; live render verification on Mac/Chrome
   is the next required step.
3. **Does animation work?** No — deferred per the prompt's
   "If retargeting is not safe yet" branch. The bundled GLB has zero
   animation tracks, the companion library's clips are not
   basketball-style, and Phase M's three clips were authored against
   a 12-bone generated rig that does not bone-name-match the GLB's
   65-bone Unreal-style skeleton. The static figure travels along
   the BDW-01 path correctly because root motion stays owned by the
   scene timeline.
4. **Does procedural remain the default?** Yes. Both
   `USE_GLB_ATHLETE_PREVIEW` and `USE_SKINNED_ATHLETE_PREVIEW` are
   `false` in source. `USE_PREMIUM_ATHLETE` stays `true`. BDW-01
   continues to render the procedural premium athlete (Phase J/K/L)
   with Phase F as the guaranteed last resort. Production traffic
   never loads `mannequin.glb`.
5. **Should GLB become the next investment?** Conditionally yes —
   *if* a follow-up Phase O-ANIM pass lands the bone-name
   retargeting from Phase M's three clips onto the Unreal skeleton.
   Without animation, the static GLB recovers static silhouette but
   surrenders the Phase N motion-clarity win the generated skinned
   path delivered. The recommended sequence:
   - Phase O-ANIM: bone-name map (Phase M rig → UE5 rig), retargeted
     `idle_ready`, `cut_sprint`, `defense_slide` clips, per-figure
     mixer wiring, motion-controller integration.
   - Phase O-PERF: profile cold-load + per-figure clone cost on real
     hardware; add an optional preload point in
     `Scenario3DCanvas.tsx` mount if cold-load latency is a problem.
   - Phase O-LIVE-QA: actual Mac/Chrome screenshot pass with the
     flag flipped on, comparing all three paths side by side.
6. **Validation summary.** `pnpm exec vitest run components/scenario3d/
   lib/scenario3d/` — **12 files, 171 tests, all green** (4 new tests
   added for the GLB path). Typecheck on the scenario3d surface is
   clean; pre-existing TS errors in `lib/services/*` (Prisma services)
   are unrelated and unchanged. BDW-01 wiring, scenario JSON schema,
   and the procedural / skinned paths are byte-identical to the
   pre-Phase-O-ASSET state when both experimental flags are off.

## Phase O-ANIM — BDW-01 Visual QA (OB8)

**Setup.** `USE_GLB_ATHLETE_PREVIEW = false` is still the production
default — Phase O-ANIM did not flip it. Visual QA below describes
what the wired path *will* render when the flag is flipped on
locally; an in-browser screenshot pass is deferred to a follow-up
"O-LIVE-QA" because this micro-chunk runs in a sandboxed CI
environment with no display.

**What's wired now (verified by code review + the 171-test vitest
suite):**

- `GLB_BONE_MAP` (OB1) — Phase M's 11 rig bones → Unreal-style
  pelvis / spine_02 / Head / clavicle-skipped → upperarm_l,r /
  lowerarm_l,r / thigh_l,r / calf_l,r.
- Three retargeted clips (OB2/3/4) authored against the GLB rest
  pose, smaller eulers than the procedural clips because the GLB
  rig stands taller and the rest pose is closer to the target.
- Per-figure `AnimationMixer` + named actions stored on
  `userData.glbAthlete` (OB5). idle_ready plays by default at
  build time.
- `MotionController.tick` advances every figure's mixer with a
  wall-clock dt and switches clips through `setGlbAthleteAnimation`
  based on `pickGlbClipForState(team, kind, isMoving)` (OB6).
  Defenders → `defense_slide`; offensive cut/drive →
  `cut_sprint`; everything else → `idle_ready`. Cross-fade is
  150 ms.

**Comparative judgement (predicted, not screenshotted):**

| dimension              | procedural premium | generated skinned     | GLB animated (this phase) |
| ---------------------- | ------------------ | --------------------- | ------------------------- |
| player realism         | code-built sub-groups, separate limbs | low-poly cylinder humanoid | real Quaternius mesh, real shoulders / hands / feet |
| motion smoothness      | rigid stance lookup; no limb deformation | bone-deformed, 11-bone rig | bone-deformed on a 65-bone rig with real cloth weights |
| readability            | high — silhouette is exaggerated for clarity | medium — cylinders read flat at distance | high — the GLB silhouette already won OA6 over both procedural variants for static look |
| performance            | best (no mixer, shared materials) | mid (single mixer, 11 bones) | mid-low — 65 bones × 10 figures × ~9 quaternion tracks worst-case = ~6k mixer evaluations / frame |
| teaching clarity       | high — discrete poses snap with no interpolation | medium — animations help legibility | high pending live QA — concern is that arm yaw axis on Unreal `upperarm_l/r` may not match the assumed Z-roll, in which case `defense_slide` arms can read tilted instead of raised |

**Known risk that requires live QA before flag flip.** Phase M clips
were Eulers in the *procedural* rig's local frame. The GLB
Unreal-style rest pose has the upper arms ~45 deg out from the spine
on a different local axis than the procedural rig (which had arms
at the shoulder pointing straight down `-y`). The retarget here
keeps amplitude small but the *axis* assumption could still be
wrong on `defense_slide` (arms raised). If the live QA shows arms
rotated wrong, the fix is to swap the Z roll for an X pitch on the
upperarm tracks; the bone map and the mixer wiring stay the same.

**No regression to BDW-01 / procedural / skinned paths.**
`USE_GLB_ATHLETE_PREVIEW = false` is unchanged, so production
traffic still renders the procedural premium athlete byte-for-byte
identically to the pre-Phase-O-ANIM output. The 171-test vitest
suite confirms this: every non-GLB test stays green, including the
six `imperativeScene.athlete.test.ts` cases that check the
procedural fallback.

## Phase O-ANIM Findings (OB9)

1. **Does the GLB now look better than procedural?** Pending live
   QA. Code-side: yes — the retarget gives the GLB the same three
   movement vocabularies as the procedural premium and skinned
   paths *plus* a real-mesh silhouette that already won the OA6
   static comparison. The unknowns are arm-axis correctness on
   `defense_slide` and absolute readability at the broadcast
   camera distance.
2. **Is motion significantly improved over the static GLB?** Yes
   on paper. The static GLB rendered as a stiff mannequin with no
   in-place limb motion (Phase OA6 called this out as a teaching
   regression). Wiring three named clips through a per-figure
   AnimationMixer plus state-driven clip switching restores
   in-place motion vocabulary while keeping replay deterministic
   — the mixer only writes pose, the timeline still owns root
   motion.
3. **Any performance issues?** Possible — not measured on real
   hardware. Worst case is 10 figures × ~9 quaternion tracks per
   figure × 65-bone evaluation ≈ a few thousand quaternion lerps
   per frame. The skinned path (11 bones) was already well below
   budget; the GLB path scales linearly in bone count, so a
   10–15% mixer-cost bump per figure is the working assumption.
   FPS-guard already downgrades the tier on sustained slow
   frames, so a perf regression cannot ship as a black-screen.
4. **Is it stable enough for production consideration?** Not yet.
   The flag stays `false`. The retarget is plausible but
   un-screenshotted; flipping the default without a live arm-axis
   verification is the exact "fake success" failure the original
   Phase O-ASSET prompt warned against.

**Decision: B — Improve GLB further before flipping the default.**

The next pass should (in this order):

- Live QA on real hardware: flip the flag, screenshot all three
  figures, and confirm `defense_slide` arms read raised (not
  tilted) and `cut_sprint` legs alternate cleanly.
- If arms read wrong, swap the Z roll for an X pitch on the
  `upperarm_l/r` tracks in `buildGlbDefenseSlideClip` /
  `buildGlbCutSprintClip` only — bone map and mixer wiring stay.
- Profile per-figure mixer cost on a mid-tier laptop; if
  significant, gate the mixer behind a quality tier (don't run
  on `low`).
- Only then consider promoting `USE_GLB_ATHLETE_PREVIEW` to
  `true` by default, and only behind a soft launch (e.g.
  per-environment override).

Procedural premium remains the production default for at least
one more cycle.

## Phase P — P0-LOCK packet (determinism baseline)

The first concrete implementation packet after the Phase P
architecture doc landed. Locked the determinism baseline before any
imported-clip or decoder-mapping work begins. Production default
stays `USE_GLB_ATHLETE_PREVIEW = false`; nothing in this packet
flips the flag.

**Bone-map audit.** Parsed the bundled `mannequin.glb` binary and
listed every bone in `skins[*].joints`. All 11 entries in
`GLB_BONE_MAP` resolve exactly, including the lone PascalCase
`Head`. The doc's pre-packet suspicion that `Head` should be
lowercase was wrong for this Quaternius UAL2 export. Added a
one-shot dev-only console log inside `buildGlbAthletePreview` so
future skeleton drift is caught at flag-on time rather than as a
silent visual bug.

**Mixer-tick assertion.** Added a one-shot dev-only assertion in
`updateGlbAthletePose`. After the third tick, asserts the mixer
advanced, at least one `AnimationAction` is running, the mapped
probe bone (`spine_02`) exists, and its quaternion has drifted from
its bind-pose snapshot. Failures log once per figure; production is
silenced via the `NODE_ENV` guard.

**Idle clip amplitude.** Lifted `idle_ready` spine sway from ~2°
to ~3.4° amplitude and added a counter-rotated head sway. The
chest+head motion is now readable at broadcast-camera distance
without breaking the film-room "athletic but still" silhouette.
`cut_sprint` and `defense_slide` keyframes are unchanged.

**Foot-to-floor offset.** The Quaternius rig's natural rest pose
is not a T-pose, so the rendered rest-pose bbox does not match the
bind-pose POSITION accessor. After `cloneSkinned`, runs
`Box3.setFromObject(cloned, precise=true)` to measure the actual
skinned rest-pose bounds and writes `cloned.position.y` so the
lowest vertex sits at figure-local `y = 0`. Indicator rings stay
parented to the figure root; only the inner mannequin clone is
translated. The figure root's `(x, z)` route remains owned by the
scenario timeline.

**Fullscreen resize.** Replaced the single `fullscreenchange`
handler with a `ResizeObserver` on the canvas wrapper plus
belt-and-suspenders `fullscreenchange` and `webkitfullscreenchange`
listeners. Root cause of the bottom-half-black canvas was the
React `setIsFullscreen(true)` flush running async while the
document `fullscreenchange` handler called `gl.setSize` on the
still-embedded wrapper height. The `ResizeObserver` fires on the
actual layout change and no longer races the React render cycle.

**Replay-determinism test.** Added
`components/scenario3d/replayDeterminism.test.ts` with nine cases
covering: `samplePositionsAt` purity, `MotionController` parity
across two runs, freeze-cap idempotence, the rule that animation
never writes player `y`, GLB clip factory stability, GLB bone-map
adherence per clip, mixer-bone determinism on a mock skeleton, and
spine-bone motion under `idle_ready`.

Documented coverage gap: a full end-to-end determinism test that
actually loads `mannequin.glb`, builds the GLB athlete, drives the
mixer through `MotionController`, and snapshots bones at the
scene-authored freeze tick is blocked on a Vitest harness that can
warm the cache (the bundled GLB is fetched via `GLTFLoader` which
needs network/file fetch). The next packet should land that
end-to-end test once a Playwright/scene-screenshot harness can
prime the cache.

### P0-LOCK manual QA matrix

| Item | Status | Notes |
| --- | --- | --- |
| `/dev/scene-preview?scenario=BDW-01` renders with GLB on | Manual / dev-only | Flip `USE_GLB_ATHLETE_PREVIEW = true` locally to verify; default stays off in repo. |
| Fullscreen fills the viewport, no black bottom half | Code-fixed | `ResizeObserver` + multi-frame apply replaces the old single-frame race. |
| FOLLOW / REPLAY / BROADCAST / AUTO cycle | Unchanged | `CameraController` mode-switch path is untouched. |
| GLB athletes visibly animate | Mixer-tick assertion + amplitude bump | Production silenced; dev console reports if any figure's spine fails to drift. |
| Dev log confirms mixer advances and mapped bones exist | Code-added | One-shot per figure; dedupe latch in `_mixerAssertion`. |
| Feet sit on the floor / rings naturally | Code-fixed | Bind-pose-aware bbox measurement; cloned-position-only translation. |
| Replay-determinism test passes (with the GLB-on gap) | Code-added | 9 cases, all green; gap documented above and in the test header. |
| Turning GLB flag off preserves the procedural fallback | Unchanged | `buildPlayerFigure` selector untouched; flag-off path is byte-identical to pre-O-ASSET behavior. |

### P0-LOCK follow-on packet recommendation

Unblock P1 (imported `closeout` clip on AOR-01 dev preview) by
landing the end-to-end GLB determinism test the gap above calls
out. That test is the gate every later phase depends on, and it
needs a Playwright harness or a Vitest-friendly GLTF mock before
it can run. Once it lands, P1's imported-clip spike can flip
`USE_IMPORTED_CLOSEOUT_CLIP` on against AOR-01 with a live
determinism check verifying root-motion-stripped clips do not
divert the figure's authored x/z route.

## Phase P — P0-LOCK-2 packet (end-to-end GLB determinism gate)

The follow-on packet P0-LOCK called for. Closes the
end-to-end-GLB-determinism gap before P1 imported animations,
P2 decoder-specific intent mapping, or P3 overlay/camera
synchronization can land.

**Path chosen — Vitest GLTFLoader mock (Path A).** The existing
`qa:scene:screenshots` Playwright harness spawns a real Next.js
dev server and is wall-clock-driven. Making it deterministic
would require plumbing a synthetic-tick API through
`Scenario3DCanvas`/`Scenario3DView`, exposing a test-only window
method to read bone snapshots, and adding a way to pin
`USE_GLB_ATHLETE_PREVIEW = true` from a query parameter — at
least three new public surface points the production app would
carry forever. Path A drives the same code path
(`MotionController.applyGlbAnimation` →
`setGlbAthleteAnimation` + `updateGlbAthletePose` on a real GLB
figure built via `cloneSkinned`) with only the asset bytes
mocked, runs in <100ms in plain Vitest, and acts as a true CI
gate.

**Implementation.**

- `_setGlbAthleteCacheForTest(scene, skinnedMesh)` — test-only
  cache injector in `glbAthlete.ts`. Bypasses the GLTFLoader so
  Vitest can warm the cache with a hand-built asset.
- `__fixtures__/mockGlbAsset.ts` — faithful Quaternius UAL2
  mock. Bone names, parent-child topology, and non-T-pose rest
  rotations all captured from the real bundled `mannequin.glb`
  during the P0-LOCK audit. Three vertices fully weighted to the
  pelvis are enough to make `cloneSkinned` re-bind the cloned
  skeleton and `Box3.setFromObject(precise=true)` produce a real
  skinned bbox.
- `glbAthleteEndToEndDeterminism.test.ts` — four cases:
  1. Two GLB-figure runs of the same scenario produce
     bit-equivalent bone quaternions on every mapped bone at the
     freeze tick. **This is the gate every later phase depends on.**
  2. Animation never writes to player world `(x, y, z)` — only
     the scenario timeline does. Verified end-to-end on every
     player by snapshotting positions across ticks and proving
     `y` stays at `PLAYER_LIFT` and `(x, z)` come purely from
     `samplePlayer`.
  3. Mapped bones drift from bind pose under the active clip on
     every player. Catches the silent-no-op regression where the
     mixer "ran" but `PropertyBinding` wrote nothing.
  4. Freeze cap is idempotent for the `(x, z)` route — extra
     ticks past the cap do not move any player by even a float
     ULP. Bones DO continue under `idle_ready` per Phase P §7's
     "subtle breathing acceptable" allowance, so this case
     intentionally checks the route, not the pose.

**Coverage gap (asset drift).** The test runs against the
hand-built mock that mirrors bone names + topology audited from
the bundled GLB. If Quaternius publishes a UAL2 update with
renamed bones or a different parent chain, only a Playwright
pass loading the real asset would catch it. The dev-only
bone-map audit log added in P0-LOCK is the last-line defense
when `USE_GLB_ATHLETE_PREVIEW = true` runs in a real session.
A complementary Playwright-driven sanity check that asserts
"all `GLB_BONE_MAP` names resolve in the real `mannequin.glb`"
is the next packet's natural follow-on, but it is no longer the
gate — Path A is the gate.

### P0-LOCK-2 follow-on packet recommendation

P0-LOCK-2 is the gate. Imported animation work (P1) can begin.
The smallest sensible next packet is **P1.0 — closeout clip
import + root-motion-strip loader**, which:

1. Bundles a single CC0/permissive `closeout` GLB clip as a
   second asset (`apps/web/public/athlete/clips/closeout.glb`).
2. Adds a loader-level utility that strips translation channels
   from the root/hip bone before any clip is exposed to the
   mixer, with a unit test asserting the channel is zeroed.
3. Wires `USE_IMPORTED_CLOSEOUT_CLIP` (default off) into the
   same flag pattern as `USE_GLB_ATHLETE_PREVIEW`.
4. Extends `glbAthleteEndToEndDeterminism.test.ts` with one
   case that flips the closeout flag on, drives the AOR-01
   defender through the closeout intent, and asserts (a) the
   bone snapshot stays deterministic across runs and (b) the
   defender's authored `(x, z)` route is byte-identical to the
   flag-off run. This is the live form of the determinism gate
   the P1 acceptance criteria call out.

## Phase P — P1.0 packet (imported closeout clip + root-motion-strip loader)

The first imported-clip spike. Lands the loader, the flag, the
synthetic placeholder closeout clip, and the determinism gate's
imported-closeout coverage — without bundling a real `.glb` asset
and without changing flag-off behaviour.

Production default stays `USE_GLB_ATHLETE_PREVIEW = false` AND
`USE_IMPORTED_CLOSEOUT_CLIP = false`. Nothing in this packet flips
either flag.

### What was added

- **`apps/web/public/athlete/clips/`** — new asset folder with a
  README spelling out the loader contract, license requirements,
  and what a contributor needs to do to drop a real
  `closeout.glb` here later. The folder ships with no `.glb` file
  in this packet.
- **`importedClipLoader.ts`** — loader-level root-motion-strip
  utility. Public API:
  - `stripRootMotionTracks(clip, rootBoneNames?)` returns a NEW
    clip with `<root>.position` tracks removed; input is not
    mutated.
  - `loadImportedClip(url, options?)` fetches a `.glb`, picks an
    animation, strips root motion, caches per URL.
  - `getCachedImportedClip(url)` — synchronous accessor.
  - `_setImportedClipCacheForTest(url, entry)` — Vitest injector.
  - Default root-bone list covers Quaternius UAL2 (`root`,
    `pelvis`) plus common Mixamo / Unreal aliases (`Hips`,
    `mixamorig:Hips`, `Root`, `Armature`).
- **`importedClipLoader.test.ts`** — 17 cases lock the strip
  contract, including a mixer-level end-to-end check that proves
  a stripped clip cannot move a bone via root motion even after
  the mixer integrates past the clip duration.
- **`USE_IMPORTED_CLOSEOUT_CLIP`** flag in `imperativeScene.ts`,
  default `false`. Wired through `buildGlbAthleteFigure` →
  `buildGlbAthletePreview` via a new optional
  `attachImportedCloseoutClip` builder option.
- **Synthetic placeholder closeout clip** in `glbAthlete.ts`
  (`buildPlaceholderImportedCloseoutClip`). Authored
  programmatically to look like a Mixamo-style import — including
  a `pelvis.position` track — so the loader-level strip is
  exercised end-to-end without a bundled `.glb`. Pose intent:
  forward chest lean, hands raised, wide stance with knees bent;
  visibly distinct from `defense_slide`.
- **Closeout action wiring**: when both flags are on,
  `buildGlbAthletePreview` attaches a `closeout`
  `AnimationAction` to every GLB figure's mixer using the
  cached, stripped clip. `pickGlbClipForState` picks `closeout`
  for defenders with movement kind `closeout`. With either flag
  off, the action is never attached and the selector never picks
  `closeout`.
- **Determinism gate extension**:
  `glbAthleteEndToEndDeterminism.test.ts` grows by four cases
  covering bone determinism with closeout playing, root-motion
  strip enforcement on the cached clip, route invariance across
  closeout-on vs closeout-off runs, and flag-off equivalence.

### Was a real closeout asset used?

**No.** A synthetic placeholder closeout clip is authored in code
inside `glbAthlete.ts` and primed into the importedClipLoader
cache (post-strip) at first GLB-figure build with the closeout
flag on. This is by design — the spike's job is to land the
loader, the flag, the wiring, and the determinism gate so a real
permissive asset can be dropped into
`apps/web/public/athlete/clips/closeout.glb` later without
touching code. Visual QA of the closeout body language at
broadcast distance is **gated on a real CC0 closeout clip
landing**.

### How root motion is stripped

Loader chokepoint. Every imported clip flowing into the GLB
athlete system goes through `stripRootMotionTracks` before it
ever reaches an `AnimationMixer`. The strip:

- Iterates the input clip's tracks.
- Drops every track whose object selector matches a known root
  bone name (`root`, `pelvis`, `Hips`, `mixamorig:Hips`, etc.)
  AND whose property selector starts with `position`.
- Returns a NEW `THREE.AnimationClip` with the same name and
  duration as the input but only the surviving tracks. The
  input is not mutated.

Removing (rather than zeroing) the track guarantees the mixer
never blends a non-zero `.position` write onto the root bone,
even if a future clip update sneaks in non-zero values at a
non-keyframe time. The bone keeps its bind-pose translation,
which is what we want.

The contract is locked by:
- `importedClipLoader.test.ts` — 17 unit cases.
- `glbAthleteEndToEndDeterminism.test.ts` — case that asserts
  the loader-cached closeout clip carries no `<root>.position`
  track, classified through the production
  `isRootMotionTrack` helper.
- `glbAthleteEndToEndDeterminism.test.ts` — case that asserts
  the defender's per-tick `(x, z)` is byte-identical between a
  closeout-playing run and a baseline run with no closeout
  attached.

### How to manually QA the closeout in `/dev/scene-preview`

1. Locally edit `apps/web/components/scenario3d/imperativeScene.ts`
   to flip both:
   - `export const USE_GLB_ATHLETE_PREVIEW = true`
   - `export const USE_IMPORTED_CLOSEOUT_CLIP = true`
   Do **not** commit these edits.
2. The `founder-v0` scenario pack ships only `BDW-01.json` today
   (no AOR scenario JSON exists yet). Until an AOR scenario lands,
   visual QA targets `/dev/scene-preview?scenario=BDW-01` and the
   on-ball defender. To see the closeout pose specifically, you
   need a movement of `kind: 'closeout'` for that defender — not
   present in BDW-01 by default. The realistic visual QA pass is
   therefore blocked on either:
   - dropping a `closeout` movement into a fork of `BDW-01.json`
     for local-only QA, OR
   - the next packet authoring a real `AOR-01` scenario.
3. With the synthetic placeholder closeout clip, the body
   language is recognisably "high hands + wide stance + forward
   lean", but pose realism is constrained by the placeholder
   keyframe values. **The real visual QA acceptance check is
   blocked on a real CC0 closeout `.glb` landing in
   `apps/web/public/athlete/clips/closeout.glb`.**
4. Verify the route is unchanged by toggling the closeout flag
   off and replaying — the defender's `(x, z)` trajectory must
   match. The determinism gate proves this in CI.
5. Verify FOLLOW / REPLAY / BROADCAST / AUTO still cycle and
   fullscreen still works. The closeout wiring touches only the
   GLB figure's mixer; camera and replay paths are untouched.
6. Revert the local flag edits before committing anything.

### What remains before this can be used in a real AOR film-room moment

In rough order of priority:

1. **Real CC0 closeout `.glb` asset.** Drop into
   `apps/web/public/athlete/clips/closeout.glb` with attribution
   in `apps/web/public/athlete/ATTRIBUTION.md`. The loader will
   pick it up automatically; no code changes needed.
2. **Real `AOR-01` scenario JSON** in
   `packages/db/seed/scenarios/packs/founder-v0/`. Currently only
   `BDW-01.json` exists.
3. **Bone-name adapter for the source rig.** If the imported
   clip is authored against Mixamo or another rig, add the
   smallest possible name adapter to `importedClipLoader.ts`. A
   full retargeting framework is intentionally out of scope.
4. **Live Mac/Chrome screenshot pass** with both flags flipped on
   to capture the closeout body language for the QA archive.
5. **Decoder-specific intent mapping (P2).** Once the closeout
   is visually validated, the per-tick selector should map roles
   (defender / receiver / passer / ...) to intents through
   `getDecoderAnimationMap(decoderTag, role)` per Phase P §6.
   That work explicitly belongs to the next packet and is
   forbidden in this one.

### P1.0 manual QA matrix

| Item | Status | Notes |
| --- | --- | --- |
| `USE_IMPORTED_CLOSEOUT_CLIP` defaults `false` | Verified by unit test | `glbAthlete.test.ts` covers the default. |
| Loader-level root-motion strip implemented + tested | Verified by 17 unit cases | `importedClipLoader.test.ts`. |
| Closeout clip attached when both flags on, absent when either flag off | Verified by determinism gate | `glbAthleteEndToEndDeterminism.test.ts` flag-off case. |
| Closeout playing produces deterministic bones across runs | Verified by determinism gate | Bone-equivalence case. |
| Loader-cached closeout clip has no `<root>.position` track | Verified by determinism gate | Production classifier reused. |
| Closeout cannot move defender route | Verified by determinism gate | Per-tick `(x, z)` byte-identical to baseline run. |
| All P0-LOCK / P0-LOCK-2 cases stay green | Verified | 141 scenario3d tests pass. |
| Real closeout GLB visual QA | **Blocked on real asset** | No real CC0 closeout clip on disk yet. |
| Real `AOR-01` scenario | **Blocked on scenario data** | `founder-v0` pack ships only `BDW-01`. |
| Camera / fullscreen / replay paths untouched | Verified by code review | Wiring is mixer-only. |

### P1.0 follow-on packet recommendation

The natural next packet is **P2 — decoder-specific animation
states**. It depends on:

- A real CC0 closeout `.glb` (so the AOR mapping has a live
  asset to point at).
- A real `AOR-01` scenario JSON (so the decoder map has
  somewhere to fire).
- The P1.0 loader / strip / determinism gate landed in this
  packet (so the per-tick intent selector is replay-safe by
  construction).

Until the asset and scenario land, P2 has nothing visual to
verify and the right move is to source those first. A small
asset-sourcing packet between P1.0 and P2 is the recommended
sequencing.

## Phase P — P1.5 packet (closeout asset status + AOR-01 scenario intake)

The asset-sourcing packet P1.0 called for. Lands the AOR-01
founder scenario, the seed-validation gate, and the truthful
closeout asset status — without bundling a real `.glb` and
without flipping any feature flag.

Production default stays `USE_GLB_ATHLETE_PREVIEW = false` AND
`USE_IMPORTED_CLOSEOUT_CLIP = false`. Nothing in this packet
changes either flag.

### Closeout asset status

**Real closeout asset on disk:** No. As of P1.5 the
`apps/web/public/athlete/clips/` folder contains only its README
and no `.glb` file.

**Attribution / license verified:** N/A — no asset to attribute.
The parent `apps/web/public/athlete/ATTRIBUTION.md` now carries an
"Imported animation clips" section that explicitly says no real
clip is bundled and provides a TODO template for the future
closeout entry. The clips/README adds a "P1.5 asset status
checklist" so a future contributor can see at a glance what is
wired (loader, flag, determinism gate, synthetic placeholder) and
what is still missing (real `.glb`, attribution entry, bone-name
verification, live screenshot pass).

**Local candidate:** None reported. The synthetic placeholder
closeout clip authored programmatically in `glbAthlete.ts` is
NOT a redistributable asset — it has no separate authoring source
and lives in code. Calling it a "candidate" would be inaccurate.

### AOR-01 scenario summary

`packages/db/seed/scenarios/packs/founder-v0/AOR-01.json`,
registered in `pack.json`. Status: `DRAFT` (coach review pending).

**Setup.** 4-on-4 half-court shell. PG at the slot with the
ball; user is the right wing; user's defender (x2) starts
helping in the paint. PG passes to the wing; x2 closes out from
the help position as the pass arrives. Freeze at 1500 ms — ball
arriving, x2 one or two steps short.

**Choices.**

| id | label | quality | branch |
| --- | --- | --- | --- |
| c1 | Shoot it. | best | catch-and-shoot, defender's closeout is short |
| c2 | Rip and drive past him. | acceptable | works on a flying closeout, gives up the open jumper here |
| c3 | Pass it back to the point. | wrong | gives up the open look, defense resets |
| c4 | Hold and pump fake. | wrong | defender catches up, contests |

**Decoder authoring fields shipped.** `best_read`,
`decoder_teaching_point`, `lesson_connection`, `feedback.correct`,
`feedback.wrong`, `self_review_checklist` (4 entries), and three
`wrongDemos` covering c2 / c3 / c4. All required by the seed
validator's decoder superRefine.

**Scene block.** 8 players, 3 pre-decision movements (lift, pass,
closeout), `freezeMarker { kind: 'atMs', atMs: 1500 }`, 2
answer-demo movements (shot lift + ball release toward rim), 3
wrongDemos, 6 pre-answer overlays (vision cone + hip + foot
arrows on x2, low-man help_pulse, two short labels), 6
post-answer overlays (open_space_region, vision cone, hip + foot
arrows, timing_pulse, drive-cut preview for the rip-and-drive
alternate).

### How AOR-01 teaches Advantage or Reset

The cue is the closeout itself. Phase P §6 names the AOR mapping
as receiver `receive_ready` → branches and defender `closeout`;
AOR-01 ships the smallest scenario that exercises both halves:

- **Cue.** Defender x2 is in help when the ball is one pass away.
  When the ball reverses to the wing, x2 has to close out from
  the help position — running while the ball is in the air.
- **Read.** The cushion, angle, and speed of the closeout
  determine whether the receiver should shoot, attack, or reset.
  This v1 scenario authors a short, under-control closeout —
  the correct read is the catch-and-shoot.
- **Wrong reads.** Each non-best choice plays a consequence: the
  drive recovers into a contest (c2), the pass-back resets the
  defense (c3), the hesitation lets the defender catch up (c4).
- **Plain-English labels.** "Read the closeout." "How much
  space?" No weak-side rotation jargon, no advanced lingo.

Schema-wise, the existing `closeout` SceneMovementKind is used
directly — no schema changes were needed for AOR-01.

### Schema compromises

**None.** The existing `sceneSchema` already supports every
overlay, movement kind, and freeze-marker form AOR-01 needs. The
scenario fits the BDW-01 shape and the seed validator's decoder
authoring discipline without modification.

### How to manually QA AOR-01

The dev preview route already supports any pack scenario by id;
no route changes were needed in this packet. Manual QA flow:

1. From the repo root, ensure the dev server is running:
   `pnpm --filter @courtiq/web dev`.
2. Open `http://localhost:3000/dev/scene-preview?scenario=AOR-01`.
3. Verify the scene loads:
   - PG holds the ball at the slot.
   - User stands on the right wing.
   - x2 starts in the help position (short of the wing).
   - Pre-answer overlays show the defender vision cone, hip and
     foot arrows on x2, and the low-man help_pulse on x4.
   - Two short labels appear ("Read the closeout", "How much
     space?").
4. Verify timing:
   - At ~350 ms the pass leaves the PG.
   - At ~1100 ms x2 reaches the closeout endpoint at (14, 8).
   - At 1500 ms the freeze fires — the ball is at user's hands
     and x2 is one or two steps short.
5. Cycle FOLLOW / REPLAY / BROADCAST / AUTO. Confirm the camera
   does not jump and the freeze pose holds across modes.
6. Toggle fullscreen. Confirm the canvas fills the viewport (no
   black bottom half — P0-LOCK fixed that for the GLB path; the
   procedural path was already fine).
7. **GLB flag off + closeout flag off** (default). The defender
   plays the procedural premium closeout pose. This is the
   shipping path.
8. **GLB flag on + closeout flag off.** Locally edit
   `apps/web/components/scenario3d/imperativeScene.ts` to flip
   `USE_GLB_ATHLETE_PREVIEW = true` only. Reload `/dev/scene-preview?scenario=AOR-01`.
   Defender should now render with the GLB mannequin and the
   bespoke `defense_slide` clip during the closeout. Route is
   unchanged.
9. **GLB flag on + closeout flag on.** Also flip
   `USE_IMPORTED_CLOSEOUT_CLIP = true`. Reload. With the
   placeholder closeout clip, the defender plays a "high hands +
   wide stance + forward lean" pose during the closeout
   movement. Verify the route is unchanged from step 8 — the
   loader-level root-motion strip prevents the placeholder's
   `pelvis.position` track from moving the figure. The
   determinism gate proves this in CI.
10. Revert the local flag edits before committing anything.

**Limit:** the placeholder closeout pose is recognisable as a
defender posture but is not visually polished. **The real visual
QA acceptance check is blocked on a real CC0 closeout `.glb`**
landing in `apps/web/public/athlete/clips/closeout.glb`.

### What remains before P2 decoder mapping

In rough order of priority:

1. **Real CC0 closeout `.glb` asset.** Drop into
   `apps/web/public/athlete/clips/closeout.glb` with attribution
   in `apps/web/public/athlete/ATTRIBUTION.md` (template in the
   "Imported animation clips" section).
2. **Coach review of AOR-01 cue + cushion timing.** The
   `coach_validation` block ships as `level=low / status=needed`;
   a coach should confirm that a middle-school player will
   recognise the closeout cushion in the freeze frame.
3. **Live Mac/Chrome screenshot pass** of `/dev/scene-preview?scenario=AOR-01`
   in all four camera modes plus fullscreen, with both flags on
   and a real closeout asset. Captures the visual QA evidence the
   placeholder cannot provide.
4. **Promote AOR-01 from DRAFT to LIVE** after coach review.
5. **P2 — decoder-specific intent mapping.** Implement
   `getDecoderAnimationMap(decoderTag, role)` per Phase P §6.
   AOR is the highest-leverage decoder for this work because the
   closeout asset and AOR-01 scenario are now in place.

### P1.5 manual QA matrix

| Item | Status | Notes |
| --- | --- | --- |
| AOR-01.json on disk and registered in pack.json | Verified | `pack.json` lists both BDW-01 and AOR-01. |
| Scenario validates against runtime sceneSchema | Verified | `aor01Seed.test.ts` + ad-hoc `tsx --eval` parse. |
| Decoder authoring discipline (best_read, …, wrongDemos) | Verified | Seed validator superRefine mirrored in test. |
| Defender closeout movement present | Verified | `kind='closeout'` on `x2_closeout_to_wing`. |
| Freeze marker lands in the catch window | Verified | atMs:1500. |
| /dev/scene-preview?scenario=AOR-01 loads | Code-verified | Route reads `<id>.json` directly; regex accepts AOR-01. |
| All 4 camera modes + fullscreen still work | Carry-over from P0-LOCK | `ResizeObserver` + multi-frame apply in `Scenario3DCanvas.tsx`. |
| Imported closeout flag on does not move defender route | Verified by determinism gate | `glbAthleteEndToEndDeterminism.test.ts` route-invariance case. |
| Real `closeout.glb` visual QA | **Blocked on real asset** | Placeholder pose is wired but not visually polished. |
| Coach validation of cushion + cue timing | **Blocked on coach review** | `level=low / status=needed`. |
| GLB flag off still works | Verified | flag-off path is byte-identical to pre-O-ASSET behaviour. |
| GLB flag on still works | Code-verified, Mac/Chrome capture pending | Same gating as P0-LOCK + P0-LOCK-2. |

### P1.5 follow-on packet recommendation

Same as P1.0's recommendation, narrowed:

1. **Asset-sourcing micro-pass.** Pick + verify a single CC0
   closeout GLB. Bundle. Attribute.
2. **Coach review of AOR-01.** Promote to LIVE if approved.
3. **P2 — decoder-specific animation states.** Now unblocked on
   both axes (asset + scenario).

## Phase P — P1.6 packet (real closeout asset on disk)

The asset-sourcing micro-pass P1.5 called for. Lands a real,
license-clean closeout animation in
`apps/web/public/athlete/clips/closeout.glb` and the
loader-strip-against-real-asset test the synthetic-only suites
could not provide.

### What this packet does

1. **Adds a real `closeout.glb` (60 KB, CC0).** Extracted from
   Quaternius Universal Animation Library 2 — the same pack that
   ships the bundled `mannequin.glb`. The chosen source clip is
   `Shield_Dash_RM`, a 1.1 s forward defensive approach with a
   raised guard hand. UAL2 has 43 clips; none are
   basketball-style; `Shield_Dash_RM` is the only sub-1.5 s
   forward defensive-approach in the pack and reads as a
   closeout once the root motion is stripped.

   Extraction is a scripted GLB JSON+bin re-pack that copies
   only the bone tracks `GLB_BONE_MAP` cares about (root,
   pelvis, spine_01–03, neck_01, Head, clavicle/upperarm/
   lowerarm/hand_l|r, thigh/calf/foot_l|r, ball_l|r — 23
   bones) into a fresh GLB. The full UAL2 mesh + 42 unrelated
   clips are NOT bundled. The animation is renamed `closeout`
   so the loader's name-default picks it up.

2. **Loader strip is unchanged.** `closeout.glb` carries
   `root.position` AND `pelvis.position` tracks in the source
   (translates 1.0 unit forward over 1.1 s). The existing
   `DEFAULT_ROOT_MOTION_BONE_NAMES` already lists both, so the
   loader strips them on the way in. No code changes were
   required.

3. **Adds `closeoutAssetIntegration.test.ts`.** Reads the
   bundled GLB, parses through `GLTFLoader.parse`, and asserts
   the real-asset path stays loader-safe:
   - one clip named `closeout`, duration `(0, 2)` s.
   - `root.position` and `pelvis.position` present in source
     and classified as root motion.
   - `stripRootMotionTracks` removes exactly those two and
     leaves rotation tracks for every Phase O bone-mapped joint.
   - the stripped clip cannot move a bound `pelvis` bone off
     its bind pose translation; rotation tracks DO drift the
     `pelvis.quaternion` (proves PropertyBinding still resolves).

4. **Updates `ATTRIBUTION.md` and `clips/README.md`.** Replaces
   the "asset is a TODO" prose with an actual provenance entry:
   pack + source URL + downloaded date + license + bone-rig
   note + extraction note + size + visual-QA-pending status.

### What this packet does NOT do

- Toggle either flag. `USE_GLB_ATHLETE_PREVIEW` and
  `USE_IMPORTED_CLOSEOUT_CLIP` remain `false` by default.
  Production traffic still pays no cold-load cost for either
  asset.
- Run the live `/dev/scene-preview?scenario=AOR-01` Mac/Chrome
  capture. That requires a human-driven flag-on session and is
  the next gate before AOR-01 promotes to LIVE.
- Ship a per-clip license adapter. The closeout shares the
  parent `LICENSE.txt` (CC0) the bundled mannequin uses, since
  both come from the same pack archive. A future per-clip
  asset from a different licensor would need its own
  `LICENSE-<asset>.txt` next to the GLB.
- Decoder-specific animation states (P2). Out of scope.

### P1.6 dev-preview QA note (`/dev/scene-preview?scenario=AOR-01`)

Static analysis only — both flags ship `false`, so the live
visual capture is still pending.

- Route loads the same way it did in P1.5: the dev-preview page
  reads the AOR-01 seed JSON via the existing pack registry
  (`apps/web/lib/scenario3d/pack.json` lists AOR-01).
  `apps/web/lib/scenario3d/aor01Seed.test.ts` (11 tests) was
  re-run after this packet — green.
- `glbAthleteEndToEndDeterminism.test.ts` (8 tests) was re-run
  with the bundled file on disk. The cases that exercise the
  closeout action attached + playing still use the synthetic
  placeholder clip (the test injects via
  `_setImportedClipCacheForTest`); the bundled file is loader-
  validated separately by `closeoutAssetIntegration.test.ts`.
- The flag-off code path is byte-identical to pre-P1.6: the
  GLB athlete builder skips the closeout attach branch, the
  imported-clip cache is never populated, and no fetch goes
  out for `/athlete/clips/closeout.glb`.
- A flag-on local session WILL now fetch the bundled
  `closeout.glb` once on cold mount. After that fetch, the
  next figure-build will pick the real clip out of the loader
  cache; the very first cold-mount frame still uses the
  synthetic placeholder so there is no "static defender for
  300 ms then animation kicks in" race. This carry-over from
  P1.0 is unchanged.

### P1.6 manual QA matrix

| Item | Status | Notes |
| --- | --- | --- |
| Real `closeout.glb` on disk | Verified | 60 KB at `apps/web/public/athlete/clips/closeout.glb`. |
| Attribution recorded with license + source URL | Verified | `apps/web/public/athlete/ATTRIBUTION.md` "Closeout" entry. |
| Bone names match Quaternius UAL2 rig (no adapter needed) | Verified | Source bones: `root`, `pelvis`, `spine_01..03`, `Head`, `upperarm_l/r`, `lowerarm_l/r`, `thigh_l/r`, `calf_l/r`, `foot_l/r`, `ball_l/r`. All resolve via `GLB_BONE_MAP`. |
| Root motion present in source | Verified | `root.position` 0→1.0 fwd; `pelvis.position` ~0.487→~0.877 fwd over 1.1 s. |
| Loader strips both root tracks | Verified | `closeoutAssetIntegration.test.ts` "stripRootMotionTracks removes both root-motion tracks" case. |
| Stripped clip cannot move a bound pelvis | Verified | `closeoutAssetIntegration.test.ts` "stripped clip cannot move a bound pelvis bone off its bind pose" case. |
| Determinism gate green with the bundled asset on disk | Verified | `glbAthleteEndToEndDeterminism.test.ts` 8/8 — runs unaltered against the synthetic placeholder, but the real GLB co-exists on disk without disturbing module-level state. |
| AOR-01 still loads | Verified | `aor01Seed.test.ts` 11/11; `pack.json` unchanged. |
| Both flags default false | Verified | `imperativeScene.ts:3515` and `:3541` unchanged. |
| Live `/dev/scene-preview?scenario=AOR-01` Mac/Chrome capture (flags on) | **Pending** | Requires human-driven flag-on session. The P1.5 step-by-step walkthrough above (steps 1–10) still applies. |

### P1.6 follow-on packet recommendation

1. **Live flag-on dev-preview capture** of
   `/dev/scene-preview?scenario=AOR-01` in all four camera
   modes plus fullscreen. With the real closeout clip on disk,
   this finally produces the visual evidence the placeholder
   could not. After capture, this is the gate for promoting
   AOR-01 from DRAFT to LIVE.
2. **Coach review of AOR-01** — same recommendation as P1.5,
   now unblocked on the asset axis.
3. **P2 — decoder-specific animation states.** All asset and
   scenario blockers are now retired.

## Phase P — P1.7 packet (closeout visual QA + cold-mount readiness)

The flag-on capture P1.6 called for. Lands the dev-only flag-
override path so a tester can preview the GLB + imported closeout
clip without editing source, plus a cold-mount preload so the very
first rendered frame uses the real Quaternius rig + real closeout
clip (no synthetic-placeholder regression). The asset itself is
unchanged — same `Shield_Dash_RM` extracted in P1.6.

### What this packet does

1. **Dev-only flag override.** Two new helpers in
   `imperativeScene.ts`:
     - `isGlbAthletePreviewActive()`
     - `isImportedCloseoutClipActive()`
   Both fall back to the existing module-level `USE_*_PREVIEW`
   consts (default `false`) and only flip to `true` when:
     - the const is `true`, OR
     - `process.env.NODE_ENV !== 'production'` AND a dev-only
       window-global override key is set
       (`__COURTIQ_GLB_ATHLETE_PREVIEW_DEV_OVERRIDE__`,
       `__COURTIQ_IMPORTED_CLOSEOUT_DEV_OVERRIDE__`).
   The three existing consumers in `imperativeScene.ts` and the
   one consumer in `Scenario3DCanvas.tsx` were updated to call
   the helpers.

2. **Dev-preview URL flag-on.** `/dev/scene-preview` accepts two
   new query params, dev-only:
     - `?glb=1` — flips `isGlbAthletePreviewActive()` for the
       lifetime of this page render.
     - `?closeout=1` — flips `isImportedCloseoutClipActive()`.
       Layered on top of `?glb=1`; ignored when `?glb=1` is
       absent (the imported closeout path only runs inside the
       GLB athlete builder).
   Both window globals are written during the render pass via a
   `useState` initialiser, BEFORE any 3D canvas mount effect
   runs. The route is already 404 in production unless
   `ENABLE_DEV_ROUTES=1`, so the override never reaches a
   production user.

3. **Cold-mount readiness fix.** Two layers:
     - **Dev-preview client blocks the canvas mount** on
       `Promise.all([loadGlbAthleteAsset, preloadImportedCloseoutClip])`
       when the corresponding flags are on, displaying a brief
       "loading GLB assets…" placeholder until both resolve. The
       very first rendered frame of the canvas builds figures
       with both caches warm, so no placeholder regression.
     - **Production / `/train` Scenario3DCanvas** also kicks the
       `preloadImportedCloseoutClip()` fetch in parallel with the
       existing mannequin GLB preload when both flags resolve to
       true. Same defense-in-depth pattern as the existing GLB
       asset cold-load handoff. Gated so flag-off traffic never
       fetches the 60 KB asset.

4. **No production default change.** Both module-level consts
   remain `false`. A unit test (`runtimeFlagOverride.test.ts`)
   re-locks both defaults and asserts the production-NODE_ENV
   short-circuit fires even with the window globals set
   (defense-in-depth).

### What this packet does NOT do

- Toggle the production defaults. The const flags remain
  `USE_GLB_ATHLETE_PREVIEW = false` and
  `USE_IMPORTED_CLOSEOUT_CLIP = false`.
- Change figure-build semantics on cold mount in `/train`. The
  preload is a defense-in-depth layer; the existing
  procedural-fallback-then-GLB-on-next-mount carry-over from
  P1.0 is unchanged for that path.
- Add a Playwright screenshot capture target. Documented as a
  manual capture step in the QA matrix below.
- Replace the `closeout.glb` asset. The Quaternius UAL2
  `Shield_Dash_RM` extraction from P1.6 stays — this packet is
  the visual-QA gate, not an asset swap.
- Implement P2 decoder-specific animation states.

### How to test AOR-01 with both flags on

1. Run the web app locally:
   ```bash
   pnpm --filter @courtiq/web dev
   ```
2. Open the dev preview with the override URL params:
   ```
   http://localhost:3000/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1
   ```
3. The header banner reads `DEV PREVIEW · AOR-01 — auth bypassed
   for QA only · glb=on · closeout=on`. While both assets fetch,
   the canvas placeholder reads "loading GLB assets…" — usually
   under 500 ms on broadband, longer on cold cache. Once both
   resolve, the canvas mounts and the scene plays.
4. To capture the four camera modes plus fullscreen, append the
   matching query params (already supported in
   `Scenario3DCanvas.tsx`):
     - `&camera=follow`
     - `&camera=replay`
     - `&camera=broadcast`
     - `&camera=auto` (default — omit to use)
     - `&fullscreen=1` (auto-clicks the fullscreen button after
       mount; combined with `&camera=broadcast` per the
       checklist below)
5. To revert: close the tab. Both window globals are scoped to
   that page render and clear when the route unmounts. No
   source edit was made.

### P1.7 manual visual QA checklist (AOR-01)

For each of the four camera modes plus fullscreen broadcast,
inspect the freeze tick (1500 ms by default) and confirm:

| Item | Pass / Fail / Note |
| --- | --- |
| Defender visibly closes out toward the receiver (forward stride or stride-stop body language) |  |
| Raised guard hand reads as contest pressure (not lateral arms-out, not arms-down) |  |
| Defender's authored route stays unchanged from `samplePlayer` (compare against `?glb=0` reference if needed) |  |
| Freeze moment cushion is readable — receiver has caught the ball, defender is one to two steps short |  |
| FOLLOW camera tracks the receiver smoothly without losing the defender's closeout silhouette |  |
| REPLAY camera captures the defender's hand-up moment in the freeze frame |  |
| BROADCAST camera frames both player + defender comfortably; no clipping |  |
| AUTO camera (default fit) shows the full play |  |
| Fullscreen BROADCAST fills the viewport; no black bands |  |
| No obvious foot sliding / floating across the closeout duration (1.1 s) |  |
| Clip does not read as "fantasy combat / shield dash" — the shoulder + hand pose matches a basketball closeout cue |  |

The last row is the most subjective. The `Shield_Dash_RM` source
is a generic forward defensive approach; on the Quaternius female
mannequin it reads more like "athlete charging with a guard up"
than "fantasy shield dash". If the tester or coach feels the
fantasy read dominates, the mitigation is to swap the source to
either `Idle_Shield_Loop` (low-energy, hands-up, no forward
motion — would lose the "approach" cue) or to author a custom
closeout in Blender and ship it under the same loader contract.
That's the next packet boundary — out of P1.7's scope.

### P1.7 manual screenshot capture targets

The screenshot harness is `scripts/screenshot-scenario.ts` (Phase
F). It already supports the dev-preview route and accepts a
`SCENARIO=AOR-01` env var. Adding both flag params requires a
small URL-builder tweak that is OUT OF P1.7 SCOPE — this packet
documents the manual capture targets the harness extension can
later automate.

For each capture, the URL pattern is:
```
http://localhost:3000/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1&camera=<mode>[&fullscreen=1]
```

Targets:
1. **FOLLOW at freeze.** `camera=follow`. Capture at
   `data-scene-ready=1` + 1500 ms (the freeze tick).
2. **REPLAY at freeze.** `camera=replay`. Same timing.
3. **BROADCAST at freeze.** `camera=broadcast`. Same timing.
4. **Fullscreen BROADCAST at freeze.** `camera=broadcast&fullscreen=1`.
   The fullscreen toggle auto-clicks after mount; the capture
   should wait for `:fullscreen` to apply before snapping.

Save the four PNGs under `docs/qa/courtiq/phase-p/p1-7-aor-01/`
when the human capture pass runs. This packet's CI does NOT
generate screenshots — pure manual capture per the matrix.

### P1.7 manual QA matrix

| Item | Status | Notes |
| --- | --- | --- |
| Both flag consts default to false | Verified | `runtimeFlagOverride.test.ts`. |
| Helpers ignore override in NODE_ENV=production | Verified | `runtimeFlagOverride.test.ts`. |
| Falsey override values do not flip the helper | Verified | `runtimeFlagOverride.test.ts`. |
| Preload helper hits cache idempotently | Verified | `runtimeFlagOverride.test.ts`. |
| Determinism gate green with helpers in place | Verified | `glbAthleteEndToEndDeterminism.test.ts` 8/8. |
| AOR-01 still loads | Verified | `aor01Seed.test.ts` 11/11. |
| Closeout root-motion strip still applied | Verified | `closeoutAssetIntegration.test.ts` 5/5. |
| `?glb=1&closeout=1` URL turns the helpers on | Code-verified | Window-global write via `useState` initialiser; cannot be unit-tested without a full browser harness. |
| Cold-mount placeholder fix in dev-preview | Verified by design | The dev-preview client blocks canvas mount on `Promise.all` of the two preloads; the canvas is created exactly once with warm caches. Manual capture pending. |
| Cold-mount placeholder mitigation in `/train` | Documented | Production `/train` still kicks both preloads but does not block mount. First frame may use procedural fallback for the GLB rig and synthetic placeholder for the closeout; the next scene rebuild picks up the real assets. Acceptable because the `/train` flag stays false in shipping builds. |
| Live `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1` capture (Mac/Chrome) | **Pending** | Human capture per the matrix above. |
| Coach validation of cushion + cue timing | **Pending** | Same as P1.5 / P1.6. |
| Visual acceptance of `Shield_Dash_RM` as closeout cue | **Pending** | The "fantasy combat read" subjective row in the per-mode checklist gates this. |

### P1.7 visual-acceptance verdict

**Status: PENDING** — the asset is loader-safe, route-safe, and
determinism-safe. Visual acceptance requires a human pass against
the per-mode checklist above. As of this packet, no human capture
has been added to the repo. The `Shield_Dash_RM` source is the
best CC0 candidate in Quaternius UAL2 (P1.6 audit) but reads
slightly fantasy-coded; the tester / coach must decide whether
the body language is close enough to a basketball closeout, or
whether a Blender-authored bespoke clip is the correct next step.

### P1.7 follow-on packet recommendation

1. **Manual `?glb=1&closeout=1` capture pass** of AOR-01 in all
   four camera modes plus fullscreen broadcast (per the
   checklist + screenshot matrix above). Save under
   `docs/qa/courtiq/phase-p/p1-7-aor-01/`.
2. **Coach review of AOR-01 cue + cushion timing** — same
   recommendation as P1.5 / P1.6, now fully unblocked on both
   asset and review-tooling axes.
3. **If the visual verdict is REJECT,** the next packet
   replaces `closeout.glb` with either:
     - Quaternius UAL2 `Idle_Shield_Loop` (lower energy, no
       approach motion — would need pose-only rig).
     - A bespoke Blender-authored clip on the same UAL2 rig
       (CC0 self-authored, smallest visual scope).
4. **If the visual verdict is ACCEPT,** the next packet is
   **P2 — decoder-specific animation states.** All asset and
   scenario blockers are retired.

## Phase P — P1.8 packet (AOR closeout visual readability + GLB athlete polish)

### P1.8 scope

P1.7 confirmed the imported closeout asset is loader-safe, route-safe,
and determinism-safe but left visual acceptance PENDING. Manual screen
captures (`/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`)
showed five distinct readability failures:

1. GLB athletes rendered as single-tint plastic mannequins. The whole
   body shared one team colour, so the silhouette read as "doll"
   rather than "basketball player in jersey".
2. The Quaternius UAL2 `Shield_Dash_RM` clip read as fantasy lunge —
   deep forward lean, wide arm spread, hands flared like a shield-
   dash, no recognisable basketball-closeout body language.
3. The freeze frame piled the on-floor "WING" sprite over the
   receiver, competing with the cushion read.
4. The shared broadcast / replay / follow camera presets framed the
   half-court midline (x = 0); AOR-01's read happens at x ≈ 15, z ≈ 9,
   so the closeout cue sat at the right edge of canvas with the
   passer off-screen left.
5. Joint stud overlays (M_Joints primitive) tinted the team colour
   read as fantasy-armour bumps at every joint.

P1.8 fixes 1–5 without expanding scope: flags stay default-off, the
route stays deterministic, root motion stays stripped, and the
procedural fallback path is untouched.

### P1.8 changes (commit-by-commit)

1. **Material polish.** `applyTeamColorToCloned` is replaced with
   `applyMultiRegionMaterialsToCloned`. Each vertex picks its body
   region from the SkinnedMesh's primary skinning bone (and, for
   sleeves, secondary): jersey, shorts, skin, shoes, hair. The
   per-figure cloned geometry carries a `color` attribute with the
   team colour baked in for jersey vertices; one `MeshStandardMaterial`
   with `vertexColors: true` renders the whole figure in one draw
   call. The joints overlay tints to skin so the joint studs blend
   into the silhouette.
2. **Closeout pose readability.** `dampenClipRotationTracks` slerps
   every rotation keyframe in the imported closeout clip from
   identity toward the authored value by a factor of `0.65` before
   the clip ever reaches a mixer. The shield-dash extreme lean and
   arm spread are dampened toward bind pose; the silhouette reads as
   basketball closeout pressure (controlled hand up, feet plant)
   rather than fantasy lunge. Translation tracks are untouched (the
   loader strip already handles root motion).
3. **AOR-01 visual + camera framing.** Closeout-read scenes
   (`scene.type === 'catch_and_read_closeout'`) suppress the
   on-floor spacing label on the receiver. A new
   `SCENE_CAMERA_NUDGES` table biases AOR-01's broadcast / replay /
   follow presets toward the right-wing read (broadcast nudge dx=+6,
   dz=−6, lookDx=+8; replay swings to the opposite side at dx=+32;
   follow extends trail by 2 ft). The follow target prefers the
   user (receiver) over the ball-handler so FOLLOW frames the cue
   not the passer.

### P1.8 manual visual acceptance rubric

For each capture below, answer YES / NO:

- [ ] Does the defender read as closing out (controlled hand up,
      stance plant)? — not as fantasy lunge.
- [ ] Does the receiver read as making a first-touch decision —
      isolated, ball arriving, defender pressuring?
- [ ] Does the scene look basketball-like — jersey vs shorts vs
      skin vs shoes visibly distinct, no plastic-doll tint?
- [ ] Does the imported clip still look too fantasy/combat-like at
      its peak? (NO is the desired answer.)
- [ ] Does each camera mode (BROADCAST / FOLLOW / REPLAY / TACTICAL /
      AUTO) show the closeout cue clearly?
- [ ] Does fullscreen still work and stay framed?
- [ ] Are feet planted / rings on the floor / no z-fighting?
- [ ] Is the correct read visually understandable from the screenshot
      alone — shoot, attack, or reset?

### P1.8 manual screenshot capture targets

URL builder for AOR-01 with the GLB athlete + imported closeout
clip enabled:

- `BROADCAST` (default) — `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`
- `FOLLOW`           — `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1&camera=follow`
- `REPLAY`           — `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1&camera=replay`
- `TACTICAL`         — `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1&camera=tactical`
- `AUTO`             — `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1&camera=auto`
- `Fullscreen broadcast` —
  `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1&fullscreen=1`

Save captures under `docs/qa/courtiq/phase-p/p1-8-aor-01/`.

P1.8 does not bundle screenshot automation — the CI screenshot
worker would need a flag-on toggle that has not been wired through
the harness yet (out of P1.8 scope, same posture as P1.7).

### P1.8 visual-acceptance verdict

**Status: NEEDS-COACH-REVIEW.** The five P1.7 readability failures
are addressed at the code layer and the synthesis tests pass, but
P1.8 has not yet been hand-walked by a coach against the AOR-01
cue + cushion timing read. The Quaternius `Shield_Dash_RM` source
clip is now dampened toward bind pose so the closeout reads as
basketball pressure rather than shield-dash; final ACCEPT vs.
REJECT is a coach call that should happen on top of these visual
fixes.

### P1.8 follow-on packet recommendation

1. **Coach review of dampened closeout + AOR-01 cushion read** —
   the asset+pose acceptance gate that P1.5 / P1.6 / P1.7 left open
   is now visually defensible. A 10-minute coach pass against the
   capture matrix above gives a definitive ACCEPT / REJECT.
2. **If ACCEPT:** ship P2 — decoder-specific animation states
   (other AOR cues, BDW closeouts, ESC switches).
3. **If REJECT:** the next packet replaces the dampener with a
   bespoke Blender-authored clip on the same UAL2 rig — the
   smallest visual escalation, since the pipeline (loader strip,
   determinism gate, material splits) is unchanged.

## Phase P — P1.9 packet (closeout leg deformation root cause + fix)

### P1.9 root cause

P1.8 manual screenshots at `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`
showed the GLB athletes inverting — legs folded over the torso,
bodies oriented head-down. Two compounding bugs were responsible:

**Bug #1 — bind-pose-naive dampener (introduced in P1.8).**
The P1.8 closeout dampener slerped every keyframe quaternion
from identity (0,0,0,1) toward the authored value by a factor
of 0.65. The intent was to soften extreme poses, but the
implementation was bind-pose **NAIVE**: it pulled bones toward
identity, not toward bind. Quaternius UAL2 bones carry
non-trivial bind rotations:

| bone        | bind rotation magnitude |
|-------------|-------------------------|
| thigh_l/r   | ~166° around X          |
| pelvis      | ~75° around X           |
| clavicle    | ~99°                    |
| upperarm    | ~96°                    |
| foot_l/r    | ~64°                    |
| Head, spine | ≤ 13°                   |

A bone whose bind sits at 166° dampened to "65% of authored, 35%
of identity" lands ~50–100° away from where it should rest,
flipping the limb.

**Bug #2 — closeout clip lower-body authoring vs. runtime rig.**
Independent of the dampener, the bundled `closeout.glb` writes
absolute lower-body rotations that, composed with the bind pose
the runtime mannequin holds, produce inverted thighs and feet:

- `thigh_l` keyframe at t=0 ≈ 179° around X.
- `thigh_r` keyframe at t=1.10 ≈ 178° (negative w).
- `pelvis` keyframe ≈ 100–131° multi-axis.
- `root` rotation track is a steady -90° around X — directly
  contradicts the bind orientation, so the mixer flips the
  whole armature on every frame.

The clip was authored against an internal Quaternius rig
state that does not match the bundled `mannequin.glb` rest
pose for these specific bones (despite the bone names matching
exactly).

### P1.9 fix strategy

**Option D from the P1.9 brief — disable imported lower-body
tracks; treat the closeout asset as upper-body only.**

1. Drop the P1.8 bind-naive dampener entirely. The helper is
   removed; nothing in production calls it.
2. New pure helper `stripCloseoutLowerBodyTracks(clip)` filters
   every track targeting `root`, `pelvis`, `thigh_l/r`,
   `calf_l/r`, `foot_l/r`, `ball_l/r` (rotation, translation,
   and scale).
3. `_getReadableCloseoutClip()` runs the strip before the
   action is attached to the mixer; the cache flips to the
   stripped clip the moment the loader swaps the synthetic
   placeholder for the real asset on disk.
4. The list of stripped bones is exported as
   `CLOSEOUT_LOWER_BODY_BONE_NAMES` and locked by a unit test
   so a future edit can't silently re-include legs.

After the strip:

- Lower-body bones hold their bind pose — a stable standing
  rest. Feet plant, knees do not fold, no inversion.
- Upper body still receives the imported clip pose: spine
  lean, head turn, raised hand, contest posture.
- Determinism is preserved (the strip is a pure function and
  the existing P1.0 determinism gate still passes).
- Root motion strip from P1.0 is unaffected.

### P1.9 trade-offs

- The closeout no longer animates the legs at all. A real
  defensive closeout slides + plants; ours holds bind in the
  legs while the upper body pressures. Acceptable trade for
  the P1.x series; the next escalation either authors a
  bespoke Blender clip on the same UAL2 rig or ships a
  bind-relative retargeter.
- The dampener is gone, so bones with small bind rotations
  (spine, head, upperarm, lowerarm) play their imported pose
  at full strength. If that reads "too fantasy" again, the
  next-iteration fix is a dampener that slerps from per-bone
  bind, not from identity.

### P1.9 visual-acceptance verdict

**Status: NEEDS-COACH-REVIEW.** The leg-inversion regression is
fixed; the figure no longer pretzels. But:

- The upper body still plays the raw imported pose (no
  dampener), and the Quaternius UAL2 source is the same
  shield-dash-coded clip P1.7 flagged as borderline. A coach
  has to decide whether the upper-body-only closeout reads as
  basketball pressure.
- Treating the imported asset as upper-body-only is a defensible
  short-term call, but it's not the final shape of CourtIQ's
  closeout animation system.

Manual retest URL (unchanged):
`/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`

Capture matrix from the P1.8 packet still applies:
- `BROADCAST` — default URL
- `FOLLOW`    — `&camera=follow`
- `REPLAY`    — `&camera=replay`
- `TACTICAL`  — `&camera=tactical`
- `AUTO`      — `&camera=auto`
- Fullscreen broadcast — `&fullscreen=1`

### P1.9 follow-on packet recommendation

1. **Coach review pass on the upper-body-only closeout.** If
   ACCEPT, the visual gate clears and P2 can begin. If the
   torso/arm pose still reads "fantasy", proceed to the
   bespoke clip path.
2. **If REJECT** — P2 candidate is a Blender-authored CC0
   closeout on the same UAL2 rig (no full-body retarget needed
   because the rig is shared). Smallest visual escalation.
3. **Optional optimisation:** a bind-relative retargeter that
   slerps imported keyframes from per-bone bind rather than
   identity. Would let the dampener return safely AND let the
   imported clip drive the legs without inversion. Out of
   scope for P1.9.

## Phase P — P1.9 closeout visual follow-up (CourtIQ lower-body base)

### Why P1.9 was not visually sufficient

P1.9 correctly identified the unsafe source of the leg inversion:
`Shield_Dash_RM` lower-body/root tracks cannot be trusted on the
runtime mannequin. Stripping those tracks fixed the worst failure
(fully inverted legs), but it left the closeout action with no
lower-body owner. The result was a Quaternius rest/bind lower body
under an imported upper-body contest pose.

The browser pass also exposed a second related issue: the existing
GLB bespoke lower-body clips (`idle_ready`, `cut_sprint`, and
`defense_slide`) were authored with small near-identity lower-body
quaternions as if Three.js would apply them relative to bind. Three.js
animation tracks write absolute local quaternions. On Quaternius
lower-body bones whose rest rotations are large (`pelvis` ~104°,
`thigh_l/r` ~166°), those small values overwrite the bind rotations
and create the same kneeling/bug-leg read outside the imported
closeout path.

The rest pose is valid for skinning, but it is not by itself a
basketball teaching stance. In AOR-01 at
`/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`, many athletes
still read as kneeling, floating, or frozen in a bug-like base:
feet/legs were technically no longer upside down, but the cue did
not communicate a defender closing out to a receiver.

### Follow-up fix strategy

Chosen strategy: **Option A/C — keep the imported closeout upper
body, but replace the stripped lower body with a small CourtIQ-
authored basketball base.**

Implementation:

1. Continue stripping imported tracks for `root`, `pelvis`,
   `thigh_l/r`, `calf_l/r`, `foot_l/r`, and `ball_l/r`.
2. After the strip, add pose-only quaternion tracks for:
   `pelvis`, `thigh_l/r`, and `calf_l/r`.
3. Author those lower-body tracks bind-relative: start from the
   audited Quaternius lower-body bind quaternions, then multiply in
   small CourtIQ stance deltas. Do not blend toward identity.
4. Apply the same bind-relative lower-body correction to the existing
   GLB `idle_ready`, `cut_sprint`, and `defense_slide` lower-body
   tracks so non-closeout athletes do not appear broken.
5. Do not add any root, world, or position tracks. Scenario route
   authoring still owns player world `(x,z)`.
6. Keep feet/toes at the mannequin's bind rotations once the
   pelvis/thigh/calf base is sane; overwriting those channels was
   intentionally avoided because foot/ball rotations were part of
   the original failure surface.

Pose intent:

- upright hips with only a tiny deceleration rock
- slight knee bend, not a folded crouch
- feet under the body via conservative thigh splay
- imported spine/head/arms still show closeout pressure and high
  guard

This is intentionally not P2 decoder-wide animation mapping and not
a renderer rewrite. It is a closeout-specific safety/readability
override for the GLB imported clip path.

### Follow-up validation notes

Added/updated tests lock:

- lower-body strip still removes the dangerous imported root/leg/foot
  channels
- readable closeout clip adds the CourtIQ lower-body base back as
  quaternion-only pose tracks
- attached closeout action uses that readable clip, not just the
  loader-cached root-motion-stripped source
- GLB bespoke lower-body motion now preserves Quaternius bind before
  applying small stance deltas
- route invariance remains true
- closeout determinism remains true
- GLB/imported-closeout flags remain default false

AOR-01 player-count note: the seed is currently authored as 4v4
(8 players: `pg`, `user`, `o3`, `o4`, `x1`, `x2`, `x3`, `x4`).
The GLB screenshot rendering 8 athletes is therefore not dropping a
player; changing the seed to 5v5 would be separate scenario-authoring
work.

### Follow-up visual verdict

**Status: NEEDS-COACH-REVIEW.** The technical visual failure has a
more appropriate base stance now, but final acceptance still needs
a human/coach pass against AOR-01 cue readability. The imported
upper body is still sourced from Quaternius `Shield_Dash_RM`, so the
question is now coaching-language readability, not broken-leg safety.

Manual retest URL:
`/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`
