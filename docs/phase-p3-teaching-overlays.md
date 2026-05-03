# Phase P3.0 — Teaching Overlay Architecture

> **Goal:** Make CourtIQ feel like *“coach paused film and is teaching you what to see.”*
>
> **Non-goals:** more graphics, a new overlay engine, animation control, randomness, ball-logic mutation, or a rewrite of the scenario engine.

P2 (P2.3 → P2.6) shipped the 3D readability primitives — back-cut, deny posture, idle-ready, deterministic pass arc, generalized scenario readability. P3.0 formalises the *teaching* layer that sits on top of those primitives: the cue-first overlays that explain to the player **what changed, what space opened, what the best read is, and what the next-best keep-the-advantage action is** if the first read is gone.

---

## Section 1 — Philosophy: cue-first, not solution-first

CourtIQ is a perception-first, game-based IQ trainer. The overlay layer's job is **explanation**, not movement.

Every rep should answer four questions in this order:

1. **What changed?**
2. **What space opened?**
3. **What is the best read now?**
4. **If that read is gone, what is the next-best keep-the-advantage action?**

Every freeze frame and every replay should support five fixed elements:

1. Freeze exactly at the cue.
2. Offer best / acceptable / wrong choices.
3. Use overlays to **show the cue**, not just the answer.
4. Sometimes ask the player to explain *why*.
5. Re-test the same concept later in a changed wrapper.

> **Architectural lock.** Overlays are *teaching*, not *control*. Scenario data owns movement. Animation is body-language only. Overlays neither move players nor mutate scenario state.

---

## Section 2 — Layered architecture (already in place)

The teaching overlay system is **three layers** today. P3.0 does not change the layering.

```
┌──────────────────────────────────────────────────────────────┐
│ Scenario data            (owns movement; deterministic)      │
│  - players, ball, movements, answerDemo, wrongDemos          │
│  - freezeMarker                                              │
│  - preAnswerOverlays / postAnswerOverlays                    │
└──────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Overlay primitive schema  (typed; pre-answer allow-listed)   │
│  apps/web/lib/scenario3d/schema.ts                           │
│   - 13 OverlayPrimitive kinds                                │
│   - PRE_ANSWER_OVERLAY_KINDS allow-list                      │
│   - referential integrity (playerId, from/to, targetId)      │
└──────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Imperative renderer       (deterministic, fade-in only)      │
│  apps/web/components/scenario3d/imperativeTeachingOverlay.ts │
│   - TeachingOverlayController                                │
│   - setAuthoredOverlays(pre, post)                           │
│   - setPhase('pre' | 'post' | 'hidden', nowMs)               │
│   - per-primitive deterministic builders                     │
│   - fade-in animations only; no movement                     │
└──────────────────────────────────────────────────────────────┘
```

P3.0 adds two pieces of **data and types** alongside this stack — not a new layer:

- a **decoder overlay preset map** (data) — per-decoder default recipe of cue/space/action overlays.
- an **overlay beat spec** (types) — a structured author-time format for future scenarios that need timed reveals during replay.

Neither piece replaces the existing flat `preAnswerOverlays[]` / `postAnswerOverlays[]` arrays. They sit *next to* them.

---

## Section 3 — Overlay primitive vocabulary

The schema's 13 primitives map to the curriculum's visual cue library. They are intentionally small; the win is consistency, not breadth.

| Primitive | Cue layer | Pre-answer allowed? |
|---|---|---|
| `defender_vision_cone` | head/eyes | ✅ |
| `defender_hip_arrow` | hips | ✅ |
| `defender_foot_arrow` | feet | ✅ |
| `defender_chest_line` | chest angle | ✅ |
| `defender_hand_in_lane` | arms / lane | ✅ |
| `help_pulse` | help-defender location | ✅ |
| `label` | callout text | ✅ |
| `passing_lane_open` | spacing / open lane | ❌ post-answer only |
| `passing_lane_blocked` | blocked lane | ❌ post-answer only |
| `open_space_region` | spacing / vacated zone | ❌ post-answer only |
| `drive_cut_preview` | best-read action arrow | ❌ post-answer only |
| `timing_pulse` | timing cue | ❌ post-answer only |

> **Why the pre/post split exists.** Pre-answer overlays must show the **cue**, not the **answer**. Lane-open lines, attack-lane previews, and timing pulses *would* reveal the right read; they're banned pre-decision and gated by the schema's `assertPreAnswerOverlayAllowlist`.

