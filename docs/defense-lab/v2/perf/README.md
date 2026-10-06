# CourtIQ world performance: tiers, instrumentation, benchmark

Founder gate: an excellent experience on a normal school laptop with integrated graphics (45-60 FPS in normal use),
exceptional on a MacBook Pro, and an architecture that can reach Chromebook-class later.

**Status: instrumented and tuned, NOT validated on real GPU hardware.** Every FPS number in this folder was captured
on a workspace with no GPU (Chromium + SwiftShader software GL, 4 shared CPUs). Those runs are valid for JavaScript
time, draw calls, triangles, memory, shader count, GC, long tasks and worker responsiveness. They are not valid for
frame rate. The "Real-hardware validation" section lists exactly what a human must run.

## Quality tiers

`components/courtiq/world/quality.ts` is the single source of truth. Tiers change only how the world is drawn, never
the simulation, frames or any basketball number.

| | HIGH | BALANCED | LOW-FALLBACK |
|---|---|---|---|
| Pixel ratio cap (also capped by devicePixelRatio) | 2.0 | 1.25 | 1.0 |
| Lowest render scale the controller may use | 0.85 | 0.70 | 0.55 |
| Key-light shadow | 2048 map, every frame | 1024 map, re-rendered every 2nd frame while playing (exact when paused) | off (contact shadows only) |
| Athlete detail (`labAthlete.setQuality`) | high | balanced (maps to `high` until the athlete module ships `balanced`; feature-detected) | low |
| Environment (`setEnvironmentQuality` when exported, else build option) | high | balanced (build option: high) | low (half-size textures) |
| Mark ring/disc segments | x1.0 | x0.75 | x0.5 |
| Ghost capsule geometry | 10 / 12x8 | 8 / 10x6 | 6 / 8x6 |
| MSAA (fixed at context creation) | on | on | off |
| Contact shadow texture | 64 px | 64 px | 32 px |
| Backdrop blur on UI glass | on | on | off (more opaque glass instead) |

Initial tier: software GL -> low; Apple Silicon or discrete NVIDIA/AMD -> high; integrated / mobile / unknown ->
balanced; <= 4 cores and <= 4 GB -> low (Chromebook-class). A short GPU warm-up (512x512 fragment workload, GPU timer
query when exposed, wall-clock otherwise; skipped on software GL) may move the start tier by at most one step.
`WARMUP_LIMITS` in quality.ts (1.5 ms / 9 ms) and the controller thresholds are **provisional**: they are reasonable
defaults, not calibrated. The bench records `probe.warmupMs` on every device so they can be calibrated.

Override: `?quality=high|balanced|low` (persisted in `localStorage['courtiq.quality']`), `?quality=auto` clears it,
and the `?debug` HUD has a selector. An override locks the tier; only the render scale still protects the frame rate.

### Adaptive controller (render scale first, then tier)

Fed one sample per consecutive rendered frame (real rAF interval, JS ms, GPU ms when the timer query exists). It
evaluates every 750 ms over a sliding window (>= 12 samples).

- Bad window: p50 interval > 21 ms, p95 > 34 ms, or GPU p50 > 14 ms. Two bad windows in a row -> degrade: render scale
  -0.15 down to the tier minimum, then drop a tier (if the frame is CPU-bound, JS p50 > 9 ms, the tier drops sooner
  because resolution will not help).
- Good window: p50 <= 18.8 ms, p95 <= 26 ms, GPU <= 9 ms. 8 good windows (about 6 s) -> scale +0.1. 24 good windows at the
  maximum scale -> try one tier up. A tier-up that fails immediately goes back down and blocks tier-up for 90 s, then
  180 s, up to 8x (no flapping). 1.5 s hold after every change. Idle gaps, tab hiding and resizes reset the window.
- Unit tests: `components/courtiq/world/quality.test.ts`.

## Instrumentation

- `?debug`: HUD with fps, frame p50/p95, JS ms per frame (mean, p95), GPU ms (timer query or "n/a"), draw calls,
  triangles, programs, textures, geometries, tier (auto/locked), scale, long tasks, last automatic change, tier selector.
  Contract: `WorldStats` in `world/types.ts`, emitted ~1 Hz via `onStats`. `WorldRuntime.stats()` reads it on demand.
