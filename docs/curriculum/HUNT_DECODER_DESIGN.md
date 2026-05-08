# HUNT Decoder Design

**Decoder tag:** `HUNT_THE_ADVANTAGE`
**Status:** Pack 2 architecture spec. Stub primitives exist (`freezeFrameCognition.ts:306`, `decoderPrimitives.ts:230`). The schema has pre-seeded the `beatSpec.secondBeat` field (`schema.ts:112-116`) and the `OverlayBeatPhase: 'consequence'` value (`overlayBeats.ts:33`) explicitly for HUNT. This document specifies how to wire and use them.
**Audience:** Engineers wiring 3.1.4 (HUNT chained-freeze infrastructure) and content authors preparing the first HUNT variants once the runtime is wired.
**Companion docs:** `DROP_DECODER_DESIGN.md` (single-beat decoder, DROP is the prerequisite mental model), `PACK2_ARCHITECTURE_RISKS_AND_NEXT_STEPS.md` (sequencing + risks).

---

## 1. What HUNT teaches

HUNT is the first CourtIQ decoder where **a single scenario contains two reads in series**. The cognitive task:

> *"Read 1 created an advantage. The defense responded. Now read what the defense gave you, and exploit THAT."*

This is the bridge from single-read decoders to chained offense. It teaches:

1. **Defenses react.** The first action you ran created a problem the defense had to solve, and the way they solved it created a new opening.
2. **Advantages decay.** The window between the defense's reaction and their full recovery is short — the second read must come fast.
3. **Decoy actions.** The first action was not always meant to score. It was meant to *force a reaction*. Recognizing this shift is the heart of HUNT.

Concrete examples HUNT covers:

- **Mismatch hunting**: Force a switch onto a smaller / weaker defender, then immediately attack the mismatch.
- **Swing-and-attack**: Skip pass forces the closeout. Read the closeout angle. Drive past or shoot.
- **Drag-and-roll → kick**: Drag screen creates a help rotation. Read which weak-side shooter just opened up. Skip there.
- **Decoy cut → real cut**: Cut to bait a tag. Tag commits. Cut back into the now-vacated space.

The unifying structure: **action 1 → defensive reaction → read the new geometry → action 2**.

### 1.1 The pedagogical leap from single-read decoders

| Decoder type | Cognitive shape | Example |
|---|---|---|
| BDW / ESC / SKR / AOR | "Cue → action" | Defender's hand in lane → backdoor cut |
| DROP | "Geometry → exploit menu" | Drop coverage → pull-up vs snake vs lob |
| **HUNT** | **"Action → reaction → read → action"** | Skip pass forces closeout → read closeout angle → drive baseline |

HUNT does not teach a *new* visual cue. It teaches the **temporal sequencing of reads**. The cues themselves (closeout angles, help rotations, switches) are reused from earlier decoders. What changes is that the player now has to **chain them**.

### 1.2 What HUNT is *not* teaching

HUNT is **not** teaching set offense. It is not teaching playcalls. It is not "watch this exact play and tell me where to pass." HUNT scenarios should be **structurally compositional**: action 1 is *some* offensive action that forces *some* defensive reaction, and the read is what the reaction yielded. Authors should resist the temptation to author specific NBA-team sets — those produce "basketball trivia" failures (see §5.1).

---

## 2. Cognitive architecture — the two-beat freeze

### 2.1 Why HUNT requires multi-beat cognition

The user explicitly asked: *can the current single-freeze architecture support HUNT cleanly?*

**The answer is: yes, but only because the schema has already been seeded for it.** The `beatSpec` field on `sceneSchema`:

```ts
// apps/web/lib/scenario3d/schema.ts:112-116
export const beatSpecSchema = z.object({
  firstBeat: freezeMarkerSchema,
  secondBeat: freezeMarkerSchema.optional(),
})
```

was added in Phase 3.1.4 specifically anticipating HUNT. The schema accepts a second freeze marker today; the runtime renderer does not yet trigger a second freeze on it. Wiring the runtime is one of the two highest-leverage changes in Pack 2 (the other being wiring the `consequence` overlay phase — see §4 below).

