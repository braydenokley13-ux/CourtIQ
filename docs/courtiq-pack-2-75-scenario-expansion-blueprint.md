# CourtIQ — Pack 2: 75-Scenario Expansion Blueprint

> **Status**: Architectural plan. **Owner**: Architecture (Opus). **Audience**:
> content lead, basketball SMEs, engineers, QA, future contributors.
> **Related docs**: `CONTENT_SYSTEM.md`, `ARCHITECTURE.md`,
> `docs/founder-v0-scenario-content-plan.md`,
> `docs/courtiq-phase-1-decoder-foundations.md`,
> `docs/phase-p3-teaching-overlays.md`,
> `docs/phase-p-film-room-animation-architecture.md`,
> `docs/scenario-qa-checklist.md`,
> `docs/curriculum/SCENARIO_OVERLAY_SPEC.md`.

CourtIQ is a "playable film room" basketball IQ trainer, not a video game.
Each scenario is a tiny, deterministic, replayable possession that teaches
**one** specific defensive or offensive read. Pack 1 (`founder-v0`) shipped
20 hand-authored scenarios across the four founder decoders (BDW, ESC, SKR,
AOR), all at difficulty 1 on render tier 1. This document is the
architectural plan for **Pack 2** — 75 additional scenarios — and the
authoring system, QA, and roadmap that make Pack 3+ a production line
instead of a heroic effort.

The plan is intentionally **system-first**, not list-first. We do not name 75
scenarios in this document; we design the system that produces them and
prove the system can hit 75 without compromising teaching quality.

---

## Executive Summary

**The problem with the current state.** Pack 1 is excellent and consistent,
but the path that produced it does not scale: every scenario is a
~250-line hand-authored JSON file with bespoke prose. Authors hit a
prose bottleneck at ~30–60 minutes per scenario. The template/variant
system is the right primitive but only 2 templates and 4 partial
variants exist, with 25+ `TODO:` placeholders left in `02-mirror-light`.

**Pack 2 is not "more Pack 1."** Pack 2 must do four things Pack 1 did
not need to:

1. **Push the difficulty ceiling and floor.** Pack 1 spans D1 (8
   scenarios), D2 (8), D3 (4), with **zero D4 or D5**. Pack 2 must
   land the D4 ("advanced — timing / weak-side manipulation") and a
   small number of D5 ("elite") scenarios so the ladder described in
   `CONTENT_SYSTEM.md` §2.4 actually exists end-to-end.
2. **Cover the missing categories.** Pack 1 is 100% half-court
   offense. Pack 2 introduces TRANSITION, SITUATIONAL, and
   DEFENSE-perspective reads.
3. **Validate the template/variant compiler at scale.** The system
   exists; Pack 2 is its production trial. If the compiler can produce
   75 high-quality scenarios from 14–18 templates, it can produce 300.
4. **Enforce decoder-overlay and decoder-camera presets at runtime.**
   Pack 1's overlays were authored with discipline; Pack 2 cannot rely
   on author discipline at scale.

**The four-decoder ceiling is real.** Four decoders cannot teach AAU /
varsity IQ. Pack 2 introduces **two new decoder families** (DROP and
HUNT) gated to difficulty ≥3 so they appear only after a player has
mastered the founder four. We do not abandon the founder four — they
remain the trunk of the curriculum tree.

**75 = 14 templates × 4–6 variants + a small handcrafted boss tier.**
Concretely: 12 templates × 5 variants = 60 scenarios, plus 4 handcrafted
"boss"/multi-read scenarios, plus 11 transition/situational templates
that ship 1 base variant each (transition reads do not mirror or
disguise as cleanly as half-court reads). Total: 75.

**Six-phase plan, micro-commit cadence.** Phases run in this order:
(1) compiler hardening + lint-in-CI, (2) two new decoder families with
overlay/camera presets, (3) template authoring sprint, (4) variant
authoring sprint with prose-bank assist, (5) QA + visual regression,
(6) ship and instrument. Phases 1–2 must complete before any Pack 2
content lands; phases 3–4 parallelize across authors; phase 5 gates
LIVE.

---

## Phase 1 — Audit Findings

This section synthesizes the parallel audits of (a) scenario schema and
data model, (b) decoder/curriculum coverage, (c) replay/overlay/freeze
runtime, (d) authoring pipeline & tooling, (e) existing scenario content
quality. Cited paths come from those audits; line counts reflect the
state of the repository at the time of writing.

### 1.1 What CourtIQ already does well

| System | Why it is strong |
| --- | --- |
| Decoder taxonomy | The four founder decoders (BDW/ESC/SKR/AOR) each have a complete pre-answer cue cluster, post-answer reveal, and animation-intent map. Each is documented to author-grade in `docs/curriculum/SCENARIO_OVERLAY_SPEC.md`. |
| Determinism | `imperativeScene.ts` is ~7,800 lines of vanilla THREE.js with **no wall-clock, no random, no physics**. Pure-function modules (`freezeFrameCognition.ts`, `overlayChoreography.ts`, `replayTeachingFlow.ts`) are testable in isolation. The "same JSON → same playback" contract is verifiable by inspection and by `replayDeterminism.test.ts`. |
| Freeze choreography | A 600 ms ramp + 1400 ms cognition hold + 300 ms handoff = 2.3 s freeze envelope, with explicit cue/label/action/advantage beats. This is a **2.3-second timeout huddle**, consistent across every scenario. |
| Snapshot-based consequence playback | Wrong-choice replays resume from the freeze snapshot via `startOverrides`, so idle players don't snap back to authored starts. Subtle but important for "did I just see the same possession?" trust. |
| Coach validation gating | Three-tier (`low`/`medium`/`high`) with seeder warning and a `--allow-unvalidated` escape hatch. The bones of an SME process exist. |
| Template + variant primitive | `_schema.ts` already encodes 20 cue atoms, 4 disguise levels, 5 variation axes, and a `variationSignature` for repetition lint. This is the right primitive for scaling content. |
| Visual design system | `courtiq/project/design-system.jsx` plus the eight overlay primitives + 12 animation intents + 13 movement kinds give authors a controlled vocabulary. |

### 1.2 Where Pack 1 is the wrong shape for Pack 2

**Pack 1 is 100% half-court, 100% render tier 1, with a truncated
difficulty ladder.** Every scenario in
`packages/db/seed/scenarios/packs/founder-v0/` carries `"render_tier":
1` and a half-court setup. Difficulty is exercised partially — D1: 8
scenarios, D2: 8, D3: 4, **D4: 0, D5: 0** — so a player who masters
all 20 reads has nowhere to go. The 12-intent animation vocabulary is
exercised only in its simplest configurations (no `STOP_BALL`, no
`SLIDE_RECOVER`-into-`CLOSEOUT` chain, no multi-step `RESET_HOLD` →
`JAB_OR_RIP`).

**Pack 1 is 100% single-decision.** Every scenario freezes once,
asks one question, and replays one answer. There are no chained
reads ("catch the skip → now read the closeout"), no multi-beat
scenarios, no scenarios where the consequence of a wrong choice
itself becomes a teachable second read. This is a deliberate Pack 1
constraint, not a system limitation — but it caps the apparent depth
of the product.

**Court-zone coverage is wing-heavy.** Of 20 founder scenarios:
8 wing, 4 corner, 4 top-of-key/slot, 3 slot/elbow, 1 post. The post
read (SKR-03) is the only scenario where the user is a post player.
Pack 2 must broaden zone coverage, particularly for big-man /
high-post / short-corner reads.

**Pack 1 is 0% transition, 0% situational, 0% defense-perspective.**
Per `CONTENT_SYSTEM.md` §2.5 the v1 target map is:

| Category | v1 target | Pack 1 actual | Gap |
| --- | --- | --- | --- |
| Offense | 100 | 20 | 80 |
| Defense | 80 | 0 | 80 |
| Transition | 40 | 0 | 40 |
| Situational | 30 | 0 | 30 |

Pack 2 cannot fill all 230 of those slots, but it must **open** every
category, because each category needs different choreography rules
(e.g. transition uses full-court, situational uses shot-clock pressure)
and those rules need to be exercised on real content before Pack 3.

**Decoder coverage is balanced but capped at four.** Each founder
decoder has 5 scenarios. Four decoders cannot teach late-clock reads,
PnR coverage choices, hammer / pin-down / Iverson actions,
double-team-out-of-post recognition, or any defensive read whose cue is
not "a defender's body language." The four-decoder ceiling **is** the
constraint we have to break in Pack 2.

### 1.3 Anti-patterns and technical debt observed

Each item below is a real risk against scaling to 75 scenarios; each
gets a corresponding fix in Phase 3 or Phase 4.

1. **`concept_tags` is `string[]` with no enum and no foreign key**
   (`packages/db/prisma/schema.prisma` `Scenario.concept_tags`). A typo
   like `"clos_outs"` silently breaks the spaced-rep query that joins
   `Mastery.concept_id`. The seeder does not catch it. **Severity:
   high.** Pack 2 will multiply tag count by ~4× and compound this.
2. **Decoder overlay presets exist as data but are not enforced at
   runtime.** `apps/web/lib/scenario3d/decoderOverlayPresets.ts`
   defines what BDW/ESC/SKR/AOR scenarios should show; nothing in
   `imperativeTeachingOverlay.ts` filters scenario overlays through
   that preset. Pack 1 was disciplined; Pack 2's larger surface will
   drift.
3. **Decoder-to-camera-preset mapping lives nowhere in code.**
   `cameraPresets.ts` has the presets; the scenario JSON's `camera`
   field is a free string. Two BDW scenarios can ship with different
   framing. Pack 2 is the right time to add `decoderCameraPresets.ts`.
4. **Pre-answer overlay allowlist is enforced only at seed time.**
   `assertPreAnswerOverlayAllowlist()` runs in
   `scripts/seed-scenarios.ts` and produces a console error; the
   author authoring locally sees nothing until they run the seeder.
5. **Hard-coded timing constants (no per-scenario override).**
   `FREEZE_COGNITION_HOLD_MS`, `CUE_REPAINT_HOLD_WRONG_MS`, etc. are
   module-level constants in `freezeFrameCognition.ts` and
   `replayTeachingTimeline.ts`. Difficulty 4 scenarios genuinely need
   a longer cognition hold than difficulty 1; today the only way to
   get that is to fork a constant.
