# Opposing basketball systems: implementation and limits

The default config now includes `opponent`; older configs without it retain the legacy route/coverage mode. No model/content/schema version was bumped during this unfinished V1. Save/import schemas preserve the optional strategy and timed opponent changes.

## Actual runtime contract

- `offensivePolicy.ts` interprets serializable composite predicates: observed distance, coordinate, relative position, possession, prior activation, declared action and observed screen encounter. Each rule activates at most once. Priority arbitrates simultaneous movement intents. The interpreter knows no P&R coordinates or coverage IDs.
- `scenario.ts` supplies the first problem's counter graph: reject observed overplay; release into the short roll against two observed defenders; re-screen once after a real first encounter while contained; lift behind an observed low defender's inward motion. Existing catch reads continue into skip/extra/finish choices. These are permissioned responses, not forced completed passes.
- `defensivePolicy.ts` owns ball-screen coverage rules, independently of the world executor. Switch requires an observed encounter when the new system is enabled. Show recovery follows observed reconnection/roller depth. Content `defenseRules` can replace declared defenders' obligations using the same observation predicates and coach-answer matches. Stay and strong-side guarding are content rules; the remaining detailed P&R tag/split/coverage formulas are explicit authored domain policy.
- `simulation.ts` integrates physical targets without moving history or retargeting released balls. Policy events contain trigger evidence and observation times; `frame.policyActivations` exposes the bounded transition history. `frame.screenEngagedAt` records the observed first encounter, which is not certified contact or screen legality.

`OpponentStrategy`: `screenAngle` radians [-.65,.65], `liftDelay` seconds [-.25,.6], `liftWidth` metres [-.7,.7], and permission booleans `reject`, `rescreen`, `shortRoll`. Defaults are zero offsets with reject and short-roll permitted. Re-screen is disabled for the readable first tag/lift problem and can be introduced by Break My Defense. `opponentAt(config,time)` and `DEFAULT_OPPONENT` are exported from `offensivePolicy.ts`.

Lift delay adjusts a 0.25 s response interval after the observed low-help trigger. Positive lift width moves the weak lift farther toward its sideline. Screen angle rotates the two-player action's targets about the content screen location; it changes encounter geometry, but is not a complete screen-body/contact model. Bounds are supported modeling choices, not empirical player limits.

A timed `{kind:'opponent', at, patch}` changes strategy only from that clock tick onward. Already activated action commitments remain latched. A changed spacing target still obeys acceleration limits. A launched pass endpoint remains fixed.

Movement demonstration supports `untilTrigger:'ball-leaves'|'big-secured'`. The cue releases once the chosen event is observed and resumes current defensive rules. Big-secured means the big is within modeled contest radius and actually owns the roller responsibility. The cue does not teleport the defender or secretly author a new recovery assignment.

## Read and evidence coherence

The first read still has a content evaluation checkpoint. A committed re-screen can defer it. `ThreatOption.readAvailableAt` exposes that earliest permitted read; in the active system, `timeToRelease` and `opportunityDeadline` include the remaining action/read delay plus pass flight and gather. Thus a candidate window during a re-screen is a forecast of opportunity at the permitted read, not an immediately executable pass. Present defender geometry/velocity drives the analytical arrival estimate; future policy frames are never consulted. The actual selected read's candidate snapshot is preserved on its launch tick.

## Verified proofs

Nine new policy tests cover coupled coverages with unchanged offense; permissioned connected counters without cycles; no tag-lift against switch/stay-home geometry; read commitment in the opportunity horizon; timestamped opponent causal prefixes and physical bounds; immutable released passes; demonstrated-target release; generic baseline-drive offense and defensive stunt rules without an accidental clock-based switch; bounds and legacy activation.

The existing seven simulation tests still pass. The exact old shallow-tag lift→roll/lob example is deliberately preserved as a **legacy absent-opponent fixture**. It is not asserted as the behavior of the new default system. Under the active default (re-screen disabled), deep tag leads lift→corner→keep while a shallow tag at 0.75 s leads roll→keep. The default paired run has lift window 0.10→0 s, roll 0→0.15 s, corner 0.30→0 s. Enabling re-screen is a genuine further counter: in the prior all-enabled default it changed these first three windows to zero, with lift→corner→keep versus keep. Choosing the best candidate is not proof that it is open. UI explanations must derive from actual reads and analyses.

Full defense-lab test suite passed at 49 tests during integration, with typecheck clean; rerun after other agents' final changes.

## Real limits

This is one bounded possession, not a general basketball intelligence. Offensive motion endpoints, trigger thresholds, evaluation checkpoints, target rotations, priorities, pass preferences, and most detailed coverage formulas remain authored and uncalibrated. Simultaneous transitions are deterministic approximations. The system does not discover arbitrary tactics, evaluate shooting skill, enforce all screen/contact rules, or select dynamic low-man eligibility across arbitrary formations. Five situational roles per side are still the content contract. The independent baseline fixture proves reusable trigger/assignment/motion machinery, not an authored clinic-ready baseline defense corpus item.