A naïve single-freeze HUNT (everything happens during one freeze, the action 1 + reaction + action 2 are all collapsed into one beat) would be **structurally illegible**. The cognition hold (1400 ms default) is not enough to read action 1 + recognize the defensive reaction + decide on action 2. Stretching the cognition hold to ~3.5 s violates the schema's 4000 ms ceiling and, more importantly, exceeds the attention budget for a 13-year-old player.

The right architecture is **two distinct freeze beats with distinct cognition holds**, separated by ~1.0–1.5 s of unfrozen play during which the defense reacts. The player's eye tracks the reaction, then the second freeze captures the new geometry.

### 2.2 The two-beat schedule

```
[t=0]    Scene starts. Action 1 begins (e.g., drag screen, skip pass, decoy cut).
[t=~1.2s] FIRST FREEZE (beatSpec.firstBeat).
          - Cognition hold: 1100 ms (the floor; SHORTER than default 1400ms).
          - 1-2 cues showing what the offense initiated.
          - NO choice tray. Player just observes.
          - This is "action 1 happened — see it."
[t=~2.5s] Unfreeze. Defensive reaction plays out.
          - 800–1500 ms of real-time animation.
          - Helper steps over, switch happens, closeout flies, etc.
          - NO overlays during this window. The player WATCHES.
[t=~4.0s] SECOND FREEZE (beatSpec.secondBeat).
          - Cognition hold: 1400 ms (default).
          - 2-3 cues showing the new geometry.
          - Choice tray opens (this is THE decision).
          - This is "now read what they gave you."
[t=~5.4s] Choice. Replay teaches the right answer.
```

**Total envelope:** ~5.5 s from scene start to choice. This is roughly 2x a BDW scenario (~2.5 s). The added load is the price of teaching chained cognition. The mitigation is **shorter cognition hold on beat 1** (1100 ms — the schema floor) and **no choice tray on beat 1**, so beat 1 is information-only and beat 2 is the decision-only.

This split is critical: **only one beat is a decision beat.** If both beats had choice trays, the player would face two decisions per scenario, which doubles the cognitive load AND breaks the IQ scoring model (one scenario = one decision). Beat 1 is *observation*; beat 2 is *cognition + action*. This separation is the load-bearing design choice in HUNT.

### 2.3 Why beat 1 needs the SHORTEST cognition hold, not the longest

A counter-intuitive but critical design choice: **beat 1's cognition hold is shorter than beat 2's**, even though beat 1 is establishing context.

The intuition wants: *"give the player more time on beat 1 to absorb the setup."* The reality of teaching chained cognition is the opposite. Beat 1 must feel like a **glance**, not a study session. If beat 1's hold is long, the player exhausts attention on it and arrives at beat 2 (the actual decision) cognitively fatigued.

Concretely:

- Beat 1 hold: 1100 ms (the schema floor in `timingOverridesSchema`).
- Beat 2 hold: 1400 ms (the default — same as every other decoder).
- Inter-beat unfreeze: 1000–1500 ms (lets the defensive reaction play out at real speed, not slowed down).

This puts beat 1 at the readability floor — which means the cue cluster on beat 1 must be **at most 2 primitives**. More than that and the cluster overflows the attention available in 1100 ms.

### 2.4 Beat 2 is visually simpler than beat 1, not more complex

Second counter-intuitive design choice: **beat 2 has fewer cues than beat 1 in the cluster diff sense.** The way this works is the principle of **"highlight only what changed."**

