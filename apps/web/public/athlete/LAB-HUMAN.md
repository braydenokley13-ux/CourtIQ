# Anatomical Defense Lab athlete

Built 2026-10-05. `lab-human.glb` is a locally generated derivative of two CC0 assets. It is the anatomical bind-source intermediate for the Blender studio pipeline. Defense Lab now loads `lab-athlete.glb`; see `LAB-ATHLETE-STUDIO.md`. The legacy scenario renderer keeps its original mesh.

## Sources and rights

- **MakeHuman Community base mesh**, downloaded from https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj . The file header explicitly declares CC0 release in September 2020. The official license page https://static.makehumancommunity.org/about/license.html confirms all core assets are CC0. A copy is bundled at `scripts/athlete/source/makehuman-base.obj` for reproducibility. SHA-256: `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`.
- **Quaternius Universal Animation Library 2 female mannequin rig**, already bundled as `mannequin.glb`; see `ATTRIBUTION.md` and `LICENSE.txt`. CC0. Its 65-bone skeleton, node transforms and inverse-bind matrices are preserved unchanged in the new GLB.
- No third-party clothing, commercial sports-game assets, likeness scans or motion capture are included. Geometry adaptation, uniform color/cloth allowance, eye meshes and poses are locally authored presentation work.

## Rebuild

From repository root, with Blender 4.3:

`blender -b -t 2 --python scripts/athlete/build_lab_human.py`

The builder brings the anatomical base's A-pose into the audited donor T-pose, narrows the bind stance, adjusts the jersey silhouette, transfers donor skin weights with nearest polygon interpolation, and writes new mesh accessors into the unchanged original glTF rig. It prunes unused source buffers. Output: 13,380 vertices, 26,756 triangles, 984,116 bytes. Runtime adds eye geometry, team kit colors, cloth allowance and height variation.

## Scope and limits

This is an anatomical humanoid with visible facial structure, not a scanned or photorealistic athlete. Weight transfer is an approximation and must be inspected across the basketball poses. Current base body is gender-neutral; the product should not claim validated sex-specific anthropometry. Uniforms are locally shaped/tinted mesh regions, not simulated fabric. The animation and foot/hand adjustments are deterministic presentation, not measured biomechanics. Collision, timing and arrival evidence remain independent analytical geometry.

## Presentation adaptation after visual QA

The first transfer exposed an incorrect arm-warp region that included outer hip vertices. That region was corrected before acceptance; arm warping now excludes the hips. Hip adjustment blends smoothly, and the runtime does not apply the old mannequin's uniform normal inflation to this anatomical mesh. Uniform regions use clean rest-space jersey/shorts bounds rather than the donor's bone-region tint boundaries.

The Lab samples a deterministic presentation stance from model time, phase, speed, facing and velocity. Restored bind rotations feed explicit knee/ankle and elbow/wrist targets; feet retain level sole orientation. Defensive stance lowers the pelvis and separates the feet; movement advances opposite feet along the sampled movement direction. The ball-hand solver then points the hand toward the actual model ball. This is locally authored kinematic illustration, not motion capture or a biomechanical validation, and does not modify any simulation position or collision capsule.
