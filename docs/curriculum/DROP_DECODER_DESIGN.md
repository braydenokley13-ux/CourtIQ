# DROP Decoder Design

**Decoder tag:** `READ_THE_COVERAGE`
**Status:** Pack 2 architecture spec. Stub primitives exist (`freezeFrameCognition.ts:305`, `decoderPrimitives.ts:210`). This document specifies how to fill them in.
**Audience:** Engineers wiring 3.1.2 (DROP) and content authors writing the first DROP variants.
**Companion docs:** `SCENARIO_OVERLAY_SPEC.md` (overlay grammar), `HUNT_DECODER_DESIGN.md` (chained reads), `PACK2_ARCHITECTURE_RISKS_AND_NEXT_STEPS.md` (cross-cutting risks + sequencing).

---

## 1. What DROP teaches

DROP is the first **coverage-recognition** decoder. The user is the **ball-handler** in a pick-and-roll, and the cognitive task is:

> *"Look at the screen defender. The way he is playing the screen tells you which exploit is open. Pick the right one."*

This is fundamentally different from BDW / ESC / SKR / AOR.

- **BDW / ESC / SKR / AOR** are **single-cue → single-action** decoders. *"Defender's hand is in the lane → cut backdoor."* The cue is a binary trigger.
- **DROP** is a **coverage-shape → menu-of-exploits** decoder. The cue is a *geometry* (where the screen defender is sitting), and the answer is the highest-EV exploit *given that geometry*. There is no single "right answer" independent of position — there is a right answer **given the screen defender's depth**.

The pedagogical move is from *recognition of body language* to *recognition of spatial coverage*. This is the first step toward HUNT, which adds chained reads on top of coverage recognition.

### 1.1 The three exploits DROP teaches

For a textbook drop:

1. **Pull-up jumper in the pocket** — when the screen defender sits at the level of the free-throw line or deeper, the ball-handler has 6–10 ft of clean space to elevate. **The default best read.**
2. **Snake the screen** — when the screen defender is in true drop and the on-ball defender is fighting *over*, the ball-handler can cross back across the screen and attack the now-vacated middle.
3. **Lob to the roller** — when the tag (low man) is late or weak-side and the screen defender is deep, the diving big has a lane to the rim.

The cognitive frame players must internalize:

> *"Drop = the screen defender is conceding the pocket to deny the rim. So I take what he gives me. What he gives me is one of three things, depending on the exact depth and the help geometry."*

### 1.2 What DROP is *not* teaching

DROP is **not** teaching the player to *recognize that a drop is being run*. That belongs in the Academy lesson `pnr-coverage-recognition` (see §6 — academy prerequisite). By the time a DROP scenario fires, the player should already know the difference between drop, hedge, switch, and ICE. The decoder teaches the **exploit selection inside the drop**, not the coverage classification.

This separation matters because conflating "what coverage is this?" with "what's the right exploit?" produces a two-step cognitive load on every scenario. We want the *coverage classification* lesson to be a one-time academy lock, and the DROP scenarios to drill the *exploit* — the part that changes scenario-to-scenario.

---

## 2. Cognitive architecture

### 2.1 Why DROP fits the existing single-freeze envelope

DROP **does not require chained reads**. The decision is one beat:

```
[ball-handler comes off the screen] → [freeze] → [pick exploit] → [replay]
```

This is the same cognitive shape as BDW. DROP can ship on the existing single-freeze infrastructure without `beatSpec.secondBeat` and without the unwired `consequence` overlay phase. It's the *cue grammar* that's new, not the cognitive architecture.

This is intentional: **DROP is the bridge from single-cue decoders to chained decoders**. It introduces coverage-shape cognition while keeping the single-beat cadence stable. HUNT is where the chained-read architecture proves out.

### 2.2 The DROP freeze beat schedule

Reuses the canonical `cue → action → advantage` schedule (`freezeFrameCognition.ts:82-91`). Same offsets, same fade durations, same cognition hold. Players should learn ONE rhythm across all decoders.

