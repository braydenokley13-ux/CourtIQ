# Basketball corpus and three-register language layer

Code: `apps/web/lib/defense-lab/corpus/` (pure TypeScript, no UI). Tests: `corpus.test.ts`.

## Registers

1. **Plain**: a coach who has never heard "X-out" understands every sentence. Enforced by tests against `COACH_ONLY_TERMS`.
2. **Coach**: standard coaching words (drop, tag, lift, X-out, low man).
3. **Team**: `Voice.terms` overrides any concept id, answer id, or `role:<RoleId>`. "We call Drop Blue" is `{ drop: 'Blue' }` and flows into every sentence.

## Sources

No live web research was available in this pass. The note relies on the verified clinic and article readings already recorded in `docs/defense-lab/basketball-research.md` (checked 5 Oct 2026) and on general coaching knowledge. Where the claim is general knowledge, it is marked below.

- Joao Costa, "Defending the Pick and Roll", Coach's Clipboard: over/under, show/recover, trap, hug, re-screen, weak-side rotation.
- James Gels, "Man-to-Man Defense" and "Switching Man-to-Man Defense", Coach's Clipboard: gap help, stay-home on shooters, equal-size switches, mismatch handling.
- Zeljko Obradovic, Partizan ball-screen concepts (Basketball Immersion): tagger, fill-behind, short roll, skip.
- "The Basketball Defensive X-Out" (Basketball Immersion): in/out help roles, first pass versus second pass; the exchange is a responsibility swap, not one fixed route.
- Jim Boylen defensive-system clinic summary (Basketball Immersion): force direction, gap, weak-side exchange.
- Alan Keane, U18 European Championships observations: middle ball screens expose the low tag; empty-corner low tags; short-roll dependence on line of pass.
- FIBA Champions League trends; "The Next Ball Screen Defense Explained" and "Mastering Peel Switching" (Basketball Immersion): peel versus scram, gap sink, hot trap.
- General knowledge, not cited to a page: the alias lists (Down, Blue, Red, Black, Green), common ICE usage for side screens, and the low-man/tag vocabulary. Treat them as examples of usage, not a standard.

## Terminology collisions

There is no governing body for ball-screen calls. Color and direction words are chosen by programs.

| Word | Meanings seen | In the corpus |
|---|---|---|
| Down | Drop (some teams); ICE / force down the sideline (many teams) | alias of both `drop` and `ice`, flagged in `COLLISIONS` |
| Blue | Drop (some); ICE or "push" (many) | same |
| Black | Trap (some); ICE (some) | alias of `blitz` and `ice`, flagged |
| Red | Trap/blitz (common) | alias of `blitz` |
| Green | Switch (some) | alias of `switch`, marked program-specific |
| Sink | Big sinks (drop); low man sinks to the roller (deep tag) | flagged |
| Stay | Helper stays home (no tag); backside stays on the lift (no X-out) | flagged |
| Show | Soft stop at the screen; also used for "hard show" | alias of `hedge` |
| Tag | A bump, a stunt, or a sustained commitment | `tagDepth` makes the choice explicit |
| Switch | Called switch, "switch everything", or late-clock only | one preset; timing not modelled |

UI rule: when a team term is set, show it. Before a program adopts a built-in alias, show the collision list.

## Real coaching disagreements (do not pick a winner in the UI)

- **Deep tag versus shallow tag.** Deep protects the rim and the roller but leaves a long closeout on the weak side. Shallow keeps shooters but gives the roller more room. Programs choose by their opponents' shooters and their own big.
- **X-out versus stay.** X-out makes the first closeout shorter, but needs communication and loses to the skip. Stay keeps the lift covered, but the low man runs farther to the corner.
- **Early versus on-pass rotation.** Early beats a committed tag, but a pump or counter punishes it.
- **Drop depth.** A deep drop protects the rim and concedes the pull-up. A high drop contests the pull-up and leaves the roller closer to the basket.
- **Over versus under.** Over contests the shot; under protects the rim side.
- **When to switch.** All-the-time switch limits chasing but creates mismatches. Late-clock-only switch limits mismatches but gives the offense a normal action early.
- **Trapping the ball.** Takes the ball handler out but leaves a 4-on-3. Whether that is a good trade depends on the handler, the screener's passing and the weak side.
- **What shot to concede.** The corpus never calls a shot "bad"; goals list what each answer tends to protect.

## What the engine executes versus what is only text

Executed (changes simulation output; every preset is simulated in tests, and every coverage by helper pairing is simulated too):
- `coverage`, `poa`, `bigDepth`, `tag`, `tagDepth`, `backside`, `rotationTiming`, `recovery` through each answer's `patch`.
- Threat names, open durations and defender-needs durations come from the engine; the language layer only formats them.

Approximate (marked `fidelity: 'approximate'` on the preset):
- **ICE**: a middle-screen force-direction rule, not a sideline ICE coverage.
- **Switch**: responsibility transfers, but there is no size mismatch, post seal or switch-back.
- **Hedge**: show and recover are one pattern. Flat show versus hard hedge is not split.

Notes on executed fields:
- `bigDepth` is a floor measured from the attacked baseline (metres): smaller lets the big sink farther. It only binds when the ball handler attacks that line.
- Early rotation only starts the exchange when tag depth exceeds 0.45.
- X-out is a two-player exchange. Three-player peel chains are not modelled.

Text only (no engine behavior):
- Situations other than high middle P&R (side, empty-side, Spain, drag, driving help, off-ball screens, post, transition, zone) are `preview`. The entry screen should say so.
- Goal-to-answer rankings are authored judgments about tendencies, not simulation results.
- Aliases, collisions and coach notes.
- `describeTradeoff` and `explainMoment` causes (`late-rotation`, `two-on-ball`, `big-too-deep`, ...) are labels passed in by the caller. The language layer does not diagnose them.

## Number and wording honesty

- Seconds are shown with two decimals below 1 s and one decimal at 1 s or more. No numbers are invented, and invalid values are dropped.
- Open-window changes under `TRADEOFF_EPSILON` (0.05 s) count as no change. That is a reporting choice, not a basketball constant.
- A mixed change ends with "it comes down to which shot you would rather give up", never a verdict.
- No composite score, no shot-percentage claim.