6. **Coach-validation `--allow-unvalidated` escape hatch.** The
   seeder's `--allow-unvalidated` flag lets `level: 'high'` scenarios
   ship without `status: 'approved'`. This is a process loophole, not
   a schema one — but at 75 scenarios with 2+ external coaches, it
   becomes a coordination failure mode.
7. **Templates do not gate CI.** `pnpm templates:lint` exists
   (`scripts/lint-variants.ts`) but is not in `.github/workflows/ci.yml`.
   Variation collisions and single-axis spread go undetected on PR.
8. **Lesson-panel fields validated but not persisted.** Fields like
   `game_context`, `decision_moment`, `visible_cue`, `best_read`,
   `decoder_teaching_point`, `lesson_connection`, `feedback`,
   `self_review_checklist` are validated in `seed-scenarios.ts` but
   live only on `Scenario.scene` JSON or pure-text columns; there is
   no FK to `Lesson` or `Concept`. Pack 2 should not extend this
   debt.
9. **Wrong-demo authoring is silently optional for non-best choices.**
   The seeder warns when `decoder_tag` is set and a non-best choice
   has no `wrongDemos[]` entry, but the warning does not block
   `LIVE`. A scenario with no consequence playback for a wrong choice
   is pedagogically broken — that wrong choice teaches nothing.
10. **Templates-v1 is half-finished.** `02-mirror-light.json` carries
    25+ `TODO:` placeholders. `pnpm templates:lint` is supposed to
    flag prose containing `TODO:`; it must be promoted to **error**
    before Pack 2 begins.
11. **GLB/procedural athlete drift.** When the GLB asset doesn't load,
    procedural figures render with different proportions and shading
    in the same frame. Determinism is preserved for the math, but the
    user sees two visual languages. Tracked in
    `docs/courtiq-3d-film-room-system-plan.md` Phase 1.
12. **No scenario picker for QA.** Authors must seed, log in, and hope
    randomized session bundles surface the scenario. `/dev/scenario-preview`
    exists; `/dev/scene-preview` exists; neither is a stable URL by ID.

### 1.4 Authoring bottlenecks (top 3)

1. **Prose authoring is 100% manual.** Every variant types
   `title`, `prompt`, `game_context`, `possession_setup`,
   `decision_moment`, `visible_cue`, `best_read`, `explanation_md`,
   `feedback.{correct,partial,wrong}`, `self_review_checklist[2..6]`,
   `acceptable_reads[]`, `bad_reads[]`, plus per-choice `label` /
   `feedback_text` / `partial_feedback_text`. ~25 prose lines per
   scenario × 75 scenarios × ~3 minutes per line ≈ **94 author-hours
   of pure typing**, ignoring thinking time.
2. **SME review is a single-person gate.** No async review tool, no
   review queue, no diff view. SME must spin `pnpm dev`, navigate to
   `/dev/scenario-preview`, manually walk every scenario. At
   ~15 minutes per review, 75 scenarios is **18.75 SME hours** before
   a single fix iteration.
3. **Template-first discipline is opt-in.** `pnpm templates:lint`
   warns on single-axis spread and variation collision but does not
   block, and is not in CI. The path of least resistance is to copy a
   founder JSON and edit it — undoing the entire template/variant
   investment.

### 1.5 Educational gaps (concept-level)

The four founder decoders teach off-ball cuts, weak-side help, skip
passes, and closeout reads. They do **not** teach:

| Missing concept family | Example reads | Decoder fit |
| --- | --- | --- |
| Pick-and-roll offense | reject, snake, slip, short roll, pocket pass, throwback | new family **HUNT** (advantage hunting) |
| Pick-and-roll defense | drop, ICE, hedge-and-recover, switch, blitz, weak | new family **DROP** (drop coverage / coverage call reads) |
| Late-clock | scramble, hunt mismatch, strong-side override, kick-out cycles | repurpose AOR + clock pressure axis |
| Transition | stop-ball, secondary break spacing, rim run vs. trail, drag screen, push-tempo | repurpose ESC + AOR with `court: 'full'` |
| Hammer / pin-down / Iverson actions | screen-the-screener, defender level, top-lock vs. chase | extend BDW + ESC |
| Double-team-out-of-post | high-side double, baseline double, splitter, short corner | new SKR sub-family |
| EOB / SOB | first-cut option, second-cut counter, screen-the-screener finish | situational, dedicated templates |
| Closeout chains | shot-fake → drive → drift, attack-and-kick-and-cut | repurpose AOR with chain depth |
| Fake advantage / bait | help defender's stunt is the fake; punishing the over-rotation is the read | new SKR sub-family |
| Defense-perspective reads | "you are the help defender — do you tag, X-out, dig, stunt?" | new family **DROP** sub-set |

Pack 2's design therefore introduces two new decoder families
(**DROP**, **HUNT**) and stretches the existing four into the
difficulty 2–4 band, including disguised, mirrored, clock-pressured,
and chained variants. Section 2 specifies the matrix.

### 1.6 Repetition risk

The variation signature lint (`lint-variants.ts:variationSignature`)
catches duplicate variants **inside one template**. It does not yet
catch:

- Duplicate templates (two templates that resolve to the same tactical
  shape with different names).
- Cross-pack near-duplicates (a Pack 1 scenario and a Pack 2 variant
  whose freeze frame is visually identical).
- "Same possession, different prose" — a real risk when 2+ authors are
  writing prose for variants of the same template.

Phase 3 extends the lint to cover all three.

### 1.7 What is solid enough to leave alone for Pack 2

To prevent scope creep, the following are **out of scope** even though
all are imperfect:

- The 7,800-line `imperativeScene.ts`. We do not refactor the
  renderer for Pack 2.
- The dual `court_state` (legacy 2D) + `scene` (3D) representation.
  Pack 2 authors author both, but the materializer can derive
  `court_state` from `scene` going forward (Phase 3).
- The Prisma schema's `concept_tags: String[]` typing. We add
  enum-style validation in the seeder rather than schema-migrate to
  `Concept` foreign keys.
- The GLB/procedural athlete pipeline. Pack 2 ships render tier 1.
- The 12-animation-intent vocabulary. New decoders reuse existing
  intents; no new clips.
- The Notion-as-CMS authoring path described in `CONTENT_SYSTEM.md`
  §5.1. We use templates + variants directly.

---

## Phase 2 — Design the 75-Scenario Expansion

This section answers: **what 75 scenarios are we shipping, why those,
in what order, and how do they assemble into a learning journey?**

### 2.1 Two new decoder families

Four decoders cap the kind of read CourtIQ can teach. Pack 2
introduces two new families. Each is gated to D≥3 so it appears only
after a player has demonstrated mastery on the founder four.

**DROP — Read the Coverage**
- **What it teaches**: pick-and-roll defense recognition from the
  ball-handler's perspective. The ball-handler reads the screen
  defender's coverage (drop / hedge / blitz / switch / weak / ICE)
  and chooses the punishing attack (snake, reject, throwback, slip,
  pocket).
- **Cue cluster**: screen-defender depth, hip orientation,
  shoulder-line, and on-ball defender's go-over / go-under decision.
- **Animation intents reused**: `DROP_COVERAGE`, `OVER_SCREEN`,
  `UNDER_SCREEN`, `SWITCH_SIGNAL` (already in the cue-atom
  vocabulary), `JAB_OR_RIP`, `PASS_FOLLOWTHROUGH`, `SHOT_READY`.
- **No new movement kinds.** Uses existing `drive`, `pass`,
  `skip_pass`, `rip`, `jab`, `cut`.
- **Lesson connection slug**: `read-the-coverage`.

**HUNT — Hunt the Advantage**
- **What it teaches**: chained-decision reads where the first
  advantage is taken but the **second read** produces the higher-EV
  finish. "Drive draws help — kick — receiver reads the closeout —
  swing — shooter reads the next-pass closeout."
- **Cue cluster**: post-rotation defender body language; this is the
  family that exercises **multi-beat scenarios**.
- **Animation intents reused**: full vocabulary (no new clips
  required). HUNT scenarios use two freeze beats per scenario; the
  controller already supports `freezeMarker` per leg.
- **Lesson connection slug**: `hunt-the-second-read`.

**Why these two and not more?** DROP unlocks PnR, the most-played
NBA action and the missing on-ball read in CourtIQ. HUNT unlocks
multi-beat scenarios, which are the missing depth dimension. Adding
more families before these two have been validated with live users
risks a teaching surface we cannot maintain.

### 2.2 Decoder coverage matrix (Pack 2)

The matrix is **decoder × difficulty × scenario count.** Pack 2's
total is 75 scenarios.

| Decoder | D2 | D3 | D4 | D5 | Pack 2 total | Pack 1 carry | Combined |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BDW | 4 | 3 | 3 | 0 | 10 | 5 | 15 |
| ESC | 4 | 3 | 3 | 0 | 10 | 5 | 15 |
| SKR | 4 | 3 | 3 | 1 | 11 | 5 | 16 |
| AOR | 4 | 3 | 3 | 0 | 10 | 5 | 15 |
| DROP (new) | 0 | 5 | 4 | 1 | 10 | 0 | 10 |
| HUNT (new) | 0 | 4 | 3 | 1 | 8 | 0 | 8 |
| TRANSITION shell | 4 | 4 | 2 | 0 | 10 | 0 | 10 |
| SITUATIONAL shell | 2 | 2 | 2 | 0 | 6 | 0 | 6 |
| **Pack 2 total** | **22** | **27** | **23** | **3** | **75** | **20** | **95** |

The arithmetic adds to 75 exactly. **Cross-decoder boss scenarios
are not a separate row** — they are boss variants of the founder-
extension templates (one boss per template, 4 founder families × 1
boss apiece = 4 cross-decoder bosses, embedded in the D4 columns of
the founder-decoder rows above).

**TRANSITION shell** and **SITUATIONAL shell** rows are *categories*
that can be implemented across multiple decoders (e.g. an SKR-coded
transition skip, an AOR-coded transition closeout). The decoder-by-
decoder breakdown for those rows is in §2.5.

**Cross-decoder boss variants** are intentional traps where the
wrong choice is correct in a *different* decoder family — the most
advanced read CourtIQ can offer. They are authored as the
template's "boss" variant per `templates/README.md` ("Boss
variants").

### 2.3 Difficulty ladder (real this time)

Pack 2 is the first pack where every difficulty band has anchor
scenarios. Difficulty is not a `prompt`-rewriting exercise — it is
encoded mechanically through four levers, in order of preference:

| Lever | Effect on difficulty | Implementation |
| --- | --- | --- |
| 1. Disguise (template-defined) | Removes pre-answer cues | `disguises.{light,moderate,heavy}.removePre[]` |
| 2. Clock pressure | Compresses freeze + adds visible clock | `variation.clock_pressure: 'shot_clock' \| 'game_clock'` |
| 3. Distractor cue | A second decoder's cue is also visible; only one answer is correct | template-level `cue_atoms[]` gets a competing atom |
| 4. Multi-beat freeze | Two freeze points; second one depends on first | template authors a second `freezeMarker` (HUNT only) |

We **forbid** difficulty inflation by:
- making the prompt deliberately confusing
- shrinking choice text below readability standards
- removing the visible cue entirely
- shortening the cognition hold below 1100 ms

These are "fake difficulty" — they punish the player for the
authoring system's failure to communicate, not for a real
basketball skill gap. Section 5.3 makes this an anti-pattern.

**Per-difficulty cognition-hold targets** (Phase 3 will add a
`Scene3D.timingOverrides` object so these are data-driven):

| Difficulty | Cognition hold | Pre-answer cue cap | Post-answer reveal cap |
| --- | --- | --- | --- |
| 1 | 1400 ms (today's default) | 3 | 3 |
| 2 | 1400 ms | 3 | 4 |
| 3 | 1200 ms | 2 (one disguised) | 4 |
| 4 | 1000 ms | 2 (heavily disguised) | 5 |
| 5 | 800 ms | 1 (single subtle cue) | 5 |

### 2.4 Player learning journey

The Academy renders as a "zig-zag skill tree" (`courtiq/project/academy.jsx`).
Pack 2 is sequenced so a new player walks a coherent path:

```
                        ┌── BDW deny D2/D3 ──┐
   FOUNDER PACK ─►      │                     │
   (D1 each decoder)    ├── ESC help D2/D3 ──┤
                        │                     ├──► SKR weak-side D3/D4 ──► CROSS-DECODER BOSS
                        ├── SKR rotation D2/D3┤                              (D4)
                        │                     │
                        └── AOR closeout D2/D3┘
                                  │
                                  ▼
                        DROP coverage (D3) ──► HUNT chains (D3) ──► HUNT chains (D4)
                                  │                  │
                                  └────────► TRANSITION (D2-D4) ◄────┐
                                                  │                  │
                                                  └──► SITUATIONAL (D2-D4)
```

**Mastery gates** (concretely):
- DROP family unlocks at: BDW + ESC + SKR + AOR all at ≥80%
  rolling-accuracy over ≥10 attempts each.
- HUNT family unlocks at: DROP at ≥80% over ≥10, **and** any one
  founder family at ≥85% over ≥15.
- Cross-decoder bosses unlock at: HUNT at ≥80%.

These gates are encoded in `pack.json` `prerequisites[]` per
scenario, the same mechanism founder-v0 uses. They do not require
schema or service-layer changes.

### 2.5 The scenario inventory by category

This is **not** the 75-scenario list — it is the template plan. Each
template ships 4–6 variants, so 14 templates × ~5 variants ≈ 70
scenarios; the remaining 5 are handcrafted boss / cross-decoder /
launch scenarios.

#### A. Founder-decoder extension templates (8 templates → ~40 variants)

| Template ID | Decoder | Tactical core | Difficulty floor | Notes |
| --- | --- | --- | --- | --- |
| `BDW.top-lock-baseline` | BDW | Corner top-lock → baseline backdoor | 2 | Mirror, slot-swap, disguise |
| `BDW.flare-rejection` | BDW | Defender chases flare → reject + backdoor | 3 | Boss variant: chained second cut |
| `ESC.weak-corner-drift` | ESC | Tagger's helper rotates → drift to vacated wing | 2 | High-yield 5-variant template |
| `ESC.dho-replace` | ESC | DHO action sets up empty replace into slot | 3 | Disguise removes the helper pulse |
| `SKR.dribble-at-skip` | SKR | Dribble-at draws help → skip across | 3 | Mirror + clock-pressure variants |
| `SKR.baseline-x-out` | SKR | Baseline drive → low-man tag → X-out → skip slot | 4 | Heavy disguise removes X-out arrow |
| `AOR.flying-baseline` | AOR | Flying closeout from help → rip + baseline drive | 2 | Slot-swap variant: be the helper |
| `AOR.stunt-and-go` | AOR | Set stance → stunt-and-recover defender → punish | 4 | Boss variant: fake-advantage trap |

#### B. New-family templates (4 templates → 18 variants)

| Template ID | Family | Tactical core | Difficulty floor | Variants |
| --- | --- | --- | --- | --- |
| `DROP.high-pnr-snake` | DROP | High-PnR with drop coverage → snake + pull-up | 3 | 5 (base, mirror, user-as-screener, light, heavy) |
| `DROP.side-pnr-reject` | DROP | Side-PnR with hedge → reject + skip back | 3 | 5 (base, mirror, user-as-roller, clock-pressure, boss) |
| `HUNT.drive-kick-shoot` | HUNT | Drive draws help → kick → receiver reads closeout | 3 | 4 (base, mirror, slot-swap, boss-D5) |
| `HUNT.swing-swing-shoot` | HUNT | Skip + swing → next-pass closeout read | 3 | 4 (base, mirror, slot-swap, light) |

#### C. Transition templates (2 templates → 10 variants)

| Template ID | Decoder | Tactical core | Difficulty floor | Variants |
| --- | --- | --- | --- | --- |
| `TRA.secondary-drag` | SKR-coded | Drag screen in transition → drop coverage → skip trail | 2 | 5 (base, mirror, push-tempo, pull-back, boss) |
| `TRA.stop-ball-decision` | DROP-coded | First defender back: stop-ball or pick up trailer? | 3 | 5 (base, mirror, 2-on-1, 3-on-2, clock-pressure) |

#### D. Situational template (1 template → 6 variants)

| Template ID | Decoder | Tactical core | Difficulty floor | Variants |
| --- | --- | --- | --- | --- |
| `SIT.late-clock-mismatch` | AOR-coded | <8 seconds left, hunt switch / read closeout | 3 | 6 (base, mirror, position swap, light, moderate, boss-D4) |

#### E. Handcrafted scenarios (not from templates)

- **1 launch-narrative scenario** — the "what was the read?"
  marketing piece, authored by the basketball lead, free of
  templating constraints.

#### Template authoring totals

| Section | Templates | Avg variants | Scenarios |
| --- | --- | --- | --- |
| A. Founder extensions | 8 | 5.0 | 40 |
| B. New families (DROP / HUNT) | 4 | 4.5 | 18 |
| C. Transition | 2 | 5.0 | 10 |
| D. Situational | 1 | 6.0 | 6 |
| E. Handcrafted | — | — | 1 |
| **Total** | **15 templates** | **4.93** | **75** |

A.AOR.stunt-and-go and the 4 founder-extension boss variants
serve double-duty as the **cross-decoder boss tier** (their boss
variant carries a competing-decoder distractor cue per
`templates/README.md`).

### 2.6 The "first hour" a Pack-2 player experiences

A Day-1 player who has finished the founder pack opens Pack 2:

1. **Welcome scenario** — a free-of-charge difficulty-2 BDW variant
   that signals "the cue cluster you learned still works, but
   defenders are getting trickier." Lesson connection:
   `backdoor-window`.
2. **Three D2 scenarios** drawn from BDW/ESC/SKR/AOR extensions —
   sampler that hits each founder family one rep deep.
3. **One D3 scenario** from a founder extension where one cue is
   light-disguised — the first time the player has to read body
   language without the full cue cluster.
4. **DROP unlock check** — if mastery is met, prompt "you've earned
   the Coverage decoder" and slide a 30-second concept lesson in.
5. **First DROP scenario** at D3 with full cue cluster — same
   no-disguise teaching shape as BDW-01 was for the founder pack.

This is the **scenarioService.generateSessionBundle** logic
(`apps/web/lib/services/scenarioService.ts:74`) tuned for Pack 2.
No service-layer change needed; the mastery-band weighting and
spaced-rep queue already exist. We just feed it Pack 2 scenarios.

### 2.7 Onboarding to advanced — the long arc

Across ~12 hours of play, a fully-engaged player should walk:

1. **Hours 0–2**: founder pack (D1 across BDW/ESC/SKR/AOR).
2. **Hours 2–4**: Pack 2 D2 founder extensions; first transition reps.
3. **Hours 4–6**: Pack 2 D3 founder extensions + first DROP reps.
4. **Hours 6–8**: HUNT chains, more DROP, situational sprinkled in.
5. **Hours 8–10**: D4 across all six decoders; cross-decoder bosses.
6. **Hours 10–12**: D5 SKR/DROP/HUNT (the three D5 scenarios).

By hour 12, the player has seen: 95 unique scenarios, 6 decoder
families, 4 categories, 4 difficulty levels, mirrors of every
template, and at least one chained read. Pack 3 onward extends each
band rather than introducing new families.

---

## Phase 3 — The Authoring System

The system answers: **how do we author 75 scenarios in 6 weeks
without sacrificing teaching quality, and leave behind a pipeline
that produces Pack 3 in 4 weeks and Pack 4 in 2?**

The system is anchored on **templates + variants**, the primitive
already shipped in `_schema.ts`. Phase 3's job is to harden the
primitive (Section 3.1), extend it for the new requirements
(Section 3.2), build the missing tooling (Section 3.3), and codify
authoring standards (Sections 3.4–3.7) so authors and SMEs operate
without ambiguity.

### 3.1 Compiler & lint hardening (must precede any Pack 2 authoring)

These are the prerequisites — none ships content; all ship
guardrails. Each is a small, reversible PR.

| # | Change | File(s) | Why |
| --- | --- | --- | --- |
| 3.1.1 | `concept_tag` enum validation in seeder | `scripts/seed-scenarios.ts` | Reject typo'd tags at seed time; Pack 2 multiplies tag count |
| 3.1.2 | `decoder_overlay_preset` runtime enforcement | `apps/web/lib/scenario3d/decoderOverlayPresets.ts`, `imperativeTeachingOverlay.ts` | Authored overlays must be a subset of the decoder's preset (or a documented exception) |
| 3.1.3 | `decoderCameraPresets.ts` | new file in `apps/web/lib/scenario3d/` | Scenario `camera` field must match decoder's preset unless overridden in template |
| 3.1.4 | `Scene3D.timingOverrides` data-driven hold | `apps/web/lib/scenario3d/freezeFrameCognition.ts` + `schema.ts` | Per-difficulty hold targets from §2.3 land as data, not constants |
| 3.1.5 | TODO-marker lint promoted to error | `scripts/lint-variants.ts` | Block any variant with literal `TODO:` from materializing |
| 3.1.6 | Templates lint added to CI | `.github/workflows/ci.yml` | `pnpm templates:lint --check` fails the PR on collisions or single-axis spread |
| 3.1.7 | Cross-template duplicate signature check | `scripts/lint-variants.ts` | Today's lint is template-local; extend to global |
| 3.1.8 | Cross-pack duplicate signature check | `scripts/lint-variants.ts` | Detect Pack 1 vs Pack 2 visual overlap |
| 3.1.9 | Wrong-demo authoring required for non-best | `scripts/seed-scenarios.ts` | Promote today's warning to error when `decoder_tag` is set |
| 3.1.10 | Coach-validation `--allow-unvalidated` removed | `scripts/seed-scenarios.ts` | Pack 2 ships no scenario that bypasses SME |
| 3.1.11 | DROP & HUNT decoder enums | `_schema.ts`, `prisma/schema.prisma` | Add to `decoderTagSchema` and `DecoderTag` enum, include presets |
| 3.1.12 | New cue atoms for DROP / HUNT | `_schema.ts` `cueAtomSchema` | Atoms: `screen_defender_drop`, `screen_defender_hedge`, `tag_recovery_late`, `helper_overhelp_chain`, `closeout_chain_first_beat`, `closeout_chain_second_beat` |
| 3.1.13 | `/dev/scenario-preview?id=…` stable URL | `apps/web/app/dev/scenario-preview/page.tsx` | QA can reproducibly load any scenario without seeding randomness |
| 3.1.14 | Visual regression harness | `scripts/screenshot-scenario.ts` already exists; expand to a Pack 2 baseline | Catch unintended visual drift across the 75 scenarios |

3.1.1 is the highest priority. A typo in `concept_tags` today is a
silent spaced-rep bug. Pack 2 multiplies tag surface area by ~4×.

### 3.2 Schema standards (what every scenario carries)

Scenario JSON is the contract between authors and the runtime. The
existing schema (`scripts/seed-scenarios.ts:338`, `_schema.ts:206`)
is sound; Pack 2 standards layer on top:

**Required fields (Pack 2 floor)**:

- `id` — `^[A-Z]{3,4}-T\d+-\d{2}$` (template variant) or `^[A-Z]{3}-\d{2}$` (founder-style legacy only)
- `version: 1` (bump per non-cosmetic edit)
- `status: 'DRAFT' | 'REVIEW' | 'LIVE' | 'RETIRED'` (Pack 2 ships `LIVE` only)
- `category: 'OFFENSE' | 'DEFENSE' | 'TRANSITION' | 'SITUATIONAL'`
- `concept_tags[]` — at least one, all from the enum landed in 3.1.1
- `decoder_tag` — one of {BDW, ESC, SKR, AOR, DROP, HUNT}
- `difficulty: 1..5`
- `user_role` — slug from the role registry; matches a slot in
  `tactical.user_slot_default`
- `prompt` — ≤140 chars
- `choices[]` — 3 or 4, exactly one `quality: 'best'`, every choice
  has `feedback_text` (and `partial_feedback_text` when
  `quality: 'acceptable'`)
- `decoder_teaching_point`
- `lesson_connection` (slug)
- `feedback.{correct, partial?, wrong}`
- `self_review_checklist[]` — 2 to 6 items, each in second person
- `coach_validation.{level, status, notes?}` — status must equal
  `'approved'` for `LIVE`
- `scene` — full scene block with at least one freezeMarker

**Forbidden fields**:

- `is_correct` (legacy boolean) — Pack 2 uses `quality` exclusively;
  the seeder still derives but new scenarios omit
- `media_refs[]` non-empty — Pack 2 is render tier 1, no external
  assets
- Free-form `camera` strings — must be one of the four preset names

**New fields landed in 3.1.4**:

- `scene.timingOverrides?: { cognitionHoldMs?, choiceTrayAtMs?, cueRepaintHoldWrongMs?, cueRepaintHoldCorrectMs? }`
- `scene.beatSpec?: { firstBeat: FreezeMarker, secondBeat?: FreezeMarker }`
  for HUNT chained reads

### 3.3 Tooling we still owe (build before authoring)

| Tool | Status | Why we need it for Pack 2 |
| --- | --- | --- |
| `/dev/scenario-preview?id=…` stable URL | Ships in 3.1.13 | QA cycle without `pnpm seed` |
| Variant scaffolder with axis presets | Exists (`scripts/scaffold-variant.ts`) | Reuse |
| Prose-bank generator | New | Author cuts prose authoring time ~40%; templates emit a feedback-template skeleton per choice quality |
| Coach-review queue UI | New (deferred to Phase 4 if Phase 3 budget tight) | Async SME signoff replaces 1:1 walkthroughs |
| Visual regression baseline | Expand existing `screenshot-scenario.ts` | Pack 2 baseline + cron to detect drift |
| Decoder-overlay preset linter | Ships in 3.1.2 | Author can't drift from preset |
| Cross-template signature lint | Ships in 3.1.7 | Catches duplicate templates |

**The prose-bank generator** is the highest-yield tooling investment.
For each template, the generator emits a JSON skeleton per quality:

```json
{
  "quality": "best",
  "tone": "encouraging",
  "skeletons": [
    "Good read. He {cue_atom_short_desc}, so {open_space_short_desc}.",
    "Right. {cue_atom_short_desc} = {action_short_desc}.",
    "Yes. {decoder_micro_explainer}."
  ]
}
```

Authors fill the slot variables; the linter checks the slots are
populated and the prose is unique within the template. This converts
~40% of prose authoring from a writing task to a slot-filling task.

### 3.4 Naming conventions

**Files** — `_schema.ts` already enforces patterns. Pack 2 adds:

- Template directory: `<DECODER>.<topic-kebab>/` where `<DECODER>` is
  one of {BDW, ESC, SKR, AOR, DROP, HUNT, TRA, SIT}; topic kebab is
  `[a-z][a-z0-9-]{2,32}`.
- Variant filename: `NN-<axes>.json` where `NN = variantId.slice(-2)`
  and `<axes>` is the axis combination (`base`, `mirror`, `as-<slot>`,
  `light`, `moderate`, `heavy`, `shot-clock`, `game-clock`, `boss`).

**IDs** — Variant IDs are scenario IDs in the DB. Pattern
`^[A-Z]{3,4}-T\d+-\d{2}$`. T-number = template generation; Pack 2 is
T2 (founder is T1). Examples: `BDW-T2-01`, `DROP-T2-04`. NN within a
template starts at 01.

**Concept tags** — Lower snake case, enum-validated. Pack 2 adds the
following tags (Phase 3.1.1 wires them in):

- `pnr_ball_handler_read` (DROP family)
- `pnr_screener_read` (DROP family)
- `chained_kick_decision` (HUNT family)
- `chained_swing_decision` (HUNT family)
- `transition_secondary_break`
- `transition_stop_ball`
- `late_clock_mismatch_hunt`
- `closeout_chain` (HUNT/AOR overlap)
- `helper_overcommit_punish` (cross-decoder)
- `screen_defender_coverage_read` (DROP)

**Lesson slugs** — Pack 2 adds `read-the-coverage`,
`hunt-the-second-read`, `transition-stop-ball`,
`late-clock-mismatch`. Each lesson lands in
`packages/db/seed/lessons/<slug>.json`.

### 3.5 Clip timing standards

| Beat | Target | Hard ceiling | Notes |
| --- | --- | --- | --- |
| Pre-freeze movements | 1.0–3.0 s | 4.5 s | `docs/scenario-qa-checklist.md` §2 |
| Cognition hold (D1–D2) | 1400 ms | 1800 ms | Default constant; D2 stays at default |
| Cognition hold (D3) | 1200 ms | 1500 ms | Phase 3.1.4 override |
| Cognition hold (D4) | 1000 ms | 1300 ms | Phase 3.1.4 override |
| Cognition hold (D5) | 800 ms | 1100 ms | Phase 3.1.4 override; floor enforced by lint |
| Consequence (wrong) leg | 1.5–2.5 s | 3.0 s | qa-checklist §6 |
| Cue repaint hold (correct) | 600 ms | 800 ms | controller default |
| Cue repaint hold (wrong) | 800 ms | 1100 ms | controller default |
| Answer-demo leg | 2.0–3.0 s | 3.5 s | qa-checklist §7 |
| Total scenario | 6–13 s | 16 s | sanity ceiling — anything longer should split into HUNT chain |

**HUNT chained scenarios** add a second cognition hold (1200 ms at
D3, 1000 ms at D4). The total scenario therefore grows to 9–18 s.
This is the only category exempt from the 16 s ceiling.

### 3.6 Camera & overlay standards

**Camera** — Pack 2 adds `decoderCameraPresets.ts` (Phase 3.1.3):

| Decoder | Default preset | Why |
| --- | --- | --- |
| BDW | `passer_side_three_quarter` | The cue is body-language on the deny defender; passer-side reads it best |
| ESC | `teaching_angle` | Vacated paint must be visible |
| SKR | `top_down` | Whole floor matters; skip arc must read clearly |
| AOR | `defense` | Closeout body language is the cue |
| DROP | `top_down` | Coverage call is read off two defenders' positions |
| HUNT | `teaching_angle` (first beat), `passer_side_three_quarter` (second beat) | The two beats use different cameras |

Templates that override the preset must justify the override in
`tactical.notes` and pass through a one-line lint check.

**Overlay discipline** (Phase 3.1.2 enforces these at runtime):

- Pre-answer cluster cap by difficulty: D1=3, D2=3, D3=2, D4=2, D5=1
- Post-answer reveal cap: D1=3, D2=4, D3=4, D4=5, D5=5
- Pre-answer overlays must be a subset of the decoder's preset
- Post-answer overlays may add the decoder's reveal kinds; nothing
  else
- `label` overlays may not anchor on a player position (the
  renderer doesn't push them off; per
  `docs/curriculum/SCENARIO_OVERLAY_SPEC.md`)

### 3.7 Freeze-frame and replay-choreography standards

These are the rules every Pack 2 scenario follows so the player
experiences a consistent rhythm across all 75:

1. **Cue must be visible at the freeze**. The defender body-language
   atom (or competing cue, for boss variants) must be fully resolved
   in the frozen frame. No mid-step ambiguity.
2. **User marker is held visible**. No half-completed `lift` /
   `drift` at the freeze instant.
3. **All five framing elements on screen** (passer, cue defender,
   user, ball, rim). qa-checklist §3.
4. **Wrong-demo must show the failure**. A pre-authored wrongDemo
   must depict the deflection / missed window / blocked finish.
   Phase 3.1.9 requires this; today's warning becomes an error.
5. **Best-read replay layers overlays in 600–900 ms**, never
   instantaneously. Sequence is anchor → support → auxiliary.
6. **Answer-demo plays from the freeze snapshot.** Idle players do
   not snap back to authored starts.
7. **HUNT chained reads use a "look-back" beat between freezes.**
   The first beat resolves; camera holds for ~400 ms on the result;
   the second beat starts. The 400 ms transition is not optional —
   it's the moment the player reads the new defensive shape.
8. **Reduced-motion behaviour** is checked per qa-checklist §11.
   No animation chain leaves the user stuck.

### 3.8 Reuse strategy

The expensive parts of a scenario are: court geometry, defensive
choreography, wrong-demo logic, decoder-overlay rigging. The cheap
parts are: prose, mirroring, slot swapping. The template/variant
system is exactly this split.

**What every Pack 2 author should do, in order**:

1. Before authoring a new template, run
   `pnpm templates:lint --coverage` and confirm the decoder ×
   difficulty cell is genuinely empty.
2. If a similar template exists, scaffold a variant
   (`pnpm templates:scaffold <id>`) and adjust prose only.
3. Only author a new template if the cue cluster, court geometry,
   or wrong-demo logic is genuinely novel.
4. After landing a template, scaffold its 4–6 variants in a single
   PR. SME reviews the template + all variants together to amortize
   review cost.
5. Boss variants are last. They are intentionally late so the
   author has a full template + standard variants under their belt
   before designing the trap.

### 3.9 What this gets us

Authoring time per scenario, today vs. Pack 2 system:

| Activity | Today (Pack 1 style) | Pack 2 with system |
| --- | --- | --- |
| Court / choreography design | 90 min | 0 min (template reuse) — or 90 min once per template |
| Wrong-demo authoring | 45 min | 0 min (template reuse) |
| Prose authoring | 30 min | 18 min (prose-bank assist) |
| QA / SME review (round-trip) | 30 min | 12 min (review queue) |
| **Total per scenario** | **195 min** | **30 min** (90 min for template, amortized) |

For 75 scenarios: 195 × 75 = **244 hours** under the Pack 1 model.
30 × 75 + 90 × 15 (templates) = **2,610 minutes ≈ 43.5 hours** under
the Pack 2 system. **5.6× speedup, with quality floor encoded in the
template instead of the author's discipline.**

---

## Phase 4 — Implementation Roadmap

This is the build sequence. Ordering optimizes for: (a) cheap
prerequisites first, (b) high-risk items behind feature flags,
(c) parallelizable streams identified explicitly, (d) every PR is
small enough to revert, (e) every milestone has a measurable gate.

### 4.1 Branch & PR strategy

- **Trunk**: `main`.
- **Phase 1 work-stream branch**: `pack-2/phase-1-compiler` —
  hardening PRs (3.1.1 through 3.1.14) merge into this branch in
  small chunks, each with its own reviewer. Branch merges to `main`
  only when the 14 items are green.
- **Phase 2 work-stream branch**: `pack-2/phase-2-templates` —
  templates (15 of them) author here. Each template is its own PR.
- **Phase 3 work-stream branch**: `pack-2/phase-3-variants` —
  variant authoring after templates merge.
- **Phase 4 work-stream branch**: `pack-2/phase-4-rollout` — feature
  flag flips, instrumentation, launch.

We use **stacked PRs** for templates (template PR → variant PRs that
depend on it) so the author can keep working while the template
review is in flight.

**Branch hygiene rules** (already standard in the repo):
- Never push to `main` without a green PR.
- Never `git push --force` to a shared branch.
- Hooks are not skipped; if `pre-commit` fails, fix the issue.
- One migration per PR.

### 4.2 Milestone sequence (six gates)

| Gate | Name | Definition of Done | Blocking criteria |
| --- | --- | --- | --- |
| **G0** | Plan adopted | This document is reviewed by content lead, basketball SME, and an engineer; sign-offs in PR comments | Anyone disputes a decoder family, ladder, or matrix cell |
| **G1** | Compiler hardened | 14 items in §3.1 merged to `main`; all CI green; Pack 1 regression pass clean (every founder-v0 scenario still seeds and renders) | Any Pack 1 scenario regresses |
| **G2** | Templates landed | 15 templates merged to `main` with SME approval; `pnpm templates:lint --coverage` shows a populated matrix; visual baseline captured | Any template has unresolved SME notes |
| **G3** | Variants authored | 75 scenarios in `LIVE` status; CI green; lint clean; coach validation `approved` for every `LIVE` scenario; visual regression baseline shows no unintended drift | Any scenario fails the QA checklist |
| **G4** | Beta soft-launch | Pack 2 behind a feature flag; 5–10 internal players play full sessions; bugs filed | Crash rate >0; misread accuracy <10% on D2 |
| **G5** | GA | Flag flipped on production; PostHog dashboard shows attempts on at least 50 of the 75 scenarios within 7 days; per-scenario accuracy and skip rate within targets (Section 4.5) | Any scenario flagged by the live-monitor heuristic |

### 4.3 Parallelization

Items that **can** run concurrently:

- All 14 compiler/lint items in §3.1 are mostly independent. The
  longest-blocked is 3.1.4 (Scene3D.timingOverrides) since it
  touches the renderer. Parallel-friendly groups:
  - Group A (seeder): 3.1.1, 3.1.5, 3.1.7, 3.1.8, 3.1.9, 3.1.10, 3.1.11, 3.1.12
  - Group B (runtime): 3.1.2, 3.1.3, 3.1.4, 3.1.13, 3.1.14
  - Group C (CI): 3.1.6 — depends on Group A items landing
- Template authoring (Phase 2 of the build, after G1):
  Eight founder-extension templates can author in parallel because
  they share no files. The four new-family templates land after the
  decoder enums (3.1.11) and presets (3.1.2) are in.
- Variant authoring: Within a template, all 4–6 variants can
  parallelize across authors. SME review batches per template.
- Lessons: The four new lesson JSONs (`read-the-coverage`,
  `hunt-the-second-read`, `transition-stop-ball`,
  `late-clock-mismatch`) author in parallel with templates.

Items that **must** run sequentially:

1. 3.1.11 (DROP / HUNT decoder enums) → blocks all DROP / HUNT
   templates.
2. 3.1.2 (decoder-overlay preset enforcement) → blocks any template
   that ships overlays outside the preset.
3. 3.1.4 (timing overrides) → blocks any D3+ template that needs
   shorter cognition holds.
4. 3.1.6 (templates lint in CI) → blocks G2; without it, variant
   collisions ship undetected.
5. Template materialization → variant scaffolding → variant authoring
   per template.

### 4.4 Automation vs. human review

**Automated** (CI / lint / seeder / materializer):
- Schema validation (every field, every type, cross-refs).
- Variation signature uniqueness (template-local + cross-template +
  cross-pack after 3.1.7/3.1.8).
- Single-axis spread detection (lint warning).
- Decoder/difficulty coverage matrix gap report.
- TODO-marker presence (lint error after 3.1.5).
- Pre-answer overlay allowlist (already enforced; 3.1.2 extends to
  decoder preset).
- Camera preset match (Phase 3.1.3).
- Cognition hold floor enforcement (Phase 3.1.4 lint rule).
- Visual regression diff (3.1.14).

**Human-only** (no automation will replace these for Pack 2):
- Basketball correctness of the "best" choice.
- Plausibility of distractor choices.
- Pedagogical clarity of the prompt for a 12-year-old.
- Whether the wrong-demo *teaches* the failure rather than just
  showing a missed shot.
- Whether the boss variant's competing-decoder cue is genuinely
  ambiguous to a player who has not yet mastered both decoders.
- Whether prose voice matches the existing Pack 1 voice (we noted
  Pack 1 has a recognizable closing-line pattern: "Watch his body,
  not your spot.").

The async coach-review queue (deferred tooling from §3.3) is the
v1.5 unlock. For Pack 2, SMEs walk a per-template review with the
content lead present.

### 4.5 QA strategy

**Per-scenario QA** uses `docs/scenario-qa-checklist.md` unchanged.
Every Pack 2 scenario must pass every applicable item before its
`status` flips to `LIVE`. New items added for Pack 2:

- HUNT chained reads: both freeze beats independently pass §3
  framing, §4 overlay discipline, §6 consequence playback, §7 best-
  read reveal.
- DROP camera preset: top-down framing must show all 5 defenders.
- Cross-decoder boss variants: the competing-decoder distractor cue
  must be visible at the freeze, and the wrong-demo must show
  *why* the competing-decoder answer fails in this context.
- Per-difficulty cognition hold: the lint floor (1100 ms) and
  declared override is what the runtime actually uses.

**Pack-level QA** runs at G3:

1. **Coverage matrix snapshot**. `pnpm templates:lint --coverage`
   output gets committed to the repo as
   `docs/qa/pack-2-coverage-snapshot.md`.
2. **Visual regression**. `screenshot-scenario.ts` captures the
   freeze frame for all 75 scenarios; PR comment shows diffs against
   any prior baseline. Drift on Pack 1 scenarios is investigated
   before Pack 2 ships.
3. **Live-bundle dry run**. A scripted session generator pulls 100
   sample bundles via `scenarioService.generateSessionBundle`. Pack
   2 scenarios must appear in the expected ratios (mastery-band
   weighting); no scenario is starved.
4. **Accuracy targets per difficulty band**:

| Difficulty | Expected accuracy band (cold play) | Skip-rate ceiling |
| --- | --- | --- |
| 2 | 65–85% | 8% |
| 3 | 45–65% | 12% |
| 4 | 30–50% | 18% |
| 5 | 25–40% | 22% |

   Scenarios that fall outside their band after 50 LIVE attempts
   are flagged for re-balance per `CONTENT_SYSTEM.md` §4.2.

### 4.6 Validation / testing checklist

| Layer | What to validate | How |
| --- | --- | --- |
| Schema | New decoder tags, cue atoms, timingOverrides field, beatSpec | `pnpm seed:scenarios -- --dry-run` per template |
| Materializer | 15 templates × variants → 75 scenarios in `packs/templates-v2/` | `pnpm templates:materialize --check` |
| Lint | No TODO markers, no signature collisions, no axis-spread warns | `pnpm templates:lint` exits 0 |
| Renderer | Pack 1 still seeds and renders; Pack 2 freeze frame and replay legs play deterministically | `pnpm test`, `pnpm dev`, walk every scenario via `/dev/scenario-preview?id=…` |
| Service | Session bundle returns Pack 2 scenarios in expected weight; spaced-rep due dates re-queue Pack 2 scenarios on miss | bundle-replay test fixture (Phase 4 deliverable) |
| Mastery | DROP / HUNT mastery rows update on attempt; gating prerequisites unlock as expected | mastery-replay test fixture |
| Determinism | Same scenario twice → identical movement timeline + identical phase emissions | `replayDeterminism.test.ts` extended to Pack 2 sample |
| Mobile | iPhone-SE-class viewport, all 75 scenarios fit, single-thumb reachable | `docs/scenario-qa-checklist.md` §12 |
| Reduced motion | All overlay reveals downgrade gracefully | qa-checklist §11 |
| WebGL fallback | 2D `<Court>` renders Pack 2 scenarios; choices and feedback still surface | qa-checklist §13 |

### 4.7 Rollout sequence

1. **Internal alpha (G3 → G4)**: 5 engineers + 2 SMEs play 30
   minutes a day for one week. Goals: catch ambiguous prompts,
   broken consequences, mobile layout regressions.
2. **Closed beta (G4)**: 30 invited players (mix of 12-year-olds,
   16-year-olds, and adult coaches). Two-week play window. PostHog
   captures every attempt; daily standup reviews accuracy outliers.
3. **Public soft-launch (G5)**: feature flag flipped to 100% on a
   weekday morning. PostHog dashboard pinned on the team monitor.
   On-call rotation: one engineer + one content person.
4. **Cadence after launch**: weekly accuracy & skip-rate review;
   monthly content cadence (per `CONTENT_SYSTEM.md` §6) starts
   producing Pack 3 templates.

### 4.8 Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| HUNT chained-read scenarios feel laggy on low-end mobile | M | H | Frame-budget audit at G2; degrade second beat to a static cue card on tier-low devices |
| DROP overlays clutter the top-down camera at D2 | M | M | Cap pre-answer cue cluster at 2 for DROP D2 (one notch tighter than the global cap) |
| SME bottleneck stretches G3 | H | H | Recruit second SME at G1; review queue UI deferred until v1.5 but template-batch reviews start at G2 |
| Template lint regressions silently slip | M | H | 3.1.6 (CI gate) is a hard prerequisite; G1 cannot land without it |
| Pack 2 scenarios accidentally duplicate Pack 1 | L | M | 3.1.8 (cross-pack signature check) catches at lint time |
| Cognition-hold floor enforcement breaks Pack 1 | L | H | Pack 1 keeps the default 1400 ms; only Pack 2 D3+ scenarios opt in via `timingOverrides` |
| Decoder-overlay enforcement (3.1.2) regresses Pack 1 | M | H | Run a Pack 1 visual regression pass after 3.1.2 lands; allow per-scenario `enforceDecoderPreset: false` opt-out for the 1 founder scenario that genuinely needs it (AOR-01 has 6 pre-answer entries today) |
| Coach validation `--allow-unvalidated` removal blocks an in-flight Pack 1 fix | L | M | Audit Pack 1 first; bring all `level: 'high'` scenarios to `status: 'approved'` before removing the flag |

### 4.9 Done definition for Pack 2

Pack 2 is shipped when **all** of the following are true:

- 75 scenarios in `LIVE` status across the 6-decoder × 4-difficulty
  matrix as planned in §2.2.
- 15 templates merged with SME approval.
- All scenarios pass the QA checklist + visual regression baseline.
- `pnpm templates:lint --coverage` shows the planned matrix shape.
- The feature flag is at 100% on production and has been for ≥7 days.
- PostHog has captured ≥1 attempt on ≥50 of the 75 scenarios within
  those 7 days.
- The Pack 1 founder pack still seeds, renders, and is unaffected
  by Pack 2 changes.

---

## Phase 5 — Scenario Quality Rubric

QA gates catch broken scenarios. A rubric catches *boring* scenarios
— scenarios that pass every check yet teach nothing memorable. This
section is what every author and SME consults before authoring a
new variant.

### 5.1 What makes a great CourtIQ scenario

A great scenario satisfies every one of these, in order:

1. **One read, one decoder.** The scenario teaches exactly one
   recognition pattern. If the freeze frame contains two equally
   important cues, the scenario is two scenarios.
2. **The cue is visible, not narrated.** The defender's body
   language, position, momentum, or balance carries the information.
   The prompt does not name the cue ("his hips are open"); the
   scenario shows it.
3. **The wrong choice is plausible.** Distractors are real reads a
   real player would consider. Straw-man choices that no one would
   pick teach nothing.
4. **The wrong-demo teaches the failure.** The consequence playback
   shows *why* the wrong choice fails — the deflection, the missed
   window, the rotation that closed it. A wrong-demo that is just
   "missed shot" fails this test.
5. **The replay reveals the space.** The post-answer overlay set
   anchors on the open space the read created — vacated paint,
   skip-pass corridor, baseline lane. The reveal answers "where did
   the advantage live?" not "what should I have done?"
6. **The teaching point is one sentence.** "When his eyes leave,
   your feet move." "Top-lock high → baseline low." If the teaching
   point requires a paragraph, the scenario is too complex.
7. **A 12-year-old can read it.** The prompt and choice copy work
   without basketball jargon a youth player wouldn't have. Vernacular
   is OK ("rip", "back-cut", "skip"); jargon is not ("ICE the side
   PnR", "X-out the second-side rotation").
8. **The replay payoff is visceral.** A successful read produces a
   layup, a clean shot, an open swing. The visual outcome rewards
   the cognitive work.
9. **Difficulty is mechanical, not editorial.** D3 means a cue is
   disguised, the clock is ticking, or a distractor is present —
   not "the prompt is harder to read."
10. **The scenario fits the freeze envelope.** Pre-freeze in 1.0–3.0
    seconds, freeze in ≤2.3 seconds, consequence in 1.5–2.5 seconds,
    answer in 2.0–3.0 seconds. Total ≤ 13 seconds (HUNT chains
    excluded; capped at 18 seconds).

### 5.2 What makes a bad CourtIQ scenario

These are the **anti-patterns**. If a scenario hits any of them, it
goes back to draft.

1. **Two-decoder ambiguity at D2.** The freeze contains a BDW cue
   and an ESC cue, both with valid actions. Acceptable at D4 as a
   boss variant; never at D2.
2. **The "best" choice is best because the others are illegal.**
   "Cut to the rim / Stand still / Run out of bounds / Pass to the
   ref." Three of the four are non-options.
3. **The wrong-demo is silent.** Choice c2 fires; nothing visibly
   happens; the answer replay starts. The player learns nothing
   from the wrong choice.
4. **The freeze is unreadable on phone.** Six labels, two arrows,
   three vision cones, an open-space region, and a help-pulse all
   on the same frame. The qa-checklist clutter cap exists for this.
5. **The cue is the prompt.** "Your defender has his hand in the
   lane. What do you do?" The prompt narrates what the freeze should
   be showing.
6. **The replay restates the prompt.** The post-answer reveal shows
   the cue cluster again instead of revealing the space the cue
   *opened*.
7. **The decoder-teaching-point is two sentences with "and".** "When
   his eyes leave, your feet move, **and** make sure to show your
   hands." The "and" is an extra concept; cut it or make a second
   scenario.
8. **D3 is just D2 with smaller text.** Real difficulty came from
   §2.3's four levers; if a scenario claims D3 without using one of
   those levers, it is mis-tagged.
9. **The boss variant is a riddle.** The competing-decoder cue is
   so subtle that only the author can see it. Boss variants must
   be solvable by a player who has seen the parent template at D3
   five times.
10. **Prose voice drifts from Pack 1.** Pack 1 has a recognizable
    voice: short sentences, second person, no exclamation marks in
    the prompt, present tense, closing line that names the body
    part to watch. Drift makes the product feel inconsistent.
11. **The scenario punishes the player for the system's failure.**
    The cue is technically present but only renders for 80 ms before
    the freeze; the freeze frame is 5° off-camera; the choice text
    truncates on iPhone-SE. These are bugs, not difficulty.
12. **The mirror variant is the only "new" variant.** A template
    whose 5 variants are 4 mirrors of the same setup is a single
    scenario marketed as five.

### 5.3 Cognitive overload risks

Pack 2 is the first pack where these become real:

| Risk | Symptom | Mitigation |
| --- | --- | --- |
| Too many overlay primitives at the freeze | Player reads labels instead of bodies | Pre-answer cluster cap by difficulty (§3.6); SME flag at preview |
| Two decoders at the freeze (boss exception) | D3+ scenarios feel frustrating, not hard | Restrict competing cues to D4 boss variants only |
| Long prompts | Eye time competes with cue time | Prompt ≤140 chars; recommended ≤90 |
| Cue chain depth >2 | Working-memory overflow for ages 10–14 | Cap HUNT chains at 2 freezes; defer 3-beat scenarios to Pack 3+ |
| Clock pressure on D2 | Pack 1 graduates have not internalized clock yet | Reserve clock pressure for D3+ |
| Long self-review checklists | Players skip them entirely | Keep checklists at 4 items; one-line each |

### 5.4 Repetition risks at the player layer

The lint catches duplicate variants. The *player experience* layer is
different: even non-duplicate variants can feel like duplicates if
the session generator stacks them. Three risks:

1. **Streak dilution**. Five mirrored variants of one template in a
   session feels like one possession played five times. Mitigation:
   `scenarioService.generateSessionBundle` should diversify by
   template, not by scenario id.
2. **Decoder fatigue**. Five SKR scenarios in a row teaches "skip"
   but exhausts the decoder. Mitigation: max two scenarios per
   decoder per 5-scenario bundle.
3. **Difficulty whiplash**. D2 → D5 → D2 → D4 reads as random.
   Mitigation: bundle difficulty curves rise then plateau (e.g.
   D2 → D2 → D3 → D3 → D4) — a small change to the existing weight
   function.

These three are runtime-tuning issues, not authoring issues. They
appear here because they look like quality issues to the player.

### 5.5 "Fake difficulty" traps to avoid

A scenario must be hard for a basketball reason, not a UX reason.
The difference matters because UX-driven difficulty erodes trust.

| Trap | Why it's fake | What to do instead |
| --- | --- | --- |
| Shrinking the cue from 200 ms to 80 ms | Punishes vision acuity, not basketball | Disguise the cue (§3.6 disguise levels) |
| Hiding the cue defender behind a label | Punishes pixel-hunting | Move the label; never hide the actor |
| Adding a third irrelevant defender to clutter the frame | Punishes attention-management | Remove or reposition defenders, don't add noise |
| Truncating choice text below readability | Punishes parsing | Rewrite the choice |
| Removing the freezeMarker so the player picks before the cue lands | Punishes timing the system, not the read | Use freeze compression with a documented floor |
| Adding a competing-decoder cue at D2 | Punishes a player for not knowing what they haven't been taught | Reserve competing cues for D4 boss variants |

### 5.6 Over-coaching risks

The opposite failure is **over-coaching** — making the read so
explicit that the player isn't reading, just reciting. Symptoms:

1. The prompt names the cue ("Defender hand is in the lane —").
2. The pre-answer overlay points an arrow at the open space (this is
   why `drive_cut_preview` and `open_space_region` are post-answer
   only — already enforced at the schema level).
3. The "best" choice repeats the prompt ("Cut behind because his
   hand is in the lane"). The choice should be the action, not the
   reason.
4. The teaching point names the answer rather than the recognition.
   "Cut behind the defender" vs. "When the pass is blocked, the
   space behind it is open."
5. Multiple correct choices that all rephrase each other ("Cut
   behind", "Back-cut", "Cut to the rim"). The player can't pick
   wrong, so they don't read.

**Pack 1 failure mode worth naming**: AOR-03 ("No advantage —
reset") is an *intentional* low-payoff scenario teaching the
non-shot read. It earns its place pedagogically but performs
poorly because the resolution is "swing the ball" — anti-climax.
Pack 2's reset variants (AOR.flying-baseline includes one) must
make the reset feel like a *choice* rather than a non-action.

### 5.7 Rubric scoring (used during SME review)

Every scenario is scored 0–3 on each of the following, by the SME
during template-batch review:

| Dimension | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| Cue clarity | Cue not visible | Cue visible but cluttered | Cue clear | Cue is the most natural thing the eye lands on |
| Distractor plausibility | Straw-men | One real, two straw-men | Two real distractors | All three distractors are real reads |
| Wrong-demo teaches failure | No wrong demo | Wrong demo plays but unclear | Wrong demo shows the failure | Wrong demo *and* a caption that names the failure |
| Replay payoff | No payoff | Layup attempted | Clean finish | Clean finish + visceral reveal of the open space |
| Prose discipline | Prose drifts from voice | Voice consistent but prompt over-wordy | Tight | Sounds like a Pack 1 scenario authored by the same hand |
| Difficulty correctness | Wrong tier | Off by one | Tier matches mechanical lever | Tier emerges naturally; player feels the lever |

**Threshold to ship**: every scenario averages ≥2.0 across the six
dimensions, with no dimension at 0. Scores live in
`coach_validation.notes` and are persisted on `LIVE`.

---

## Phase 6 — Future Scalability

Pack 2 is the proving ground. This section sketches the path to 300+
scenarios, multiple sports, community contribution, AI-assisted
authoring, adaptive difficulty, and weakness-targeted recommendations
— without throwing away the Pack 2 system.

### 6.1 Scaling to 300+ scenarios (Pack 3 → Pack 6)

The Pack 2 economics show 30 minutes per scenario plus 90 minutes
per template. Three packs of 75 scenarios each would be 225 more
scenarios — call it Pack 3 (deeper SKR/AOR/BDW), Pack 4 (deeper
DROP/HUNT), Pack 5 (transition + situational deepening) — totaling
**300 scenarios at v1**, the `CONTENT_SYSTEM.md` v1 target.

The system enables this with two unlocks beyond Pack 2:

1. **Coach-review queue UI** (deferred from §3.3). At 300 scenarios,
   1:1 SME walkthroughs are a ~75-hour bottleneck. The async queue
   moves SME time to ~25 hours.
2. **Cross-pack mastery weighting**. The session generator already
   weights by concept; Pack 3+ asks it to weight by *pack*, so a
   Pack 1-graduate sees Pack 3 scenarios proportional to the
   concepts they're weakest on, not just the next pack in sequence.

**No new schema fields are needed for Pack 3.** The schema designed
for Pack 2 (timingOverrides, beatSpec, decoder enums extended for
DROP/HUNT) carries through. Pack 6 may need a new render tier (Tier
2 = animated Rive layer) — that lands in `media_refs[]`, already
designed-in.

**Decoder count ceiling**: Pack 6 is when we'd consider a 7th
decoder family. The signal that we *need* a 7th is empirical:
HUNT scenarios start clustering around a specific tactical core
(e.g. "second-side action") that doesn't fit the chained-read frame.
Until that signal arrives, six is plenty.

### 6.2 Multiple sports

Two sport families could share CourtIQ's engine: **soccer** (reading
defender body lean and angle on the ball-carrier) and **football
QB reads** (post-snap progression scanning). Both share basketball's
core loop: a possession plays, a freeze frame surfaces a decision,
the player picks a read.

**What ports cleanly**:
- The freeze-frame cognition model (600 ms ramp + 1400 ms hold).
- The template/variant primitive.
- The cue-atom controlled vocabulary (re-defined per sport).
- The decoder taxonomy framing.
- The mastery model and IQ scoring.
- The `Scenario` Prisma model with a single `sport: Sport` field
  added.

**What does not port**:
- The half-court SVG primitive (`<Court>`).
- The 12 movement kinds (specific to basketball).
- The 12 animation intents (specific to basketball).
- The decoder overlay vocabulary (vision cones, hip arrows are
  basketball-defender-specific).

**Practical path** (post-Pack 6): refactor `apps/web/lib/scenario3d/`
into `lib/sport-engine/<sport>/`. Each sport ships its own movement
kinds, animation intents, and overlay primitives, but reuses the
freeze cognition, choreography, and overlay-beat framework. The
sport selector lives at signup (`packages/db/prisma/schema.prisma`
`User.preferred_sport`).

This is a **strategic question, not a tactical one**. The decision
to add a sport should follow product-market fit on basketball, not
precede it.

### 6.3 Community-authored scenarios

`CONTENT_SYSTEM.md` §5.3 sketches a v2 contributor portal. The
template/variant system is a near-perfect fit because:

- Templates encode tactical truth that requires SME authorship —
  contributors do **not** author templates.
- Variants supply prose and axis selections — contributors author
  variants of an existing template, never new templates.
- The lint catches collisions, single-axis spreads, and bad prose
  before any human review.
- The coach-review queue (§6.1) routes contributor variants to an
  SME for sign-off.

**Contributor reputation system**: each approved variant earns the
contributor reputation points. Reputation gates more sensitive
templates (e.g. cross-decoder boss authoring). Revenue share kicks
in at a reputation threshold (handled by the platform's commerce
layer, not by content tooling).

**Anti-spam**: variant authoring requires a paid subscription tier
or invite-only access. The submission form rejects variants whose
prose contains TODO markers (already enforced) or whose
variation-signature collides with an existing variant. SME final
sign-off is the only humans-needed gate.

### 6.4 AI-assisted authoring

This is the most-likely product accelerator and the most-likely
quality risk.

**What AI does well**:
- Drafting prose for variants (title, prompt, feedback, explanation,
  self-review checklist) given a template and an axis selection.
- Suggesting cue-atom combinations for new templates from a
  basketball-decision description ("a ball-handler facing a
  hard hedge").
- Generating wrong-demo movement coordinates from a verbal
  description of the failure ("defender deflects the pass with the
  trail hand").
- Writing the launch-narrative scenario.
- Spotting prose-voice drift across a Pack via embedding similarity
  to Pack 1's voice.

**What AI does badly** (and where humans must remain in the loop):
- Judging basketball correctness of the "best" choice. False
  confidence at correctness checking is the #1 quality risk.
- Recognizing whether a distractor is plausible vs. straw-man.
- Recognizing whether a wrong-demo *teaches* the failure or just
  shows it.
- Authoring boss variants — cross-decoder cues require taste and
  basketball intuition.
- Replicating an authorial voice with the consistency Pack 1 shows.

**Practical integration** (post-Pack 2):

1. **Variant draft assistant**. Authors invoke
   `pnpm scaffold-variant ... --ai-prose-draft` to seed prose
   skeletons. The skeleton is marked `ai_drafted: true` in
   variant frontmatter; SME review knows to scrutinize.
2. **Wrong-demo movement-coord generator**. Given a verbal failure
   description, propose `wrongDemos[].movements[]` coordinates
   bounded by court geometry. SME approves or edits.
3. **Cue-atom recommender**. Given a template's tactical
   description, suggest the 1–4 cue atoms that fit. Linter still
   requires human confirmation.
4. **Voice-drift detector**. Cron job embeds every Pack scenario's
   prose; flags variants whose embedding sits >2σ from the Pack 1
   centroid.

**Forbidden integration**: AI cannot author a `quality: 'best'`
choice or its `feedback_text` autonomously. The basketball-correct
answer remains a human decision. AI can *propose*; the SME's
`approved` is required.

### 6.5 Adaptive difficulty (per player)

The mastery model already tracks rolling accuracy per concept; the
session generator already weights by mastery band. Adaptive
difficulty means:

- A player who just hit 90% on AOR D3 **automatically** sees AOR
  D4 next session.
- A player who just dropped to 60% on SKR D4 sees SKR D3 to
  re-stabilize before retrying D4.
- A player who has plateaued at D3 across all decoders for 7 days
  sees a "challenge week" where the bundle skews D4.

These behaviors are **service-layer**, not content-layer. The
existing `scenarioService.generateSessionBundle` already accepts a
weighting function; we extend it with a `difficultyAdjuster()` that
reads recent attempts.

**Failure modes to guard against**:
- Difficulty floor — never serve only D5; always include one D≤3
  for confidence.
- Skip dragnet — if a player skips 3 in a row, the next bundle
  drops a difficulty tier.
- Streak protection — if a player is on a 7-day streak, the next
  session opens with a D2 freebie to lock in the streak before
  pushing harder.

### 6.6 Player-weakness targeting

Adaptive difficulty is global ("you're a D3 player"); weakness
targeting is local ("your weakness is reading the helper's hips
on weak-side rotations"). The mastery model carries per-concept
accuracy; weakness targeting is the inversion of that signal.

**Implementation** (post-Pack 2, service-layer):

1. Per-decoder per-difficulty rolling accuracy (already tracked).
2. Per-cue-atom rolling accuracy (new — requires the seeder to
   persist `tactical.cue_atoms[]` from the template into a
   `Mastery.cue_atom_accuracy` Json column).
3. Weekly weakness report (new — emails the player + parent +
   coach if those roles are linked).
4. Bundle weighting that pulls 2 of 5 scenarios from the player's
   bottom-quartile cue atom.

**Privacy implication**: cue-atom-level weakness data is more
sensitive than concept-level. RLS on `Mastery.cue_atom_accuracy`
must be tighter than on `rolling_accuracy` (concept-level is fine
to surface to a parent; cue-atom-level should require explicit
opt-in).

### 6.7 Dynamic decoder recommendations

A coach using CourtIQ for their AAU team would want: "this player
keeps missing the help-side rotation read; show them more SKR
disguised at D3." This is a coach-dashboard feature, not a player
feature.

**Implementation path**:

1. Coach role exists in `User.role` (`packages/db/prisma/schema.prisma`).
2. Coach links to player via a new `CoachAssignment(coach_id,
   player_id, role: 'TRAINER' | 'PARENT' | 'COACH')` model.
3. Coach dashboard at `/coach/<player-id>` (gated to assigned
   players only) shows the per-decoder, per-difficulty, per-cue-atom
   accuracy heatmap.
4. Coach can generate a custom bundle: "5 SKR D3 disguised
   scenarios", which spins up a `SessionRun` for the player with
   `mode: 'COACH_PRESCRIBED'` (new enum value).
5. Player receives a notification; their next session opens with
   the prescribed bundle.

This is the **B2B wedge** referenced in `CONTENT_SYSTEM.md` §10. It
is the highest-leverage post-MVP product expansion because every
coach who adopts CourtIQ pulls in their team.

### 6.8 The system Pack 2 leaves behind

If Pack 2 ships per this plan, here's what the next pack inherits:

- **A 6-decoder, 4-difficulty, 4-category content surface** with
  proven authoring economics (~30 min/scenario amortized).
- **A 15-template foundation** that a Pack 3 author can extend by
  adding 5–10 new templates and authoring variants in parallel.
- **A hardened compiler/lint pipeline** that catches concept-tag
  typos, decoder-overlay drift, single-axis variant spreads,
  cross-pack duplicates, TODO markers, and missing wrong-demos.
- **A QA pipeline** with per-difficulty accuracy bands, visual
  regression baseline, and an SME rubric.
- **A learning-journey graph** (Pack 1 → founder extensions →
  DROP → HUNT → cross-decoder bosses) ready to be extended.
- **A documented anti-pattern catalog** so authors don't repeat
  Pack 2's near-misses.
- **A roadmap for Tier 2 animation, multi-sport refactor, and
  contributor portal** that does not require a rewrite.

The single biggest thing Pack 2 leaves behind is **proof that the
template/variant system scales**. Until Pack 2 ships, that is a
hypothesis. After it ships, every subsequent pack is engineering,
not invention.

---

## Appendix A — Glossary of Pack 2 Concepts

| Term | Meaning |
| --- | --- |
| **Pack** | A versioned set of scenarios shipped together (`founder-v0` = Pack 1, `templates-v2` = Pack 2). |
| **Template** | Tactical blueprint encoded once, instantiated as multiple variants. Lives in `packages/db/seed/scenarios/templates/`. |
| **Variant** | One scenario derived from a template by selecting axes (mirror, slot, disguise, clock, difficulty). |
| **Decoder** | A named recognition pattern (BDW, ESC, SKR, AOR, DROP, HUNT). |
| **Cue atom** | The smallest unit of defensive body language a scenario teaches (`hand_in_lane`, `screen_defender_drop`, etc.). |
| **Disguise** | A template-defined pre-answer cue removal recipe (`none`/`light`/`moderate`/`heavy`) that bumps difficulty. |
| **Variation signature** | A stable hash over (mirror, slot, difficulty, disguise, clock) that the lint uses to detect duplicates. |
| **Boss variant** | A handcrafted variant that adds a competing-decoder cue or a chained second movement. One per template max. |
| **Beat** | A freeze-and-question moment. HUNT chained scenarios have two beats. |
| **Cognition hold** | The post-freeze window during which overlays paint and the player reads (default 1400 ms; per-difficulty overrides in §3.5). |
| **Render tier** | Visual fidelity tier. Tier 1 = static SVG; Tier 2 = animated; Tier 3 = video. Pack 2 is Tier 1. |

## Appendix B — Pack 2 Template Inventory (canonical list)

| ID | Decoder | Category | Difficulty floor | Variants | Boss variant |
| --- | --- | --- | --- | --- | --- |
| `BDW.top-lock-baseline` | BDW | OFFENSE | 2 | 5 | mirror-as-passer (D4) |
| `BDW.flare-rejection` | BDW | OFFENSE | 3 | 5 | second-cut chain (D4) |
| `ESC.weak-corner-drift` | ESC | OFFENSE | 2 | 5 | helper-disguised (D4) |
| `ESC.dho-replace` | ESC | OFFENSE | 3 | 5 | distractor SKR cue (D4) |
| `SKR.dribble-at-skip` | SKR | OFFENSE | 3 | 5 | clock + heavy disguise (D5) |
| `SKR.baseline-x-out` | SKR | OFFENSE | 4 | 5 | distractor AOR cue (D4) |
| `AOR.flying-baseline` | AOR | OFFENSE | 2 | 5 | helper-rotation distractor (D4) |
| `AOR.stunt-and-go` | AOR | OFFENSE | 4 | 5 | fake-advantage trap (D4) |
| `DROP.high-pnr-snake` | DROP | OFFENSE | 3 | 5 | switch-disguise (D4) |
| `DROP.side-pnr-reject` | DROP | OFFENSE | 3 | 5 | weak coverage (D5) |
| `HUNT.drive-kick-shoot` | HUNT | OFFENSE | 3 | 4 | second-beat closeout chain (D5) |
| `HUNT.swing-swing-shoot` | HUNT | OFFENSE | 3 | 4 | next-pass closeout (D4) |
| `TRA.secondary-drag` | SKR-coded | TRANSITION | 2 | 5 | trailer-vs-rim distractor (D4) |
| `TRA.stop-ball-decision` | DROP-coded | TRANSITION | 3 | 5 | 3-on-2 with trailer (D4) |
| `SIT.late-clock-mismatch` | AOR-coded | SITUATIONAL | 3 | 6 | cross-screen counter (D4) |

**Plus**: 1 handcrafted launch-narrative scenario.
**Total**: 75 scenarios.

## Appendix C — Files this plan modifies

| File | What changes |
| --- | --- |
| `packages/db/seed/scenarios/templates/_schema.ts` | Decoder enum extends to DROP, HUNT; cue atoms extend with PnR + chain atoms; timingOverrides field; beatSpec field |
| `packages/db/prisma/schema.prisma` | `DecoderTag` enum extends; no other schema changes |
| `scripts/seed-scenarios.ts` | Concept-tag enum validation; wrong-demo required; --allow-unvalidated removed |
| `scripts/lint-variants.ts` | TODO marker is error; cross-template + cross-pack signature checks; coverage matrix output |
| `scripts/materialize-templates.ts` | No source-level changes; produces `packs/templates-v2/` |
| `apps/web/lib/scenario3d/decoderOverlayPresets.ts` | Add DROP, HUNT presets |
| `apps/web/lib/scenario3d/decoderCameraPresets.ts` | New file mapping decoder → camera preset |
| `apps/web/lib/scenario3d/freezeFrameCognition.ts` | Read per-scenario `timingOverrides` |
| `apps/web/lib/scenario3d/imperativeTeachingOverlay.ts` | Enforce decoder-overlay-preset filtering |
| `apps/web/lib/scenario3d/schema.ts` | Extend `Scene3D` with `timingOverrides` and `beatSpec` |
| `apps/web/app/dev/scenario-preview/page.tsx` | Stable `?id=…` URL |
| `.github/workflows/ci.yml` | Add `pnpm templates:lint --check` step |
| `packages/db/seed/scenarios/templates/<template-id>/template.json` | 15 new template files |
| `packages/db/seed/scenarios/templates/<template-id>/variants/*.json` | 75 new variant files |
| `packages/db/seed/lessons/*.json` | 4 new lesson files |
| `docs/courtiq-pack-2-75-scenario-expansion-blueprint.md` | This document |
| `docs/qa/pack-2-coverage-snapshot.md` | New, generated at G3 |

## Appendix D — Open questions

These need resolution before G0 sign-off:

1. **Decoder family naming**: are DROP and HUNT the right names? The
   four founder names are mnemonic-rich (BDW, ESC, SKR, AOR);
   DROP/HUNT continue the convention. Alternatives considered:
   COV (coverage), CHN (chain). DROP and HUNT win on
   pronounceability.
2. **Cross-decoder boss bound**: 4 is one per founder family.
   Should DROP and HUNT also ship a boss variant? Recommendation:
   yes for HUNT (its second beat is a natural distractor), no for
   DROP at Pack 2 (DROP is too new for boss authoring).
3. **HUNT chain depth**: 2 beats hard cap. Is there a real Pack 2
   scenario that wants 3? Recommendation: no; defer to Pack 3+ once
   we have Pack 2 retention data.
4. **Render tier 2** (animated): does any Pack 2 scenario justify
   Tier 2 effort? Recommendation: no. Tier 2 is a Pack 4+ unlock.
5. **Coach-review queue UI**: ship in Pack 2 (delays G3) or defer
   to Pack 3? Recommendation: defer; SME walks template-batch
   reviews for Pack 2.
6. **Voice style guide**: write a one-page guide capturing Pack 1's
   voice for Pack 2 authors? Recommendation: yes; ship as
   `docs/scenario-voice-style-guide.md` before any Pack 2 variant
   authoring.

---

*End of blueprint. Sign-offs go in PR comments; questions in
Appendix D get tracked in GitHub issues.*





