# CourtIQ athlete assets: attribution and runtime status

This file records provenance for the Quaternius mannequin and two extracted
animation clips. The current CourtIQ world uses `lab-athlete.glb` as its
primary athlete and its embedded basketball action library. The Quaternius
mannequin is retained as the fallback source rig if the studio GLB cannot be
loaded. See [`LAB-HUMAN.md`](LAB-HUMAN.md) and
[`LAB-ATHLETE-STUDIO.md`](LAB-ATHLETE-STUDIO.md) for the generated athlete's
source, build and validation details.

Use `/dev/athlete-studio` to review the current athlete and its motion, and
`/dev/glb-debug` to check bundled asset availability. These development routes
are hidden in production unless `ENABLE_DEV_ROUTES=1` is set. The extracted
clips in `clips/` are retained, attributed assets; normal world rendering
does not select them. The development instructions here describe only the
currently available review routes.

## Mannequin fallback: `mannequin.glb`

- Original name: `Mannequin_F.glb`, Female Mannequin from Universal Animation
  Library 2 — Standard.
- Author: Quaternius (<https://quaternius.com/>).
- Pack page: <https://quaternius.com/packs/universalanimationlibrary2.html>.
- Distribution archive: `universal_animation_library_2standard.zip`,
  obtained from the OpenGameArt mirror at
  <https://opengameart.org/content/universal-animation-library-2>.
- Downloaded 2026-04-30.
- License: CC0 1.0 Universal, public-domain dedication
  (<https://creativecommons.org/publicdomain/zero/1.0/>). The
  [`LICENSE.txt`](LICENSE.txt) file is a copy of the license shipped in the
  pack archive.
- The asset has a 65-bone rig, no embedded animation tracks, and a 1,442,824
  byte file size. It is used only by the renderer's asset fallback path; it
  is not gated by an environment flag.

The mannequin has no textures. The CourtIQ renderer supplies player colors
and presentation at runtime. Its lack of embedded actions does not affect the
primary studio athlete, whose basketball actions are authored in
`lab-athlete.glb`.

## Retained extracted clips

Both files below are one-animation extracts from Quaternius Universal
Animation Library 2 — Standard. Each is licensed CC0 1.0 under the same pack
license copied in [`LICENSE.txt`](LICENSE.txt). They preserve no full pack
mesh or unrelated animation library. The loader in
`apps/web/components/courtiq/world/renderer/importedClipLoader.ts` strips
root/hip translation when these assets are explicitly loaded. They are not
selected by the current CourtIQ world route; current closeout and other
basketball actions come from the action library embedded in
`lab-athlete.glb`.

### Closeout: `clips/closeout.glb`

- Original animation: `Shield_Dash_RM` from `Unreal-Godot/UAL2_Standard.glb`.
- Author and pack page: Quaternius,
  <https://quaternius.com/packs/universalanimationlibrary2.html>.
- Distribution archive: `universal_animation_library_2standard.zip`,
  obtained from <https://opengameart.org/content/universal-animation-library-2>.
- Downloaded 2026-05-03; 61,444 bytes; glTF binary v2 with one animation.
- The source contains root motion; the shared imported-clip loader removes
  root and pelvis translation before an explicitly loaded clip reaches a
  mixer.

### Back cut: `clips/back_cut.glb`

- Original animation: `NinjaJump_Start` from `Unreal-Godot/UAL2_Standard.glb`.
- Author and pack page: Quaternius,
  <https://quaternius.com/packs/universalanimationlibrary2.html>.
- Distribution archive: `universal_animation_library_2standard.zip`,
  obtained from <https://opengameart.org/content/universal-animation-library-2>.
- Downloaded 2026-05-03; 57,760 bytes; glTF binary v2 with one animation.
- The source contains root motion; the shared imported-clip loader removes
  root and pelvis translation before an explicitly loaded clip reaches a
  mixer.

The bundled Quaternius assets are CC0. Do not add assets with CC BY-NC,
CC BY-SA or personal-use-only terms to this directory without resolving
their redistribution terms first.