- `?bench`: runs the fixed scenario on screen (entry -> run -> 4 X-Ray lenses -> fix + compare -> Break search ->
  Break replay; `&soak=N` repeats the possession N times) and shows a table plus Copy/Download JSON. Also
  `window.__courtiqBench`. `&nodraw` skips GPU work (JS pipeline only). `&uiclock=0` restores the old
  "React updates every frame" behaviour for A/B.
- `world/perf.ts`: ring buffers, GPU timer (`EXT_disjoint_timer_query_webgl2`), long-task observer, named segments,
  event-loop lag probe (shows whether workers block the UI). `WorldRuntime.sceneReport()` is a census of objects,
  triangles, materials and estimated GPU memory per scene group, included in the bench JSON.

## Running the benchmark

```
# anywhere (software GL, headless): JS time, draw calls, memory, workers. FPS is NOT meaningful.
node scripts/perf/bench.mjs --url http://localhost:3000

# on REAL hardware (headed Chrome, real GPU, real vsync): this is the run that decides pass/fail
node scripts/perf/bench.mjs --gpu --url https://<preview-or-prod-build> --quality auto
node scripts/perf/bench.mjs --gpu --quality balanced --dpr 2     # force a tier / emulate a retina panel
node scripts/perf/bench.mjs --gpu --soak 10 --trace              # leak check + GC per segment
```

Use a production build (`next build && next start`) for real numbers; a dev server ships unminified React and about
10x the JavaScript. Output goes to this folder: `bench-<label>.json` (everything) and `.md` (table).

No Node on the school laptop? Open `https://<host>/?bench` in Chrome, wait about 90 s, and use "Copy results (JSON)".
That path has no CDP main-thread-busy numbers but has everything else.

## What "pass" means

Per playback segment (run, each X-Ray lens, compare, Break replay), on a real GPU:

| tier | frame rate | frame time | 
|---|---|---|
| BALANCED on an ordinary integrated-GPU laptop (the gate) | p50 >= 45 FPS | p95 frame interval < 33 ms |
| HIGH on a strong MacBook Pro | p50 >= 55 FPS (display refresh bound) | p95 < 25 ms |
| LOW-FALLBACK on Chromebook-class | p50 >= 30 FPS | p95 < 50 ms |

Also required on any device: no segment where the controller is still degrading at the end; fix and Break searches
leave UI timer lag p95 < 50 ms and max < 250 ms (the workers must not block rendering); soak runs show flat
geometries / textures / programs and JS heap growth under 5 MB per iteration after GC; no long task over 200 ms during
playback; first X-Ray / Compare use causes no hitch over 100 ms.

The bench computes the first rule automatically (`verdict`); it reports "NOT A VALID FPS TEST" on software GL or `nodraw`.

## What was measured here (software GL, production build, 840x472, 4 shared CPUs)

Raw: `bench-prod-*.json`, `.md`. FPS values are meaningless and deliberately not quoted as results.

