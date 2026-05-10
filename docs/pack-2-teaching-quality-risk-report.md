# CourtIQ Pack 2 — Teaching Quality Risk Report

> **Audit phase only.** No code changed. This document is a systems-thinking
> review of the *educational architecture* now that Pack 2 infrastructure has
> stabilized. Implementation, scenario authoring, and visual baselines are
> explicitly out of scope.

- **Branch:** `claude/courtiq-pack2-infrastructure-AmjTd`
- **Date:** 2026-05-08
- **Scope:** cognitive load · replay readability · disguise fairness · D4/D5
  pacing · overlay escalation · ambiguity design · decoder clarity · freeze
  composition · teaching progression · wrong-demo pedagogy · recognition-vs-
  trick balance

---

## 0. Executive Findings

Pack 2's infrastructure is sturdy. The **educational contract** rides on top
of it carries five structural contradictions between documented pedagogy and
enforced behavior. None of them require new systems to fix; most are
single-file architecture tweaks, lint additions, or pacing parameters.

1. **D5 is unauthorable to spec.** `cognitionHoldMs ≥ 1100ms` is enforced at
   the schema floor (`apps/web/lib/scenario3d/schema.ts:105`), but the Pack 2
   blueprint defines D5 as `800ms` hold. The hardest difficulty cannot be
   authored to its own specification.
2. **`disguise.freezeCompressMs` compresses the wrong axis.** It shifts
   `freezeMarker.atMs` earlier in the possession
   (`scripts/materialize-templates.ts:435`). It does *not* shorten thinking
   time. "Heavy" disguise gives the player exactly as long to think as
   "none"; only the moment of freeze moves.
3. **HUNT and DROP can ship as empty teaching surfaces.** Their preset
   overlay clusters are explicit `[]`
   (`apps/web/lib/scenario3d/decoderOverlayPresets.ts:259-275`), and the
   gating against LIVE promotion is a soft seeder check, not a schema
   constraint. A LIVE D4/D5 `HUNT_THE_ADVANTAGE` scenario can render with
   zero pre-answer cues.
4. **Two difficulty axes exist and don't compose.** Authoring overlay caps
   (D1=3pre → D5=1pre, in `materialize-templates.ts`) and runtime Pathways
   caps (beginner=3pre, advanced=1pre, none=0, in
   `apps/web/lib/scenario3d/overlayLevel.ts`) are independent. A D5 variant
   played in the "beginner" Pathways mode and a D1 variant played in
   "advanced" both render with roughly one pre-overlay — but for opposite
   teaching reasons.
5. **The advantage beat fires at the cognition-hold boundary.**
   `ADVANTAGE_BEAT_AT_MS = 1100` is the *same* number as the schema-floor
   `cognitionHoldMs` (1100). At any compressed-hold variant, the "why this
   read works" explanation arrives the same instant the choice tray opens.
   Advanced players make their decision *during* the explanation, not after.

The rest of this document expands these findings, audits the eleven specific
focus areas, and proposes a short list of high-leverage fixes.

---

## 1. Answers to the Audit Questions

### Q1. Is D4 genuinely "harder," or just more hidden?

**More hidden, not harder.** Pre-overlay cap drops only one slot from D2 to
D5 (3 → 1). Cognition hold cannot be shortened. Beat offsets are constants.
What actually changes between D3 and D4 is which `removePre` cues are
filtered out and (potentially) `freezeCompressMs`, but the latter doesn't
compress cognition. **D4 is "you see less" not "you decide faster."**

### Q2. When does disguise become unfair?

When `removePre` strips the cue that *uniquely identifies the decoder*. The
schema validates that `removePre` targets exist
(`scripts/lint-variants.ts` removePre validity), but it does not validate
which cue *remains*. With heavy disguise on a BDW-denied-wing variant, you
can legally remove `vision_cone`, `hip_arrow`, AND `hand_in_lane`,
leaving zero cues — pre-overlay cap is then 1, but the disguise filter
already returned 0. The lint catches typos, not pedagogy.

### Q3. When do overlays become noise?

At any moment two overlays of different decoder families share the freeze.
The pre-overlay priority table in `overlayLevel.ts` ranks
`defender_vision_cone` at priority 0 alongside `help_pulse`. When a
`SKIP_THE_ROTATION` variant uses both (its preset has a `help_pulse` and the
template added a vision_cone for a distractor), at the advanced cap of 1,
*one of them is silently dropped*. The decoder's own cue can lose to a
distractor. Same problem at the post-answer side, where `passing_lane_open`
and `open_space_region` tie at priority 0.