---

## Section 4 — Decoder overlay preset map

The renderer ships with a per-decoder *preset* recipe in `apps/web/lib/scenario3d/decoderOverlayPresets.ts`. The map is data, not policy:

- **Authors** use the preset as a starting checklist for any new scenario in that decoder family.
- **The renderer** never reaches into the preset to generate overlays at runtime — every scenario authors its own `preAnswerOverlays` / `postAnswerOverlays` so changes are explicit and reviewable.
- **Tests** assert each preset's `preAnswer` overlays pass the schema's pre-answer allow-list, and that the cue cluster honours the beginner clutter cap.

| Decoder | Pre-answer cue cluster | Post-answer reveal |
|---|---|---|
| **BDW** Backdoor Window | deny defender body language (vision/hip/foot/chest/hand) + low-man `help_pulse` | `passing_lane_blocked` (the denied lane) + `open_space_region` (rim window) + `drive_cut_preview` (back-cut path) |
| **AOR** Advantage or Reset | closeout defender body language (vision/hip/foot) + decision-maker focus mark + low-man `help_pulse` | `open_space_region` (shooting pocket) + `timing_pulse` (catch beat) + `drive_cut_preview` (attack lane) |
| **ESC** Empty-Space Cut | help defender vision/hip + tag-help `help_pulse` + decision-maker focus mark | `open_space_region` (vacated zone) + `passing_lane_open` (cutter pass) + `drive_cut_preview` (cut-to-air path) |
| **SKR** Skip the Rotation | overhelp `help_pulse` + helper hip/chest cue + decision-maker focus mark | `passing_lane_open` (skip lane) + `open_space_region` (weak-side advantage) + optional one-more `drive_cut_preview` |

Each preset references **only typed primitives** that already exist in the schema. No new primitive types are introduced in P3.0.

---

## Section 5 — Clutter rules

Young players cannot read a film frame with eight overlays on it. The clutter rules are codified as constants in `decoderOverlayPresets.ts` and exercised by tests.

| Rule | Constant | Reason |
|---|---|---|
| Beginner pre-answer overlays per cue cluster | `MAX_FREEZE_OVERLAYS_BEGINNER = 3` | One main cue + one helper cue + one anchor (focus or label). Above three, the freeze becomes a label-reading exercise. |
| Beginner post-answer overlays at peak | `MAX_REPLAY_OVERLAYS_BEGINNER = 3` | One open-space + one action arrow + one supporting body-language cue. |
| Intermediate per-phase ceiling | `MAX_OVERLAYS_INTERMEDIATE = 4` | Lets a scenario reveal a second-read cue (helper hip, recovering defender). |
| Advanced per-phase ceiling | `MAX_OVERLAYS_ADVANCED = 5` | Chained-decision scenarios may layer a next-rotation cue. |
| Required ordering | n/a | Cue overlays must mount before answer overlays. The pre/post split enforces this at the schema layer. |
| Label overlap | n/a | Labels must not anchor on top of player positions. (Today: enforced by author review; future: a positional check helper in `decoderOverlayPresets.ts`.) |

Authors are expected to keep beginner founder scenarios at the beginner ceiling. The intermediate / advanced ceilings exist so the architecture can grow with the curriculum without re-writing the renderer.

---

## Section 6 — Overlay beat spec (data format, types-only in P3.0)

The flat `preAnswerOverlays[]` / `postAnswerOverlays[]` arrays are the right shape for the founder scenarios — there's a single freeze and a single replay. As the curriculum grows into chained-decision scenarios, scenes will need *timed reveal* during replay (cue → action → advantage, separated by a few hundred milliseconds).

The `OverlayBeat` type — exported from `apps/web/lib/scenario3d/overlayBeats.ts` — describes that future shape. **It is not wired into the scene schema or the renderer in P3.0**; doing so would force a migration of every existing scenario without a present need.

