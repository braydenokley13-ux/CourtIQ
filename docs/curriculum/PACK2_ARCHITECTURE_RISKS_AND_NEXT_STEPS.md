# Pack 2 — Architecture Risks, Recommended Changes, and Next Implementation Phase

**Audience:** Pack 2 implementation owners. This document complements `DROP_DECODER_DESIGN.md` and `HUNT_DECODER_DESIGN.md` with the cross-cutting risk analysis, recommended architectural changes (high-leverage only), teaching-quality risks, cognitive-load risks, and the exact sequencing of the next implementation phase.

**Scope:** This document does NOT propose changes to the visual-regression infrastructure, deterministic-replay system, baseline capture, or any preview / CI workflow. Those workstreams are running in parallel and are explicitly out of scope.

**Status:** Architecture spec for the next implementation phase. No code in this PR.

---

## 1. What breaks first — the blast radius map

Failures are listed in the order I expect them to appear in production. Each has a mitigation that should be in place before the corresponding decoder ships.

### 1.1 Single-freeze pacing assumptions break for HUNT
**Symptom:** HUNT D1 scenarios run ~5.5 s from scene-start to choice. Children abandon mid-scenario.
**Root cause:** Two-beat cognition stretches the freeze envelope.
**Mitigation:** HUNT requires `timingOverrides.cognitionHoldMs ≤ 1200` enforced as lint (LINT-HUNT-04 in the HUNT design). Beat 1's hold is at the floor (1100 ms); beat 2 retains default (1400 ms). Inter-beat unfreeze is held to ≤ 1500 ms. **Worst case:** ~5.0 s envelope — still long but acceptable.
**When it appears:** First HUNT D1 scenario in QA playtest.

### 1.2 Pre-answer overlay clutter cap is exceeded across two beats
**Symptom:** Renderer drops cues silently because the per-phase clutter cap is exceeded; the freeze becomes incoherent.
**Root cause:** `compileBeatsToFlatOverlays.maxPerPhase` (`overlayBeats.ts:120-127`) is per-phase, but for HUNT the *unit of cognition* is per-beat. Both freezes share the `'freeze'` phase ID.
**Mitigation:** Extend `compileBeatsToFlatOverlays` to support per-*beat* caps when `beatSpec.secondBeat` is set. The phase ID can stay `'freeze'` for both beats; the differentiator is a new `beat_index: 0 | 1` field on `OverlayBeat`. ~30 lines of code.
**When it appears:** First HUNT scenario authored with 3 cues on each beat.

### 1.3 Camera teleports between HUNT beats
**Symptom:** Players report disorientation at beat 2; eye-tracking on QA users shows them re-parsing the scene from scratch instead of diff-recognizing.
**Root cause:** Camera presets snap to freeze positions. Without an inter-beat transition, the camera teleports from beat 1's frame to beat 2's frame.
**Mitigation:** New `cameraTransitions.chained_freeze_bridge` mode (see HUNT design §3.3). Mandatory before HUNT ships.
**When it appears:** First HUNT scenario tested in-app (not just static screenshots).

### 1.4 DROP / HEDGE confusion in the cue layer
**Symptom:** Players misclassify the screen defender's stance and pick the wrong exploit. The scenario's cue cluster reads as DROP to the system but as HEDGE to the player.
**Root cause:** `defender_chest_line` is the load-bearing cue for both DROP (chest at/below screen line = drop) and the disqualifier for HEDGE (chest crossing the screen line = hedge). The geometric distinction is subtle and authors will get it wrong.
**Mitigation:**
- Mandatory Academy prerequisite: `pnr-coverage-recognition` lesson must be mastered before DROP scenarios surface.
- Lint rule LINT-DROP-06 (decoder-confusion check) — defer to v2 of lint suite, but include the design in initial spec.
- Coach validation `medium` for D2+ DROP scenarios with explicit reviewer instruction: *"Verify the chest line geometry is unambiguously below the screen line."*

