# Reusability test: BASELINE DRIVE → DRIFT / WEAKSIDE ROTATION

Question: can CourtIQ express a structurally different defensive problem with the same primitives?
Answer: **yes for the simulation core, no for everything that talks to a coach.** The second problem
(wing beats his man baseline, help, drift, weakside rotation, X-out) is 108 lines of content plus 7 changed
engine lines. The P&R vocabulary still leaks through `TeamAnswer`, the explore catalog, the attack domain and
the whole `components/courtiq` layer.

Files: content `lib/defense-lab/problems/baselineDrive.ts`; proof `problems/baselineDrive.test.ts` (7 tests).

## What the problem is (all expressed in existing primitives)

| Basketball idea | Primitive used |
|---|---|
| Driver beats on-ball man baseline | `OffensiveAction{drive}` + `chase` assignment with negative gap once `relative(poa, ballhandler, z) > 0.35` |
| Corner drifts behind help | `BehaviorRule` `corner-drift` (observed `vz`), motion on `strongCorner` |
| Weak wing lifts when help commits | `BehaviorRule` conditioned on `responsibility(lowMan\|big, 'tag')`, a defender-state observation |
| Help from low man / big / strong side / none | 12 `DefensiveBehaviorRule`s (generated), selected by `answer` match |
| Early vs late help | `rotationTiming` picks the trigger: first step of the drive vs on-ball defender visibly beaten |
| X-out on the kick | `backside:'x-out'` rules gated by `not possession(ballhandler)` |
| Reads: finish / dump-off / kick to drift / skip | 5 `ReadNode`s, `penetration` then `catch` continuations |

Role slots are re-used by meaning, not by name (`screener` = the dunker, `strongCorner` = the drifter,
`lowMan` = weak-side helper). Threat ids: `roll` = dump-off, `strong` = kick to drift, `corner` = weak short corner,
`lift` = skip, `drive` = finish. This worked with zero change to `threatPlayer`, because roles are ids supplied by content.

## Evidence (tests, deterministic)

- no help and late help: first read `drive` (finish). Late help is no help.
- low man or big commits early: first read `lift` (skip pass). Strong-side defender sags: `strong` (kick to O2).
- Teaching moments name the helper: `late-rotation`/`pulledDefender D3`; `deep-tag`/`D5`; `strong`/`O2`/`D2`.
- Per-defender teaching states: D1 contain→chase, D3 guard→tag, D4 guard→closeout, D2 guard only.
- `compare()` reports lift opens when help starts. `proposeFixes` replays real alternatives.
- `attack()` runs and returns a report, but only `liftWidth` moves a body (see ranking).
- Tag guide returns `unavailable` (correct: no screen).

## Audit: where P&R assumptions live in "generic" code

(a) generic, (b) parameterizable by content, (c) hard-coded P&R.

| Location | What | Class | Baseline outcome |
|---|---|---|---|
| `simulation.ts` stepping, `advance`, flights, catch, reads, `readCandidates` | physics, acceptance, ranking | a | unchanged |
| `offensivePolicy.ts` `PolicyCondition`, `advancePolicies` | condition algebra on roles | a | used for drift, lift, help triggers |
| `ProblemDefinition.roles` names (`screener`, `lowMan`…) | slot names | b | re-used by meaning; misleading names |
| `threatPlayer` (roll/pop→screener, corner→weakCorner…) | threat→player | b | works through roles; still 6 fixed threat ids |
| `defenseResponsibilities` P&R block (coverage, poa, big depth, tag, backside) | default obligations | c | fully overridden by an unconditional `home` rule |
| `defenseRules` mechanism (replace per defender, `answer` exact match) | content override | a | carries the whole problem |
| `TeamAnswer` fields (`tag`, `tagDepth`, `bigDepth`, `recovery`, `coverage`) | coach vocabulary | c | overloaded: `coverage` = who helps; `tagDepth`/`bigDepth`/`recovery` unused |
| `defenseRules.answer` | exact-equality match only | b | no numeric ranges, so no depth-based help |
| `target:'tag-depth'` | lowMan→screener only | c | unused |
| `compileCoachRules` / `CoachRule` | roller-depth, lift-rise | c | `coachRules` unusable |
| `observeScreen`, `screenAt`, `showReleased` | screen encounter | c | inert (no screen action); correct |
| `offenseGoals` `lift-behind-tag` id, `liftDelay` | weak-lift delay by rule id | c | inert unless the rule id exists |
| `offenseGoals` `liftWidth`, `OPPONENT_BOUNDS`, `OpponentStrategy` | fixed attack knobs | c | only `liftWidth` has effect |
| `ATTACK_DOMAIN`, `mutations`, `previewAttackCandidate`, scope string | attack search | c | runs, mostly no-ops |
| `explore.ts` `buildMoment` | cause taxonomy | b/c | `tag` kind reused; `switch`/`two-on-ball`/big-depth causes are P&R |
| `explore.ts` `CATALOG`, `ORDER` | fixes | c | cannot turn help on; labels lie ("Switch the screen") |
| `explore.ts` `jitterConfig`, `problemFor` | registry lookup | a/b | uses `PROBLEMS` |
| `analytics.ts` `LABELS` | threat names | c | "Roller", "Weak corner" shown for dump-off, short corner |
| `simulation.ts` decision reason text | "The roller offers…" | c | wrong prose, correct data |
| `simulation.ts` `tag` event label | "Low man commits to the roll" | c→a | **fixed** (derives from the tag responsibility) |
| `simulation.ts` screener `'screen'` stance for t<0.48 | pose | c→a | **fixed** (only with a screen action) |
| `interventions` `untilTrigger:'big-secured'` | big/screener roles | c | inert |
| `tagGuide.ts` | lowMan tag rail | c | correctly `unavailable` |
| `components/courtiq` (read-only audit) | see below | c | not run |

