# Break My Defense: bounded adversarial search

The search varies an opposing **strategy**, then reruns the coupled simulation against the current defensive answer. It does not choose from stored clips, select a defensive score, force passes, or infer shooting odds.

`attackAsync(config, { signal, onProgress, budget, previousReport })` runs a dedicated worker; abort terminates its CPU work and ignores subsequent messages. A fallback yields after every replay. The UI must abort its prior request on input edits and retain an identity guard before displaying a resolved report. Search is explicitly invoked, not run during first render.

## Domain and budget

The default budget is 28 complete replays, bounded to 6–40. One baseline, an optional paired retest and two selected-attack sensitivities count toward that budget. Remaining replays inspect one-edit neighbors, then a three-parent beam of continuations. Candidates change at most two parameters relative to the searched baseline. Beam parents prioritize witnessed or near openings; final selection does not use that exploration heuristic.

The exposed strategy consists of screen angle (−0.65 to +0.65 radians, search increments 0.325), lift delay (−0.25 to +0.6 seconds, increments 0.25), lift width (−0.7 to +0.7 metres, increments 0.35), and Boolean permissions to reject, re-screen and short roll. Permissions allow observed-state policy rules to activate; they never command the action regardless of defense. The initial counter intent, answer, seed, starting geometry, interventions and nominal physical assumptions remain fixed during candidate search. The report retains exact inputs and resulting event/decision evidence.

Search rejects legacy inputs that omit `opponent` before evaluating any replay. The coach must explicitly enable the adaptive opponent as a separate input edit before searching. Legacy replay inputs remain untouched; the search baseline always preserves the displayed, explicitly enabled opponent.

## Evidence and ranking

An opening must persist longer than the shared analytic catch-and-read horizon plus one simulation tick. Each qualifying contiguous interval must contain an actual sample at or after that option’s permitted read gate, while the option is still open. That sample must have an actual engine read with that available candidate, or a continuing drive already chosen by the current ball carrier; an elapsed timestamp alone does not establish trigger permission. Intervals that close before the read are rejected. The earliest such executable sample supplies the witness time and geometry; the full geometric interval is retained separately. At that sample, the same public `isThreatOpen` predicate used by analytics verifies availability, body clearance, influence radius and arrival versus release time. The witness records the actual option target, fastest defender's position/role, earliest estimated influence, release horizon (including remaining permitted-read delay), optional actual read gate, positive time lead, clearance, preceding events and latest recorded read. The fastest defender is computed at that frame, not copied from a label attached to some earlier option window.

A witness after an intersected flight, missed catch or court-boundary violation is conditional. Final ranking is lexicographic: valid witness before conditional witness before no witness; fewest changed parameters; smallest normalized parameter displacement; earliest opening; largest local arrival lead; stable identifier. No sum collapses overall defensive quality. When the baseline already exposes a valid opening it wins with zero changes, while the search still inspects alternatives. The UI must say the original opponent already exposed the answer. If no valid witness appears, say only that the inspected bounded search found none.

## Coach adjustment and attack again

Pass a previous report after the coach changes their answer. Its chosen opponent is rerun against the current answer before new search. The report retains the previous witness and the new result, and marks whether seed, assumptions, intent and starting geometry remain equal. Changing those inputs prevents an isolated defensive-rule claim. The coach owns any rule adjustment; search never applies an allegedly optimal defense.

Two reaction-delay variants (80 ms earlier/later, clamped to the model's supported 0–0.8 s range) rerun only the selected attack. These are disclosed sensitivity checks, not confidence intervals, frequencies or success odds. An invalid continuation remains visible in warnings even if an earlier witness is valid.

## Limits

This is a finite deterministic search through the executable high-P&R policy template. It cannot establish coverage against every offense, predict high-school athlete performance, or certify a universally correct defense. Parameter bounds, search increments, beam width, physical assumptions and authored policy predicates are inspectable implementation choices. Additional problems need reviewed basketball content and policy tests, not more random parameter sampling.
