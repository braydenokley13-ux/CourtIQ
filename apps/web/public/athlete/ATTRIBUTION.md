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

**None.** As of the P1.5 packet, no real `.glb` clip is on disk
under `clips/`. The GLB athlete system is wired to load a real
`closeout.glb` if one appears (see `clips/README.md`), and falls
back to a synthetic placeholder closeout clip authored
programmatically inside `apps/web/components/scenario3d/glbAthlete.ts`
when the cache is cold.

The placeholder clip is **NOT a redistributable asset** — it lives
in code, has no separate authoring source, and has no license
question because it is an internally-authored derivative of the
existing bespoke clip vocabulary.

### Closeout (`clips/closeout.glb`) — TODO

When a real closeout clip is added, append the following block here
with the actual values filled in. The seed validator and the
imported-clip loader do not check this file, but a missing entry is
the project's contract violation, not a runtime error.

```
- File: clips/closeout.glb
- Original name: <as shipped by the source>
- Author: <name + URL>
- Source URL: <permalink>
- Distribution archive: <archive name + URL>
- Downloaded: YYYY-MM-DD
- License: <CC0 1.0 / CC BY 4.0 / explicit-commercial / ...>
- License file: clips/<asset-license-filename>.txt (verbatim copy)
- Bone naming source rig: <Quaternius UAL2 / Mixamo / custom>
- Root-motion stripping: enforced at the loader layer
  (apps/web/components/scenario3d/importedClipLoader.ts).
- Visual QA: <date + screenshot path>
```

CC BY-NC, CC BY-SA, and "personal use only" licenses are NOT
acceptable for CourtIQ. Mixamo characters distributed in this
public repository require explicit legal review before adding a
bundled file (per `phase-o-glb-athlete.md` § Source survey).