### 1.5 The `consequence` overlay phase sits unwired and silently drops payloads
**Symptom:** Authors write `consequence`-phase beats expecting them to render; they don't.
**Root cause:** `compileBeatsToFlatOverlays.consequence` is computed but unused (P3.0 comment in `overlayBeats.ts:138`). The renderer doesn't consume it.
**Mitigation:** Wire the `consequence` phase into the renderer concurrently with HUNT runtime work. ~50 lines. UNBLOCKS HUNT's "what changed between beats" overlays AND DROP D5's late-clock punishment cues.
**When it appears:** First HUNT scenario authored. Will silently fail — nobody notices until QA visually verifies the consequence overlays.

### 1.6 Determinism breaks during HUNT inter-beat reactions
**Symptom:** Replay regression CI flags HUNT scenarios as non-deterministic; baseline screenshots fail.
**Root cause:** Inter-beat defensive reaction (helper rotation, switch, recovery) is authored with too few movement constraints; small floating-point drift accumulates and changes the beat 2 freeze geometry.
**Mitigation:** Lint rule LINT-HUNT-02 — all movements during the inter-beat window must have explicit `delayMs` and `durationMs` (no schema defaults). Visual regression CI (parallel workstream) will catch any survivors.
**When it appears:** First HUNT scenario integrated with the visual regression CI.

### 1.7 Decoder-overlap confusion between SKR, HUNT, and DROP
**Symptom:** Users with SKR mastery > 0.7 perform poorly on HUNT D4 and on DROP D3 — they default to "this is SKR, I know this" and try to solve in one beat.
**Root cause:** All three decoders involve reading help. Without explicit pedagogical separation, players bucket them.
**Mitigation:**
- Academy lesson `chained-reads-intro` must teach the SKR/HUNT distinction explicitly.
- Session generator must not pair HUNT/SKR/AOR for users below HUNT mastery 0.6 (LINT-HUNT-06 / soft lint).
- The decoder-name vocabulary in choice tray prompts must use distinct verbs: "Skip" for SKR; "Hunt" for HUNT; "Read coverage" for DROP.

### 1.8 Cognitive overload for ages 10–12
**Symptom:** Abnormally high abandonment on HUNT scenarios for users who calibrated below IQ 700.
**Root cause:** Chained cognition is developmentally hard for the lower end of the target age range.
**Mitigation:** Soft gate at the session generator — exclude HUNT for users with calibration IQ < 700 for the first 60 days. Implement as a weight in `scenarioService.generateSessionBundle()`, not a content gate.
**When it appears:** First public release of HUNT, first 7 days of analytics.

### 1.9 Progression bottleneck at DROP D2 → D3
**Symptom:** Players plateau at DROP D2 because D3 introduces the second-defender cue (low-man `help_pulse`), which is a significant cognitive jump.
**Root cause:** D3 is the first DROP scenario where the answer changes based on a SECOND player's positioning. Without a smooth on-ramp, the difficulty curve has a vertical step.
**Mitigation:** Ship a DROP D2.5 variant (still tagged D2) that introduces the low-man cue without changing the right answer. The user sees the cue cluster but still pulls up. Trains the visual recognition before it carries decisional weight.
**When it appears:** ~3 weeks after DROP D3 launches; visible in mastery curves.

### 1.10 Author bandwidth bottleneck on D4–D5 disguised variants
**Symptom:** D4 and D5 variants take 3–4× longer to author than D1–D3. The disguise window timing (D4 DROP, D4 HUNT) is the load-bearing detail and SMEs reject 50%+ on first review.
**Mitigation:** Don't author D4/D5 in Pack 2 v1. Ship D1–D3 across both decoders, validate the architecture, then return for D4–D5 in a v2 sweep. (See §6 sequencing.)

---

## 2. Recommended architectural changes — HIGH leverage only

The user prompt was explicit: only propose HIGH leverage changes. Each item below has been triaged on three axes: blast radius (low = ~10 lines, high = ~100+ lines), scenarios unblocked, and reversibility.

### 2.1 Wire `OverlayBeatPhase: 'consequence'` into the renderer ★★★★★
**Files:** `imperativeTeachingOverlay.ts`, `replayTeachingFlow.ts`, `ScenarioReplayController.tsx`
**Size:** ~50 lines.
**Unblocks:** HUNT (entirely), DROP D5 (late-clock punishment), and any future delayed-feedback decoder.
**Reversibility:** High — additive, no schema change.
**Why this is #1:** Half-built. The schema, types, beat compiler, and controller state all support it. Only the renderer doesn't consume the output. Wiring it is the single most leveraged 1-day change in Pack 2.

