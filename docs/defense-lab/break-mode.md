# Break Mode: two interaction directions and the shipped first proof

The founder's objective is a repeated basketball loop: attack → see the first meaningful vulnerability → coach the responsibility → attack the revised answer. Search results are evidence inside that loop, not a replacement for watching a possession.

## Direction A: branch audition — selected

**Interaction prototype.** Enter Break Mode. The current basketball setup remains visible. A few actual offensive movement traces appear in the court as completed tests arrive. Each trace has a plain basketball intent: turn the screen, lift earlier, allow a reject. Contained tests lose visual weight. A witnessed opening stays visible. The final route becomes prominent, then the whole possession executes from its beginning and freezes at its first executable opening. One coaching sentence identifies the open option and the earliest arriving defender. “Fix it” selects that defender and opens his responsibility controls. “Break it again” pairs the prior opponent against the revised answer, then searches for the next exposure.

**Visual grammar.** No animated fantasy branches or possible pass shown as an executed pass. Actual player trajectories are sampled from completed simulations. No more than eight small preview messages leave the search; the court should display at most four routes concurrently. Conditional exposure remains amber and distinct from an established executable opening. A narrow mode indicator tracks Attack / Watch / Read / Fix. The court is the changing content. During search, a 290-pixel margin caption identifies only the latest sampled trial. During play it collapses to a thin line. At the freeze, a 282-pixel court-attached callout gives one consequence, the release-versus-arrival comparison, and the next coaching action. Its optional projected anchor lets the parent avoid players and other world controls.

**What this makes easy.** A coach can watch a possession with a beginning, a decision and a stopping point. Changes to offense have names he understands. The answer can already fail against its current opponent; zero edits is an honest winning search result. Seeing fewer than 28 routes is intentional: the mode shows a bounded sample while actually evaluating up to 28 replays.

**Cost.** Several actual movement traces can overlap because a permission change need not activate, or different intent may lead to the same observed action. The renderer must not fan identical routes apart to imply physical divergence. In that case the evidence is in the intent labels and selected possession, not an invented branch shape.

## Direction B: pressure lens — alternative

**Interaction prototype.** Enter Break Mode with the offense progressing to the next actual read gate. Freeze the ballhandler. A local lens around that player holds the remainder of the court dimly in place. Three alternative evaluated possessions take over that local view in turn, each starting at the same moment. The coach scrubs a single “their next read” control through the alternatives; the threatened receiver and responsible defender show their actual movement for that short interval. The best supported attack exits the lens into the full possession. “Fix it” attaches directly to the responsibility transfer at that moment.

**Visual grammar.** Time-local replacement worlds, no simultaneous route fan. One active alternative at a time, local ghost context from the original possession and a fixed clock reference. The lens has to distinguish a full alternate replay from a hypothetical action branch, since current simulation evaluates from the beginning rather than forking an arbitrary intermediate state.

**What this makes easy.** A coach can inspect one read and one recovery conflict without a web of trajectories. It is particularly attractive for teaching and repeated comparisons at an already-understood breakdown.

**Why it is not the first proof.** The present search changes initial intent and can change earlier screen engagement, so treating alternatives as if they share an identical read-gate state would be misleading. Showing their true earlier divergence would make the local lens considerably more complex. A coach new to this possession also loses the causal lead-in. Keep this direction for a runtime with explicit stateful forks or clearly labeled alternate replay alignment.

## Implemented contract

`attackAsync(config, { onCandidate, onProgress, signal, previousReport })` retains the bounded deterministic search. `onCandidate` runs no more than eight times, including a final selected preview; upsert the final preview by id because it can replace an earlier sample. All candidates, including the untouched baseline, continue to compete under existing minimum-edit ordering. Search cancellation terminates its dedicated worker and suppresses later messages.

`AttackPreview` contains `id`, basketball `label`, `playerId`, actual `points`, `verdict` (`held`, `exposed`, `conditional`), optional `threatId`, `witnessAt`, `leadSeconds`, `replays`, `selected`, and `executionUnresolved`. A halted flight, missed catch, or boundary violation with no witness is conditional execution, labeled “Execution unresolved”; it is not an opening and is never presented as a held defensive possession. Paths contain no more than 33 actual player positions at or before the witness, or through the replay when no witness exists. No future option target is appended to a trajectory. A permission preview follows the relevant actual player and does not imply the permission activated. `held` means no supported executable opening was found in that replay; it is not a proof of a universally sound defense.

`BreakMode` is controlled by its parent. Phases are `searching → selecting → playing → frozen → fixing`. A short selection dwell establishes the route before actual playback. Reduced motion can shorten that emphasis. Search output is complete before playback begins, but the normal simulation clock renders the exact selected possession. The stop point is the actual witness timestamp; an unwitnessed result should replay through the modeled duration. Seeking or pausing early must not be labeled “frozen at first exposure.”

The parent retains the previous report for paired retests, preserves defensive interventions, and must cancel both an in-flight search and pending selection-to-playback transition on exit, reset, content changes or another request. Old asynchronous completion must never replace the current configuration. During a new search, hide the previous report's witness; while coaching after a change, show the fixing state rather than previous numerical evidence.

## Evidence guards retained

- Legacy inputs without an explicitly enabled adaptive opponent reject the search.
- An opening requires an actual permitted read candidate or the handler's continuing selected drive. Forecast window timing alone is insufficient.
- Invalid-flight, catch or boundary evidence marks a resulting witness conditional.
- Baseline exposure may win with zero changes; permission changes never force offensive actions.
- Same-opponent retests preserve timed defensive answer and movement cues. Changes to offense, initial geometry, seed or assumptions prevent an isolated defensive comparison claim.
- Every display verdict is derived from the candidate's actual witness; selected does not imply exposed.

The attack tests additionally verify bounded preview count, default replay budget, exact selected witness, every preview point's presence in the actual simulation, and worker-preview suppression after cancellation.