Concretely: beat 1 establishes the scene with 2 cues. Beat 2 *removes* one of the beat-1 cues (the one that's no longer load-bearing) and *adds* one new cue (showing the defensive reaction). Net cue count on beat 2 is again ~2.

| Phase | Cue count | What's shown |
|---|---|---|
| Beat 1 freeze | 2 | The user's pre-action positioning + the targeted defender's pre-state |
| Unfreeze | 0 | Reaction animation, no overlays |
| Beat 2 freeze | 2 (1 retained, 1 swapped in) | The user's post-action position + the *new* state of the defense |

The player's cognitive task on beat 2 is **diff cognition**: *"What changed? What did they give me?"* If beat 2 introduced 3 brand-new cues, the player would re-parse the scene from scratch — and beat 1's setup would be wasted.

This is why **the consequence overlay phase matters so much for HUNT.** The `consequence` phase (`overlayBeats.ts:33`) is the canonical home for showing *what changed* — it's defined explicitly to fade in *after* the answer is chosen, but it can also be used to bridge from beat 1 to beat 2 by showing "the defense moved here." See §4.

---

## 3. The HUNT-specific overlay grammar

### 3.1 New overlay primitives — *prefer not to add*

HUNT does NOT require new pre-answer overlay primitives. The existing 7-primitive allow-list (`PRE_ANSWER_OVERLAY_KINDS` in `schema.ts:194`) covers every cue HUNT needs. The reason: HUNT teaches chained cognition, not new cue types. The cues are the same as BDW/ESC/SKR/AOR/DROP — what's new is the *sequencing*.

The one minor extension I'd recommend: add `'mismatch'` to the `help_pulse.role` enum (`schema.ts:171`):

```ts
role: z.enum(['tag', 'low_man', 'nail', 'stunter', 'overhelp', 'mismatch']),
```

This lets `help_pulse(role: 'mismatch')` highlight the targeted defender on beat 2 ("here is the matchup you forced"). Single enum addition; ~5 minutes of work; no breaking change.

Anything beyond this — a `defender_switch_arrow` or `chain_marker` primitive — should be deferred. The signal-to-noise tradeoff isn't worth it for the first 5 HUNT variants.

### 3.2 The `consequence` phase finally gets used

`OverlayBeatPhase` includes `'consequence'` (`overlayBeats.ts:33`):

```ts
export type OverlayBeatPhase = 'watch' | 'freeze' | 'answer_replay' | 'consequence'
```

`compileBeatsToFlatOverlays` already returns a `consequence` array, but the renderer **does not consume it** (P3.0 comment in `overlayBeats.ts:138`). HUNT is the trigger to wire this.

The `consequence` phase is the right home for:

1. **Beat-1-to-beat-2 transition overlays.** When the first freeze ends and the defense reacts, the consequence phase can show ghost arrows of where the defenders moved, anchored to the targeted player. This bridges the gap between the two freezes without crowding either.
2. **Wrong-choice consequences.** When the player picks the wrong exploit, the consequence phase shows what would have gone wrong (the late closeout that recovered, the secondary help that picked off the lob). Today the `wrongDemos[]` field exists (`schema.ts:118-124`) but is sparsely used; the consequence overlay phase is the visual layer that complements it.
3. **Delayed punishment.** A correct read might still get partial credit if the player took too long. The consequence phase can show a `timing_pulse` indicating "the window closed" even on a "right" answer — without changing the IQ delta logic, just showing the player *why* their read was late.

### 3.3 Camera transitions between the two freezes

The single hardest visual problem in HUNT is the camera move between beat 1 and beat 2. Current camera presets (`cameraPresets.ts`) snap to the freeze position. A second freeze 1.5 s later requires either re-snapping (jarring — the camera teleports) or a smooth bridging transition.

**Recommended approach: a new `cameraTransitions` mode `chained_freeze_bridge`** that interpolates between the two freeze positions over the duration of the unfreeze window. The transition starts when beat 1's handoff completes, eases through the inter-beat unfreeze, and arrives at beat 2's framing 100 ms before beat 2's freeze entry. Smooth, deterministic, and reuses the existing camera transition infrastructure.

This is the only architectural change HUNT *requires*. The rest can reuse existing primitives.

---

## 4. Specific HUNT variations — D1 → D5 progression

HUNT D1 is the most cognitively demanding D1 in the curriculum. Authors should not assume HUNT D1 is "easy" because it's a D1. **HUNT's D1 is roughly equivalent in load to BDW's D3.**

### 4.1 D1 — Pre-set switch, exploit immediately

**Setup:** The screen + switch already happened off-screen. The scene opens with the user (a wing) being guarded by a slower / smaller defender after the switch. Beat 1 freezes immediately to show the matchup. Beat 2 freezes after a single dribble probe to show the resulting reaction.
**Why D1:** Avoids teaching "force the switch" + "exploit the switch" simultaneously. The switch is a given. The decoder teaches just the *exploitation*.
**Beat 1 (1100 ms hold):** `help_pulse(role: 'mismatch')` on the smaller defender + `defender_chest_line` showing his stance.
**Beat 2 (1400 ms hold):** Same `help_pulse(role: 'mismatch')` + `defender_foot_arrow` showing his recovery angle after the probe.
**Right read:** Drive baseline against the recovery angle. (Or: pull up if the defender bit on the dribble.)
**Coach validation:** `medium`. SME must verify that the matchup is genuinely exploitable for the user's role.
**Disguise:** `none`.
**File:** `packages/db/seed/scenarios/templates/HUNT.preset-mismatch/`.

### 4.2 D2 — Force the switch, then exploit

**Setup:** User is the ball-handler; runs a screen on a target defender; the defense switches; user attacks the mismatch.
**Why D2:** Adds the *forcing* of the switch as the first read. This is where HUNT's chained cognition truly begins.
**Beat 1 (1100 ms hold):** `help_pulse(role: 'mismatch')` on the upcoming defender + `defender_hip_arrow` showing the screen-defender already preparing to switch.
**Beat 2 (1400 ms hold):** `help_pulse(role: 'mismatch')` + `defender_chest_line` on the new defender.
**Right read:** Same as D1 — drive baseline. The new cognition is recognizing that the switch happened, not picking the exploit.
**Coach validation:** `medium`.
**Prerequisite:** HUNT D1.

### 4.3 D3 — Bait-and-attack (decoy first action)

**Setup:** User is the cutter. Runs a hard cut to the corner that *isn't* the real action — it's a decoy meant to pull the tag. The tag commits. User reverses and cuts into the now-vacated paint.
**Why D3:** Reverses the polarity of action 1. The first action is *not* meant to score; it's bait. The player must internalize that *some actions are meant to fail in order for the second action to succeed.* This is the deepest pedagogical move in HUNT.
**Beat 1 (1100 ms hold):** `help_pulse(role: 'tag')` on the low man + `defender_vision_cone` showing the tag's eyes locked on the decoy cut.
**Beat 2 (1400 ms hold):** `open_space_region` is post-only — but the cue cluster on beat 2 shows `defender_hip_arrow` on the now-displaced tag, communicating "he committed; the space is yours."
**Right read:** Cut back into the paint.
**Coach validation:** `high`. Decoy actions are subtle; the SME must verify the tag commitment is unambiguous.
**Prerequisite:** HUNT D1, HUNT D2.

### 4.4 D4 — Late-help variation

**Setup:** Skip pass action (SKR-shaped, but extended into HUNT). The first skip works. The closeout flies. The closeout's recovery creates a NEW open shooter elsewhere. User must recognize the secondary opening and make the second pass.
**Why D4:** Introduces the **second-side rotation** — the highest-leverage chained read in pro basketball. The player learns that the first kick out is the bait; the second kick out is the score.
**Beat 1 (1100 ms hold):** Closeout in flight; `defender_vision_cone` on the closeout showing target + `defender_hip_arrow` on the secondary helper rotating toward the original receiver.
**Beat 2 (1400 ms hold):** `help_pulse(role: 'overhelp')` on the secondary helper + `defender_chest_line` showing the new open shooter is now uncovered.
**Right read:** Skip pass to the second open shooter (not the one who caught the first skip).
**Coach validation:** `high`. This is where HUNT scenarios are most prone to ambiguity — SME must verify which shooter is *most* open and that the answer isn't a coin flip.
**Disguise:** `light` on intermediate variants.
**Prerequisite:** HUNT D2.

### 4.5 D5 — Multi-target advanced

**Setup:** Two potential mismatches after a switch + slip. The user must pick which to attack. The wrong target is a defender who *looks* slower but is actually positioned to recover; the right target is a defender who looks slower AND is positioned wrong.
**Why D5:** Forces the player to disambiguate between two plausible exploits. The cognitive load is at the schema's structural ceiling.
**Beat 1 (1100 ms hold):** `help_pulse(role: 'mismatch')` on BOTH potential targets — visually identical at the cue beat. The player must look beyond size.
**Beat 2 (1400 ms hold):** `defender_foot_arrow` on each target showing recovery angles. Only one of them is broken.
**Right read:** Attack the target whose foot arrow points away from the rim (his recovery is wrong direction).
**Coach validation:** `high`.
**Disguise:** `moderate` — drops the vision cones, keeps the foot arrows.
**Prerequisite:** HUNT D2, HUNT D4.

---

## 5. What breaks first — HUNT-specific failure modes

### 5.1 "Trivia HUNT" — the highest risk
HUNT scenarios are the most prone to "basketball trivia" failures because chained cognition feels "advanced" and authors are tempted to author NBA-specific reads. Symptoms:

- The scenario hinges on knowing what "Spain pick-and-roll" or "Chicago action" is.
- The right read references a coach's terminology rather than visible geometry.
- A player who has never watched the NBA cannot solve the scenario from cues alone.

*Mitigation:* Every HUNT variant must pass a "13-year-old test": *Could a player who has never watched a college or pro game solve this from the visible cues alone?* If no, reject. Encode this as a **mandatory SME review checklist item** for HUNT scenarios specifically (HUNT requires `coach_validation.level: 'high'` for D3+).

### 5.2 "Two-beat overload"
Beat 1's cue cluster is too dense; player exhausts attention before beat 2. Symptoms in playtest: high time-to-answer on beat 2 even when the right read is obvious.

*Mitigation:* Hard cap of **2 cues on beat 1, 2 cues on beat 2** for beginner-tier HUNT (D1–D2). Lint rule LINT-HUNT-01 enforces this.

### 5.3 "Inter-beat camera judder"
The camera transition between beat 1 and beat 2 looks like a teleport. Symptoms: players report feeling "lost" or "disoriented" at beat 2 and re-parse the scene from scratch.

*Mitigation:* The `cameraTransitions.chained_freeze_bridge` mode is non-negotiable — HUNT cannot ship without it. This is the only HUNT-specific architectural change required.

### 5.4 "Decoder confusion: HUNT vs SKR"
Both decoders involve reading help and skipping past it. SKR is single-beat (read overhelp, skip). HUNT D4 is two-beat (skip → read closeout → skip again). Players who learned SKR first will misclassify HUNT D4 as "another SKR" and try to solve it on beat 1.

*Mitigation:* The Academy lesson sequence must teach the distinction explicitly. Recommended copy: *"SKR is one read. HUNT is two reads in a row."* Plus: HUNT scenarios must NEVER appear in the same session as SKR scenarios for users whose `mastery.HUNT < 0.6`. The session generator should treat HUNT and SKR as conflicting concepts during the learning phase.

### 5.5 "Two right answers"
On beat 2, both the original target and a secondary target look equally exploitable. Player picks the secondary target, gets marked wrong, can't tell why.

*Mitigation:* Same as DROP §5.1 #2 — every HUNT variant must declare a `quality: 'best'` AND a `quality: 'acceptable'` choice with explicit `acceptable_reads[]` text explaining *why* the acceptable read is worse.

### 5.6 "Determinism violation via inter-beat reaction"
The defensive reaction during the inter-beat unfreeze must be *fully scripted*. If the reaction includes any seeded randomness (e.g., the helper's recovery angle varies), the chain breaks deterministically and replay regression fails.

*Mitigation:* Lint rule LINT-HUNT-02 — `wrongDemos[]` and answer-replay movements during the inter-beat window must not include any randomized fields. All movements have explicit `delayMs` and `durationMs`. Visual regression CI (the parallel workstream) will catch violations.

### 5.7 "5-second envelope feels slow"
Even with beat-1 hold at the floor (1100 ms), HUNT scenarios run ~5.5 s from start to choice. For a child who's been playing for 20 minutes, this feels like an eternity.

*Mitigation:* Two parts. (1) Session generator must mix HUNT scenarios with shorter decoders — never run two HUNT scenarios in a row, and HUNT count ≤ 1 per 5-scenario session for the first 30 days of HUNT mastery. (2) The XP reward for HUNT must scale with difficulty (D5 HUNT = ~2x BDW D5 XP) so the player's perceived "time-per-XP" stays reasonable.

### 5.8 "Cognitive overload for ages 10–12"
The lower end of the target age range may not be developmentally ready for chained cognition. Symptoms in early data: HUNT scenarios produce abnormally high abandonment rates among users who self-rated as "Rookie" during onboarding.

*Mitigation:* Gate HUNT behind a calibration result. Users whose initial calibration places them below IQ 700 do not see HUNT scenarios in their session bundles for the first 60 days. This is a soft gate at the session-generator level, not a content gate. Implementation: extend `scenarioService.generateSessionBundle()` weighting to exclude HUNT for low-calibrated users.

---

## 6. Replay-system evolution required for HUNT

The replay teaching timeline (`replayTeachingTimeline.ts`) currently emits `correct` and `wrong` cadences. HUNT introduces a third state: **partial chain — got beat 1 right but beat 2 wrong (or vice versa)**.

The recommended evolution:

```ts
// replayTeachingTimeline.ts — proposed extension
export type ReplayPath = 'wrong' | 'correct' | 'partial_chain'

const PARTIAL_CHAIN_CADENCE: ReplayCadence = Object.freeze({
  // Replay shows beat 1 normally (no overlays — they got that part right)
  // then slows the inter-beat unfreeze 50%
  // then over-emphasizes beat 2's cue cluster to highlight what was missed
  cueRepaintHoldMs: 800,
})
```

This is additive — no breaking change to existing replays. But it's required for HUNT to teach properly: a player who got the chain partly right needs different feedback than one who blew it entirely.

Note that this requires extending `Attempt`'s schema to capture *which beat* was missed if the scenario is multi-beat. Recommended: add an optional `attempt.beat_results[]` field; null for non-HUNT scenarios. Single new column on `Attempt`; ~10 lines of migration.

---

## 7. Authoring constraints — lint rules

### 7.1 LINT-HUNT-01 — Beat cue caps
Beat 1's pre-overlay cluster ≤ 2 primitives for D1–D2; ≤ 3 for D3+.
Beat 2's pre-overlay cluster ≤ 2 primitives for D1–D2; ≤ 3 for D3+.
Across both beats, total unique cue primitives ≤ 4 for D1–D2; ≤ 5 for D3+.

### 7.2 LINT-HUNT-02 — Determinism
All movements during the inter-beat window must have explicit `delayMs` and `durationMs`. No movement may use schema defaults during the inter-beat window.

### 7.3 LINT-HUNT-03 — `beatSpec` required
HUNT scenarios MUST author `scene.beatSpec.firstBeat` AND `scene.beatSpec.secondBeat`. A HUNT scenario without a second beat is structurally a different decoder (probably SKR or AOR).

### 7.4 LINT-HUNT-04 — Cognition hold floors
HUNT scenarios MUST author `timingOverrides.cognitionHoldMs` and the value must be ≤ 1200 (i.e., compressed below default 1400). Reason: beat 1's hold MUST be at the floor; beat 2 retains default 1400. Without the override, both beats use default 1400 ms and the total envelope balloons to 6+ seconds.

### 7.5 LINT-HUNT-05 — Coach validation gate
HUNT scenarios at D3+ MUST have `coach_validation.level: 'high'` AND `coach_validation.status: 'approved'`. The seeder already enforces high+approved for shipping; this lint catches missing reviews at template-author time.

### 7.6 LINT-HUNT-06 — No SKR/AOR co-occurrence
*Soft lint, runtime-only.* Session generator must not pair HUNT scenarios with SKR or AOR scenarios for users below HUNT mastery 0.6. Implemented in `scenarioService` weighting, not template lint.

---

## 8. What changes in the codebase

| Change | File | Size | Notes |
|---|---|---|---|
| Wire `beatSpec.secondBeat` into freeze controller | `apps/web/components/scenario3d/imperativeScene.ts`, `ScenarioReplayController.tsx` | ~120 lines | The largest change. Adds a second-freeze entry-point in the state machine; existing `frozen → consequence → cueRepaint → replaying` extends to `frozen → unfrozen2 → frozen2 → consequence → cueRepaint → replaying`. |
| Wire `consequence` overlay phase into the renderer | `imperativeTeachingOverlay`, `replayTeachingFlow.ts` | ~50 lines | `compileBeatsToFlatOverlays.consequence` is currently dropped on the floor. Renderer reads it and schedules during the controller's `consequence` state. |
| Extend `cameraTransitions` with `chained_freeze_bridge` | `apps/web/lib/scenario3d/cameraTransitions.ts` | ~40 lines | Smoothly interpolates camera between the two freezes during the inter-beat window. |
| Populate `HUNT_TEMPLATES` (3 freeze beats per beat × 2 beats = 6 total) | `apps/web/lib/scenario3d/freezeFrameCognition.ts:306` | ~80 lines | Note: the existing template list is per-decoder, not per-beat. Recommend extending: `getFreezeBeatTemplates(decoder, beatIndex)` returning the appropriate beat's templates. Backwards-compatible default: `beatIndex = 0`. |
| Add `'mismatch'` to `help_pulse.role` enum | `apps/web/lib/scenario3d/schema.ts:171` | 1 line | Single enum entry. |
| Add HUNT camera preset dispatch | `apps/web/lib/scenario3d/cameraPresets.ts:170` | ~15 lines | Same teaching-angle for beat 1, broadcast for inter-beat unfreeze, teaching-angle for beat 2, player-read-angle for replay. |
| Fill in HUNT `requiredIntents` + `requiredAuthoring` | `apps/web/lib/scenario3d/decoderPrimitives.ts:230` | ~30 lines | Replace the `_PACK2_STUB`. |
| Add HUNT entry to `EXPLANATIONS` | `apps/web/lib/decoders/explanations.ts` | ~15 lines | One-liner + meaning + watch + matters + example. |
| Add HUNT teaching label (already exists as stub) | `apps/web/lib/scenario3d/replayTeachingTimeline.ts:107` | (already there) | `'Hunt the second read.'` — already authored as a Pack 2 stub. |
| Extend `ReplayPath` with `'partial_chain'` | `apps/web/lib/scenario3d/replayTeachingTimeline.ts` | ~30 lines | Additive. |
| Extend `Attempt` schema with optional `beat_results[]` | `packages/db/prisma/schema.prisma`, migration | ~15 lines | Single optional column, JSON. |
| Add LINT-HUNT-01..05 rules | `scripts/lint-variants.ts` | ~60 lines | Authoring guardrails. |
| Author HUNT D1 template + 1 base variant | `packages/db/seed/scenarios/templates/HUNT.preset-mismatch/` | New | Use as the architecture validator. |
| Update QA matrix with 1 HUNT row | `apps/web/lib/scenario3d/qaMatrix.ts` | ~10 lines | One row per D-tier eventually; D1 first. |
| Author Academy lesson `chained-reads-intro` | TBD | New | Prerequisite for any HUNT scenario surfacing in sessions. |

**Total touch surface for HUNT D1 ship:** ~470 lines of code + 1 template + 1 lesson + 1 migration. **Larger than DROP** because HUNT requires runtime wiring (not just data); estimated 1–2 engineer-weeks plus content authoring.

The biggest single piece of work is the controller state machine extension. Recommend doing this first as a vertical slice — wire the second freeze to a dummy HUNT scenario before authoring real content, so the runtime is provably solid before content investment.

---

## 9. The HUNT design principle in one sentence

> *"HUNT teaches the player that the first action is the question and the second action is the answer. The freeze cadence is doubled, but the cue grammar is the same — players are not learning new cues, they are learning to chain old ones."*

The discipline that makes HUNT work: **two beats, one decision.** Beat 1 is observation; beat 2 is the choice. The hold timing is asymmetric (beat 1 at the floor, beat 2 at default) because the player's attention budget is finite and beat 2 is where it must land. Wire `beatSpec.secondBeat` and the `consequence` overlay phase first; everything else flows from those.