```ts
type OverlayBeat = {
  beat_id: string
  decoder: DecoderTag
  phase: 'watch' | 'freeze' | 'answer_replay' | 'consequence'
  /** Time relative to the phase entry, in ms. Zero is "the moment the
   *  phase begins." Beats are sorted ascending and applied determ-
   *  inistically. */
  at_phase_ms: number
  /** What the beat is teaching the player to see. Used by QA, lesson
   *  authoring, and future audio cues. */
  teaching_question:
    | 'what_changed'
    | 'what_space_opened'
    | 'what_is_best_read'
    | 'what_is_next_best'
  primitive: OverlayPrimitive
  /** Lower number = mounted first. Determines stacking order on screen
   *  and the order in which clutter rules drop overlays under pressure. */
  clutter_priority: number
  /** Ceiling — beats above the cap for the active difficulty are
   *  hidden, lowest-priority first. */
  visibility: {
    beginner: boolean
    intermediate: boolean
    advanced: boolean
  }
  fade_in_ms?: number
  fade_out_ms?: number
  camera_mode_hint?: 'auto' | 'follow' | 'replay' | 'broadcast'
}
```

`overlayBeats.ts` ships with:

- `sortBeats(beats)` — a stable, deterministic sort by `(phase, at_phase_ms, clutter_priority, beat_id)` so the same input always produces the same ordered list.
- `compileBeatsToFlatOverlays(beats, opts)` — a pure function that flattens beats into the existing flat `preAnswer` / `postAnswer` arrays. This gives a future migration path: a scenario author can write beats, and the compiler produces the validated flat arrays the renderer already understands.

Until a scenario actually needs timed reveals, founder scenes keep using the flat arrays directly.

---

## Section 7 — Founder scenario examples

### BDW-01 (LIVE)

Already authored against this architecture. See `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json`.

- **Pre-answer cue cluster:** `defender_vision_cone(x2 → pg)`, `defender_hip_arrow(x2)`, `defender_foot_arrow(x2)`, `defender_chest_line(x2)`, `defender_hand_in_lane(x2)`, `help_pulse(x4, low_man)`.
- **Post-answer reveal:** `passing_lane_blocked(pg → user)`, `open_space_region(rim)`, `drive_cut_preview(user → rim)` — answers *what space opened* and *what is best read*.

### AOR-01 (DRAFT)

Already authored. See `packages/db/seed/scenarios/packs/founder-v0/AOR-01.json`.

- **Pre-answer cue cluster:** `defender_vision_cone(x2 → user)`, `defender_hip_arrow(x2)`, `defender_foot_arrow(x2)`, `help_pulse(x4, low_man)`, `label("Read the closeout")`, `label("How much space?")`.
- **Post-answer reveal:** `open_space_region(shooting pocket)`, `defender_vision_cone(x2)`, `defender_hip_arrow(x2)`, `defender_foot_arrow(x2)`, `timing_pulse(catch beat)`, `drive_cut_preview(attack lane)`.

> **Manual QA note (P3.0):** AOR-01's pre-answer cluster is at six entries — above the beginner clutter cap. Two of those are `label`s, which are textual anchors rather than visual cues; they sit on the periphery and don't crowd the action. The author is encouraged to drop one of the labels and one of the body-language cues in a follow-up; the clutter constants are advisory in P3.0 and become enforced when the beat compiler lands.

### ESC-01 (planned)

The seed JSON does not yet exist. The intended overlay shape (per the preset map):

- **Pre-answer cue cluster:** `defender_vision_cone(helper)`, `defender_hip_arrow(helper)`, `help_pulse(tag, tag)`, plus a focus mark on the cutter (rendered via `setFocusMark`).
- **Post-answer reveal:** `open_space_region(vacated paint)`, `passing_lane_open(passer → cutter)`, `drive_cut_preview(cutter cut path)`.

### SKR-01 (planned)

Also not yet authored as JSON. Intended shape:

- **Pre-answer cue cluster:** `help_pulse(helper, overhelp)`, `defender_hip_arrow(helper)`, `defender_chest_line(helper)`, plus a focus mark on the passer.
- **Post-answer reveal:** `passing_lane_open(passer → weak-side shooter)`, `open_space_region(weak-side advantage)`, optional `drive_cut_preview` for the one-more option.

---

## Section 8 — Beginner / intermediate / advanced progression

The clutter caps in Section 5 give a one-axis progression dial without changing the renderer:

- **Beginner.** One main cue, one main action arrow. Founder scenarios target this. `MAX_FREEZE_OVERLAYS_BEGINNER = 3` for a cluster.
- **Intermediate.** Defender + helper, first read + second read. Adds one cue in the freeze. `MAX_OVERLAYS_INTERMEDIATE = 4`.
- **Advanced.** Defender + helper + next rotation, chained decision. Adds one cue or one preview in the replay. `MAX_OVERLAYS_ADVANCED = 5`.

