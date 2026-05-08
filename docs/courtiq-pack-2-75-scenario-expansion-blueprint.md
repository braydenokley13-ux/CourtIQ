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