| Finding | Number |
|---|---|
| React re-renders per second during playback | was one per animation frame by construction; now about 11/s (45 commits in 4 s against 57 rAF/s) |
| Main-thread busy time per frame, JS pipeline only (`nodraw`), before -> after the clock fix | run 4.2 -> 3.0 ms, X-Ray lenses 5.2 / 3.7 / 8.8 / 3.2 -> 3.0 / 3.3 / 3.4 / 3.5 ms, compare 4.2 -> 3.5 ms, Break replay 3.1 -> 2.2 ms |
| Non-runtime JS (React + app) per frame, same A/B | X-Ray 1.4 / 1.0 / 1.2 / 0.9 -> 0.4 / 0.5 / 0.6 / 0.6 ms |
| Same, dev build profile (React in dev mode) | react-dom 4.1 -> 0.85 ms per frame |
| Runtime JS per rendered frame (p50 / p95), `nodraw` | 1.0-1.7 / 1.7-4.2 ms |
| Draw calls | 32 idle, 40 playing, 101 with the X-Ray ownership lens, 126 peak; (frame-to-frame counts from `renderer.info`) |
| Triangles | 84k low tier; 223-228k balanced (10 athletes x 17k because `balanced` currently falls back to the 16.5k-triangle high mesh) |
| Scene census (balanced) | athletes 710 objects (71 bones each) / 170k tris, environment 43k tris, marks 2k; 88 materials, 30 textures; est. GPU memory 76 MB textures + 24 MB PMREM + 9 MB geometry + 4 MB shadow map |
| Shader programs | 33 after exercising every lens, compare and break |
| First-use shader compile hitch (software GL) | opening each X-Ray lens first time blocked the main thread 4.7-5.1 s (program count rose 21 -> 29 and mark materials freed their programs on disposal); after pre-warm the program count is flat at 33 and X-Ray JS p95 is 15-22 ms, longest task 61 ms. Real GPUs hitch far less, but compiles are still synchronous without parallel-compile support |
| Open issue: first Compare under software GL | one runtime tick of about 5.2 s in `compare-run` (reproduced in 3 of 3 draw runs, absent in `nodraw`). Program count is flat, so it is not shader compilation; most likely software-rasterizer back-pressure from the additive hologram overdraw. Undetermined; check `compare-run` max JS ms and long tasks on real hardware before trusting this |
| Backdrop blur (14 `backdrop-filter` layers over the canvas) | software compositing, 1280x720: 34 -> 45 rAF/s with blur removed. Real-GPU effect unknown; LOW tier removes it |
| Worker latency | fix search 1.0-2.3 s, Break search 2.1-2.9 s wall; UI timer lag p95 3-17 ms, max 60-190 ms (the max is the result-handling commit, not the search) |
| Soak (3 repeats) | heap after GC 54.8 -> 55.1 MB; geometries 140, textures 49, programs 33 constant: no leak seen (3 iterations is short; run `--soak 10+` on hardware) |
| Allocation churn (Chrome trace) | pure playback 0.5-0.8 MB/s freed by minor GC; run/compare segments about 10-12 MB/s (simulate + analysis + results, not per-frame rendering); about 2 % of time in GC |
| Load | `/` First Load JS 311 kB; 3D chunks (three + runtime) about 0.8 MB raw / 210 kB gzip, lazy; GLBs 758 kB transferred |
| GPU timer | SwiftShader exposes the extension (values around 1.1-2.2 s per frame: software time, only useful as a smoke test of the plumbing) |

## Fixes made (behaviour identical)

- Playback clock no longer re-renders the whole React shell every frame: the world reads the clock from a ref through
  `WorldScene.live`; React state updates at 80 ms (and exactly at stops, seeks and pause). Same for the ambient entry
  loop and the Teach loop. Marks that depend on the frame (lens classification, reach radius) are therefore sampled at
  12.5 Hz while playing; anything anchored to a player moves every frame.
- Analytical environment blend ran every frame (walks every tintable material, allocates colours): now only when the
  X-Ray amount changes.
- Label layer: `querySelectorAll` + `dataset` parsing + a layout read (`clientWidth`) every frame replaced by a
  MutationObserver cache, cached viewport size, `Vector3` reuse, and skipping identical style writes.
- `poseIntent` allocated (`filter().sort()`) per defender per frame; ghost body loop allocated 5+ vectors per capsule.
- Contact shadows: 10 meshes + 10 materials -> one `InstancedMesh` (9 fewer draw calls).
- Contact shadow texture leaked one `CanvasTexture` per athlete rebuild.
- Shadow map re-rendered only when something moved (existed) and, on BALANCED, every 2nd frame while playing.
- Shader pre-warm: one of every mark kind plus the hologram material is compiled at start-up with `compileAsync`
  and kept hidden, so the first X-Ray / Compare does not stall.
- Frustum culling was already on for athletes and environment; ghost and marks disable it deliberately (instanced /
  screen-sized). `shadowMap.autoUpdate = false` plus explicit `needsUpdate` was already in place.

## Recommendations (not done: other owners or higher risk)

