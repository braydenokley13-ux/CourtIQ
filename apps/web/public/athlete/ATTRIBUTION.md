# CourtIQ Athlete Asset — Attribution

## Asset

- **File:** `mannequin.glb`
- **Original name:** `Mannequin_F.glb`
- **Pack:** Universal Animation Library 2 — Standard, Female Mannequin
- **Author:** Quaternius (<https://quaternius.com/>)
- **Source URL:** <https://quaternius.com/packs/universalanimationlibrary2.html>
- **Distribution archive:** `universal_animation_library_2standard.zip`
  obtained from the OpenGameArt mirror at
  <https://opengameart.org/content/universal-animation-library-2>
- **Downloaded:** 2026-04-30
- **License:** CC0 1.0 Universal — Public Domain Dedication
  (<https://creativecommons.org/publicdomain/zero/1.0/>)
- **License file:** `LICENSE.txt` in this directory (verbatim copy of
  the `License.txt` shipped inside the pack archive)

## Why this asset is acceptable for CourtIQ

CourtIQ is a commercial training product, so the bundled mesh + skeleton
must be redistributable in our public repository under a license that
permits commercial use without restrictive obligations. CC0 1.0 is the
strongest possible license for this — it is a public-domain dedication
that imposes no conditions on use, modification, or redistribution.

The asset clears every Phase O gate:

1. License is acceptable — CC0, commercial redistribution permitted, no
   attribution required (this file is voluntary).
2. Humanoid rig is usable — 65-bone Unreal-style skeleton (root,
   pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/lowerarm/hand
   L+R, thigh/calf/foot L+R) compatible with the Phase M animation
   contract.
3. Single SkinnedMesh, single primitive, no textures — fits the
   one-draw-call-per-figure budget the procedural and Phase M paths
   already maintain.
4. Broadcast-distance silhouette reads as a stylized premium athlete —
   real shoulders, hands, and feet recover the static-look regression
   the generated low-poly cylinder rig left in Phase N.

## Size note

Cold-load weight is 1.4 MB. This exceeds the soft 500 KB target the
Phase O-ASSET prompt set ("around ≤500 KB if possible"). The smaller
companion file in the pack (`UAL2_Standard.glb`, 7.7 MB) bundles 43
themed animations none of which are basketball-style, so it is not a
better trade. Decimating below 1.4 MB would require a Blender /
gltf-pipeline / gltf-transform / Draco optimization pipeline that is
out of scope per the prompt's "no huge asset pipeline" rule. The 1.4 MB
weight is paid only when `USE_GLB_ATHLETE_PREVIEW` is `true`; the flag
is `false` by default, so production traffic does not pay this cost.

## What's NOT bundled

- No embedded animations. Per the Quaternius README inside the pack,
  the female mannequin GLB intentionally ships without animation
  tracks; the companion file holds the shared clip library, but those
  clips are themed (lantern, rail, shield, ninja, sword, zombie, etc.)
  and none correspond to the Phase M `idle_ready`, `cut_sprint`, or
  `defense_slide` clips. Animation retargeting is therefore deferred
  per Phase O-ASSET OA5 — the GLB preview renders as a static figure
  whose root motion is owned by the existing scene timeline.
- No textures. The pack's two embedded materials are flat shaders;
  team colors and trim are applied to the cloned `SkinnedMesh`
  material at runtime so user / offense / defense jerseys read
  correctly.

## Verification commands

```bash
# Confirm magic header is glTF v2:
od -An -c -N 12 apps/web/public/athlete/mannequin.glb

# Inspect mesh / skeleton metadata:
python3 -c "
import json, struct
with open('apps/web/public/athlete/mannequin.glb', 'rb') as f:
    f.read(12); chunk_len, _ = struct.unpack('<I4s', f.read(8))
    j = json.loads(f.read(chunk_len).decode('utf-8'))
    print('verts:', sum(j['accessors'][p['attributes']['POSITION']]['count']
        for m in j['meshes'] for p in m['primitives']))
    print('bones:', len(j['skins'][0]['joints']))
    print('anims:', len(j.get('animations', [])))
"
```

Expected output (matches the file shipped here): `verts: 10070`,
`bones: 65`, `anims: 0`.

---

## Imported animation clips (`clips/`)

The `clips/` subdirectory bundles per-intent imported animation files
that drive the GLB athlete's bone-only body language. Each file in
that folder must carry its own attribution entry below before the
asset can be considered shippable.

### Clips currently bundled

- `clips/closeout.glb` — see entry below.
- `clips/back_cut.glb` — see entry below.

The synthetic in-code placeholder closeout clip authored inside
`apps/web/components/scenario3d/glbAthlete.ts` continues to act as
the fallback when the bundled `closeout.glb` is not yet cached
(e.g. the very first frame after a cold mount, or under JSDOM in
tests). The placeholder is **NOT a redistributable asset** — it
lives in code, has no separate authoring source, and has no license
question because it is an internally-authored derivative of the
existing bespoke clip vocabulary.

### Closeout (`clips/closeout.glb`)

- **File:** `clips/closeout.glb`
- **Original animation name:** `Shield_Dash_RM`
- **Renamed to:** `closeout` (single animation in this file)
- **Pack:** Universal Animation Library 2 — Standard
  (`Unreal-Godot/UAL2_Standard.glb`)
- **Author:** Quaternius (<https://quaternius.com/>)
- **Source URL:** <https://quaternius.com/packs/universalanimationlibrary2.html>
- **Distribution archive:** `universal_animation_library_2standard.zip`
  obtained from the OpenGameArt mirror at
  <https://opengameart.org/content/universal-animation-library-2>
- **Downloaded:** 2026-05-03
- **License:** CC0 1.0 Universal — Public Domain Dedication
  (<https://creativecommons.org/publicdomain/zero/1.0/>)
- **License file:** `LICENSE.txt` in the parent `athlete/` directory
  (verbatim copy of the `License.txt` shipped inside the pack
  archive — same license as the bundled `mannequin.glb`).
- **Bone naming source rig:** Quaternius UAL2 (Unreal/Godot rig).
  Bone names match the rig already used by `mannequin.glb`
  (`root`, `pelvis`, `spine_01`–`03`, `Head`, `clavicle/upperarm/
  lowerarm/hand_l|r`, `thigh/calf/foot_l|r`, `ball_l|r`,
  `neck_01`). No name adapter needed — the loader's bone-map
  audit (`GLB_BONE_MAP` in `glbAthlete.ts`) resolves cleanly.
- **Root motion:** **YES** in source. The original
  `Shield_Dash_RM` (the `_RM` suffix is Quaternius's convention
  for clips with root motion) translates `root` from `(0, 0, 0)`
  to `(0, 0, 1.0)` and `pelvis` from `(~0.075, ~0.078, ~0.487)`
  to `(~0.005, ~0.086, ~0.877)` over the 1.1 s duration. The
  loader strips both via `DEFAULT_ROOT_MOTION_BONE_NAMES` (which
  includes `root` AND `pelvis`) before any clip reaches the
  `AnimationMixer`. Scenario timeline retains sole ownership of
  `(x, z)`.
- **Why this clip qualifies as a closeout:** UAL2 ships no
  basketball-style clips; out of the 43 animations in
  `UAL2_Standard.glb`, `Shield_Dash_RM` is the only sub-1.5s
  forward defensive approach with a raised guard hand.
  Semantically maps to "defender approaches the catch with a high
  hand" (Phase P §5 Vocabulary). Body language differs visibly
  from `defense_slide` (a lateral rocking stance), so the clip
  also satisfies the P1.0 visual-distinguishability requirement.
- **Extraction:** A scripted re-pack (Python + manual GLB JSON
  + bin chunk surgery) extracts only the `Shield_Dash_RM`
  animation tracks targeting the core bones used by
  `GLB_BONE_MAP` (root/pelvis/spine\_xx/neck/Head/clavicle/
  upperarm/lowerarm/hand/thigh/calf/foot/ball — 23 bones). The
  full UAL2 mesh / 43-clip library is NOT bundled. The
  resulting `closeout.glb` is **60 KB** on disk
  (vs. 8.06 MB for the full `UAL2_Standard.glb`).
- **File format:** glTF binary v2 (`magic = "glTF"`, version
  = 2). One animation. Single buffer chunk.
- **File size:** ~60 KB (61,444 bytes) — well below the
  500 KB soft target the GLB athlete prompt set.
- **Visual QA:** Pending. Both flags
  (`USE_GLB_ATHLETE_PREVIEW` and `USE_IMPORTED_CLOSEOUT_CLIP`)
  remain `false` by default; QA must be performed locally with
  both flipped on against `/dev/scene-preview?scenario=AOR-01`.
  See `apps/web/public/athlete/clips/README.md` checklist.

### Back cut (`clips/back_cut.glb`)

- **File:** `clips/back_cut.glb`
- **Original animation name:** `NinjaJump_Start`
- **Renamed to:** `back_cut` (single animation in this file)
- **Pack:** Universal Animation Library 2 — Standard
  (`Unreal-Godot/UAL2_Standard.glb`)
- **Author:** Quaternius (<https://quaternius.com/>)
- **Source URL:** <https://quaternius.com/packs/universalanimationlibrary2.html>
- **Distribution archive:** `universal_animation_library_2standard.zip`
  obtained from the OpenGameArt mirror at
  <https://opengameart.org/content/universal-animation-library-2>
- **Downloaded:** 2026-05-03
- **License:** CC0 1.0 Universal — Public Domain Dedication
  (<https://creativecommons.org/publicdomain/zero/1.0/>)
- **License file:** `LICENSE.txt` in the parent `athlete/` directory
  (verbatim copy of the `License.txt` shipped inside the pack
  archive — same license as the bundled `mannequin.glb` and
  `closeout.glb`).
- **Bone naming source rig:** Quaternius UAL2 (Unreal/Godot rig).
  Same rig as `mannequin.glb` and `closeout.glb` — no name adapter
  needed. The loader's `GLB_BONE_MAP` audit resolves cleanly.
- **Root motion:** **YES** in source. The original
  `NinjaJump_Start` translates `root` and `pelvis` over the
  ~0.97 s duration to read as a quick athletic burst forward. The
  loader strips both via `DEFAULT_ROOT_MOTION_BONE_NAMES` (which
  includes `root` AND `pelvis`) before any clip reaches the
  `AnimationMixer`. Scenario timeline retains sole ownership of
  `(x, z)` — the imported clip never moves the player off the
  authored back-cut route.
- **Why this clip qualifies as a back cut:** UAL2 ships no
  basketball-style clips; of the 43 animations in
  `UAL2_Standard.glb`, `NinjaJump_Start` is the closest sub-1.0 s
  explosive change-of-direction read. Semantically maps to
  "offensive cutter reads denial and accelerates behind the
  defender" (Phase P §5 Vocabulary). Body language differs
  visibly from `cut_sprint` (the bespoke even-tempo run cycle)
  and from `closeout` (`Shield_Dash_RM`'s shielded forward
  approach), so the BDW cutter under
  `USE_IMPORTED_BACK_CUT_CLIP=true` is distinguishable from
  the flag-off `cut_sprint` fallback.
- **Extraction:** A scripted re-pack (Python + manual GLB JSON
  + bin chunk surgery) extracts only the `NinjaJump_Start`
  animation tracks targeting the same 23 core bones the
  closeout extraction uses (root/pelvis/spine\_01..03/neck\_01/
  Head/clavicle/upperarm/lowerarm/hand/thigh/calf/foot/ball).
  The full UAL2 mesh / 42 unrelated clips are NOT bundled.
  Resulting `back_cut.glb` is **57 KB** on disk
  (vs. 8.06 MB for the full `UAL2_Standard.glb`).
- **File format:** glTF binary v2 (`magic = "glTF"`, version
  = 2). One animation. Single buffer chunk.
- **File size:** ~57 KB (57,760 bytes) — well below the
  500 KB soft target the GLB athlete prompt set.
- **Visual QA:** Pending. All three flags
  (`USE_GLB_ATHLETE_PREVIEW`, `USE_IMPORTED_CLOSEOUT_CLIP`,
  `USE_IMPORTED_BACK_CUT_CLIP`) remain `false` by default; QA
  must be performed locally with the relevant flags flipped on
  against `/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1`.
  See `apps/web/public/athlete/clips/README.md` checklist.

CC BY-NC, CC BY-SA, and "personal use only" licenses are NOT
acceptable for CourtIQ. Mixamo characters distributed in this
public repository require explicit legal review before adding a
bundled file (per `phase-o-glb-athlete.md` § Source survey).
