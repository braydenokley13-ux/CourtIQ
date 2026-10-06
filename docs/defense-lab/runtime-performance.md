# Basketball execution and runtime budget

Recorded 2026-10-05. This is a measured CPU implementation checkpoint, with a
remaining physical-device gate. The browser renderer and asset pipeline have
their own quality budgets. These CPU results do not establish laptop frame rate.

## Implemented runtime contract

The default deterministic motion clock is 40 Hz (`dt = 0.025`), independent of
display frame rate. A 5.8-second possession retains 233 frames of ten players.
The validated clock can range from 20 to 100 Hz; the horizon is at most 12
seconds. Rendering interpolates executed neighboring states with `frameAt` and
never advances the simulation. Exact stored clock ticks preserve discrete
reads, possession, responsibility and intervention evidence.

Movement keeps momentum: velocity changes are bounded by acceleration, capped
speed and player capability. Desired velocity includes braking distance. The
bounded avoidance search evaluates fifteen candidate velocities against three
short lookahead distances. It rejects distant pairs using squared distance
before computing a norm. Twelve angular search directions are computed once;
one run-local 30-value `Float64Array` holds the candidates for all players and
receiver previews. No candidate storage enters retained snapshots.

Facing now changes once per motion tick. Defenders face the executed ball while
their velocity may slide laterally; offense faces movement, and a receiving
player anticipates the approaching ball. Wrapped yaw change obeys `turnRate ×
dt`. The previous movement-facing plus ball-facing double turn exceeded that
declared bound.

Launched pass and shot endpoints stay fixed. Ball positions use the same
gravity/arc function for execution, display, launch preview and evidence. Each
motion interval checks articulated defensive body envelopes at intervals of at
most 5 ms, with at most eleven probes for a supported 50 ms step. Conservative
horizontal/vertical bounds reject bodies before building their capsules. The
first 5 ms after release is the explicit release-probe exclusion. All remaining
flight time, including late shot arc and the landing point, is checked.

An intersection ends possession execution at the first observed body witness.
`diagnostics.flightStops` records the launch identity, time, player, body part,
ball position, body witness and clearance. The ball freezes there; later policy
activations, reads, catches and shots do not execute. The contact is unresolved:
the engine does not infer a deflection, turnover, foul or completed catch.
Interpolated display also stops at that witness between motion ticks. Analysis
audits only the executed portion and retains the planned endpoint separately.
Synthetic or legacy histories that continue through contact remain conditional.

Catch support is one authored receiving envelope, shared by the execution
decision and its warnings. Height scales arm reach. Facing gives a smaller
supported reach behind the torso. Hand height and the executed jump position
bound supported ball height. The envelope is an elliptical horizontal reach
with lateral radius `0.38 × height + 0.35 × bodyRadius`, forward radius
`0.42 × height + 0.5 × bodyRadius`, and rear radius
`0.24 × height + 0.5 × bodyRadius`. Its height bounds are
`jump + 0.35 × height − ballRadius` and
`jump + height × (0.8 + 0.22 × hands) + ballRadius`.
These are inspectable authored approximations, not calibrated completion odds
or measured biomechanics. A missed support check stops possession and records
`missedCatchCount` plus a `missed-catch` event. `maxCatchError` remains a measured
horizontal offset, not an unrelated fixed acceptance threshold.

Hot-clock history uses explicit copies of physical fields, poses, option
targets, responsibility targets, launch endpoints and activation evidence.
JSON remains the portable authoring/export format; it is no longer used to
serialize every motion snapshot. Independent snapshot mutation tests protect
history from contamination.

The optional UI replay cache (`simulateCached`) retains at most three exact
worlds and 800 aggregate frames, evicting least-recently-used worlds. Full
configuration, engine version and problem version are in the key. Cached
histories are deeply frozen. An oversized replay bypasses retention. The pure
uncached simulator remains available to callers needing private mutable results
and to bounded attack search. A timed rule change creates a different replay;
earlier physical history remains equal under the normal causal-prefix tests.

Break search stays in its existing asynchronous worker. Its default budget is
28 replays, with a hard maximum of 40; it keeps at most eight preview paths and
uses the executed candidate history. Worker cancellation/progress and fallback
yielding are separate from draw-frame animation. Main-thread fallback yields
between complete replays, so it cannot guarantee a sub-50 ms task on every
device or the maximum 100 Hz/12-second configuration.

## CPU evidence

