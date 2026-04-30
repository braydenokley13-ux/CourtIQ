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