### 2.2 Wire `beatSpec.secondBeat` into the freeze controller ★★★★★
**Files:** `imperativeScene.ts`, `ScenarioReplayController.tsx`, `freezeFrameCognition.ts`
**Size:** ~120 lines.
**Unblocks:** HUNT (entirely).
**Reversibility:** Medium — adds new state-machine transitions; backward-compatible if `beatSpec.secondBeat` is undefined.
**Why this is #2:** The schema accepts the second beat; the runtime ignores it. This is the largest single piece of HUNT work. Recommend a vertical slice: wire it for one dummy HUNT scenario before any real content authoring.

### 2.3 `cameraTransitions.chained_freeze_bridge` mode ★★★★
**Files:** `cameraTransitions.ts`, `cameraPresets.ts`
**Size:** ~40 lines.
**Unblocks:** Smooth visual continuity between HUNT's two freezes.
**Reversibility:** High — additive mode; existing presets unchanged.
**Why this is #3:** Without it, HUNT is functionally complete but visually broken. Required for HUNT D1 to ship in a state we'd be proud of.

### 2.4 Add `'mismatch'` to `help_pulse.role` enum ★★★★
**Files:** `apps/web/lib/scenario3d/schema.ts:171`
**Size:** 1 line.
**Unblocks:** HUNT D1's mismatch-targeting cue grammar.
**Reversibility:** High — single enum entry, additive.
**Why this is high leverage despite size:** Without it, HUNT scenarios cannot legally express the mismatch read. With it, HUNT's entire visual vocabulary is in place.

### 2.5 Per-beat clutter caps in `compileBeatsToFlatOverlays` ★★★
**Files:** `overlayBeats.ts`
**Size:** ~30 lines.
**Unblocks:** Multi-beat cue budgeting for HUNT scenarios.
**Reversibility:** High — additive option; existing per-phase caps retained.
**Why this is #5:** Without it, the renderer might silently drop cues from beat 2 if the combined freeze-phase cap is exceeded.

### 2.6 Lint rules LINT-DROP-01..05 + LINT-HUNT-01..05 ★★★
**Files:** `scripts/lint-variants.ts`
**Size:** ~100 lines combined.
**Unblocks:** Catches authoring mistakes at template-author time, not in production.
**Reversibility:** High — pure validation, no runtime effect.
**Why this is #6:** Cheap to write, expensive to omit. Authoring discipline collapses without these.

### 2.7 `ReplayPath = 'partial_chain'` for HUNT replays ★★★
**Files:** `replayTeachingTimeline.ts`, `Attempt` schema migration
**Size:** ~50 lines + 1 column.
**Unblocks:** Differentiated feedback for HUNT scenarios where one beat was right and one wrong.
**Reversibility:** Medium — schema migration is reversible but visible.
**Why this is #7:** Without it, HUNT players who get half right see the same replay as players who blew the entire scenario. Pedagogically wrong.

### 2.8 Academy prerequisite lessons ★★★
**Files:** Academy lesson seeds (new) + `Concept.parent_id` updates.
**Size:** Two new lesson texts (`pnr-coverage-recognition` for DROP, `chained-reads-intro` for HUNT) + ~10 lines of metadata.
**Unblocks:** Prevents premature DROP / HUNT exposure before the player has the conceptual framework.
**Reversibility:** High.
**Why this is #8:** Critical for transfer learning, not for runtime correctness.

### 2.9 Decoder-confusion soft gate in session generator ★★
**Files:** `scenarioService.ts`
**Size:** ~20 lines.
**Unblocks:** Prevents SKR-mastery players from face-planting into HUNT.
**Reversibility:** High.

### 2.10 Per-decoder XP scaling for HUNT ★★
**Files:** `iqService.ts` or scenario JSON.
**Size:** Already supported via `xp_reward` field; just author higher values for HUNT D3+.
**Unblocks:** Player perceives HUNT's longer envelope as fair (more XP for more time).
**Reversibility:** High.

### Things explicitly NOT recommended

