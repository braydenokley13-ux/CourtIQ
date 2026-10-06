# CourtIQ runtime-performance verification protocol

Status: a measurement protocol, not a benchmark result. No physical-hardware run has been performed in this cloud session. The existing screenshots and functional checks used Chromium with SwiftShader. The founder's requirement is a rich basketball world usable on ordinary high-school coaches' computers.

## Test environments and reproducibility

Use a production build and the same commit, asset set, seeded configuration and browser viewport for comparisons. Record OS, CPU, GPU, RAM, browser/version, screen resolution, CSS viewport, device-pixel ratio, display refresh rate, power state, browser extensions, quality tier, render scale and whether the GPU renderer reports software fallback. Keep the tab visible, close unrelated workloads and record the thermal/power conditions. Test at least a modest Windows integrated-GPU laptop and a mainstream Apple integrated-GPU laptop when those devices are available; do not infer either device's results from the cloud.

A useful initial matrix is an 8 GB Intel integrated-GPU coach laptop at 1280×800 and an 8 GB Apple M1-class laptop at the same CSS size. A higher-density display is an additional test because pixel count changes GPU cost. Mobile fit and touch behavior are separate from a desktop laptop performance claim. Record available devices precisely; these examples are proposed coverage, not devices owned or measured here.

Run a cold-load pass, a warm-cache pass, then three warm repetitions of each active workload. Keep startup/download, shader/asset warmup, steady playback and attack search as separate measurements. Report each repetition and a summary rather than cherry-picking one favorable frame.

## Workloads

1. Normal world, frozen and idle for 30 s, with no controls being manipulated. Check that an unchanged scene does not keep submitting expensive draws or regenerating shadows.
2. Normal full-possession playback, repeated for 30 s at the same seed and camera. Include possession changes, pass/catch, athletes' starts/stops and camera orbit.
3. Porcelain X-ray playback and spectral X-ray playback at the same clock, role and layer. Test responsibilities, windows/ball flight, recovery and body/reach views. Record transition cost independently from settled cost.
4. Break Mode search with sampled route streaming. Measure start-to-first-completed-preview and start-to-search-complete, plus interaction during worker pressure. Then measure selected route emphasis, actual replay and exact freeze.
5. Paired comparison with old and revised defensive worlds. Measure synchronized playback, ghost updates and the information shown at the causal divergence.
6. Repeated lifecycle loop: open, toggle X-ray/style, search/cancel, search/exit during dwell, replay, select/move a defender, compare, save/Teach/return, reset. Repeat ten times and inspect retained resources and memory trend.
7. Narrow viewport and lower-quality fallback. Verify that adaptation preserves the same simulation, seed, witness and saved answer. A quality reduction must not alter tactical evidence.

## Measurements and what they establish

| Measurement | Method and interpretation |
| --- | --- |
| First meaningful world | Navigation start to local athlete asset ready and a genuinely rendered inspectable scene. Confirm with a screenshot. Report shell readiness separately. |
| Rendered-frame cadence | Count real application render submissions/presentations over the active workload, using an opt-in lightweight render timestamp/counter or Chrome frame trace. Compute p50/p95/p99 intervals and the proportion exceeding 50 ms. |
| RAF cadence | Collect requestAnimationFrame intervals separately. This describes callback scheduling and responsiveness; it is not automatically rendered-frame cadence. |
| Main-thread stalls | Chrome performance trace and Long Tasks observer. Report stall count, maximum duration and overlap with interaction or asset/search completion. |
| Input response | User action event to the next meaningful visible state: selection, floor target, pause, cancel or phase change. Use event/trace timing and verify the resulting UI. Avoid measuring only the automation round trip. |
| Search time | Start request to first actual preview and final actual report. Record candidate/replay budget and worker use. Include unresolved or canceled runs rather than dropping them. |
| Draw/resource work | Record renderer draw calls, triangles, geometries, textures and active/skinned athlete counts at each workload. State quality tier and actual render scale. |
| Memory/resource lifecycle | Compare retained renderer resources after identical reset cycles. Browser memory APIs are environment-dependent; distinguish JS heap from GPU/driver allocations. A forced-GC diagnostic differs from ordinary user behavior. |
| Asset/startup cost | Transferred bytes, decoded asset size, parse/upload warmup and required requests. Separate local-cache results from realistic network delivery. |

