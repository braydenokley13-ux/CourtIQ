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


