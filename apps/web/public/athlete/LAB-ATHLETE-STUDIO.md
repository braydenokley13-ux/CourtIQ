# CourtIQ basketball studio athlete

Built 2026-10-05 in Blender 4.3.2; motion/material revision v2 built 2026-10-06 with Blender 5.2.2 (`pip install bpy`). Defense Lab's normal-world players use `lab-athlete.glb`. This asset contains an anatomical skinned athlete, an authored practice uniform and basketball shoes, twenty-one reusable basketball actions (v2), and two mesh detail levels on one rig. The analytical representation is separate and is drawn from the simulation's body/reach geometry.

## Source and rights

- Anatomical base: MakeHuman Community's CC0 core base, bundled as `scripts/athlete/source/makehuman-base.obj`. Source: https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj . Core-asset license: https://static.makehumancommunity.org/about/license.html . SHA-256 `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`.
- Rig donor: Quaternius Universal Animation Library 2 CC0 mannequin, bundled as `mannequin.glb`; see `ATTRIBUTION.md` and `LICENSE.txt`. Its rest rig is imported into Blender before authoring. Blender exports the final node transforms and inverse-bind matrices together; the runtime does not retarget or reinterpret small Euler deltas.
- Local CourtIQ work: anatomical adaptation, sleeveless uniform pattern with a tailored shoulder yoke, contrast hems and waistband, shorts, sculpted shoe/sole/laces/sock geometry, scalp/eye treatment, materials, all thirteen basketball actions, LODs, optimization and runtime motion layering.
- No commercial sports-game geometry, logos, athlete likenesses, third-party clothing or motion capture are included. The basketball motion is locally authored kinematic animation, not captured or measured biomechanics.

## v3 revision (look, one draw call, runtime foot-lock) - 2026-10-06

Build: `python3 scripts/athlete/build_studio_athlete.py` (about 70 s; `GEOMETRY_ONLY=1` stops after meshes and saves `source/lab-athlete-geometry.blend`; `python3 scripts/athlete/preview_geo.py out.png [pose=ready clip=jog p=0.3 debug=1]` renders a Cycles CPU sheet of the geometry with a test atlas). Geometry helpers live in `scripts/athlete/athlete_geo.py`.

- **Body**: the MakeHuman base is reshaped (broader shoulders/traps, lats, pecs, narrower waist, thigh/calf/forearm volume) before anything is cut from it.
- **Uniform**: the jersey is the athlete's own torso surface, boolean-cut to a tank top (clean neck and armholes, pinned during decimation), offset and solidified with a trim-coloured rim; the hem moves with the pelvis exactly like the shorts. Shorts are baggy leg tubes with a closed, rolled hem (no sliver). Shoes are chunkier lasted sneakers with laces and ankle socks.
- **Faces/hair**: brows, eyes (sclera + iris) and mouth are conformed to the face surface; hair is a shell grown from the scalp with four styles (`crop`, `buzz`, `hightop`, `afro`; `bald` = none) selected per player (`AthleteAppearance.hair` or an id hash). Skin tones and hair colours are palette-driven.
- **One draw call per athlete**: every part samples ONE 512x512 atlas (16 colour swatches + jersey front/back panels, layout in `athlete_geo.SWATCH`, also recorded in `CourtIQMotion.atlas`). The runtime paints the atlas per team / number / skin / hair / shoes (plus a roughness map) and merges the chosen hair into each LOD geometry. Baked per-vertex ambient occlusion (COLOR_0, computed in a defensive stance) supplies the form shading. Before: 8 skinned primitives per athlete (80 draw calls for ten). After: 1 (12 calls for ten athletes + floor + ball).
- **LODs** on one skeleton: LOD0 15.5k tris, LOD1 5.3k, LOD2 2.5k. Mesh data is quantised in the optimizer (COLOR_0 u8, WEIGHTS_0 u16, TEXCOORD_0 u16, core glTF, no decoder needed). lab-athlete.glb 1.16 MB; lab-athlete-tactical.glb (LOD1 + hair) 0.60 MB.
- **Quality tiers** (`setQuality('high'|'balanced'|'low')`): high = LOD0, physical material (sheen, roughness map), 2-iteration hand IK; balanced = LOD1, cheaper material; low = LOD2 + no shadow casting + half-rate skeleton/IK for unfocused athletes. The ball handler (or `setFocus(true)`) stays LOD1 and full rate in low. All tiers share one mixer.
- **Foot-lock IK**: plant markers per foot per clip frame are baked into `CourtIQMotion.clips[*].plant`. The runtime blends them by clip weight, pins planted feet to the court (bounded drag, release on large turns) and solves two-bone leg IK, so blends, starts, stops and passes (the stepping foot is unplanted) do not skate. Measured locked-foot ground speed 0.002-0.25 m/s for walk / chop / slide / backpedal / sprint (`scripts/qa-local/athlete/plant.mjs`).
- **Body mechanics**: heading vs facing picks forward / slide / backpedal sectors with wide dead zones; the residual angle becomes a hip yaw (root) with the chest and head counter-rotating toward the facing. Smoothed world acceleration leans the spine forward when accelerating, back and sinks the hips when braking, and leans into lateral acceleration (turns, cuts).
- **Poses**: lower, more forward defensive stance (hip hinge 0.25 rad, chest 0.30), wider base, bent-elbow active hands, forward-lean slides / chops / backpedal, closeout high hand beside the head, passes and shots own the legs at low speed so the lead foot steps into the pass.
- Fixes: ball hands bracket the ball (the original left hand crossed the chest), shorts crotch side no longer a flat see-through sheet.