Authors do not flag a scenario as a difficulty level today; the dial is exercised through the existing `difficulty` field on the scenario document. When the beat compiler lands, `OverlayBeat.visibility` becomes the per-overlay gate.

---

## Section 9 — How overlays connect to grading

CourtIQ grades **process before result.** The overlay system supports that in three places:

1. **Pre-answer cue cluster.** Tells the player what to look at *before* they choose. `decoder_teaching_point` from the scenario JSON pairs with the `defender_*` cues — the cue is the read.
2. **Post-answer replay.** Renders the cue cluster again *and* the `drive_cut_preview` / `open_space_region` so the player sees *why* the chosen read was the highest-value option at the freeze. This is the answer to *what space opened*.
3. **Wrong-read consequence (`wrongDemos`).** The chosen wrong action plays out, and the post-answer cue cluster stays mounted so the player can see the same body language they ignored.

Grading copy lives in the scenario document (`feedback.correct`, `feedback.partial`, `feedback.wrong`, `why_best_read_works`); the overlay system never owns text. The two layers compose at the page level (the lesson UI), not in the renderer.

---

## Section 10 — How future scenarios should author overlays

A new scenario in decoder family `D` follows this checklist:

1. **Author scene data** — players, ball, `movements`, `answerDemo`, `wrongDemos`, `freezeMarker`. (Existing P2 surface.)
2. **Look up the preset** — `getDecoderOverlayPreset(D)` in `decoderOverlayPresets.ts` returns the cue cluster + reveal recipe.
3. **Author the flat arrays** — `preAnswerOverlays[]` and `postAnswerOverlays[]` referencing the actual player ids in *this* scene. The schema validates referential integrity at parse time.
4. **Stay under the beginner cap** — three cues per cluster for any LIVE founder scenario unless the lesson is explicitly intermediate / advanced.
5. **Run the validator** — `pnpm test --filter web`. The schema, decoder primitive map, and clutter tests will fail loud if a primitive references an unknown player or a pre-answer overlay reveals the answer.
6. **Manual QA** — open `/dev/scene-preview?scenario=<id>&glb=1` and toggle paths on/off, FOLLOW/REPLAY/BROADCAST/AUTO. Confirm the cue is obvious *before* the answer, and the answer is obvious *during* replay.

When a scenario needs timed reveals during replay (cue at 0ms, action at 400ms, advantage at 1200ms), graduate it to `OverlayBeat[]` and run `compileBeatsToFlatOverlays` at scene-build time. P3.0 ships the helper; wiring it into `Scene3D` is a P3.1 decision.

---

## Section 11 — What P3.0 explicitly did not change

- **Renderer.** `TeachingOverlayController` is unchanged. Same builders, same fade-in animations, same `setPhase` lifecycle.
- **Scene schema.** `Scene` still has the same fields. No `overlayBeats[]` field is added; the type lives in its own module.
- **Existing scenarios.** BDW-01 and AOR-01 are unchanged.
- **Path / camera / animation systems.** Untouched.
- **Determinism.** Overlay rendering remains deterministic; no clocks, no randomness, no movement coupling.

The win is not more graphics. The win is that CourtIQ finally has a one-page architectural answer to *“how do we make every scenario teach the player to see the cue, not just the answer?”*

---

## Section 12 — Acceptance criteria (P3.0)

- [x] `docs/phase-p3-teaching-overlays.md` exists and documents philosophy, primitives, presets, clutter rules, beat spec, founder examples, and the authoring checklist.
- [x] `apps/web/lib/scenario3d/decoderOverlayPresets.ts` exports a preset for every founder decoder (BDW / AOR / ESC / SKR), and exports clutter constants.
- [x] `apps/web/lib/scenario3d/overlayBeats.ts` exports the `OverlayBeat` type, a deterministic `sortBeats` helper, and a `compileBeatsToFlatOverlays` helper.
- [x] Tests cover: every preset present, every preset's pre-answer overlays pass the schema allow-list, beat sort is deterministic, no NaN/Infinity in beat helpers.
- [x] Existing path-toggle / camera / animation tests remain green.
- [x] No changes to scenario JSONs in `packages/db/seed/scenarios/packs/founder-v0/`.

---

