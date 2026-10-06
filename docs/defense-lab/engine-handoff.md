# Engine handoff for the second commission

The first executor is stable substrate, not a frozen platform design. Read the user's second commission and `basketball-research.md` before evolving it.

## Owned files and public contract

- `apps/web/lib/defense-lab/types.ts`: world/domain/config types.
- `scenario.ts`: `ENGINE_VERSION`, `CONFIG_SCHEMA_VERSION`, `DEFAULT_ANSWER`, `DEFAULT_ASSUMPTIONS`, `DEFAULT_CONFIG`, `DEFAULT_PROBLEM`, `HIGH_PNR_PROBLEM`, `PROBLEMS`, `COVERAGES`, `COUNTERS`, `ROLE_LABELS`, `createDefaultConfig()`.
- `simulation.ts`: `simulate(config)`, `simulateProblem(problem,config)`, `frameAt(result,time)`, `answerAt(config,time)`.
- Research and this handoff are the only other files edited by the engine agent. Analytics, analytical geometry, stress workers, storage and their tests are owned by counterpart agents.

`LabConfig` contains problemId, seed, counter, TeamAnswer, ModelAssumptions, timed Intervention[], optional startingPositions and screenAngle. `SimulationResult` returns immutable frames, events, decisions, diagnostics, input config and model/content versions. `WorldFrame` carries ten players, true-height ball/flight, responsibilities, options, answer and stage. The renderer and saved answers consume this contract; coordinate any changes with root and those owners.

## What is really computed

Fixed-step x/z motion with velocity, acceleration/speed bounds, finite turning and local collision avoidance; actual delayed defensive observation; responsibility transfers; geometric read comparisons; fixed ballistic ball endpoints; catch errors; deterministic seeded capabilities; and causal suffix reruns. The offense chooses actual continuations at the handler and subsequent catches. It chooses pocket versus lob from current body geometry. Analytics separately probes launched flights with articulated body capsules and computes arrival/window intervals from trajectories.

What remains authored: offense motion targets/start times, graph evaluation checkpoints, the P&R coverage policy, preparation/tag/split intercept formulas, transfer triggers, capability/pose constants, gather timing and the two launch shapes. The offense's candidate preference is a declared intent, not a completed branch. No fitted outcome probability, game accuracy or universally valid tactical claim exists.

## Causal and physical invariants to retain

Never mutate caller config. Apply cues only at their first eligible clock tick. Before-cue frames/events remain identical with the same seed. A movement cue changes a target; it preserves velocity and does not project bodies to it. Ball endpoints freeze at release; a later receiver cue cannot re-aim flight and may invalidate the catch. Dead ball remains at its final physical endpoint. No instantaneous speed cap projection; velocity candidates must satisfy both acceleration and cap. Zero reaction delay observes the current clock tick, not an absent `frames[k]` falling back to time zero.

The current local velocity search is an approximation, not a globally collision-free solver. It reports overlap/bounds diagnostics rather than silently correcting positions. Capsule geometry and athlete presentation are separate systems.

## Concrete golden loop

Default tagDepth .95, weakside lift intent, seed2026, edit at `DEFAULT_PROBLEM.stressAt` .75 s. A shallow tag .25 rerun preserves every earlier frame and changes the first offensive read from lift to roll. The initial handler node's `earliest`1.1 s defines option feasibility; `decisionAt`2.1 s defines its actual evaluation. Arrival-aware analytics reported lift1.0→0s and roller.10→.175s before the final independent test pass. The shallow run chooses an authored lob around the screen defender; actual capsule probing gave minimum flight clearance about +.301m. These figures are modeled assumptions, not calibrated basketball predictions. Root/analytics should recheck exact numbers after any model change.

"Stay" now keeps the backside defender on the lift during tag. X-out splits/exchanges according to the configured rule. A zero-delay switch stays switched after its trigger; it no longer flickers because the observed time resets. Independent tests cover these regressions along with deterministic replay, same-intent responsive reads, bounds, fixed released flight and a non-P&R action/read fixture.

## Material next architecture work

1. Extract the P&R defensive policy from the world executor. Responsibility providers should be content/policy instances with observed-state predicates, rather than one long coverage conditional.
2. Replace scheduled route changes with basketball state triggers where suitable: contact/screen usage, actual advantage, low help, rejection, re-screen and short-roll catch. `trigger` strings currently distinguish authored nodes but do not define a full predicate language.
3. Give offensive intent/read/counter continuations a reusable representation. Current CounterId routes are bounded modifiers and the first read selects from geometry; they are not a full opposing system or counter search.
4. Upgrade Break My Defense from seven tests to a bounded branching probe that reports the smallest basketball-valid deviation, carries trajectory/evidence and can attack the revised rules again. Preserve deterministic paired assumptions and explainability.
5. Separate permanent player identity, situational role, assignment and threat. Current ProblemDefinition requires ten fixed P&R roles; the low man is only situational in the research, not yet dynamically eligible in the content implementation.
6. Preserve preview versus actual-flight distinction. `ThreatOption.passClearance` is currently a floor-corridor approximation; actual capsule evidence checks launched passes. Do not imply that a future-option window already has the precision of the actual-flight test. A shared preview query can improve it without future omniscience.
7. ScreenAngle currently modifies screen positioning modestly; it is not a complete angle-dependent contact/route model. Either complete its basketball effect or demote its claim.

The action/read executor reuse fixture is evidence for reusable motion/ball/causality, not proof of authentic baseline defense. The defense policy must be generalized before adding corpus families.
