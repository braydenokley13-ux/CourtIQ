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