- **New pre-answer overlay primitives.** The 7-primitive allow-list is sufficient. Adding `defender_drop_depth` or `chain_marker` has high blast radius and low marginal value. Use composite cues (`chest_line` + `foot_arrow`) instead.
- **New `DecoderRole` types beyond `screen_defender`.** The substring-match convention covers everything else.
- **A separate `chain` decoder family or a new top-level concept.** HUNT *is* the chain pattern. Adding a meta-category fragments the curriculum.
- **Real-time defender AI for HUNT reactions.** All movements scripted. No ML, no probabilistic positioning. Determinism is non-negotiable.
- **A new `OverlayBeatPhase` value.** `'watch'`, `'freeze'`, `'answer_replay'`, `'consequence'` are sufficient. The unwired `consequence` phase is what we need.
- **Mass authoring before architecture is wired.** Don't author 25 Pack 2 scenarios before HUNT runtime works. Author 1 D1 of each decoder, validate end-to-end, then scale.

---

## 3. Teaching-quality risks (scenario-design level)

### 3.1 "Basketball trivia" failure mode
HUNT in particular is prone to this — chained cognition feels "advanced" and authors are tempted to lean on NBA-team-specific tactics.

**Failure pattern:** A HUNT scenario hinges on knowing what "Spain pick-and-roll" is, or on a coach's terminology, or on a specific play call. The right read is correct only if you know the play.

**Mitigation:** SME review checklist must include the **"13-year-old test"**: *Could a player who has never watched the NBA solve this from the visible cues alone?* Reject if no.

This is encoded as part of `coach_validation` for D3+ scenarios; reviewers should be briefed explicitly.

### 3.2 "Two right answers" — the silent killer
The most damaging failure mode for trust. A scenario where two choices both look correct, the player picks the second, and the system marks them wrong without explanation.

**Mitigation:** Every D2+ variant must declare BOTH a `quality: 'best'` AND a `quality: 'acceptable'` choice, AND populate `acceptable_reads[]` with explicit text on *why* the acceptable read is worse. If only one read is plausible AND there are no acceptable alternatives, the scenario is too easy for D2+.

Lint rule recommendation: *"D2+ variants without a `quality: 'acceptable'` choice fail lint."*

### 3.3 Distractors that are "wrong" but not *educationally* wrong
A wrong choice that the player would never realistically make is a wasted distractor. It teaches nothing.

**Mitigation:** Every wrong choice must have a `wrongDemo` that *shows* what would have happened. The wrong demo is the teaching moment, not just the punishment. Reviewers should reject wrong choices whose `wrongDemo` "doesn't add information."

### 3.4 Late-clock variants that lack actual time pressure
A D5 scenario tagged "late clock" that uses default cognition hold (1400 ms) feels indistinguishable from D3.

**Mitigation:** D5 scenarios MUST set `timingOverrides.cognitionHoldMs ≤ 1200`. If they don't, lint should flag.

### 3.5 Disguise variants where the disguise is invisible
A `disguise: 'heavy'` variant authored without a `freezeCompressMs` value or without removing meaningful pre-overlays. The disguise label is on the variant; the actual disguise isn't.

**Mitigation:** Lint rule — `disguise: 'moderate'` or `'heavy'` must remove ≥ 1 pre-overlay AND/OR set `freezeCompressMs > 0`. Otherwise, downgrade to `light` or `none`.

### 3.6 Prose-bank skeleton mismatches
A prose-bank skeleton references a slot (`{open_space_short_desc}`) that the variant didn't author. The runtime substitutes empty string and the feedback text becomes "Right. , so cut." (with a missing word).

**Mitigation:** Existing schema validation catches typo'd slot IDs. Add a runtime test: every prose skeleton's slot references must be authored in the variant's slot map. Recommend extending `_proseBankSlots.ts` with a parse-time check that every used slot is populated.

---

## 4. Cognitive-load risks (player-facing)

### 4.1 The 5-second envelope problem
HUNT scenarios are ~2× the duration of single-beat scenarios. For a 13-year-old in a 5-minute session, this materially changes the felt pace.

