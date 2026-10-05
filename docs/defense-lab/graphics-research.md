# Defense Lab graphics decision

Research and source inspection: 2026-10-05. This decision precedes the new renderer implementation.

## Decision

Build a new, independent Three.js renderer around immutable Defense Lab engine frames. Reuse the locally bundled, commercially redistributable Quaternius humanoid asset and its audited loader/material/retargeted-pose helpers. Do not reuse the legacy scenario runtime or make visible geometry the collision authority. The world should be a warm, bright practice gym with a real 50 × 47 ft half court, modest varnish response, soft directional shadows, a regulation-height basket, ten articulated players, and a ball whose owner/flight comes exclusively from the engine.

Use the existing imperative Three dependency rather than coupling the model to React Three Fiber. React owns the UI; the new scene owns GPU resources, camera input, raycasting and rendering. A mutable props ref supplies the latest immutable frame without rebuilding the scene. Time-dependent pose is sampled from frame time, not wall-clock delta, so scrub and repeat produce identical body poses. Orbit/pan/zoom and camera transitions do not influence the simulation.

## Inspected substrate and evidence

- `apps/web/public/athlete/mannequin.glb`: actual binary audit reports **1,442,824 bytes, 25,636 total vertices across two primitives, 14,612 triangles, 65 skin joints, zero embedded animations**. Existing attribution reports 10,070 vertices and one primitive; that is not an accurate count of the full bundled file. At ten athletes the base meshes cost about 146k triangles and 20 mesh draws before shadows. This is a reasonable desktop scene but not the tiny one-draw 800-triangle procedural budget described elsewhere.
- `apps/web/public/athlete/ATTRIBUTION.md` and `LICENSE.txt`: Quaternius Universal Animation Library 2 female mannequin, CC0 1.0, commercial redistribution allowed. `V4_PROVENANCE.md` records that previous premium court/kit improvements were code-generated, not a premium basketball character replacement.
- `components/scenario3d/glbAthlete.ts`: usable asynchronous cached asset loader, SkeletonUtils clone, feet alignment, bone-region vertex tint, six internally authored basketball-readable clips, audited bind-relative bone rotations, clip/root-motion separation and player handle. Its stale header says static-only; implementation creates an AnimationMixer and pose library. Reuse implementation with deterministic absolute time sampling rather than trusting the stale summary.
- `skinnedAthlete.ts`: 11-bone, ≤800-triangle internally generated humanoid. Good cold-load/degraded fallback, but its silhouette cannot meet the requested final visual quality alone.
- Imported `closeout.glb` and `back_cut.glb`: legal CC0 clips extracted from shield dash and ninja jump motions; legal does not mean semantically authentic basketball motion. The new scene will prefer the authored basketball poses, not present these as basketball motion capture.
- Attached SEAM III: analytical body/passing geometry is independent of its raw WebGL renderer. Preserve that boundary. Its renderer contains locally generated maple texture, instanced geometry, shadow depth pass, floor reflection pass, camera presets, deterministic court/ball textures and ray/ground manipulation. Reuse the ideas and court dimensions; avoid transplanting its low-level renderer into a Next application that already ships maintained Three tooling.

## External asset investigation

Fetched the official Quaternius pack pages on 2026-10-05:

- [Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html): explicitly labels CC0 and free personal/educational/commercial use. Confirms bundled asset's source and license.
- [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html): also CC0; potentially better body variations, but swapping requires inspecting the actual rig, garment geometry, cold-load cost and retarget compatibility. A catalog thumbnail alone is not evidence of a better basketball athlete.
- [Ultimate Modular Characters](https://quaternius.com/packs/ultimatemodularcharacters.html): CC0, modular stylized humans with Google Drive download. Could support future roster diversity, but an unverified pack is not a production-ready asset improvement.

No unlicensed sports-game meshes, NBA likenesses, real-team branding or proprietary mocap will be redistributed. No Mixamo asset is being added: the official Adobe URL tested returned 404, and commercial use permission would not itself establish public asset redistribution permission. The local verified asset is a stronger V1 shipping choice than silently importing a model with unclear provenance.

Three source references checked: [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html). Existing dependency is Three 0.184. Renderer uses explicit color management, ACES tone mapping, hardware antialiasing, controlled device pixel ratio and PCF shadows. Floor specular response comes from physical materials/environment lighting, not bloom.

## Planned presentation and interactions

- Broadcast is default: frame the five-on-five half court from a sideline diagonal, basket visibly behind the action, no abrupt chase camera.
- Overhead reveals spacing; baseline reveals depth; selected defender POV exposes ball-side/weak-side responsibility. Orbit camera supports left-drag, pan supports right-drag, scroll/pinch zoom.
- Player picking uses invisible selection volume around the actual player. Visible labels are small team/player numbers; detailed role information stays in the UI selection panel.
- Frozen defender drag raycasts to the court. It shows a target preview and emits a timestamped causal command only on pointer release. The renderer does not teleport or rewrite player history.
- X-ray default layer: current responsibility links. Other layers show the current passing window/reach or future recovery path, one concept at a time. Window geometry and labels are engine-derived; no renderer-authored analytics.
- Before/after ghost positions consume a separate baseline snapshot at the same simulation time. Ghosts never enter analytical geometry.
- Ball rotates visually, but position/ownership/flight always comes from the sampled engine state. Held/dribbling ball posture and release/catch accents follow model events.

## Performance/fallback contract

- Show the court promptly while the 1.44 MB local rig loads once; fallback athletes remain readable during load/failure.
- Ten athletes share source and clip data, have independent cloned skeletons, and use deterministic animation sampling. Static gym geometry/textures are built once per mount. Avoid allocating meshes per frame.
- Start at DPR ≤1.6, 2048 shadow map on normal desktop; compact/mobile or software devices reduce DPR/shadow quality. Rendering runs while moving or manipulating; stop wasteful animation work in background tabs.
- ResizeObserver tracks container dimensions. Dispose owned geometry/material/texture/mixer resources and listeners on unmount without disposing the shared loaded source GLB.
- If WebGL initialization or context restoration fails, provide an interactive SVG half court from the same model frame. Playback, selection and teaching remain available.

## Honest V1 quality limits

The new world includes a small presentation-only arm CCD solver to point the wrist toward the actual sampled ball during dribble/catch/pass; it does not alter analytical release or collision geometry, and is not a validated biomechanical hand-contact model.

The existing mannequin is a stylized humanoid, not a scanned basketball athlete. Internally authored rig motion can communicate low stance, shuffle, screen, roll, turn and pass; it cannot claim photorealistic face detail, validated foot-contact IK, cloth simulation, mocap-grade acceleration or validated ball/hand inverse kinematics. Render realism should improve through court scale, materials, light, grounded posture and camera rather than hiding asset limitations behind effects. A later commissioned licensed athletic character/animation package is the appropriate route to sports-game character quality. This V1 separates that replaceable presentation layer from model correctness.

## World-first revision and anatomical asset (2026-10-05)

The later product reset supersedes the initial mannequin decision above. Investigation found a usable, explicitly CC0 **MakeHuman core anatomical mesh**, and Blender 4.3 was already available. We built and bundled a new 984 KB, 13,380-vertex anatomical player with real face topology. The existing Quaternius rig hierarchy and inverse-bind matrices are retained exactly, so the existing deterministic animation library remains applicable. MakeHuman's A-pose is brought into the donor T-pose, the stance is narrowed, and donor weights are transferred by nearest polygon interpolation. A backward-compatible optional source-scene seam lets only Defense Lab use the replacement. Source, reproducible builder, source hashes and licensing are in `scripts/athlete/` and `apps/web/public/athlete/LAB-HUMAN.md`.

The world revision also removes permanent player floor discs, keeps badges contextual, lowers the broadcast view, extends maple flooring through the gym, adds wall-pad/masonry/bench detail, and improves directional shadows and varnish. Anatomical players get team-matching shorts, simple cloth allowance/trim, spine-attached jersey numbers, head-attached eyes, and cropped hair. Approximate ankle grounding follows the sampled pose; animated root movement never enters analytical geometry. These are anatomical real-time athletes, not photoreal scans or validated biomechanics.

Passing-window colors now call the same `isThreatOpen` predicate used by computed analytics, including influence and arrival opportunity. Chest-height passing corridors and ground-level drive corridors are explanatory volumes; their drawn width is not a clearance proof. Exact body X-ray still uses the engine's capsules. Comparison ghosts consume the baseline's own pose at the shared timestamp. Optional projected anchors emit CSS-pixel head/foot/threat locations with deduplication and a 32 ms cap. Optional committed movement cues remain on the floor while paused as a ring/dashed line; they do not teleport players.

Structural checks: unchanged original rig nodes and inverse binds, normalized skin weights, finite vertices, valid joint/index ranges, exact 1.808 m rest height. Browser visual verification remains a separate gate; structural checks alone do not validate the transferred deformation quality.
