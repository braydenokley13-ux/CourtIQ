# CourtIQ basketball studio athlete

Built 2026-10-05 in Blender 4.3.2; motion/material revision v2 built 2026-10-06 with Blender 5.2.2 (`pip install bpy`). Defense Lab's normal-world players use `lab-athlete.glb`. This asset contains an anatomical skinned athlete, an authored practice uniform and basketball shoes, twenty-one reusable basketball actions (v2), and two mesh detail levels on one rig. The analytical representation is separate and is drawn from the simulation's body/reach geometry.

## Source and rights

- Anatomical base: MakeHuman Community's CC0 core base, bundled as `scripts/athlete/source/makehuman-base.obj`. Source: https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj . Core-asset license: https://static.makehumancommunity.org/about/license.html . SHA-256 `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`.
- Rig donor: Quaternius Universal Animation Library 2 CC0 mannequin, bundled as `mannequin.glb`; see `ATTRIBUTION.md` and `LICENSE.txt`. Its rest rig is imported into Blender before authoring. Blender exports the final node transforms and inverse-bind matrices together; the runtime does not retarget or reinterpret small Euler deltas.
- Local CourtIQ work: anatomical adaptation, sleeveless uniform pattern with a tailored shoulder yoke, contrast hems and waistband, shorts, sculpted shoe/sole/laces/sock geometry, scalp/eye treatment, materials, all thirteen basketball actions, LODs, optimization and runtime motion layering.
- No commercial sports-game geometry, logos, athlete likenesses, third-party clothing or motion capture are included. The basketball motion is locally authored kinematic animation, not captured or measured biomechanics.

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

Sizes: lab-athlete.glb 935,528 B (LOD0 13,868 tris / LOD1 4,575 tris, 65 bones, 8 material primitives, 21 clips); lab-athlete-tactical.glb 432,900 B (LOD1 only). Draco/meshopt are not used.

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