**Mitigation:** Three parts.
1. Session generator never queues two HUNT scenarios in a row.
2. HUNT count ≤ 1 per 5-scenario session for users below HUNT mastery 0.6.
3. HUNT scenarios award proportionally higher XP (factor 1.4×–1.7× over equivalent-difficulty single-beat scenarios).

### 4.2 Cue cluster overload at higher tiers
D5 HUNT (multi-target advanced) sits at the structural cognition ceiling. Pushing further (D6 hypothetical) would exceed the 4-second cognitive ceiling explicit in `timingOverrides`.

**Mitigation:** Don't author past D5. The schema's 4000 ms cap on `cognitionHoldMs` is the hard ceiling; D5 variants should approach but not exceed it.

### 4.3 Decoder-context-switching fatigue in mixed sessions
A 5-scenario session that mixes BDW, HUNT, DROP, SKR, and AOR forces the player to re-parse the cue grammar five times. Cumulative cognitive cost is high even when each individual scenario is fair.

**Mitigation:** Session generator should prefer "concept clusters" — 2–3 scenarios from the same family in a row, with the family rotating across sessions. Existing weight (PRODUCT_SPEC §6.3) is "current module progression" — extend it to include "concept stickiness within session."

### 4.4 Reduced-motion and cognitive accessibility
Players with reduced-motion preferences (already supported in QA checklist item 11) should still see the cue cluster but without the cognitive ramp animation. HUNT specifically is harder in reduced-motion because the inter-beat reaction depends on motion parsing.

**Mitigation:** When `prefers-reduced-motion: reduce` is detected, HUNT scenarios should be excluded from the session bundle entirely until a reduced-motion path is designed (out of scope for v1). Existing decoders are unaffected.

### 4.5 Mobile-portrait cognitive load
On a 375×667 (iPhone SE) viewport, the half-court is compressed and overlays become smaller. Two-beat HUNT freezes have more cues per pixel of court area than single-beat scenarios.

**Mitigation:** The mobile-aspect adjustment (cameraPresets dolly-in 10% on portrait) helps. For HUNT specifically, add a portrait-mode rule: cue cluster max = 2 per beat (no D3+ HUNT in portrait until tested). This is enforced at runtime, not at the template level — same scenario, different rendering on portrait.

---

## 5. Difficulty-scaling recommendations

### 5.1 The CourtIQ difficulty ladder for chained decoders
Pack 1's difficulty model is straightforward: D1 → D5 with each tier adding cue ambiguity, distractor strength, and disguise. Pack 2's DROP follows this model unchanged. **HUNT's difficulty curve is steeper** because chained cognition compounds — adding a beat-2 cue isn't additive load, it's multiplicative.

**Recommended HUNT difficulty curve:**

| Tier | Beat 1 cues | Beat 2 cues | Inter-beat duration | Cognition holds | XP multiplier |
|---|---|---|---|---|---|
| D1 | 2 | 2 (1 retained, 1 new) | ~1000 ms | 1100 / 1400 | 1.4× |
| D2 | 2 | 2 (1 retained, 1 new) | ~1000 ms | 1100 / 1400 | 1.4× |
| D3 | 2 | 3 (1 retained, 2 new) | ~1200 ms | 1100 / 1400 | 1.6× |
| D4 | 2 | 3 (1 retained, 2 new) | ~1200 ms | 1100 / 1400 | 1.6× |
| D5 | 3 | 3 (2 retained, 1 new) | ~1500 ms | 1100 / 1400 | 1.7× |

D1–D2 are the same cognitive shape, differing only in *what* the chain teaches (preset switch vs forced switch). This is intentional — HUNT D1 IS challenging, and authors should not feel they need to artificially compress HUNT D1 to be "easy."

### 5.2 Cross-decoder mastery requirements
Recommend authoring the prerequisite chain so:

- DROP D1 unlocks after `pnr-coverage-recognition` lesson.
- DROP D2–D5 unlock from DROP D1.
- HUNT D1 unlocks after `chained-reads-intro` lesson AND at least one of: AOR D2, SKR D2, DROP D2 (any chained-friendly decoder at intermediate level).
- HUNT D2 unlocks from HUNT D1.
- HUNT D3 unlocks from HUNT D2 + AOR D3 (decoy actions require closeout fluency).
- HUNT D4 unlocks from HUNT D2 + SKR D3 (second-side rotations require skip fluency).
- HUNT D5 unlocks from HUNT D3 AND HUNT D4.