### Pass 4 (art direction)
- Jersey hangs straight (half-width capped per height slice: hem 0.172 m tapering to the chest), hem at the shorts waist; shorts are tapered, solid (Solidify with a trim rim hem, double-sided material), side stripe subtle, leg weights follow the thigh so skin does not poke through.
- Stance: hip drop 0.31 m, chest hinge about 0.36 rad plus hip hinge 0.32, heels up (foot pitch 0.20), slides/chop/backpedal lowered with the bob removed.
- Hair shells are thinner and taper into the hairline; faces are a soft eye-socket shadow, small dark almond eye, thin brow, nose shadow and a mouth line (no large whites); skin specular 0.28 with warm sheen; jersey has a mesh weave plus speckle on the atlas; AO is softer.
- LOD1/LOD2 are built from thin single-surface jersey/shorts with region-boundary and open-edge vertices pinned, so decimation no longer tears cloth. Triangles: LOD0 16.2k, LOD1 5.4k, LOD2 2.8k; lab-athlete.glb 1.25 MB.

Validators: `node scripts/athlete/validate_studio_athlete.mjs`, `tsx scripts/athlete/validate_studio_runtime.ts` (determinism after scrubbing 2.6e-16, one visible skinned mesh per athlete) and `validate_foot_planting.ts`.

Remaining: no cloth simulation; skin shading is a single material (no real SSS); hem fringe artifacts on some shorts at close range and a faint back-numeral ghost at the jersey side seam; faces have no expression; screens/fights are only as good as the single `screen_fight` loop; LOD2 loses the face.

## v2 revision (motion, footwork, materials)

Pipeline: `python3 scripts/athlete/build_studio_athlete.py` (bpy 5.x or `blender -b --python`), then the validators below. Motion lives in `scripts/athlete/motion_lib.py` (procedural IK/FK authoring, still no mocap or third-party motion). `preview_clips.py` renders CPU contact sheets, `shot_studio.mjs` / `shot_sequence.mjs` screenshot the dev route `/dev/athlete-studio`.