UI (not touched): `CourtIQApp` hard-codes `HIGH_PNR_PROBLEM` and `createDefaultConfig`; the tag guide is only wired for
`HIGH_PNR_PROBLEM.roles.lowMan`; `CoachCard` keys on `D1`/`D5` and says "Tag the roller" / "Does he help on the screener?";
`basketball.ts` (`DEFENDER_ORDER`, `ROLE_OF`, `THREAT_PLAIN`, coach terms) and `BreakMode`'s `threatLabels` are P&R copy;
`lenses.ts` draws roll wedges; `FullControl` exposes only the two P&R coach rules; `useLab` starts from the P&R config.
There is no problem selector anywhere.

## The numbers

| Measure | Lines |
|---|---|
| New content, `problems/baselineDrive.ts` | 108 |
| New tests | 131 |
| Engine change (new lines or changed) | 7: `scenario.ts` +2 (import, registry entry); `simulation.ts` 5 (tag event from the real responsibility, screen stance gated by a screen action) |
| Engine change specific to this problem | 0 |
| UI change needed to play it | est. 300-500: problem selector, per-problem role/copy table, coach card for D1..D5 labels, threat labels, lens set |

Ratio of scenario-specific engine code to content is 0 : 108, which passes the founder's bar for the **simulator**.
The bar fails for the **coach surface** (answer vocabulary, fixes, attack, UI copy), which is bigger than the content.

## Remaining hard-coded P&R spots, ranked by cost to a third problem

1. **`TeamAnswer` is P&R.** Third problem would overload fields again. Proposal: `answer: Record<string, number|string|boolean>`
   with content-declared `answerSchema` (id, label, options); keep the P&R fields as one schema.
2. **Explore `CATALOG`/`ORDER`/`TeachingCause`.** Move fix candidates and cause detectors into `ProblemDefinition.teaching`
   (patch functions + plain text); keep the generic `help-detected` cause from `tag`/`closeout` responsibilities.
3. **`ATTACK_DOMAIN` / `OpponentStrategy`.** Let content declare `attackDomain` (parameter, bounds, label, intent text) and
   bind parameters to `PolicyCondition` `enabled` keys and motions (`offset` from a parameter). Offense rules already consume them.
4. **UI binding to `HIGH_PNR_PROBLEM`.** Introduce an active-problem context, render coach cards from `problem.roles` plus
   `problem.copy` (role labels, threat labels, answer controls), and gate the tag guide on `problem.tagGuide`.
5. **Threat vocabulary.** `ThreatId` is a closed union and `LABELS`, `THREAT_PLAIN`, decision reasons are P&R. Proposal: `problem.threats`
   (id → role, label, plain text); keep ids opaque.
6. **`defenseResponsibilities` default block.** Move it into `HIGH_PNR_PROBLEM.defenseRules` as its `home` rule, as baseline does,
   and delete the P&R branch from the shared function (also removes `observeScreen`, `showReleased` special-casing).
7. **Rule-id coupling** (`lift-behind-tag`, `liftDelay`, `big-secured`): replace by a motion `delayParameter`/`releaseWhen` condition.
8. **`answer` match is equality only**: add `{min,max}` ranges so help depth and rotation timing can be numeric.
9. **No latch conditions** (`passed`, `ball-in-flight`): content approximates with `not possession(role)`; add an explicit condition.

Known gaps in this problem: no coach rules, no tag guide, no depth-based help, attack mostly inert, the on-ball
defender is beaten by a content `chase` rule rather than by an authored lateral deficit, and geometry is not tuned.

Verification: `tsc --noEmit` clean; `vitest run lib/defense-lab`: baseline tests green. One P&R test
(`explore.test.ts` switch-mismatch receiver) failed in the shared tree during another engineer's in-flight edits to
`scenario.ts`/`defensivePolicy.ts`; it does not exercise code changed here.