This is encoded in `Module.prerequisite_ids` and `pack.json:scenarios[*].prerequisites` (existing schema, no change required).

### 5.3 Per-tier scenario count
Recommend 5 variants per (decoder, difficulty) tier — same as Pack 1. For the **first ship**, however, only D1 and D2 should be authored (a total of 4 variants per decoder × 2 decoders = 8 variants for Pack 2 v1). This limits author bandwidth, validates the architecture against real content, and avoids the D4/D5 disguise-window quagmire until the cheaper tiers prove out.

### 5.4 Mastery thresholds
Pack 1 mastery threshold is 80% accuracy across the last 5 attempts. Recommend HUNT mastery threshold at **70%** for the first 60 days — chained cognition has a longer learning curve and forcing 80% creates a wall. Step up to 80% after 60 days when player base is calibrated.

---

## 6. Replay-system evolution recommendations

### 6.1 Wire the `consequence` phase (already covered as #2.1)
The single highest-leverage replay improvement.

### 6.2 Add `'partial_chain'` ReplayPath (already covered as #2.7)
The single highest-leverage HUNT-specific improvement.

### 6.3 Multi-beat replay choreography (medium leverage)
For HUNT, replays must show beat 1 → reaction → beat 2 → action 2 in a coherent timeline. Recommend extending `replayTeachingFlow.ts` with a `beat_sequence` array that the renderer iterates. Each entry: `{ beatIndex, cueRepaintHoldMs, focus }`. ~40 lines.

### 6.4 Replay speed controls (low leverage, medium UX value)
Players who get HUNT scenarios wrong often want to see the replay at half-speed. Recommend a `0.5×` and `1.0×` toggle on replay only. Single button on the replay UI; affects movement playback rate. Out of scope for v1; recommended for v2.

### 6.5 Skip-replay accelerator (low leverage, high engagement value)
Players who got it right and just want to move on shouldn't be forced through a 4-second replay. Recommend a "Skip" button on replay screens that fades in 1500 ms after replay starts. Skipping forfeits the visual reinforcement but keeps session pace high.

### 6.6 Do NOT do (out of scope for replay system)
- ML-driven replay highlighting based on individual user weaknesses. Way out of scope; rebuild later if data demands.
- User-recorded replays for sharing. Cute but not a Pack 2 priority.
- Multi-camera replay angles. The existing `cameraPresets` are sufficient.

---

## 7. The exact highest-leverage next implementation phase

This is the phase ordering I recommend for shipping Pack 2 v1.

### Phase α — Architecture vertical slice (1 engineer-week)
Goal: prove HUNT runtime end-to-end on a single dummy scenario before any real content investment.

1. Wire `OverlayBeatPhase: 'consequence'` into the renderer. (`imperativeTeachingOverlay`, `replayTeachingFlow`, `ScenarioReplayController` — ~50 lines)
2. Wire `beatSpec.secondBeat` into the freeze controller. (~120 lines)
3. Add `cameraTransitions.chained_freeze_bridge` mode. (~40 lines)
4. Add `'mismatch'` to `help_pulse.role` enum. (1 line)
5. Author a single dummy HUNT scenario (HUNT.preset-mismatch.dummy-01) — not for production, just for runtime validation.
6. Verify visual regression infra (parallel workstream) accepts the dummy scenario's baseline screenshots.

**Output:** Provably solid HUNT runtime. Dummy scenario plays end-to-end with two freezes, two cognition holds, smooth camera transitions. **No content shipped yet.**

### Phase β — DROP D1–D2 ship (1 engineer-week + 1 content-author-week)
Goal: ship the lighter Pack 2 decoder first, prove the cue grammar, validate authoring discipline.