### Q4. Are wrong demos actually teaching?

**Architecturally, no — they're guaranteed to play but not guaranteed to
teach.** The schema requires every wrong choice to declare `wrongDemos`
movements. It does not require that the wrong-demo's *consequence frame*
visually diverges from the answer demo's at a given timestamp. It does not
require an explanatory caption. Lint catches missing demos, not silent
demos. The Pack 2 blueprint §5.2 documents three quality tiers ("no demo /
unclear / teaching"); only "no demo" is enforced.

### Q5. Does replay pacing preserve comprehension?

Mostly. Three weak spots:

- `PRE_CONSEQUENCE_DELAY_MS = 80ms` (`ScenarioReplayController.tsx:91`) is
  reflex-tight. After a wrong choice, the player has 80ms to register
  "yes, my choice was registered" before consequence motion begins. At
  D4/D5 — where choices are stressful — this can feel like the system
  punished them before acknowledging the input.
- `DONE_HOLD_MS = 700ms` is uniform across difficulty. A wrong answer at
  D5 needs more dwell time on the consequence than a correct answer at D1.
- The controller has *three* legs (intro → consequence → answer). HUNT's
  chained-decision model needs *four* (intro → choice₁ → choice₂ →
  resolution). The leg count is implicit in the controller; HUNT cannot
  ship without either bolting on a fourth leg or pretending its second beat
  is a wrong-demo.

### Q6. Which decoders are most fragile under disguise?

**SKR (Skip the Rotation)** and **AOR (Advantage or Reset)**. Both have
pre-answer clusters dominated by body-language cues
(`hip_arrow`, `chest_line`, `foot_arrow`) that are all priority 2 in the
overlay rank. Under heavy disguise + advanced cap, the surviving cue is
selected by author choice, not by which one *uniquely identifies* the
decoder. **BDW is least fragile** because `vision_cone` is a strong, unique
denial signal that survives priority truncation.

**HUNT and DROP are infinitely fragile** — their presets are `[]`, so the
disguise system has nothing to remove. Any "disguise" they apply is no-op.

### Q7. Which scenario structures create fake difficulty?

Four patterns:

- **Same scenario authored at multiple difficulties via Pathways mode
  alone.** The variant's authored `difficulty` is, say, D2. In advanced
  Pathways mode it becomes a 1-overlay scene. The teaching content didn't
  change — just the scaffolding was stripped. The player believes the
  scenario got harder; really, they got *less help*.
- **`freezeCompressMs` as the disguise.** Per finding above, this shifts
  the freeze moment, doesn't compress thinking. Variants leaning on this
  for D4/D5 difficulty are not actually harder.
- **Mirror flag on handedness-sensitive decoders.** A right-handed BDW
  back-cut variant mirrored becomes a left-handed cut. For middle-school
  players still building handedness, this is *cognitively harder* without
  being *tactically harder* — the wrong axis is being taxed.
- **Disguise + difficulty override compounding.** A variant with
  `difficulty: 5` AND `disguise: heavy` clamps to D5
  (effective = `min(5, base + 2)`) but the author may have intended D6-ish.
  The materializer silently caps; the variant ships at D5 with the
  pedagogy of "even harder than D5."

### Q8. What happens cognitively when HUNT arrives?

HUNT promises a "chained two-beat freeze" — the second freeze depends on
the first answer. The current runtime model has no representation of this:
the controller's three legs assume a single decision, the freeze
composition has constants for `CUE_BEAT`, `ACTION_BEAT`, `ADVANTAGE_BEAT`
all relative to *one* `freezeMarker.atMs`. A HUNT scenario that ships
today against an empty preset will:

1. Render with zero pre-answer cues (preset is `[]`).
2. Play one freeze with the standard 1400ms cognition hold.
3. Open the choice tray for the *first* read.
4. Resolve into a single answer-leg replay.

The "chained" aspect is unimplemented. The cognitive expectation HUNT
sets — "you have to commit to the first read before you can see the
second" — is not architecturally available. Players will be tested on
the published model; the system will deliver the founder model.

### Q9. Does timingOverrides scaling actually match player cognition?

**Partially.** `cognitionHoldMs` and `cueRepaintHold(Correct|Wrong)Ms` are
overrideable, which is the right surface. But:

- The schema floor (1100ms) blocks the documented D5 target (800ms).
- The override does not extend to **beat offsets** (`CUE_BEAT_AT_MS = 200`,
  etc.). At a tightened cognition hold, the cue still appears at +200ms
  but disappears at hold-end — squeezing the visible cue window.
- The override is **per scenario**, not per difficulty axis. A single
  variant authored for D4 still has the same overrides whether played in
  beginner or advanced Pathways mode.

### Q10. Where will middle-school players get confused first?

Three predicted points:

- **Mirror variants on right-hand drives.** Cognitive load goes up,
  decoder reading does not.
- **Heavy-disguise + low-base-difficulty variants** that compute to D3 but
  *feel* like D5 because all cues are gone. The player confronts a
  near-empty freeze with a 1400ms hold — confusion, not challenge.
- **HUNT scenarios when they ship.** The choice tray will open after
  beat 1 with no overlays, no chain indicator, no second-freeze
  affordance. Players will believe they finished a normal scenario.

---

## 2. Risk Catalog

### High Risk (likely to cause teaching failures at scale)

| ID | Name | Evidence | Pedagogical break |
|----|------|----------|-------------------|
| **H1** | D5 cognition hold unauthorable | `apps/web/lib/scenario3d/schema.ts:105` floor 1100ms vs. blueprint 800ms | Hardest tier silently caps to easier tier's pacing |
| **H2** | `freezeCompressMs` compresses wrong axis | `scripts/materialize-templates.ts:435` (modifies `freezeMarker.atMs`) | "Heavy" disguise advertises pacing pressure it does not deliver |
| **H3** | HUNT/DROP empty preset stubs are LIVE-shippable | `decoderOverlayPresets.ts:259-275`; soft seeder gate | A LIVE HUNT scenario can render zero cues |
| **H4** | Authoring vs. Pathways difficulty axes don't compose | `materialize-templates.ts` cap table vs. `overlayLevel.ts` cap table | Same overlay budget reached for opposite reasons; player can't tell |
| **H5** | Advantage beat at +1100 = choice tray at +1100 (floor) | `freezeFrameCognition.ts:88` vs. schema floor | "Why this read works" appears *as* player chooses |
| **H6** | Wrong-demo silent failure | Schema requires existence, not divergence | Wrong choices play a demo that may be visually identical to the answer demo |

### Medium Risk (will cause readability degradation)

| ID | Name | Evidence | Pedagogical break |
|----|------|----------|-------------------|
| **M1** | Decoder cue can lose to distractor cue at advanced cap | `overlayLevel.ts` priority ties at 0 | The cue identifying the decoder is silently dropped |
| **M2** | Mirror flag has no handedness awareness | `_schema.ts` mirror: boolean | Right-handed cut becomes left-handed cut |
| **M3** | Variation signature ignores `removePre` content | `scripts/materialize-templates.ts` variationSignature | Two heavy-disguise variants with different surviving cues collapse to one signature |
| **M4** | `acceptable` choices have prose but no demo path | Schema declares `acceptable` quality, replay model has no slot | Player cannot see what "second-best" looks like |
| **M5** | `PRE_CONSEQUENCE_DELAY_MS = 80ms` after wrong choice | `ScenarioReplayController.tsx:91` | At D4/D5, feels like punishment before acknowledgement |
| **M6** | `DONE_HOLD_MS = 700ms` uniform | `replayTeachingTimeline.ts:71` | No room for D4/D5 wrong-answer reflection |
| **M7** | Disguise lint allows `moderate.bump = light.bump` | `scripts/lint-variants.ts` monotonicity (non-decreasing, not strictly) | Two disguise tiers can functionally collapse |

### Lower Risk (worth tracking)

| ID | Name | Evidence | Pedagogical break |
|----|------|----------|-------------------|
| **L1** | Beat fade-in 300ms hardcoded | `freezeFrameCognition.ts:93` | Eats into compressed cognition holds |
| **L2** | Camera preset locked per decoder | `decoderCameraPresets.ts` | Single framing across multi-area possessions |
| **L3** | `freezeMarker` has two modes (`atMs` / `beforeMovementId`) | `_schema.ts` | Author cognitive overhead; mixed modes across templates |
| **L4** | Teaching label fade 500ms hardcoded | `replayTeachingTimeline.ts:65` | Cannot tune pacing per difficulty |
| **L5** | Coach-validation tier policy not bound to difficulty | `CONTENT_SYSTEM.md §4.3` | No rule that D4/D5 require high-tier review |

---

## 3. Highest-Leverage Fixes (proposed; not implemented)

Each fix names: **what risk(s) it solves**, **type** (architecture
tweak / replay sequencing / pacing / overlay discipline / authoring rule
/ lint / QA), and **rough effort**.

### F1. Difficulty-aware `cognitionHoldMs` floor
**Solves H1, partially H5.** Replace the flat 1100ms floor with a function:
`floor(d) = d ≤ 3 ? 1100 : d === 4 ? 1000 : 800`. Schema validates floor
against effective difficulty (variant override or template default + bump).
**Type:** architecture tweak. **Effort:** ~30 lines in `schema.ts` +
materializer; one test.

### F2. Rename `freezeCompressMs` and add real cognition compression
**Solves H2.** Rename to `freezeShiftEarlierMs` so the field's intent
matches its behavior. Add a separate optional disguise field
`cognitionHoldCompressMs` that actually subtracts from the resolved
cognition hold (with floor enforcement from F1). Heavy disguise can then
*both* shift the freeze earlier AND tighten thinking time — the two-axis
disguise the docs imply.
**Type:** architecture tweak + authoring rule. **Effort:** ~60 lines
across schema, materializer, freeze resolver; rename migration on three
existing template files.

### F3. Hard gate on empty preset decoders
**Solves H3.** In `lint-variants.ts`, fail the build for any variant whose
template `decoder_tag ∈ { READ_THE_COVERAGE, HUNT_THE_ADVANTAGE }` AND the
preset's `preAnswer.length === 0` AND variant `status ∈ { REVIEW, LIVE }`.
DRAFT remains allowed so authoring can proceed. Removes the soft
seeder-only gate.
**Type:** lint enforcement. **Effort:** ~15 lines + one test.

### F4. Single difficulty axis at runtime
**Solves H4, partially H1, partially H5.** Resolve the authored
`variation.difficulty` and the runtime Pathways mode into one effective
overlay budget at scene-load time, with explicit precedence:
`min(authoredCount, pathwayCap)`. Document that Pathways mode can only
*reduce* visible overlays, never add them, and never reduce below the
"single decoder cue" floor (one mandatory cue survives even in Boss
Challenge). Write the resolution as a pure function with a test matrix
covering the 5 × 4 = 20 combinations.
**Type:** architecture tweak + lint. **Effort:** ~80 lines + matrix test.

### F5. Beat schedule is difficulty-aware, not just decoder-aware
**Solves H5.** Move `CUE_BEAT_AT_MS / ACTION_BEAT_AT_MS / ADVANTAGE_BEAT_AT_MS`
from module constants to a function `beatSchedule(decoder, effectiveD)`.
At D4 the advantage beat compresses to +700ms; at D5 to +500ms. Fade-ins
shrink correspondingly. The advantage explanation always arrives strictly
*before* the choice tray, never with it.
**Type:** pacing adjustment. **Effort:** ~40 lines in
`freezeFrameCognition.ts` + tests.

### F6. Decoder-cue priority dominance
**Solves Q3, M1.** When the renderer truncates pre-answer overlays to the
cap, *first* preserve the overlay whose `kind` matches the active
template's `tactical.cue_atoms[0]` for the decoder. Distractor cues lose
ties to the decoder's own cue, regardless of generic priority.
**Type:** overlay discipline. **Effort:** ~25 lines in `overlayLevel.ts`
priority resolution + one test per decoder family.

### F7. Wrong-demo divergence lint
**Solves H6.** Add `lintWrongDemoDivergence` that compares the answerDemo
movements and each wrongDemo's movements, requiring at least one player's
position to differ by ≥ 1.5 ft at +500ms after freeze. Wrong choices that
play visually-identical paths fail the lint with: "wrong-demo for choice
`X` does not visibly diverge from the answer demo within 500ms."
Cheaper than mandating captions; forces the consequence to actually
display the failure.
**Type:** lint enforcement. **Effort:** ~50 lines + tests; existing
movement schema makes this a numeric comparison.

### F8. Replay sequencing: D4+ wrong-answer dwell extension
**Solves M5, M6.** When `effectiveDifficulty ≥ 4` AND the player chose
a wrong/partial choice, extend `DONE_HOLD_MS` by 800ms before transitioning
to answer leg. Give cognitive room to absorb "why wrong" before showing
"what was right." For D1–D3, no change.
**Type:** replay sequencing + pacing. **Effort:** ~10 lines in
`ScenarioReplayController.tsx`; no schema change.

### F9. Variation signature includes disguise content hash
**Solves M3, partially Q2.** Add `hash(disguise.removePre)` to
`variationSignature()`. Two variants of the same template with
heavy-disguise that strip *different* cues remain distinct. Keeps the
deduplicator honest.
**Type:** authoring rule. **Effort:** ~5 lines in materializer + tests.

### F10. Mirror handedness annotation
**Solves M2, partially Q7.** Add to template schema:
`tactical.mirror_safety: 'symmetric' | 'right-handed-only' |
'left-handed-only' | 'review-each-mirror'`. Lint rejects any variant
with `mirror: true` whose template declares `right-handed-only` or
`left-handed-only`. `review-each-mirror` requires explicit author
sign-off (a `mirror_review_note` field).
**Type:** authoring rule + lint. **Effort:** ~30 lines + per-template
authoring backfill (3 templates today, tractable).

### F11. `acceptable` choice gets a demo path
**Solves M4.** Add optional `acceptableDemo` to template schema parallel
to `wrongDemos[]`, indexed by choice outcome. Replay sequencer plays it
when the player picked an `acceptable` choice. Pure additive — no
existing template breaks. Authors can choose to add it where the second
read is genuinely worth showing.
**Type:** architecture tweak (additive). **Effort:** ~40 lines + one
acceptableDemo on each gold-standard template.

---

## 4. QA Checklist Additions

Add to `docs/scenario-readability-checklist.md`:

1. **Disguise audit:** for every D4+ variant, list the cue(s) that survive
   `removePre` filtering. Confirm the surviving cue still uniquely
   identifies the decoder (a stranger watching the freeze can name the
   read from this cue alone).
2. **Mirror audit:** if `mirror: true`, name the handedness of the
   resulting cut/drive. Confirm the mirrored version teaches the same
   tactical concept, not the inverse.
3. **Wrong-demo divergence:** at +500ms after freeze, the wrong-demo
   replay must visibly differ from the answer-demo replay (a player
   pausing mid-replay can tell which path is which).
4. **HUNT/DROP gate:** any variant authored against `READ_THE_COVERAGE`
   or `HUNT_THE_ADVANTAGE` must show a non-empty preset cluster on the
   freeze, OR remain in DRAFT until the preset is filled.
5. **Compression sanity:** if the variant uses a tightened cognition
   hold, walk through the freeze and confirm cue → action → advantage
   beats all complete *before* the choice tray opens.

---

## 5. What I Would NOT Do (low-leverage temptations)

- **Per-scenario beat offset overrides.** Surface area for very little
  gain; F5's difficulty-aware schedule covers the real need.
- **A "teaching score" dashboard.** Rolls up the wrong signals; what
  matters is the freeze passing the readability checklist, not an
  aggregate.
- **Rewriting the three-leg replay controller for HUNT.** HUNT's chain
  needs deliberate design (3.1.4+); patching the controller now will
  ossify the wrong shape. F3 (block LIVE empty-preset decoders) buys
  the time.
- **Adding more overlay primitives.** The current allow-list is large
  enough that priority-truncation is already losing decoder-critical
  cues (M1). Adding more competes for the same slot.
- **A new "ambiguity tier" between acceptable and wrong.** The existing
  three qualities (best/acceptable/wrong) are sufficient *if* F11 makes
  acceptable demonstrable. A fourth tier doubles the cognitive load on
  authors.
- **Cross-cutting refactor of `materialize-templates.ts`.** F1, F2, F4,
  F9 each touch it; doing them as four small commits is safer than one
  rewrite.

---

## 6. Recommended Sequencing

If only three fixes ship next: **F3, F4, F5.**

- **F3** (HUNT/DROP gate) is a 15-line lint that closes the most
  embarrassing failure mode (empty teaching surface).
- **F4** (single runtime difficulty axis) is the deepest pedagogical fix:
  it makes the difficulty system *coherent*, which is the foundation
  every other fix depends on.
- **F5** (difficulty-aware beat schedule) makes D4/D5 actually feel
  faster, not just more hidden.

If two more land: **F1, F7.** D5 becomes authorable; wrong-demos become
real teaching surfaces.

The remaining six (F2, F6, F8, F9, F10, F11) are all independently
landable as ~30–80-line PRs with their own tests.

---

*End of report. No code modified.*