## Section 13 — P3.1 founder scenario set complete

P3.1 closes the four-decoder founder set by authoring two new scenarios against the P3.0 preset map:

| Scenario | Decoder | Status | Cue cluster | Reveal cluster |
|---|---|---|---|---|
| BDW-01 | Backdoor Window | LIVE | 6 (existing) | 8 (existing) |
| AOR-01 | Advantage or Reset | DRAFT | 6 (existing) | 6 (existing) |
| **ESC-01** | Empty-Space Cut | DRAFT (P3.1) | **3** (cap) | **3** (cap) |
| **SKR-01** | Skip the Rotation | DRAFT (P3.1) | **3** (cap) | **3** (cap) |

Both new scenarios target the beginner clutter caps (`MAX_FREEZE_OVERLAYS_BEGINNER = 3`, `MAX_REPLAY_OVERLAYS_BEGINNER = 3`). They demonstrate that the preset map is authorable in practice and that the caps are realistic for a clean teaching frame.

### ESC-01 — Empty-Space Cut on Help

- **Decoder beat:** the user's defender (`x2`, `strong_corner_helper`) steps off to tag the point guard's drive. The strong-side baseline goes empty.
- **Best read:** baseline cut to the rim. Pass leads the user to the layup before the weak-side low man can rotate across.
- **Acceptable:** lift to the wing — keeps spacing alive but loses the layup.
- **Wrong:** stand still, or cut into the help.
- **Pre-answer cue cluster:** `defender_vision_cone(x2 → pg)`, `defender_hip_arrow(x2)`, `help_pulse(x2, tag)`.
- **Post-answer reveal:** `open_space_region` at the vacated baseline, `passing_lane_open(pg → user)`, `drive_cut_preview` along the baseline cut path.

### SKR-01 — Skip the Overhelp

- **Decoder beat:** the user (the ball-handler) drives middle. The weak-corner low man (`x4`) over-rotates to tag. The weak corner empties.
- **Best read:** skip pass to the weak-side corner shooter (`o4`). Longest closeout for the defense.
- **Acceptable:** kick to the weak-side wing — closer recovery, shorter shot window.
- **Wrong:** force the layup into help, or pass to the strong side that's still covered.
- **Pre-answer cue cluster:** `help_pulse(x4, overhelp)`, `defender_hip_arrow(x4)`, `defender_chest_line(x4)`.
- **Post-answer reveal:** `passing_lane_open(user → o4)`, `open_space_region` at the weak corner, `label` "Skip past the help".

### Authoring notes

- **Both scenarios ship as `status: "DRAFT"`** with `coach_validation: { level: "low", status: "needed" }`. The seeder treats `level=low` as not requiring approval to seed; coach review is for content polish, not a gate.
- **SKR-01 is `difficulty: 2` (intermediate)** because the user is the *passer* — they hold the ball and have to read the overhelp + execute the skip in one motion. Beginners typically learn off-ball cuts (BDW, ESC) before on-ball reads (SKR).
- **The `requiredAnswerDemoKinds` from `decoderPrimitives.ts`** are honoured: ESC-01's `answerDemo` includes `cut` and `pass` movements; SKR-01's includes a `skip_pass` movement.
- **No new schema fields, no new primitives, no renderer changes.** Both scenarios use only kinds that already shipped in P2.

### Remaining coach-review items (P3.1)

- ESC-01: confirm the help-tag timing window for an 11–13 yo player. The current `freezeMarker` lands at 1500 ms; the help arrives at ~1000 ms. A coach may want the freeze closer to 1200 ms to catch the help mid-step instead of after it lands.
- ESC-01: confirm the `c4` wrongDemo ("cut into help") doesn't visually collide with `x2`. *(P3.2 — adjusted; user now ends at `(14, 5)` so x2 at `(12, 5)` reads as walling off the cut with 2 ft of separation.)*
- SKR-01: confirm the skip-pass type for a middle-school player (overhead vs one-hand push). The current `kind: 'skip_pass'` is movement-kind-agnostic; the renderer's pass-arc helper applies a deterministic arc regardless of pass type.
- SKR-01: confirm the `label` overlay copy ("Skip past the help") reads at the schema's 24-char cap. It does (20 chars), but the cap is tight if a future translation lengthens.

---

## Section 14 — P3.2 founder QA + LIVE promotion gate