1. Populate `DROP_TEMPLATES` in `freezeFrameCognition.ts`. (~30 lines)
2. Populate `decoderPrimitives.ts` DROP entry. (~25 lines)
3. Add DROP camera preset dispatch. (~10 lines)
4. Add DROP entry to `EXPLANATIONS` and teaching label. (~16 lines)
5. Author Academy lesson `pnr-coverage-recognition`. (Content)
6. Author DROP D1 template + 1 base variant + 1 mirror variant. (Content)
7. Author DROP D2 template + 1 base variant. (Content)
8. Lint rules LINT-DROP-01..05. (~40 lines)
9. QA matrix entries for DROP D1, D2.
10. SME review.
11. Ship to LIVE behind a feature flag.

**Output:** First production Pack 2 scenarios in player hands. Coverage-recognition cognition validated.

### Phase γ — HUNT D1–D2 ship (1 engineer-week + 2 content-author-weeks)
Goal: ship the chained-cognition decoder using the runtime validated in Phase α.

1. Populate `HUNT_TEMPLATES` (per-beat). (~80 lines)
2. Populate `decoderPrimitives.ts` HUNT entry. (~30 lines)
3. Add HUNT camera preset dispatch. (~15 lines)
4. Add HUNT entry to `EXPLANATIONS` (teaching label already authored). (~15 lines)
5. Extend `ReplayPath` with `'partial_chain'` and migrate `Attempt`. (~50 lines + migration)
6. Author Academy lesson `chained-reads-intro`. (Content)
7. Author HUNT D1 template + 1 base variant. (Content)
8. Author HUNT D2 template + 1 base variant. (Content)
9. Lint rules LINT-HUNT-01..05. (~60 lines)
10. QA matrix entries for HUNT D1, D2.
11. SME review (`level: 'high'`).
12. Soft gate at session generator: HUNT excluded for IQ < 700 calibrated users for 60 days.
13. Ship to LIVE behind a feature flag.

**Output:** First chained-cognition decoder in player hands. Foundation laid for D3–D5.

### Phase δ — D3 expansion (later)
Once D1–D2 of both decoders are stable for 30+ days, expand to D3 (low-man tag for DROP, decoy actions for HUNT). Same template/variant pattern.

### Phase ε — D4–D5 (much later)
The disguise-window variants. Requires the most SME bandwidth. Ship only after D1–D3 are stable and the architecture has been stress-tested by real users.

---

## 8. The single most important next step

**Wire the `consequence` overlay phase into the renderer.**

It is half-built. The schema, types, beat compiler, and controller state machine all support it. The renderer drops the output on the floor. Wiring it (~50 lines) unblocks:

- HUNT's "what changed between beats" overlays (load-bearing for the chained read pedagogy).
- DROP D5's late-clock punishment cues.
- All future delayed-feedback decoders.
- Visual regression coverage for any Pack 2 scenario that uses the `consequence` phase.

**No other change in this document has a higher leverage-to-effort ratio.** It should be done first, even before HUNT runtime work, because it's the smallest change with the largest unlock.

After that: HUNT runtime (`beatSpec.secondBeat`) → DROP D1–D2 → HUNT D1–D2 → expansion. The exact sequence is in §7. The ordering matters because each phase de-risks the next.

---

## 9. Summary — design principles for Pack 2

1. **Reuse the cadence; vary the grammar.** All decoders use the same 200/700/1100 ms beat schedule and the same 1100–1400 ms cognition hold. New decoders differ in cue clusters, not in rhythm.

2. **Wire what the schema already accepts before extending the schema.** The hardest unblocks are the half-built features (`beatSpec.secondBeat`, `consequence` phase) — finish those before adding new types.

3. **Single decision per scenario, even with multi-beat freezes.** HUNT's beat 1 is observation; beat 2 is the choice. One scenario = one IQ delta.

4. **Lint rules are cheaper than authoring rules in your head.** The first lint rule catches more bugs than the next ten SME reviews.

5. **Ship D1–D2 first; D4–D5 last.** Disguised variants are 3–4× the authoring cost. Validate the lighter tiers before investing in the heavy ones.

6. **Determinism is the contract.** No probabilistic defender reactions. No unsourced randomness. Every movement has explicit `delayMs` and `durationMs`. The visual regression workstream is the safety net; the design constraint is upstream.

7. **The first scenario authored is the architecture validator.** Author one D1 of each new decoder, watch it through QA, and only THEN scale. Mass authoring before architecture validates is a recipe for rework.