| Beat | Offset | Primitive | Anchor | Teaches |
|---|---|---|---|---|
| Cue | +200 ms | `defender_chest_line` | `screen_defender` | "His chest is at/below the screen — he's in drop" |
| Cue (composite) | +200 ms | `defender_foot_arrow` | `screen_defender` | "His feet point at the rim, not at the ball" |
| Action | +700 ms | `drive_cut_preview` | `ball_handler` | "Pocket pull-up is here" |
| Advantage | +1100 ms | `open_space_region` | `pocket_zone` | "This 6 ft is yours" |

**Three primitives at the cue beat is the cap.** For DROP this is at the ceiling but legal: the chest line + foot arrow together communicate drop depth, and the vision cone is the third tied to where the screen defender is looking. Beginner-tier (D1) DROP scenarios should use **chest + foot only** — two cues, comfortable inside the cap. The vision cone enters at D2.

### 2.3 The new role: `screen_defender`

DROP introduces one new `DecoderRole`. The existing `decoderPrimitives.ts` stub (line 225) explicitly notes "DecoderRole extensions for screen_defender / ball_handler" land with 3.1.2. The role is recognized via substring match on `ScenePlayer.role` (case-insensitive) — same convention as `helper_defender`, `closeout_defender`, etc.

Required role substrings for a DROP scenario:

```ts
requiredPlayerRoleSubstrings: ['ball_handler', 'screen_defender']
```