1. **meshopt for GLBs (measured with gltfpack `-cc`, copies only, nothing in `public/` was touched):**
   `lab-athlete.glb` 1161 -> 347 KB (gzip 612 -> 181 KB), `lab-athlete-tactical.glb` 600 -> 216 KB, `courtiq-hoop.glb`
   280 -> 58 KB, `courtiq-bench.glb` 194 -> 38 KB; about 2.2 MB -> 0.66 MB raw. Needs `MeshoptDecoder` from
   `three/examples/jsm/libs/meshopt_decoder.module.js` on the GLTFLoaders and a visual check of quantised bones/animation.
   Athlete owner to apply; Draco is not needed.
2. **KTX2:** the GLBs carry no image textures. The big textures (2048 court albedo/roughness, about 76 MB estimated
   GPU memory) are drawn into canvases at start-up. Baking the court to KTX2 (UASTC/ETC1S) offline would cut GPU
   memory 4-8x and start-up main-thread time; needs a build step and the Basis transcoder.
3. **Athlete LOD:** BALANCED should use the 5.6k-triangle mid mesh that already exists in `lab-athlete.glb` (10 x 17k ->
   10 x 5.6k saves about 115k triangles); skeleton/animation LOD (65 joints x 10 athletes = 710 objects updated every frame)
   for far or low-tier athletes, e.g. half-rate updates for athletes far from the camera.
4. **Instancing:** marks are individual meshes (about 46 meshes with 3 lenses); batching rings/discs into instanced
   meshes is the next draw-call cut after athletes. Not worth it before real-GPU numbers show draw calls matter.
5. **Worker separation:** explore and Break searches already run in workers and do not block the UI. `simulate`
   (25-40 ms) still runs on the main thread on every config change; moving it to a worker is possible but changes the
   replay-cache flow. Only worth it if hardware runs show long tasks around "change the answer".
6. **WebGPU:** not switched. `three/webgpu` exists in r184 with a WebGL2 fallback backend, but the athlete rim effect
   injects GLSL with `onBeforeCompile` (and the hologram uses a GLSL `ShaderMaterial`), which `WebGPURenderer` does not
   support: it needs a TSL port. With about 100 draw calls and no compute workload, WebGPU's CPU-overhead benefits are
   small for this scene. Revisit after real-GPU data shows driver overhead, not fill rate, is the limit.
7. **Backdrop blur:** if real-GPU runs show compositor cost on integrated GPUs, drop `backdrop-filter` on BALANCED too
   (one CSS rule on `[data-quality]`).

## Real-hardware validation still required

None of the following could be done here (no GPU):

1. `node scripts/perf/bench.mjs --gpu --quality auto` on (a) a school-class integrated-GPU laptop, (b) a MacBook
   Pro, (c) a Chromebook-class device if available; keep the JSON and attach it to the sprint.
2. Confirm the pass table above per tier; record `probe.renderer`, `probe.warmupMs`, the initial tier the probe chose
   and every automatic tier change (`change` in the HUD / `lastChange` in the JSON).
3. Calibrate `WARMUP_LIMITS`, the initial-tier heuristics and the controller thresholds from those runs.
4. Check whether `EXT_disjoint_timer_query_webgl2` is exposed on each browser (HUD shows "gpu n/a" otherwise); the
   controller works without it.
5. Visual comparison HIGH vs BALANCED vs LOW on one scene (shadows, athlete detail, marks) to confirm the look gap is
   acceptable, and that nothing basketball-relevant differs between tiers.
6. Longer soak (`--soak 20`) for memory growth, and a 30-minute real session.
7. Real-GPU effect of backdrop blur, 2048 vs 1024 shadows, MSAA and DPR 2 on integrated graphics.

## Files in this folder

- `bench-prod-nodraw-uiclock0.*` / `bench-prod-nodraw-uiclock80.*`: A/B of the React playback clock (old behaviour vs fix), JS pipeline only.
- `bench-prod-swiftshader-balanced.*`: full draw run before the shader pre-warm (shows the 5 s first-use compile hitches).
- `bench-prod-swiftshader-balanced-r2.*`, `...-final.*`: after pre-warm (final also includes the hologram warm-up). `r2` has the GC trace and soak.
- All are software GL on 4 shared CPUs and were run while other jobs loaded the machine: treat single numbers as indicative.