The current world checks for updates on requestAnimationFrame and submits a draw while playback, camera motion, analytical transitions or changed scene state require one. It skips draws for an unchanged idle scene; it has no fixed 32 ms playback cap. Reporting RAF p50 of 16.7 ms as “CourtIQ runs at 60 fps” would be wrong. A draw-submission timestamp still measures CPU scheduling/submission, not asynchronous GPU completion; a Chrome frame/GPU trace helps assess presentation and GPU pressure. The synchronous duration of `renderer.render` alone cannot certify GPU headroom.

For active workloads, retain both actual frame intervals and the quality/render-scale history. Adaptive quality should use sustained observed cost with hysteresis, cover Normal/X-ray/Break/comparison, and recover only after a substantially longer fast period. Check whether it responds to GPU-bound workloads as well as CPU pose/skinning work. Track mobile and software-renderer floors explicitly. Independent tactical outputs must remain byte-for-byte deterministic under different render quality and display rates.

## Proposed product targets

These are initial engineering acceptance targets to review against real devices; no current result is claimed. Aim for steady 30 fps during possession playback on the modest laptop class, with p95 rendered-frame interval at or below 50 ms and no repeated long freezes. Aim for p95 meaningful selection/pause/cancel response below 200 ms while a search runs. A frozen unchanged world should avoid sustained heavy draw submission. Successful reset/cancel cycles should plateau in retained geometry/texture/worker resources. Startup targets should be chosen after recording a realistic asset/download budget rather than assuming local cloud loading represents a school connection.

A search can take longer than one possession while remaining useful if it streams honest completed work and keeps controls responsive. Always report its actual bounded budget, first-preview time and completion time. Keep cancellation and input responsiveness as acceptance criteria instead of optimizing only total search throughput.

## Cloud SwiftShader evidence

Cloud measurements can verify deterministic replay, worker behavior, exact freeze timing, preview delivery, cancellation, UI responsiveness under software contention, fallback and error-free loading. They can reveal an avoidable main-thread loop or lifecycle leak. Label those runs with the detected software renderer, viewport and render scale. Do not translate software-renderer fps or CPU submission timings into claims about a coach's integrated GPU. The next founder checkpoint should include a clear separation between implemented performance architecture, cloud functional evidence and any actual physical-device measurements.

## Renderer diagnostics and benchmark

Open `/?debug` for the current performance HUD. It reports rendered-frame p50/p95 intervals, synchronous JavaScript work, GPU time when the browser exposes timer queries, draw calls, triangles, resources, render scale, long-task count, quality tier and software-renderer detection. Its quality selector persists a manual override; return it to `auto` when checking adaptation. The HUD is a live summary and does not expose a global snapshot API.

Open `/?bench` for the automated scenario, or run `node scripts/perf/bench.mjs --gpu --url <production-origin> --label <device-run>` on the measured laptop. The scenario exercises entry, normal playback, four X-ray lenses, fix comparison, Break search and Break replay. It exposes completion and structured results through `window.__courtiqBench` (`done`, `result`, optional `error`); the script writes JSON and a Markdown table. Results include named segment intervals and CPU/GPU measurements, worker latency, event-loop lag, transfer sizes and optional `--soak <n>` resource samples. Add `--trace` to capture a Chrome trace with measurement overhead recorded. Record screenshots and the environment details alongside these artifacts.

Frame intervals are measured between actual render submissions. Sampling restarts after idle, and gaps over 500 ms are excluded from interval percentiles, so trace stalls and input response separately. RAF cadence and a complete quality-switch history require additional trace or observation; the segment result records its final tier and scale. The adaptive controller uses active rendered-frame intervals, JavaScript cost and available GPU timing with slower recovery. Verify its behavior on physical hardware. `?bench&nodraw` measures the JavaScript pipeline without draw work, and software-GL or nodraw runs cannot pass the harness's hardware verdict. That verdict currently checks p50 at least 45 fps and p95 interval below 33 ms; it is a separate, stricter check from the proposed product targets above.