The screener and the on-ball defender are **always present** but are not the cue. They are *context players* — visible but not tagged with overlays. This is important: the scenario must show the screen visually (otherwise it's not a PnR), but the cue cluster must NOT highlight the screener.

### 2.4 The user is the ball-handler — and that changes everything

Every founder decoder put the user in an **off-ball** role (cutter, receiver, passer). DROP is the first decoder where the user is *on* the ball. Cognitively:

- **Off-ball cognition** (BDW/ESC): "Watch a defender. When he commits, exploit space."
- **On-ball cognition** (DROP): "*I* am the threat. The defender is playing me a certain way. I exploit how he's playing me."

The shift is from *passive observation* to *active geometric reasoning*. This has three concrete implications:

1. **Camera framing**. Off-ball decoders favor `teaching-angle` (3/4 elevated) so the user can see the help. On-ball decoders favor `passer_side_three_quarter` or a new `ball-handler-eye` preset that puts the camera roughly behind the user's shoulder. **Recommend: reuse `passer_side_three_quarter`** for DROP D1–D5. No new preset needed. (Adding presets has high blast radius: `cameraPresets.ts`, `decoderCameraPresets.ts`, `cameraTransitions.ts`, `cameraComposition.ts` all touch.)

2. **Movement vocabulary**. The scenario's `movements` array authors the screen action — `screener` lifts and sets, `ball_handler` uses the screen, `screen_defender` plays his coverage. The `kind` enum in `decoderPrimitives.ts` already has `drive` — recommend adding **no new movement kinds** for DROP and using `drive` + `cut` + `lift` to express all variations.

3. **Answer demos**. The `answerDemo` for DROP is the user *executing* the exploit (pulling up, snaking, lobbing). The wrong demos are the user *picking the wrong exploit for this geometry* (e.g., trying to lob when the low man is in position, getting it picked off).

---

## 3. D1 → D5 progression

DROP's progression is structured around **how easy the coverage is to read** and **how clean the right answer is**. Same prerequisite-DAG model as Pack 1 (`pack.json`).

### 3.1 D1 — Textbook drop, pull-up

**Coverage:** Screen defender at the level of the free-throw line, square to the lane. On-ball defender goes over the screen.
**Right read:** Pull-up jumper in the pocket.
**Why D1:** The cue is unambiguous (chest line below the screen, hips toward rim, feet planted). The exploit is the simplest — no second-side help to worry about, no roller to read. **One cue cluster, one answer.**
**Cue cluster (beginner cap = 2):** `defender_chest_line` + `defender_foot_arrow` on `screen_defender`.
**Acceptable reads:** Reject pass to roller (hits the open space behind the drop, slightly worse EV than the open jumper but legitimate).
**Wrong reads:** (1) Drive into the screen defender's chest. (2) Reset by passing back to the swing, killing the advantage.
**Coach validation:** `low`. Universally taught youth read.
**Disguise:** `none`.
**File:** `packages/db/seed/scenarios/templates/DROP.textbook-drop-pullup/`.

### 3.2 D2 — Deep drop, snake the screen

**Coverage:** Screen defender deeper than D1 (at the elbow or below), still square to the lane. On-ball defender goes over.
**Right read:** Snake — cross back across the screen and attack the middle. The deep drop concedes the middle pocket entirely.
**Why D2:** The cue is the same shape as D1 (chest line, foot arrow), but the depth is greater — the player must read **how deep** to pick snake over pull-up. Vision cone enters at this tier (cap = 3).
**Cue cluster:** `defender_chest_line` + `defender_foot_arrow` + `defender_vision_cone(target=ball_handler)` on `screen_defender`.
**Disguise:** `none` for the base variant; one variant with `light` disguise drops the foot arrow.
**Coach validation:** `low`.
**Prerequisite:** DROP D1.

### 3.3 D3 — Drop into lob

**Coverage:** Screen defender deep, low man (`tag`) is up at the elbow tagging the roller — or *not* up.
**Right read:** **Read the low man.** If the low man is up tagging, the pull-up is open (back to D1's read). If the low man is *not* up, the lob to the roller is open.
**Why D3:** Introduces a **second cue** in the cluster — the low man's positioning. This is the highest cue density in the DROP family without crossing into HUNT territory. The low man is highlighted with `help_pulse(role: 'tag')`.
**Cue cluster (intermediate cap = 4 across two defenders):** `defender_chest_line` + `defender_foot_arrow` on `screen_defender`; `help_pulse(role: 'tag')` + `defender_hip_arrow` on `low_man`.
**This is the first scenario where the answer changes based on a second player's positioning.** It is *not* yet a chained read (single freeze, single answer) — but it is the gateway to HUNT cognition. Authors should treat D3 DROP as the conceptual training wheel for HUNT.
**Coach validation:** `medium`. Two-defender cue clusters increase ambiguity risk; SME must approve the geometry.
**Prerequisite:** DROP D1, DROP D2.

### 3.4 D4 — Disguised drop (drop that *looks like* hedge for ~250 ms)

**Coverage:** Screen defender shows hedge for the first ~250 ms of the screen, then settles into drop. The on-ball defender goes over expecting hedge support, finds drop instead.
**Right read:** Hold the dribble through the fake hedge, then attack the pocket as the drop settles.
**Why D4:** This is the first DROP scenario where the **timing of the read** matters. If the player triggers on the first 250 ms (hedge-shaped chest line), they execute the wrong exploit (try to skip past the hedge). If they wait 500 ms, the chest line settles into drop shape and the pull-up opens.
**Authoring:** `freezeMarker.atMs` is set 600–800 ms after the screen — late enough that the drop has settled. Pre-freeze movements show the hedge fake; the freeze captures the moment it resolves.
**Cue cluster:** Same as D2.
**Disguise:** `moderate` — drops the foot arrow. The chest line alone (now in drop shape) carries the cue.
**Coach validation:** `medium`. The disguise window is the load-bearing piece; SME must verify the timing is teachable not gimmicky.
**Prerequisite:** DROP D2.

### 3.5 D5 — Late-clock drop with secondary rotation

**Coverage:** Drop with a 4-second shot clock. Pull-up is open BUT the secondary defender (weak-side wing) is rotating up to contest *during* the elevation.
**Right read:** Pull up immediately on the catch — beat the rotation. Hesitation kills the read.
**Why D5:** Adds **time pressure** as the second axis. Same cue cluster as D2, but the `timingOverrides.cognitionHoldMs` is set to the 1100ms floor (down from default 1400). The player has 300 ms less to read — the cognition hold is compressed at the schema level, not the freeze duration.
**Authoring:** `timingOverrides.cognitionHoldMs: 1100`.
**Cue cluster:** Same as D2 + a `label` overlay `:04` anchored at half-court (clock).
**Disguise:** `heavy` — also drops the vision cone. Just chest + foot + clock label.
**Coach validation:** `medium`.
**Prerequisite:** DROP D2, DROP D4.

---

## 4. Visual cues and overlay choreography

### 4.1 Reusing existing pre-answer primitives — *no new schema*

The hardest design decision in DROP was: **do we add a `defender_drop_depth` pre-answer primitive?** The intuitive answer is yes — drop depth is a horizontal bar showing where the screen defender is sitting relative to the level of the screen, which would be a clean cue.

**The design decision is no.** Reasons:

1. **Adding to `PRE_ANSWER_OVERLAY_KINDS` (`schema.ts:194`) has high blast radius.** Every consumer (renderer, beat compiler, lint, tests) must be updated.
2. **`defender_chest_line` + `defender_foot_arrow` *already* communicate drop depth.** The chest line marks where the screen defender's torso is — at the screen level (hedge), at the elbow (textbook drop), at the FT line (deep drop). The foot arrow marks orientation (toward rim = drop, toward ball-handler = hedge).
3. **Reuse strengthens the visual grammar.** Players who learned to read `defender_chest_line` for BDW (top-lock denial) re-encounter it for DROP (coverage classification). The same primitive teaches different reads in different contexts — that's what consistent grammar does.

**Lint rule recommendation (HIGH leverage):** *DROP scenarios MUST include `defender_chest_line` AND `defender_foot_arrow` on the `screen_defender`.* This is enforced at the template lint layer (`scripts/lint-variants.ts`), not at the runtime schema. Schema rejection would be too rigid; lint warning catches authoring mistakes during review.

### 4.2 Post-answer reveals

Standard reveal grammar. Depending on which exploit is correct:

- **Pull-up exploit:** `open_space_region` anchored at the pocket (the ~6 ft area between ball-handler and screen defender), `timing_pulse` at the elevation point.
- **Snake exploit:** `drive_cut_preview` showing the cross-back path, `open_space_region` anchored at the middle.
- **Lob exploit:** `passing_lane_open` from ball-handler to the rim above the roller, `open_space_region` anchored at the rim alley.

No new post-answer primitives required.

### 4.3 What freeze framing must show

Every DROP freeze must show **five elements** simultaneously (per the QA matrix convention):

1. The ball-handler (user, with eye-line indicator).
2. The screener and the on-ball defender (context, no overlays).
3. The screen defender with its cue cluster (chest + foot, at minimum).
4. The roller — even when the answer is *not* the lob, the roller's defender (tag) must be visible because the player has to mentally rule out the lob.
5. The pocket zone — the geometry of the open space.

If any of these is hidden by camera framing or occluded, the freeze fails QA. Authors should preview at `/dev/scene-preview?scenario=<id>&glb=1` and verify all five before submitting for SME review.

---

## 5. Bad DROP vs great DROP — concrete failure patterns

### 5.1 What bad DROP looks like

These are the failure modes I expect to see in early authoring. Each maps to a lint rule or a QA matrix constraint we should enforce.

**Bad DROP #1 — "Trivia DROP"**
The scenario hinges on the player recognizing a specific NBA team's coverage tendency or a coach's terminology (e.g., "Spain pick-and-roll"). Cognitively this is *recall*, not *recognition*. Transfer is zero — the player can't apply the read in their own games.
*Mitigation:* SME review checklist must include: *"Could a 13yo who has never watched the NBA solve this from the visual cues alone?"* If no, reject.

**Bad DROP #2 — "Two right answers"**
Pull-up and snake both look correct because the screen defender's depth is ambiguous. The player picks one, gets marked wrong, can't tell why.
*Mitigation:* Lint rule — every DROP variant must declare exactly one `quality: 'best'` choice and the `acceptable_reads[]` list must explain *why* the acceptable read is worse (smaller advantage window, longer recovery). If `acceptable_reads` is empty AND there are two plausible exploits, the scenario is ambiguous by construction.

**Bad DROP #3 — "Drop with help that should be hedge"**
The screen defender is at the screen level, chest forward, foot pointing at the ball — that's hedge geometry. But the scenario is tagged DROP. The cue cluster lies.
*Mitigation:* Decoder-confusion lint rule (see §7). The visible cue must be classifiable as DROP by the readability layer, not as hedge or switch.

**Bad DROP #4 — "Three exploits, all marked wrong except pull-up"**
The scenario only authors the pull-up answer. Snake and lob are tossed in as distractors and marked wrong — even when they would, in fact, work given the geometry.
*Mitigation:* `quality: 'acceptable'` must be used aggressively. Wrong reads should be *actually wrong* in the geometry of the scenario, not just "less canonical."

**Bad DROP #5 — "Late-clock pressure that can't be felt"**
A D5 scenario authored with the same cognition hold as D2. The player reads it the same way, gets it right with no urgency, and the lesson lands flat.
*Mitigation:* D5 DROP MUST set `timingOverrides.cognitionHoldMs` to ≤1200. The clock label must be visible. The choice tray opens earlier (`choiceTrayAtMs ≤ 1200`).

### 5.2 What great DROP looks like

A great DROP scenario:

- **Lands the cue in the first 800 ms post-freeze.** The chest line and foot arrow are the load-bearing cues; they appear at +200 ms and the action overlay at +700 ms. By 1.0 s after freeze the player has all the geometric information needed.
- **The wrong reads are *educational*.** Every wrong demo shows what would happen — the contested layup against the recovered drop, the lob picked off by the up tag, the snake into the recovering on-ball defender. Players learn the geometry by seeing the failure mode.
- **The replay choreography emphasizes the geometry.** When the player gets it right, the replay slow-pans across the pocket showing the 6 ft of clean space; when they get it wrong, the replay zooms in on the recovered defender contesting the bad shot.
- **The next scenario in the session reuses the cue cluster but changes the right answer.** Spaced reps that vary the exploit (D1 → D3 → D5) build coverage-classification mastery faster than three D1 reps in a row.

---

## 6. Academy prerequisite (HIGH leverage)

DROP scenarios must not appear in a session **until the player has completed the academy lesson `pnr-coverage-recognition`** (a new lesson, not yet authored). This lesson teaches the four PnR coverages — drop, hedge, switch, ICE — as a one-time visual classification exercise. Without this lesson, every DROP scenario carries an implicit second cognitive task ("what coverage is this?") that drowns out the actual decoder ("what's the exploit?").

The prerequisite is enforced at the `Module.prerequisite_ids` and `Concept.parent_id` levels (existing schema). Implementation:

```jsonc
// packages/db/seed/scenarios/templates/DROP.textbook-drop-pullup/template.json
{
  "tactical": {
    "lesson_connection": "pnr-coverage-recognition",  // PRECEDES the decoder
    // ... DROP-specific fields
  }
}
```

The session generator (PRODUCT_SPEC §6.3) already weights toward "current module progression" — the prerequisite chain ensures DROP doesn't surface until coverage recognition is mastered.

---

## 7. Authoring constraints and lint rules

These are the lint rules I recommend adding to `scripts/lint-variants.ts` to catch DROP authoring mistakes at review time, not in production.

### 7.1 LINT-DROP-01 — Required cue cluster
Every variant of a DROP template must include both `defender_chest_line` and `defender_foot_arrow` on the `screen_defender` slot in `overlays.pre`. Reject otherwise.

### 7.2 LINT-DROP-02 — Forbidden cue cluster
DROP scenarios MUST NOT include `defender_hand_in_lane` (BDW cue) or `help_pulse(role: 'overhelp')` (SKR cue) in their pre-overlays. These primitives map to other decoders and would cause decoder-confusion failures in the readability layer.

### 7.3 LINT-DROP-03 — User role
The `isUser: true` player must have a `role` containing the substring `ball_handler`. Off-ball DROP scenarios are out of scope for Pack 2.

### 7.4 LINT-DROP-04 — Single-decoder cluster
DROP cue cluster must not exceed 4 primitives across `screen_defender` + `low_man` (D3 cap). Beyond that, the scenario is structurally a HUNT (chained read) and should be authored as such.

### 7.5 LINT-DROP-05 — Required acceptable reads
Every DROP variant must author at least one entry in `acceptable_reads[]`. A DROP scenario with no acceptable read is structurally suspicious — coverage decoders almost always have a "fine but not best" alternative.

### 7.6 LINT-DROP-06 — Coverage-confusion check
The visible cue cluster must classify as DROP under a (new, separate) `decoderReadability` confidence test. Rejection threshold: if the cluster classifies as HEDGE or SWITCH with confidence > 0.4, the scenario fails. *This is a stretch lint rule — recommended for v2 of the lint suite, not required for the first DROP variants to ship.*

---

## 8. What changes in the codebase

The following touch points are required to ship the first DROP D1 scenario. Each is small. None requires architectural change.

| Change | File | Size | Notes |
|---|---|---|---|
| Populate `DROP_TEMPLATES` (3 freeze beats) | `apps/web/lib/scenario3d/freezeFrameCognition.ts:305` | ~30 lines | Replace the `_PACK2_STUB = []`. |
| Add DROP camera preset dispatch | `apps/web/lib/scenario3d/cameraPresets.ts:170` | ~10 lines | Reuse `passer_side_three_quarter` for freeze, `player-read-angle` for replay. |
| Fill in DROP `requiredIntents` + `requiredAuthoring` | `apps/web/lib/scenario3d/decoderPrimitives.ts:210` | ~25 lines | Replace the `_PACK2_STUB`. Add `screen_defender` substring requirement. |
| Add DROP entry to `EXPLANATIONS` | `apps/web/lib/decoders/explanations.ts` | ~15 lines | One-liner + meaning + watch + matters + example. |
| Add DROP teaching label | `apps/web/lib/scenario3d/replayTeachingTimeline.ts:107` | 1 line | `READ_THE_COVERAGE: { text: 'Read the coverage.', anchorRole: 'ball_handler' }`. |
| Add LINT-DROP-01..05 rules | `scripts/lint-variants.ts` | ~40 lines | Authoring guardrails. |
| Author DROP D1 template + 1 base variant | `packages/db/seed/scenarios/templates/DROP.textbook-drop-pullup/` | New | Use BDW.denied-wing as authoring reference. |
| Author DROP D1 prose bank | Same dir | New | 3 quality tiers × 2–3 skeletons each. |
| Update QA matrix with 1 DROP row | `apps/web/lib/scenario3d/qaMatrix.ts` | ~10 lines | One row per D-tier eventually; D1 first. |
| Author Academy lesson `pnr-coverage-recognition` | TBD | New | Prerequisite for any DROP scenario surfacing in sessions. |

**Total touch surface for D1 ship:** ~150 lines of code + 1 template + 1 lesson. Estimated 2–3 engineer-days plus content authoring. **No schema changes required.**

---

## 9. The DROP design principle in one sentence

> *"DROP teaches the player to look at the screen defender's shape and pick the right exploit from a fixed menu. The cognitive load is in the geometry, not in chained timing. Keep the freeze cadence identical to BDW; let the new cue grammar (chest + foot) carry the new lesson."*

The discipline that makes DROP work: **same cadence, new grammar.** Players learn one rhythm; we layer cognitive demands inside that rhythm. This is also what makes DROP the right precursor to HUNT — once the player is fluent with multi-cue clusters in a single beat, chained two-beat reads become tractable.