- Locomotion is **distance-driven**: each loop covers a known ground distance (`stride`, in the GLB's `asset.extras.CourtIQMotion`); planted feet fall backwards at exactly body speed. The runtime advances the cycle by ground distance / blended stride. Measured planted-foot ground speed in pure-clip regimes is 1-3% of body speed (`validate_foot_planting.ts` -> `lab-athlete-planting.json`); blends between two gaits and the ready-to-move transition still slide a little.
- Direction relative to facing selects forward / slide-left / slide-right / backpedal; speed selects walk-or-chop, jog, sprint, slow or fast (hop) slide. Weights are smoothed with a stored per-actor history, so rewinding to an already-played time restores the identical pose; unplayed jumps re-seed from absolute distance.
- Arms are a separate layer from legs/torso/head.
- Hands are curled once and baked into the bind pose (no finger tracks). Animation keys are reduced (<=0.02 deg / 0.2 mm error) and packed into one buffer view.
- Jersey has a front/back UV atlas; the runtime paints team colours, side stripes and numerals (`player.number`) on a canvas. Materials are `MeshPhysicalMaterial` (warm skin sheen, fabric sheen, glossy shoes).

| Clip | Mode | Intent |
| --- | --- | --- |
| `offense_ready` | time | soft knees, hands chest-high |
| `defense_ready` | time | low hips, wide base, one high / one low active hand |
| `receive` | time | catch-ready, hands up to shot pocket |
| `screen_plant` | time | wide braced base, arms folded |
| `screen_fight` | time | shoulder turn over a screen, tiny steps |
| `closeout` | time | in-place chop steps, high contest hand |
| `pivot`, `cut_plant` | time | pivot foot turn; plant-and-cut load |
| `chest_pass`, `skip_pass`, `shot_release`, `dribble` | time | two-hand passes, shot, live ball hand |
| `walk`, `jog`, `sprint` | distance | forward gaits (1.45 / 2.25 / 3.1 m per loop) |
| `defense_slide_left/right`, `defense_slide_fast_left/right` | distance | push-step slides (0.9 m) and hop-slides (1.5 m), feet never cross |
| `backpedal`, `chop` | distance | drop steps; low closeout chop steps |

(v2 sizes superseded by v3 above.)

Known limits: no secondary cloth motion; shorts hems are open tubes (thin sliver visible from below); faces are blank; cut_plant/screen_fight/skip_pass need the world to feed `pose: 'cut' | 'fight' | 'skip'`; slides above ~3.4 m/s skate slightly (cadence cap).

## v1 reference (original pipeline notes)

### Original pipeline

From repository root with Blender 4.3 and the web workspace's Node 22 dependencies:

```sh
blender -b -t 2 --python scripts/athlete/build_lab_human.py
blender -b -t 2 --python scripts/athlete/build_studio_athlete.py
node scripts/athlete/validate_studio_athlete.mjs
pnpm --filter @courtiq/web exec tsx --tsconfig tsconfig.json ../../scripts/athlete/validate_studio_runtime.ts
blender -b -t 2 --python scripts/athlete/render_studio_athlete.py
python3 scripts/athlete/create_review_sheet.py
```

The first stage produces the anatomical bind source. The studio stage authors garment and footwear meshes, transfers/normalizes skin weights, makes a tactical mesh, solves basketball controls in armature space, bakes local transforms at 24 fps, saves an editable `.blend`, exports glTF, then losslessly prunes transform channels identical to the exported node defaults and compacts unused buffers. It does not require Draco, a runtime decompressor, external textures or a special GPU. CPU reference rendering uses Cycles without denoising because the installed Blender build has no OpenImageDenoise.

Editable source: `scripts/athlete/source/lab-athlete-studio.blend`. `lab-athlete-build.json` records source triangle budgets, frame counts, authored ankle ranges and asset sizes. `lab-athlete-validation.json` records the independent Three.js glTF parse/deformation checks. `lab-athlete-runtime-validation.json` verifies ten native actors, exact pose repeatability after scrubbing, one shared skeleton per actor, private resource ownership and LOD switching. All reports are regenerated, not hand-maintained.

## Basketball actions and runtime ownership

| Action | Basketball intent |
| --- | --- |
| `offense_ready` | Soft knees, offered hands, quiet weight shift |
| `defense_ready` | Lower base, bent elbows, broad defensive hand position |
| `defense_slide_left` / `defense_slide_right` | Lateral push, stance travel and low recovery foot arc |
| `cut_run` | Opposed arm/leg action and forward trunk intent |
| `start_stop` | Short steps with lower loading/braking posture |
| `screen_plant` | Wide stable base and protected hands |
| `pivot` | Planted support with pelvis/chest turn and opposite-foot reposition |
| `receive` | Two-hand target in front of the chest |
| `chest_pass` | Chest load through two-hand extension |
| `shot_release` | Two-hand gather above the eyes through release extension |
| `dribble` | Ball-side hand descent/recovery with protection arm |
| `closeout` | High contest hand, second hand taking space |

The world engine owns player position, yaw, velocity, acceleration, collision, ball flight and decision timing. Every clip is in place: there is no animation-owned court translation or yaw. `labAthlete.ts` samples absolute simulation time and integrated ground-distance phase, blends ready/locomotion by speed, chooses slide direction in player space, and layers upper-body pass/catch/dribble/contest intent over lower-body locomotion. Passing while moving therefore keeps the running legs. The ball's actual sampled location drives a bounded wrist correction; dribble height and pass extension also determine their authored upper-body sampling point.

DCC contacts contain flat-sole stance intervals and low foot-recovery arcs. Cadence is calibrated to the engine's distance phase. A small presentation-root height correction grounds blended shoes. These are expressive animation controls, not a contact-force solver; foot planting under rapidly changing acceleration/turning is approximate. Wrist correction is capped at 16 degrees per joint iteration and never moves the basketball or changes catch evidence. Neither a rendered reach nor a pose deformation changes the analytical capsules or claimed pass/collision outcomes.

## Performance and resource ownership

The main GLB includes `LOD0_athlete` and `LOD1_athlete` on the same 65-bone hierarchy. Only one mesh level is visible. The tactical-only GLB is also supplied for future bandwidth-first loading. Seven material primitives provide skin, hair, kit, trim, shoe, sole and subtle eyes; no high-resolution textures are required. The runtime clones geometry/materials per actor for safe teardown, consolidates primitive skeleton palettes, and uses one animation mixer per player. It prunes unchanged rig tracks offline and evaluates only the weighted actions. The tactical mesh remaps tiny finger influences to the hand and omits jersey-number meshes in the runtime.

`setQuality('high' | 'low')` switches meshes without adding another mixer. The renderer can sample the rig at a lower frequency and skip it entirely once the separate analytical body is fully visible. The material fade and exact X-Ray geometry are renderer-owned.

## Validation and remaining limits

The native glTF validation script checks named actions, expected bones, normalized weights, joint bounds, representative deformed vertices, ankle ranges, loop continuity and absence of root-motion channels across 25 samples per action for both exports. Offline contact renders inspect ready defense, lateral slide, running, planted screen, pass extension and closeout; the labeled sheet is `scripts/athlete/review/lab-athlete-contact-sheet.png`.

This is a deliberate stylized anatomical athlete and a reusable first basketball motion library. Uniforms are skinned, not dynamically simulated fabric. Actions are authored illustration rather than sports motion capture; facial expression, articulated finger animation and contact-force-driven footwork remain future production passes. Camera-space and mobile frame-rate acceptance still require browser QA of the integrated world.

The final six-pose sheet received an independent visual re-review after the uniform fixes and was accepted as a tactical-silhouette checkpoint. Remaining art polish is explicit: a thin dark underside edge at the collar/short hems, a somewhat angular sleeveless shoulder transition, stronger bracing in the planted screen, and more forward intent in the running action. These do not change the passing/collision evidence. They remain production art work rather than a claim that this first reusable asset is a finished sports-game character.
