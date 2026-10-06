# Defense Lab: deterministic analytics and executable content

## Decision

Use geometry to expose consequences of basketball rules. Keep the authored rules, movement assumptions, and computed evidence separately inspectable. A synthetic possession can demonstrate that a defender has too far to travel under stated assumptions; it cannot establish whether a particular varsity player completes a pass, makes a shot, or communicates correctly.

The first implementation should produce contiguous option windows, defender arrival estimates, responsibility transfers, and demonstrated recovery. Stress classifications must be derived from replayed evidence. There is no defense score, universal coverage ranking, or probability of stopping a possession.

## Evidence actually inspected

- The complete supplied `CourtIQ_SEAM_III.html` model and research scripts, including the motion controller, articulated body capsules, delayed perception, pass events, assignment search, fine collision probes, diagnostics, paired assumption settings, and worker protocol.
- Existing `packages/core/src/types/index.ts`, which implements the legacy IQ/XP learning product rather than interactive basketball simulation.
- Existing `docs/3d-scenario-engine.md`, which describes authored animation timelines and explicitly excludes physics/player AI. It is useful presentation infrastructure but not an adversarial basketball engine.
- The supplied founder commission, especially its analytics, causality, stress, corpus, and first vertical slice requirements.

Public sources retrieved and inspected on 2026-10-05 after enabling the execution environment's network permission:

