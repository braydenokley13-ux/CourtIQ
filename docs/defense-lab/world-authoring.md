# Coaching in the world

The first spatial rule editor operates on the low man's actual defensive policy. It changes a portable team answer, then the deterministic simulation resolves execution. It does not move a defender instantly.

## A tag target is a rule, not a body position

`getTagGuide(frame, answer, problem, config)` evaluates `defenseResponsibilities` on the frozen observation at zero, current, and full tag commitment. The resulting `home → commit` rail is therefore the same basketball target family as the engine's policy. Preparation and active tagging use their own existing targets. The guide names the problem's low-man role instead of assuming a player number.

`tagDepthFromFloorPoint(guide, point)` projects a floor drag to the nearest bounded commitment. The renderer sends that depth to the answer editor. It must use this helper rather than compute a target or depth independently. A direct defender drag remains a distinct demonstrated movement cue.

The guide is a policy evaluation at the displayed observation. It is not a prediction of arrival or a claim that the body's current target came from the identical snapshot: execution includes reaction delay. Show the physical defender and the rule target separately. A frozen drag should retain the original rail until pointer release and commit one change, so the handle does not chase its own re-simulation.

When the policy has released the tag, exchanged responsibilities, or replaced the low man's target with a different content rule, the guide stops being editable. It must not manufacture a tag handle. The ordinary on-screen depth control can still edit the team answer for another time.

## Two coach-owned conditional sentences

`TeamAnswer.coachRules` is optional, preserving legacy answers and the default possession. It stores at most one rule per supported observation:

| Observation | Bounded edit | Coach response |
| --- | --- | --- |
| Roller enters a chosen depth | 2.5–7 m from attacked baseline | Low man tags / big contains, or big takes roller / low man returns corner |
| Weakside lift rises during the roll | 0.5–3 m above its actual starting spot | Backside stays with lift, or three-person X-out with big taking roller |

Both rules require an observed screen encounter, an observed roller threat, and handler possession. They do not trigger from a clock or the mere presence of a planned screen. Their obligations end when those conditions end, and the ordinary team answer resumes. Switch suppresses these help rules because its screen defenders already exchange ball and roller ownership.

The rule compiler maps these sentences to the existing serializable `PolicyCondition` and `DefensiveBehaviorRule` vocabulary. The coach never needs to see predicates or a graph. Role assignments are fixed by the chosen basketball response, which prevents an imported sentence from assigning an offensive role as a defender. The low-man tag response references the same `tag-depth` target as the base policy.

Content rules run first, the roller rule next, and the lift rule last. An explicit X-out therefore owns the final three-person exchange when both observations hold. This precedence is independent of sentence order in the interface. Lift conditions depend on observed offensive geometry, not the defensive assignment they replace, avoiding tag/exchange oscillation.

Strict answer validation rejects unknown fields, mismatched responses, repeated observations, nonfinite numbers, and out-of-range thresholds. Conditional sentences survive answer interventions, save, export, import, replay, comparison, and attack because they travel inside the same team answer.

## Extending the vocabulary

New sentence families should add a basketball observation and a coherent role response, compile them through the same interpreter, and prove their trigger, release, precedence, physical continuity, and persistence. A new sentence is not permission to infer arbitrary natural language. A stateful instruction such as “until the big recovers” needs a documented observed release condition; a compound possession system needs explicit state and bounded transitions before it becomes an authorable sentence.

Tests cover target/policy agreement, preparation versus active tags, nearest-depth inversion, releases and overrides, actual screen gating, threshold observation, custom starting spots, simultaneous-rule precedence, stable X-outs, physical execution after activation, and exact replay after portable-answer round trips.
