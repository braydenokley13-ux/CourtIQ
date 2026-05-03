# Scenario Readability Checklist

**Owner:** Phase P / P2.6 — Generalized Scenario Readability Primitives.
**Audience:** Anyone authoring or QAing a CourtIQ founder scenario.
**Goal:** A single, repeatable checklist so new scenarios ship readable
the first time, instead of needing per-scenario polish phases.

CourtIQ is NOT a game. Every scenario is a teaching scene that must
clearly communicate one read at the freeze frame. If a checklist item
fails, the scenario is not yet shippable — fix the authoring, not the
renderer.

---

## Six teaching questions

Every founder scenario must let a viewer answer all six questions from
normal viewing distance:

1. **Who is making the read?**
2. **What defensive cue should I look at?**
3. **What space or advantage is being created?**
4. **What is the correct decision?**
5. **Does the ball / pass support the teaching beat?**
6. **Are bodies and paths visually clear?**

If a question can't be answered from the freeze frame plus the answer
demo, the scenario is not yet teachable.

---

## Decoder visual primitive map

Each decoder declares its required visual primitives in
`apps/web/lib/scenario3d/decoderPrimitives.ts`. The map is the single
source of truth — `decoderPrimitives.test.ts` enforces it against the
authored JSON automatically.

| Decoder              | Read actor    | Cue actor          | Required intents (role → intent)                                                                                                       | Pass kind |
|---|---|---|---|---|
| BACKDOOR_WINDOW      | cutter        | deny_defender      | cutter → BACK_CUT · deny_defender → DEFENSIVE_DENY · passer → PASS_FOLLOWTHROUGH · receiver → RECEIVE_READY                            | pass      |
| ADVANTAGE_OR_RESET   | receiver      | closeout_defender  | receiver → RECEIVE_READY · closeout_defender → CLOSEOUT · helper_defender → SLIDE_RECOVER · passer → PASS_FOLLOWTHROUGH                | pass      |
| EMPTY_SPACE_CUT      | cutter        | helper_defender    | cutter → EMPTY_SPACE_CUT · helper_defender → DEFENSIVE_HELP_TURN · receiver → RECEIVE_READY · passer → PASS_FOLLOWTHROUGH              | pass      |
| SKIP_THE_ROTATION    | passer        | helper_defender    | passer → PASS_FOLLOWTHROUGH · open_player → SHOT_READY · helper_defender → DEFENSIVE_HELP_TURN · closeout_defender → CLOSEOUT          | skip_pass |

The map drives:

- The runtime resolver via `resolveGlbClipForIntent`.
- The founder-scenario invariant test (`decoderPrimitives.test.ts`).
- Future overlay / camera hints that need to know what to emphasise.

---

## Authoring checklist

For every new founder scenario JSON, confirm each item before opening a PR:

### Scene structure

- [ ] `decoder_tag` matches one of: `BACKDOOR_WINDOW`,
      `ADVANTAGE_OR_RESET`, `EMPTY_SPACE_CUT`, `SKIP_THE_ROTATION`.
- [ ] Exactly one player has `isUser: true`.
- [ ] Exactly one offensive player has `hasBall: true`.
- [ ] Player roles include the substrings the decoder requires (see
      `requiredPlayerRoleSubstrings` in
      `decoderPrimitives.ts`).
- [ ] At least one defender carries the role substring that the cue
      actor declares (e.g. `denying` for BDW, `help` for ESC / SKR,
      `on_ball` / `closeout` for AOR).

### Movement timing

- [ ] `freezeMarker` is present and lands BEFORE the answer demo
      starts (so the freeze pose is the readable cue, not the action).
- [ ] `answerDemo` includes every movement kind the primitive map
      requires (`back_cut` + `pass` for BDW, `lift` for AOR, `cut` +
      `pass` for ESC, `skip_pass` for SKR).
- [ ] Pass `delayMs` is set so the **passer visibly reacts to the cut**
      (do not release at the same tick the cut starts — the BDW-01 P2.5
      tuning is the reference: ~150 ms after the cut commits).