- [OpenStax, University Physics volume 1, §3.4: Motion with Constant Acceleration](https://openstax.org/books/university-physics-volume-1/pages/3-4-motion-with-constant-acceleration). The derivation relates displacement, initial velocity, and constant acceleration; it explicitly treats acceleration-to-top-speed and braking as separate constant-acceleration parts. This supports the mathematical arrival calculation, not a basketball-specific movement calibration.
- [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). The inspected sections describe `postMessage`/message exchange, structured cloning, and immediate worker termination with `terminate()`. These support serializable simulation results and cancellation of stale stress jobs.

The first network attempts failed; they are not evidence. An attempted arXiv abstract was not retrieved and is not cited. No movement speeds, reaction delays, or contest radii are empirically validated by this investigation. Basketball terminology and coverage research should be cross-referenced from the separate basketball research workstream, not inferred from a physics formula.

## What to retain from SEAM III

1. **Deterministic motion.** Acceleration-bounded changes to velocity preserve the path leading into an intervention. Steering changes a target rather than a player's recorded location.
2. **A common physical state.** Drawing and analytical geometry sample the same player positions, orientations, hand readiness, and ball trajectory. Presentation meshes should remain independent of collision envelopes.
3. **Subframe pass probes.** A ball moves much farther than its radius in a normal animation step. Collision/clearance probes must sample between motion frames and around release/catch boundaries.
4. **Causal flight.** A pass endpoint is fixed at release. Editing a receiver after release cannot re-aim a ball already in flight; a missed modeled catch is a diagnostic, not a successfully completed continuation.
5. **Paired assumption settings.** Compare two answers under identical settings. Counts describe the finite inspected settings, not probabilities or confidence intervals.
6. **Cancelable background analysis.** Heavy comparisons run separately from drawing and stop when superseded. Stale results must not replace current results.

## What must change

SEAM's seven attack buttons mostly select predetermined passes/shots while offensive paths are prepared before the defensive simulation. This is useful sensitivity analysis, but changing a defense does not necessarily change the offensive read or continuation. New content must encode a connected decision graph whose conditions observe the current defensive state, with authored pass/route constraints and legal continuations. Forced counters can isolate an experiment, while an opponent-read mode chooses between available responses using observable geometry. Both must disclose their selection mode.

SEAM's single `margin` collapses drive/body overlap, ball-flight clearance, and release proximity into one metric. Those are different observations. Do not silently treat one centimeter of arm clearance as equivalent to one centimeter of driving space or as scoring value.

The SEAM assignment optimizer also permits implicit responsibility changes based on a global minimum-cost permutation. New responsibility transfers should follow a team's executable rules and appear as events. Otherwise a coach may believe an answer holds because the model invented a rotation the coach never taught.

## Measurement definitions

### Offensive option window

For a basketball option enabled by the current offensive stage, measure the contiguous intervals during which its modeled pass corridor is clear, its destination is outside current defensive influence, and the earliest estimated defender influence arrives **after that option's flight-and-gather horizon**. Current radius alone misses an incoming closeout and can give identical durations for physically different rules. Estimate arrival from all five defenders' positions and projected velocities; add remaining reaction time when a defender has not recognized/committed to that threat. Record interval start/end and the limiting defender. Report durations to a sensible display precision (tenths of a second); retain finer values for reproducibility and tests.

An available graph option is not necessarily an open option. Preserve that distinction in the data. A lift becomes a connected counter after a tag creates the space; a lift button should not force an unrelated clip.

Pass clearance is a spatial observation, not a pass-completion probability. A point-sampled corridor approximation must be described as such; do not label it articulated-body flight clearance unless it actually uses the body capsules and moving ball in time.

### Arrival

Estimate the earliest arrival at an influence radius under a specified acceleration, top speed, initial velocity, and reaction delay. A simple calculation uses the velocity projected toward the destination, accelerates toward it until the speed cap, then travels at the cap. Negative initial projection must first be reversed by acceleration. Add the remaining read/reaction delay only when the cue has not already been recognized.

This is an optimistic straight-line estimate. It does not guarantee a feasible screened route, correct stance, successful closeout, or contest. Actual replay arrival is stronger evidence when the simulated defender reaches the relevant envelope. Keep estimates and observed arrivals distinct.

For remaining distance `d`, projected initial speed `v`, acceleration `a`, and speed cap `V`, the acceleration phase solves `d = v*t + a*t²/2`, giving `t = (sqrt(v² + 2*a*d) - v)/a`. If this exceeds the cap-reaching time `(V-v)/a`, use that first phase plus the remaining distance divided by `V`. Negative `v` naturally increases the elapsed estimate through reversal. This idealized formula is not a screened-route solution.

Do not use projected velocity as a strict structural impossibility proof: dropping transverse motion can distort a radial approximation. For conflict witnesses, bound first arrival with the most optimistic scalar speed magnitude and acceleration envelope; bound transit between the two influence regions using their minimum separation divided by top speed. If even those lower bounds fail both visit orders, the conflict is stronger than a failed simulated closeout. This bound ignores obstacles, turning, and braking, which makes it generous to the defender.

### Recovery

Measure an observed interval from a rotation trigger until current responsibility targets are again within their specified influence distances, continuously for a short explicit stability interval. If this condition is not reached within the simulated horizon, return `null` / "not recovered within this replay" rather than an invented duration or infinity displayed as a number.

### Responsibility transfers

Count actual defender/threat ownership changes represented by events. Do not count a changed target coordinate on each frame as a transfer. Teach the ownership sequence and the cue that caused each transfer.

### Structural conflict versus execution miss

At one read, concurrent required responsibilities may demand one defender affect two separated destinations before their deadlines. Use optimistic transit-time lower bounds to test both possible visit orders. Only classify a structural incompatibility when **neither order** can satisfy both explicit deadlines, and retain the targets, deadlines, transit estimate, and defender as a witness.

A long observed open interval without that proof is an exposure or execution/timing issue in this model. Do not automatically call every open shooter a structural conflict. Passing windows may expose a tradeoff even when no exact impossibility can be established.

## Stress classifications

Run the complete connected graph for each relevant counter and for paired, disclosed movement/read/pass settings. Do not assign results from a table keyed by coverage.

- **Holds:** the inspected branch retains no actionable open interval under the explicit catch/gather/read horizon in every inspected setting, and no structural incompatibility is witnessed.
- **Thin:** a window approaches that horizon, settings disagree, or model diagnostics prevent a stronger claim.
- **Breaks:** a meaningful exposure persists beyond the explicit horizon, or an incompatible responsibility pair is witnessed. Copy should specify whether the evidence is exposure, execution, or structural conflict.

The actionable horizon is an authored basketball assumption, not a league-wide empirical constant. It belongs in the evidence view. Counts such as "4 of 7 settings" identify inspected settings, not odds. Faster feet and shorter read delay should change replay motion and timing, not merely relabel a row.

Before/after summaries must show both gained and conceded windows. A shallower tag that reduces a lift opening while increasing a roller opening is a tradeoff, not an automatic improvement.

## Content architecture beyond the showcase

An executable problem should carry:

- stable ID, version, category, coach-facing name, and basketball question;
- court/formation constraints and role assignments;
- parameterized routes, screens, passes, and defensive rule templates;
- connected read/continuation graph, including observable conditions and authored selection policy;
- supported counter set and unsupported continuations;
- source references, terminology aliases, coach preferences, and disputed choices;
- explicit movement, reaction, influence, catch, and decision assumptions;
- teaching checkpoints and role explanations tied to the same graph/events;
- deterministic regression fixtures plus expected causal relationships, rather than predetermined favorable outcomes.

Promotion from draft to published should require a basketball review, a motion/geometry check, a causal-intervention check, and a role-teaching check. The catalog may list future problems with clear status but must not pretend placeholder problems are executable.

Challenge reuse with a second simple problem from another family (for example, baseline drive → drift → next pass), using the same motion, responsibility, pass, and read primitives. If it requires conditional logic hidden in the generic engine keyed to a particular problem ID, move that behavior into problem content or revise the primitive. High P&R should not be the engine's entire ontology.

Architecture review cases, rather than claims of shipped support:

| Problem family | Shared structure | Ontology pressure / required extension |
| --- | --- | --- |
| Empty-side ball screen | Screen, roll/pop read, help commitment | A low man can be absent; do not assume every possession has a corner tagger. |
| Spain P&R | Screen, roll, weakside spacing, ownership transfer | A screen on the screen defender and two concurrent screening roles. |
| Ghost / slip | Screen intent, rejection/counter, roll/pop | A read can cancel contact before a physical screen is established. |
| Baseline drive + drift | Drive, relocation, pass, help/recovery | Ball screen cannot be the universal starting action. |
| Middle drive + 45 cut | Drive, cut, tag, next pass | A perimeter spacer becomes a moving interior threat without changing player identity. |
| Post double + skip | Help commitment, pass, X-out | Two defenders can intentionally own one threat; a strict one-to-one assignment solver is inadequate. |
| Pin-down curl | Screen, cut, trail, switch | Off-ball screens must not require a ballhandler/screener pairing. |
| Zone rotation | Spatial responsibility, transfer, pass | Responsibility can refer to a space or passing lane, not only an opposing player. |
| Transition cross-match | Assignment, help, exchange, communication | Initial ownership can be unset; all ten players cross court regions and roles. |
| Late-clock mismatch | Screen/switch, drive, shot opportunity | Shot-clock state and a finite possession deadline change the relevant opportunity horizon. |

Terminology belongs to the program. A template can carry aliases such as “show”/“hedge” or “down”/“ICE,” while preserving distinctions between how that team actually positions and recovers. Template aliases must not silently imply equivalent executable behavior.

## Execution architecture

Keep simulation and analysis pure and independent of React, WebGL, local storage, and network. Produce serializable results. A single current possession can be calculated synchronously if measured latency remains short; repeated counters/settings belong in a module Web Worker with request IDs, cancellation/supersession, and an explicit fallback if workers are unavailable.

Cache only immutable results keyed by problem/content version, answer, counter policy, assumptions, and intervention history. A time scrub samples existing frames rather than rerunning the model. A parameter edit reruns the continuation after its issue time. Rendering must never determine analytical outcomes.

## Required meaningful checks

1. Repeat a simulation with equal inputs and compare frames/events/read decisions exactly.
2. Issue an intervention at 1.20 s; compare every prior frame and prior event against baseline. Compare position and velocity at the edit boundary; subsequent motion obeys acceleration and speed limits.
3. Change a defensive rule and prove the geometry of at least one available offensive option changes; in opponent-read mode, demonstrate that a read can select a different continuation.
4. Reverse a defender's initial velocity and confirm the arrival estimate increases; move a defender nearer and confirm it decreases; a larger influence radius cannot increase arrival time.
5. Use a synthetic concurrent-target fixture where no visitation order can satisfy deadlines; distinguish it from a feasible delayed execution fixture.
6. Repeat paired stress with identical settings/seed and compare results; verify each setting changes the actual simulation assumptions.
7. Check that a post-release receiver intervention leaves the active ball flight unchanged and diagnoses catch failure when warranted.
8. Check invalid or out-of-horizon analyses explicitly report unsupported/incomplete evidence rather than a favorable Holds classification.

No numeric precision in the UI should exceed the model's demonstrated evidence. Internal repeatability establishes reproducibility, not real-world predictive validity.

## Implemented verification

The three focused suites contain 20 passing tests: 9 analytical geometry/window/recovery checks, 7 coupled-simulation checks, and 4 deterministic stress/cancellation checks. They exercise exact causal prefix preservation, edit-boundary physical continuity, all-ten-player movement bounds, immutable in-flight endpoints, adaptive offensive continuation changes, a custom baseline-drive formation/action/read fixture, paired settings, and unsupported-horizon classification.

The showcase regression changes tag depth at the actual tag trigger (`stressAt = 0.75 s`) while keeping the same offensive intent. It verifies that the first read changes from lift to roll, the modeled lift window closes while the roller window opens, and the chosen lob has positive clearance under the fine body probes. Its launch choice previews present bodies/current velocity rather than consuming future defensive frames. These are reproducible model consequences, not empirical game-outcome claims.

The installed mathematical/analytical modules are `analytics.ts` and `analyticalGeometry.ts`. Pure stress logic lives in `stressCore.ts`; the client coordinator in `stress.ts` creates/terminates a worker, and `stress.worker.ts` imports only the pure core. This avoids bundling a worker that imports its own constructor. The no-worker fallback yields between settings and stops when superseded. Browser worker rendering/completion remains part of the independent UI verification workstream.
