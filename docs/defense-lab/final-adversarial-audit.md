# Final adversarial runtime audit — 2026-10-05

Scope: independent source and executable audit against `RAISED-GOAL.md`. No GPU/browser session used; final browser QA is separately owned. Engine/UI edits remain with their owners.

## Repair verification

The five original findings below have been repaired in the working tree. Independent executable re-probes confirm:

- The default attack witness is anchored to the actual **3.775 s** drive read. The slow-reaction blitz and hedge examples now identify later executable drive reads; the switch example has no supported witness. The no-screen/no-read setup has no witness.
- The corrected retest comparison preserves prior defender movement, shows different worlds and retains the actual **lift → corner → drive** versus **roll → drive** change. With the subsequently corrected graph eligibility, the measured tradeoff is **drive closes 0.5 s; roller opens 0.3 s**. A defender-only move remains a controlled defensive comparison.
- All three tag templates return unsupported with a null patch under switch; all four templates remain supported under drop. Chase-over remains supported under switch with its coverage-precedence explanation.
- Source inspection confirms the pass-dependent X-out coaching copy and the corrected zero-change/no-witness message.

Two additional state-handling findings were sent to root after those repairs: legacy configurations without `opponent` silently acquire adaptive policies in the attack baseline, and teaching an older saved answer can show the current lab's unrelated attack sensitivities in Why. Their final disposition belongs to the integration/browser pass.

## Original findings and reproductions

### P1 — A geometric window can close before any executable read

Reproduction: `createDefaultConfig()`, `answer.coverage = 'blitz'`, `assumptions.reactionDelay = 0.8`, `opponent.rescreen = true`. The original witness finder reported a clean roller interval from **1.10 to 1.70 s**, although `readAvailableAt` is **2.10 s** and the actual 2.10 s decision selects **lift**. Equivalent failures occur with switch and hedge at the same supported reaction setting.

The release estimate includes time until the authored read, but that estimate does not establish that the window survives to the actual read. Require executable evidence inside the window. Owner: attack agent.

A second reproduction shows that a time-only gate is insufficient: default config with `startingPositions = { O1: { x: 7, z: 14 } }` produces **no screen event and no read decisions**, but the original finder reports a drive window from **1.725 to 3.425 s**, with `readAvailableAt = 2.10`. The screen trigger never becomes true. The repaired witness must respect actual trigger/condition eligibility as well as the clock.

### P1 — Retest comparison erases demonstrated defender movement

Reproduction: attack the default answer with budget 6, add D3 movement cue at **0.75 s**, target **(-5, 2)**, ending at **2.55 s**, and attack again. `breakDefense` originally built its ghost baseline from current non-answer interventions, including the newly demonstrated D3 movement. The resulting baseline frames equal the new frames exactly.

Observed incorrect comparison: “These answers retain similar option windows.” Actual previous-opponent comparison: **ball/drive closes by 0.7 s; roller opens by 0.1 s**. Actual decisions change from **lift → corner → drive** to **roll → drive**. Retain the previous defensive movement cues in the previous-answer world. Owner: root/UI.

### P2 — Player coaching card states the wrong X-out destination

The original `nextJob` copy sends tagging D3 to the lift for every X-out answer. Runtime on-pass X-out exchanges only on a pass to the weak corner. On the default first pass to the lift, **D4 closes to the lift and D3 recovers to the corner**. Teaching copy must state the pass-dependent destinations. Owner: root/UI.

### P2 — Zero-change, no-witness search claims an exposure

Reproduction: switch, tag false, backside stay; attack budget 12. Selected changes are empty, witness is null, and there are no warnings. Original attack card combines “No supported opening found” with “The current opponent already reveals this exposure.” Gate the latter claim on a witness. Owner: root/UI.

### P2 — Supported tag templates silently lose to switch coverage

Under switch, all three templates that promise a low-man tag are accepted and set `tag: true`, but the defense's `!switched` condition produces **zero tagging frames and zero tag events**. The unconditional preview promises executable D3 tagging. Context-aware authoring should reject that combination with a supported alternative, or explicitly disclose a coverage change in its preview. “Chase over” already explains that coverage determines the exchange. Owner: root/UI/coaching.

## Executable checks

- 108 nominal coverage × tag-depth × opening-intent simulations inspected for witnesses, read chains, contact warnings, and flight validity.
- 24 direct D3/D4 movement-target simulations checked for a clean witness after a body-overlap diagnostic; none found.
- 60 coverage × reaction-delay × speed probes found the executable-read failures above.
- 120 strategy combinations at default assumptions checked for windows ending before the permitted read; none found.
- Paired attack reproduction proved the identical-world comparison failure and measured the actual tradeoff.
- Three switch/template combinations proved the tag-preview mismatch.

Observed positives: default deep versus shallow tag changes real opponent reads; adaptive rejection, short roll, and lift rules use historical observations; launched ball endpoints remain fixed; exported coaching phrases are exact supported templates rather than inferred natural language; no global defensive score was found. These checks do not replace final browser validation.