- [ ] Pass arrival lines up with the cutter / shooter being **at** the
      catch point (mismatched arrivals are the #1 readability bug).
- [ ] `wrongDemos` covers every wrong / acceptable choice id so the
      consequence-replay path renders a real outcome on every branch.
- [ ] Total answer demo runs ≤ 3 s (Phase H budget).
- [ ] Total consequence demos run ≤ 2.5 s each (Phase H budget).

### Visual cues

- [ ] At freeze, the cue actor's body language is the dedicated
      decoder posture — `defensive_deny`, `closeout` (or P2.6
      `closeout_read` fallback), `defense_slide` — not `idle_ready`.
- [ ] At freeze, the read actor's body language is `receive_ready`
      (catch / shot / reset) or one of the cutter postures, never
      `cut_sprint` running in place.
- [ ] No more than 3 overlays on the freeze frame. Use
      `defender_vision_cone`, `defender_hip_arrow`,
      `defender_chest_line`, `passing_lane_blocked`,
      `open_space_region` — not all at once.
- [ ] No defender's body visibly tangles with the user's body at the
      freeze (small scenario-data spacing fixes are cheaper than
      renderer changes).
- [ ] No ball / pass crosses through a denied lane in a way that
      contradicts the teaching cue (the BDW post-answer overlays
      flag the blocked lane explicitly — copy the pattern).

### Architecture invariants (don't break)

- [ ] No imported clip ships without a flag.
- [ ] Scenario data — not animation — owns x / z / t. No root motion,
      no animation-driven player movement, no ball logic that mutates
      scenario data.
- [ ] Same scenario replayed twice produces byte-identical transforms
      at freeze (the determinism test enforces this).
- [ ] Pass-arc helpers (`samplePassArc`, `computeReadablePassArcPeak`)
      are pure and finite-safe; do not bypass them.

---

## Reusable visual primitives

Procedural pose-only clips (always available, no flag needed):

| Clip            | Used for                                              | Replaces (pre-P2.6)      |
|---|---|---|
| `idle_ready`    | Stationary alert players (off-ball, defaults)         | —                        |
| `cut_sprint`    | Offensive moving intents — back_cut, empty_space_cut, jab, pass-follow | — |
| `defense_slide` | Lateral defensive recovery (help-turn, slide-recover) | —                        |
| `defensive_deny`| BDW deny defender — hand / hip in passing lane        | (introduced P2.4)        |
| `receive_ready` | Stationary catch / shot / reset — RECEIVE_READY, SHOT_READY, RESET_HOLD | `cut_sprint` (P2.6 fix)  |
| `closeout_read` | Forward closeout fallback when imported clip flag off | `defense_slide` (P2.6 fix) |

Imported clips (flag-gated):

| Clip       | Flag                          | Falls back to    |
|---|---|---|
| `closeout` | `USE_IMPORTED_CLOSEOUT_CLIP`  | `closeout_read`  |
| `back_cut` | `USE_IMPORTED_BACK_CUT_CLIP`  | `cut_sprint`     |

---

## QA routes

Manual QA must walk each authored founder scenario through every
camera mode (FOLLOW / REPLAY / BROADCAST / AUTO):

- BDW: `/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1`
- AOR: `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`
- ESC: `/dev/scene-preview?scenario=ESC-01&glb=1` *(scenario not yet authored — track in P3)*
- SKR: `/dev/scene-preview?scenario=SKR-01&glb=1` *(scenario not yet authored — track in P3)*

For each route confirm the six teaching questions can be answered, and
that no body looks tangled, no arms look broad / T-pose-like, and no
ball teleports.

---

## Founder scenario status (P2.6 baseline)

| Scenario | Status | Notes |
|---|---|---|
| BDW-01   | LIVE   | P2.3 readable back-cut + P2.4 deny posture + P2.5 pass timing landed. P2.6 receive_ready improves the wing freeze pose. |
| AOR-01   | DRAFT  | P2.6 closeout_read replaces the laterally-shifting fallback for `USE_IMPORTED_CLOSEOUT_CLIP=off`. P2.6 receive_ready improves the catch / shot / reset stances. |
| ESC-01   | NOT AUTHORED | Decoder × role intent table is wired; primitive map declares requirements; awaiting scenario JSON. |
| SKR-01   | NOT AUTHORED | Decoder × role intent table is wired; primitive map declares requirements; awaiting scenario JSON. |

When ESC-01 / SKR-01 land, no renderer or test work is required — the
invariant test in `decoderPrimitives.test.ts` automatically picks them
up off disk.
