# CourtIQ Imported Animation Clips

This folder bundles imported animation clips that drive the GLB
athlete's bone-only body language at runtime. It is **separate** from
the parent `apps/web/public/athlete/mannequin.glb` (the rigged mesh)
because each imported clip is a per-intent payload, not a per-figure
payload.

## Loader contract

Every clip in this folder is consumed by
`apps/web/components/scenario3d/importedClipLoader.ts`. The loader:

1. Fetches the GLB via `GLTFLoader`.
2. Picks the first `THREE.AnimationClip` from `gltf.animations` (or a
   named clip if the caller passes one).
3. **Strips root/hip translation tracks** at the loader level so the
   clip cannot move the player off their authored `(x, z)` route. See
   `stripRootMotionTracks` for the exact list of stripped track names.
4. Caches the parsed clip per asset URL so all 10 figures share one
   decode.

If a callsite forgets the strip step, that's a bug — the strip happens
inside the loader, not in per-callsite code. Phase P §2 (the hard line
"animation must not own the world route") relies on this.

## Closeout (`closeout.glb`)

- **Intent:** `closeout` — defender approaching a catch on AOR. Short
  choppy steps, high hand, decelerating posture. See Phase P §5
  (Vocabulary) and §6 (AOR mapping).
- **Status:** **placeholder, not bundled.** The P1.0 spike adds the
  loader + flag + determinism test scaffolding so a real clip can be
  dropped in here without touching code. Until then, the GLB athlete
  system uses a **synthetic placeholder closeout clip** authored
  programmatically inside `glbAthlete.ts` so the wiring is exercisable
  end-to-end and the determinism gate can prove the route stays
  authored even with the flag on.
- **Drop a real clip here:**
  1. Save it as `closeout.glb` in this folder.
  2. Confirm it targets the Quaternius UAL2 bone naming
     (`pelvis`, `spine_02`, `Head`, `upperarm_l/r`, `lowerarm_l/r`,
     `thigh_l/r`, `calf_l/r`). If the clip uses different source bone
     names, add the smallest adapter needed inside
     `importedClipLoader.ts` — do NOT edit the clip file itself.
  3. Document the source URL, license, and downloaded date in
     `apps/web/public/athlete/ATTRIBUTION.md`. Only CC0 / explicit
     commercial-use licenses are acceptable; CC BY-NC, CC BY-SA, and
     "personal use only" are not.
  4. Visual-QA in `/dev/scene-preview` with
     `USE_GLB_ATHLETE_PREVIEW = true` and
     `USE_IMPORTED_CLOSEOUT_CLIP = true` flipped locally only. Verify
     in all four camera modes (FOLLOW, REPLAY, BROADCAST, AUTO) plus
     fullscreen that the defender plays closeout body language and
     that the player's authored x/z route is unchanged.

## What this folder must NOT contain

- Clips authored against a non-CC0 / non-permissive license (CC BY-NC,
  CC BY-SA, "personal use only", Mixamo characters distributed in a
  public repo).
- Clips with un-stripped root motion that bypass the loader. The
  loader is the single chokepoint that enforces the "scenario data
  owns x/z" rule.
- Multi-intent clips. Each file is one teaching intent (Phase P §5).
  The decoder mapping (Phase P §6) is responsible for deciding which
  intent plays per role per scenario tick — not the clip file.