Host: managed Linux x64 executor, Node 22.23.3, AMD EPYC 9V74. The original
comparison script used three warmups, twenty simulation/analysis samples,
1,000 interpolation samples and three search samples. The committed harness
uses thirty simulation/analysis samples, 1,000 interpolation/cache samples and
five search samples. Search p95 with this small sample is the slowest recorded
run. These are cloud observations, not normal-coach-laptop certification.

| Operation | Before median / p95 | After median / p95 |
| --- | --- | --- |
| Default 233-frame replay | 72.27 / 96.11 ms | 18.57 / 22.65 ms |
| Replay analysis | 5.16 / 7.10 ms | 6.88 / 7.81 ms |
| 28-replay attack | 2308.43 / 2345.52 ms | 734.11 / 753.50 ms |
| One interpolated display frame | 0.0035 / 0.0044 ms | 0.0041 / 0.0054 ms |
| Exact cached replay | — | 0.0039 / 0.0047 ms |

The original Node CPU profile attributed 48.4% of samples to `advance` and 11.3%
to garbage collection. This supported optimizing repeated avoidance norms,
candidate allocations and snapshot serialization. Analysis now checks the full
shot arc rather than only the first 200 ms; its additional work is visible in
the measurements. A default replay serializes to 1,495,317 bytes, which is a
transport-size observation, not a claim about JS heap size.

A second run during parallel production work recorded default simulation
32.99 / 57.75 ms, analysis 10.35 / 28.94 ms and search 1442.31 / 1988.54 ms
(median / p95). Structured-cloning one complete replay measured
17.44 / 35.74 ms in that run. Both runs are retained in
`runtime-cpu-checkpoint.json`; the variation is why the first table is a
checkpoint observation rather than a guaranteed latency. Worker transport is
a separate measured optimization candidate, especially for multiple retained
worlds. Packed transferable snapshots require evidence from the actual browser
before changing the public replay contract.

The genuine default tag experiment remains unchanged by these fixes: deep tag
reads `lift → corner → drive`, while a shallow-tag cue at 0.75 s reads
`roll → drive`. The measured lift opening closes by 0.10 s and the roller
opening grows by 0.15 s. These values come from committed histories, not forced
comparison constants.

Reproduce the workload from the repository root:

```bash
source /workspace/.courtiq-env/activate.sh
pnpm exec tsx scripts/profile-defense-lab.ts
```

For Node CPU samples, use the same workload rather than profiling the dev
server's compiler:

```bash
source /workspace/.courtiq-env/activate.sh
node --cpu-prof --cpu-prof-dir=/tmp --import tsx scripts/profile-defense-lab.ts
```

The harness also measures structured-clone cost separately, which helps decide
whether future packed transferable snapshots would actually improve worker
transport. WASM and WebGPU are not introduced for this ten-player workload;
neither is needed to remove the measured JavaScript hot-loop cost.

## Normal-hardware acceptance protocol

Before claiming the coach-laptop target, run a production build on physical
integrated-graphics devices: an 8 GB Windows laptop with Intel UHD-class
graphics, an 8 GB M1 MacBook Air, and a school Chromebook with supported WebGL2.
Record exact hardware, browser, device pixel ratio, canvas size, graphics
quality and power mode. Dev-server/SwiftShader captures remain visual evidence
and must not be reported as physical GPU benchmarks.

After a warmup, measure thirty seconds each of normal possession, X-Ray,
comparison ghosts, paused manipulation and Break search. Record p50/p95 frame
time, dropped frames, long tasks, renderer calls/triangles, cache bounds, worker
time, worker transport time, loaded asset bytes and JS heap. Include a cold
first visit, repeat visit, worker-unavailable fallback and reduced-motion mode.

The acceptance target is sustained 30 fps with p95 frame time at most 33.3 ms
at the lowest adaptive quality, responsive coach controls, and no continuous
rendering or simulation work while paused without interaction. Search should
keep the court interactive on its worker and expose progress/cancellation.
Reduce render scale, shadows and athlete animation/model detail when the
measured frame budget requires it. Do not relax deterministic physics or hide
conditional evidence to recover frame rate.

Current movement avoidance still uses floor discs; an articulated flight/body
stop is not a rigid-body or legal-screen solver. Passing decisions still use a
cheap floor-corridor read approximation before the actual launch check. These
limits stay explicit while future oriented screen routing, personnel movement
profiles and contact-response work are added with their own bounded tests.
