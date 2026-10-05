# CourtIQ Strategy Lab

A defense-first basketball strategy laboratory for high-school programs. The gym is the workspace: build an answer, run it against an opponent that reads the defense, inspect the tradeoff, coach a defender, attack again, save and teach.

The first problem is **High P&R → low-man tag → weakside lift / skip**. The public root and /lab work without film, tracking hardware, analyst, account, database connection or AI service.

## Run

Use Node 22 and pnpm 9:

~~~bash
pnpm install
pnpm --filter @courtiq/web dev
~~~

Open http://localhost:3000/lab. The Lab needs no service credentials. Earlier authenticated training routes retain their separate Supabase/database requirements.

## Try the loop

1. Run the default Drop / Over / Deep tag / X-out answer. It freezes at the tag, allowing a causal edit.
2. Choose **See the opponent’s read** to continue; scrub later catches and skips.
3. **Build our answer**, choose D3, and apply **Shallower tag** from the tag moment. Run again.
4. **Compare**. Same-opponent ghosts and changed windows/reads show the tradeoff. Inspect around 2.05 seconds, then the actual read at 2.10.
5. Enter **Break my defense**. Completed tests appear as faint routes; a selected route gains emphasis, then its actual possession plays and freezes at the first executable vulnerability. **Fix it** attaches coaching to the responsible defender.
6. Change his answer, then **Break it again**. The previous attack is retested before bounded alternatives are searched.
7. **Save / teach**, name the answer, and enter **Teach**. Each role uses that exact saved configuration.

Select D3 and drag the tag rail to change his executable commitment, or use the tag label’s left/right keys. Select D5 for Drop / Show / Switch / Blitz at the screen. Roller-depth and lift-rise sentences add two bounded, coach-owned conditional reads; they resume the base answer on release. Frozen defenders can also be dragged to a persistent movement target. A release cue ends demonstrated movement when the ball leaves or the big secures the roller. Supported statements preview explicit rule changes; incompatible coverage or arbitrary free text does not silently create rules.

Answers live in this browser profile. Export JSON to transfer or back them up. Storage failure retains an exportable in-memory answer and reports the limitation.

## Computation and authorship

The runtime computes deterministic movement, delayed observations, condition-triggered policy transitions, connected reads and fixed-endpoint ball flights. Shared analytical geometry computes option windows, straight-line arrival estimates, body clearance and same-input comparisons. A worker performs finite strategy search and paired retests.

The corpus, triggers, targets, read preferences and physical assumptions are authored. They have not been calibrated to a program's athletes. The model predicts no shooting percentage, score, possession success or wins. A defensive-body intersection stops the launched flight and possession at the actual witness. Catch support uses authored size, facing, hands and jump geometry. The engine does not infer a deflection, turnover or foul. Unsupported legacy continuations remain conditional. A finite search cannot certify a defense against unsearched basketball.

Initial opponent permissions include reactive lift, reject and short-roll responses. Re-screen is initially off and can be enabled by authoring or attack search. This makes the first help/rotation problem readable while retaining connected escalation.

## Implementation

| Boundary | Location under apps/web/lib/defense-lab |
| --- | --- |
| Situations, roles, action/read/counter graphs | types.ts, scenario.ts |
| Observed offense and defensive obligations | offensivePolicy.ts, defensivePolicy.ts |
| Physical world, ball and causal interventions | simulation.ts, physicalExecution.ts |
| Policy-derived authoring and conditional sentences | tagGuide.ts, coachRules.ts |
| Bounded immutable UI history | replayCache.ts |
| Shared spatial/timing evidence | analytics.ts, analyticalGeometry.ts |
| Bounded attack search, worker and retest | attackCore.ts, attack.ts, attack.worker.ts |
| Coaching templates and saved systems | coaching.ts, answers.ts |

The court, camera and contextual controls are in apps/web/components/defense-lab. The renderer samples engine frames and emits coaching intent. Normal athletes dissolve into a separate three-draw analytical representation of the same body snapshots. X-ray reveals actual flight segments, future reach samples, responsibilities and conflicts. Synchronized comparison renders prior defensive trajectories and spatial divergence in one court. It cannot choose basketball actions. Analytical bodies are independent of presentation athletes. Teaching regenerates the same engine from saved inputs.

## Verify

~~~bash
pnpm --filter @courtiq/web test
pnpm --filter @courtiq/core test
pnpm --filter @courtiq/web lint
pnpm --filter @courtiq/web typecheck
pnpm build --env-mode=loose
# Against an already running server, with Chromium installed:
BASE_URL=http://localhost:3000 pnpm exec tsx scripts/verify-defense-lab-studio.ts
BASE_URL=http://localhost:3000 pnpm exec tsx scripts/verify-defense-lab-studio-edges.ts
~~~

The independent browser runners exercise real UI controls and observe worker results, then recompute evidence from saved inputs. Use `PRODUCTION=1` when the running server is `next start`. The unified studio production run passed twelve checks and three supplemental trust checks; exact build revisions, later focused verification and screenshots/results are in [studio QA](docs/defense-lab/qa-studio/QA.md). qa-raised records the preceding remodel. SwiftShader checks functionality, not physical-device performance.

[Decisions](docs/defense-lab/DECISIONS.md), [opposing systems](docs/defense-lab/opposing-systems-handoff.md), [attack search](docs/defense-lab/attack-search.md), and [spatial design](docs/defense-lab/world-first-design.md) document the implementation and limits. Sibling research distinguishes verified sources from product hypotheses.

The [studio checkpoint](docs/defense-lab/STUDIO-CHECKPOINT.md) gives the material changes, computed tradeoff, executed verification and remaining acceptance gates.

The founder's request governs this build. Earlier top-level product/roadmap files describe the previous player IQ training product and remain historical context.

## Studio pipeline and runtime

Athletes and equipment are authored offline in Blender, exported to optimized GLBs, then sampled in the browser. Editable Blender sources, reproducible builders, saved-source exporters, lossless channel pruning, asset budgets and native Three.js validation are included. The thirteen-action athlete library covers stance, slide, cut, stop, screen, pivot, catch, pass, dribble, closeout and shooting, with high/tactical geometry LODs on one shared skeleton per athlete. Runtime pose corrections are presentation, not measured biomechanics.

The authored hoop, benches and instanced wall padding total about 481 KiB without textures or decoders. Sources/provenance are in scripts/athlete and scripts/environment; athlete rights are documented in [LAB-HUMAN.md](apps/web/public/athlete/LAB-HUMAN.md). The assets are licensed separately from the application, whose repository has no declared open-source license.

The 40 Hz motion simulation runs independently of display. Attack search uses a worker; the UI caches at most three immutable replays and 800 frames. Rendering is on demand when frozen, caps live draws near 30 Hz, instances analytical bodies and padding, and adapts resolution/athlete LOD using sustained costs. Optional ?debugLab=1 exposes actual render cadence and quality telemetry for physical-device verification.

Cloud CPU measurements improved the default replay from 72.3 ms to 18.6 ms median; a loaded repeat measured 33.0 ms. A 28-replay search measured 0.73–1.44 s median across those runs. These measurements are not coach-laptop guarantees. See [performance evidence](docs/defense-lab/runtime-performance.md) and the [hardware protocol](docs/defense-lab/runtime-performance-protocol.md).

The remaining acceptance gates are a real coach’s game-plan decision and physical laptop performance. Free-form arbitrary systems, legal contact outcomes and measured athlete calibration remain outside this vertical slice.
