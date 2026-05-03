# Scenario Overlay Spec — Author's Reference

**Status:** P3.0 reference. This doc complements `docs/phase-p3-teaching-overlays.md`; that one explains the architecture, this one is a checklist for authors.

A founder scenario is teachable when its overlays answer four questions at the freeze and during replay:

1. **What changed?**
2. **What space opened?**
3. **What is the best read?**
4. **If that read is gone, what is the next-best keep-the-advantage action?**

This doc shows, for each founder decoder, the canonical overlay shape and the founder-scenario example to reuse.

---

## Authoring checklist (every scenario)

- [ ] `decoder_tag` set to one of `BACKDOOR_WINDOW` / `ADVANTAGE_OR_RESET` / `EMPTY_SPACE_CUT` / `SKIP_THE_ROTATION`.
- [ ] Players, ball, `movements`, `freezeMarker`, `answerDemo`, `wrongDemos` authored per the existing scenario schema.
- [ ] Look up `getDecoderOverlayPreset(decoder_tag)` in `apps/web/lib/scenario3d/decoderOverlayPresets.ts`.
- [ ] Author `preAnswerOverlays[]` referencing your scenario's actual player ids — substitute the preset's `PresetRole` references.
- [ ] Author `postAnswerOverlays[]` the same way.
- [ ] Beginner-tier scenarios: keep each cluster at ≤ 3 cues. (`MAX_FREEZE_OVERLAYS_BEGINNER`, `MAX_REPLAY_OVERLAYS_BEGINNER`.)
- [ ] Pre-answer overlays must use only kinds in `PRE_ANSWER_OVERLAY_KINDS`.
- [ ] Manual QA: open `/dev/scene-preview?scenario=<id>&glb=1` and confirm:
  - the cue is obvious *before* the answer
  - paths on/off both work
  - FOLLOW / REPLAY / BROADCAST / AUTO all read clearly
- [ ] Tests pass: `pnpm --filter web test`.

---

## BDW — Backdoor Window

**Cue → Action.** Defender's hand and foot are in the lane → cut behind to the rim.

**Pre-answer cluster (beginner cap = 3):**
- `defender_vision_cone` on the deny defender, `targetId` = passer
- `defender_hip_arrow` on the deny defender
- `defender_hand_in_lane` on the deny defender

**Post-answer reveal:**
- `passing_lane_blocked` from passer to cutter
- `open_space_region` anchored at the rim window
- `drive_cut_preview` showing the cutter's plant-and-go path

**Founder example:** `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json`.

> Authors may add a fourth cue (`defender_chest_line` or `defender_foot_arrow`) for an intermediate rep — only when the lesson explicitly drills the chest/foot read.

---

## AOR — Advantage or Reset

**Cue → Action.** Closeout cushion is short, hands not yet up → catch and shoot.

**Pre-answer cluster (beginner cap = 3):**
- `defender_vision_cone` on the closeout defender, `targetId` = receiver
- `defender_hip_arrow` on the closeout defender
- `defender_foot_arrow` on the closeout defender

**Post-answer reveal:**
- `open_space_region` anchored at the shooting pocket
- `timing_pulse` at the catch beat
- `drive_cut_preview` for the attack-baseline alternative

**Founder example:** `packages/db/seed/scenarios/packs/founder-v0/AOR-01.json`.

> AOR-01 today carries six pre-answer entries (three body cues + one help pulse + two labels). Two of those are textual; they sit on the periphery and don't crowd the action. A follow-up may drop one body cue and one label to bring AOR-01 to the beginner ceiling. The clutter cap is advisory until the beat compiler is wired into runtime.

---

## ESC — Empty-Space Cut

**Cue → Action.** Helper rotated to ball; your area is empty → cut into the vacated paint.

**Pre-answer cluster (beginner cap = 3):**
- `defender_vision_cone` on the helper defender, `targetId` = passer
- `defender_hip_arrow` on the helper defender
- `help_pulse` on the helper defender, `role: 'tag'`

**Post-answer reveal:**
- `open_space_region` anchored at the vacated paint
- `passing_lane_open` from passer to cutter
- `drive_cut_preview` showing the cutter cutting into open space

**Founder example:** `packages/db/seed/scenarios/packs/founder-v0/ESC-01.json` (P3.1).

> ESC-01 names the cue defender `strong_corner_helper` (the user's own defender steps off to tag the drive) rather than the canonical `helper_defender` role string — the role substring `"help"` still matches the decoder primitive map's authoring requirement, and the player who actually moves is the user's own defender, which reads more clearly than introducing a separate weak-side helper.

---

## SKR — Skip the Rotation

**Cue → Action.** Help over-rotates strong side → skip weak side to the open shooter.

**Pre-answer cluster (beginner cap = 3):**
- `help_pulse` on the helper defender, `role: 'overhelp'`
- `defender_hip_arrow` on the helper defender
- `defender_chest_line` on the helper defender

**Post-answer reveal:**
- `passing_lane_open` from passer to the open weak-side shooter
- `open_space_region` anchored at the weak-side advantage zone
- `label` "Skip past the help" anchored mid-court (or `drive_cut_preview` for the one-more-to-corner alternative)

**Founder example:** `packages/db/seed/scenarios/packs/founder-v0/SKR-01.json` (P3.1).

> SKR-01's user is the **passer**, not an off-ball cutter. The ball-handler drives middle, the weak-corner low man over-rotates to tag, and the user reads the overhelp + skips weak side. The post-answer reveal uses a `label` overlay instead of `drive_cut_preview` because the action is a pass, not a cut path — the `passing_lane_open` already shows the path of the ball.

---

## When to graduate to overlay beats

Use the flat `preAnswerOverlays` / `postAnswerOverlays` arrays unless your scenario needs:

- timed reveal during replay (cue at 0ms, action at 400ms, advantage at 1200ms),
- per-difficulty visibility (a beat that only fires on intermediate/advanced reps),
- chained-decision pressure (a second-rotation cue that fires only after a wrong choice).

When that day comes, author `OverlayBeat[]` (see `apps/web/lib/scenario3d/overlayBeats.ts`) and run `compileBeatsToFlatOverlays(beats, { tier, maxPerPhase })` to emit the validated flat arrays. The renderer is unchanged.

---

## Things to avoid

- **Pre-answer overlays that reveal the answer.** The schema rejects these at parse time, but it's worth knowing the rule: `passing_lane_open`, `open_space_region`, `drive_cut_preview`, `passing_lane_blocked`, `timing_pulse` are post-answer only.
- **Labels on top of important actors.** Anchor labels in empty zones; the renderer doesn't push them off players.
- **More than three cues at the freeze for beginner reps.** Above three, the freeze becomes a label-reading exercise.
- **Highlighting the answer before highlighting the cue.** Cue overlays first; reveal overlays second. The pre/post split enforces this at the schema level.
- **Authoring overlays that depend on a player the scene doesn't include.** The schema rejects unknown `playerId`, `from`, `to`, `targetId` references at parse time — but the failure happens at seed time, not author time. Run `pnpm --filter web test` before committing.
