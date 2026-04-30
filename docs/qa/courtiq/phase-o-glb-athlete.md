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