P3.2 closes the loop from "all four decoders authored" to "all four decoders are shippable or intentionally held back." No new product features; no new overlay primitives; no renderer changes.

### What this packet adds

- **Unified four-founder authoring lock.** `apps/web/lib/scenario3d/founderScenarios.test.ts` now parametrises over BDW / AOR / ESC / SKR (was ESC / SKR only in P3.1). 61 assertions catch decoder tag drift, freeze window violations, choice quality breakage, missing wrongDemos, pre-answer reveals, missing required movement kinds, NaN geometry, replay over-budget, and pack registration regressions on every founder simultaneously.
- **Runtime smoke coverage.** `apps/web/lib/scenario3d/founderScenariosRuntime.test.ts` walks every founder through the production pipeline (`buildScene → TeachingOverlayController.setAuthoredOverlays → setPhase → tick → dispose`) under jsdom. 9 assertions catch: silent renderer no-ops, NaN material opacity, orphaned root children after dispose, child-count drift across phase flips, dispose leaks across decoders.
- **ESC-01 c4 collision fix.** The user's wrong-cut endpoint moved from `(12, 6)` to `(14, 5)`; x2's wall-off endpoint stays at `(12, 5)`. The two figures are now 2 ft apart on the long axis instead of overlapping at the same x. The teaching ("you ran into help") still reads.
- **`docs/qa/founder-scenario-promotion-checklist.md`** — the LIVE promotion gate. Per-scenario coach pre-flight items, the promotion procedure, and what must be true before public launch.

### What this packet did NOT change

- **No scenario was promoted to LIVE.** ESC-01 and SKR-01 stay `DRAFT`. The user/coach has not provided written review notes; promotion waits on a human pass. The promotion checklist is the path.
- **AOR-01 cluster size remains advisory.** Six pre-answer entries vs the advisory cap of three. The promotion checklist tracks this; the test exempts AOR-01 from the cap (it tests "non-empty" instead) so the legacy cluster doesn't retroactively fail CI.
- **SKR-01 difficulty stays at 2.** The user is the passer (on-ball read with execution); BDW/ESC/AOR keep difficulty 1 (off-ball or catch-and-shoot). Documented in the promotion checklist.
- **No headless WebGL test.** Sprite labels emit `getContext` warnings in jsdom (cosmetic). Adding Playwright coverage with screenshot diffs is a follow-up packet.

### Acceptance lock (P3.2)

- [ ] All four founder scenarios are registered in `pack.json`.
- [ ] All four founder scenarios pass `founderScenarios.test.ts` (15 assertions per founder + 1 pack-level test = 61 total).
- [ ] All four founder scenarios pass `founderScenariosRuntime.test.ts` (2 per founder + 1 cross-decoder leak test = 9 total).
- [ ] ESC-01 c4 wrongDemo no longer overlaps player figures (≥ 2 ft separation between user and x2 at any time after the freeze).
- [ ] `docs/qa/founder-scenario-promotion-checklist.md` ships the per-scenario coach pre-flight + LIVE promotion procedure.
- [ ] No physics, no randomness, no animation-driven movement, no scenario-data mutation.

---

## Appendix — Where things live

| Concern | File |
|---|---|
| Primitive types + pre-answer allow-list | `apps/web/lib/scenario3d/schema.ts` |
| Renderer | `apps/web/components/scenario3d/imperativeTeachingOverlay.ts` |
| Decoder *animation intent* map (P2.6) | `apps/web/lib/scenario3d/decoderPrimitives.ts` |
| Decoder *overlay preset* map (P3.0) | `apps/web/lib/scenario3d/decoderOverlayPresets.ts` |
| Overlay beat types + helpers (P3.0) | `apps/web/lib/scenario3d/overlayBeats.ts` |
| Founder scenarios | `packages/db/seed/scenarios/packs/founder-v0/*.json` |
| Phase P doc (architecture) | `docs/phase-p-film-room-animation-architecture.md` |
| Scenario overlay author spec | `docs/curriculum/SCENARIO_OVERLAY_SPEC.md` |
| Founder scenario LIVE promotion checklist (P3.2) | `docs/qa/founder-scenario-promotion-checklist.md` |
| Founder scenario authoring tests | `apps/web/lib/scenario3d/founderScenarios.test.ts` |
| Founder scenario runtime smoke tests | `apps/web/lib/scenario3d/founderScenariosRuntime.test.ts` |
