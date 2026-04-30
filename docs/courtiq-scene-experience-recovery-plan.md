# CourtIQ Scene Experience Recovery Plan

> Companion to `docs/courtiq-premium-scene-visual-system-plan.md`. The
> visual system plan got the scene to look like a basketball court.
> This plan gets the scene to **feel** like a film room.

---

## 1. Why This Plan Exists

The Phase 1–7 visual system landed. The court now reads as basketball,
the indicator layers work, the broadcast camera is dialed in. But
visual polish alone did not make CourtIQ feel like a product. The
scene is prettier, and the core experience is still off:

- replay does not behave the way a coach or player expects
- movement feels stiff and mechanical instead of basketball-real
- player bodies still read as placeholders, not athletes
- there is no fullscreen mode at all
- the wording is too dense for a young player to parse mid-rep
- the whole scenario module still feels cramped, prototype-shaped

This document is the next-stretch roadmap. It covers what to fix, in
what order, with concrete acceptance criteria and small commits.

> **CourtIQ should feel like a playable film room, not a prototype demo.**

This plan is intentionally *not* a list of new scenarios, not a list
of new visual features, and not a refactor proposal. It is a
recovery plan for the existing experience — replay, motion, body
language, fullscreen, and copy — so the scene we already render is
respectable to ship, then earns the right to grow.

---

## 2. Current Product Problems

A blunt audit of what is wrong right now. This is the work list
phases B–G are paying down.

### 2.1 Replay does not work correctly

- **What the user sees.** Play/pause sometimes loses sync with the
  visible state. Restart can leave the scene mid-trajectory or
  desynced from the answer-card UI. Speed changes (0.5x / 1x / 2x)
  don't always take effect on the consequence/replay legs. The
  consequence replay can stall, skip, or replay the wrong leg.
- **Why it hurts the product.** Replay is the entire learning loop.
  If the user can't trust play/pause/restart/speed, the freeze →
  choose → see-the-consequence → understand cycle breaks, and
  CourtIQ stops being a teaching tool.
- **Likely technical area.** `MotionController` (timeline + paused +
  playbackRate) and `ReplayStateMachine` (state transitions) in
  `apps/web/components/scenario3d/imperativeScene.ts`; their
  wiring through `Scenario3DCanvas.tsx` and `Scenario3DView.tsx`;
  the overlay buttons in `PremiumOverlay.tsx`.
- **Severity.** Blocker.

### 2.2 Movement feels bad / stiff / unclear

- **What the user sees.** Players translate from A to B without body
  reaction. Defenders don't shift stance when the ball moves.
  Cuts look like a marker sliding on a line. The ball can pop
  between holders without an arc that reads as a pass. Bodies face
  fixed yaws even when the action says they should rotate.
- **Why it hurts the product.** Basketball is a body-language sport.
  If the bodies don't react, the lesson hidden inside the play —
  why the cut works, why the closeout is wrong, why the skip is
  open — gets lost. Movement that doesn't show the *reason* is
  just animation.
- **Likely technical area.** `MotionController` interpolation,
  `computePlayerYaw` (one-shot at build, not updated per frame),
  the per-stance pose in `buildPlayerFigure`, ball arc parameters
  (`MOTION_PRE_DELAY_MS`, parabola height), pass-arrival camera
  shake.
- **Severity.** Major issue.

> **Movement should show the basketball reason, not just move pieces around.**

### 2.3 Player geometry still looks gross

- **What the user sees.** Bodies read as boxy primitives — round
  shoes, rectangular shorts, cylinder torso, sphere head. The
  silhouette is recognizable as "person" but not as "basketball
  player." Stance changes are subtle (foot stagger + shorts
  overlap) and don't sell crouch, closeout, or cut.
- **Why it hurts the product.** Player presence is the single
  biggest factor in whether the scene feels like film vs.
  diagram. Until the player looks like an athlete, the rest of
  the polish (lines, hoop, lighting) over-performs and exposes
  the player as the weakest link.
- **Likely technical area.** `buildPlayerFigure()` in
  `imperativeScene.ts` (~L3193); palette constants
  (OFFENSE/DEFENSE/USER); contact shadow + ring stack
  (~L3198–L3289). Per Section 14 of the visual plan, geometry
  must stay performance-safe on Mac.
- **Severity.** Major issue.

### 2.4 Fullscreen mode is missing

- **What the user sees.** No way to expand the court. The scene
  always lives inside the train-page shell, sharing the viewport
  with header, decoder pill, prompt, and answer cards. On
  smaller windows the read area shrinks. There is no path to "go
  big" for film-style review.
- **Why it hurts the product.** Coaches and serious players want
  to study the play full-bleed. Without fullscreen, the product
  feels like a card on a webpage instead of a tool.
- **Likely technical area.** Browser Fullscreen API; the canvas
  container in `app/train/page.tsx`; `Scenario3DView.tsx` /
  `Scenario3DCanvas.tsx` sizing; `PremiumOverlay.tsx` controls
  (need a fullscreen button); CSS layout in train page.
- **Severity.** Major issue (gap, not regression).

### 2.5 Copy is too hard for younger players

- **What the user sees.** Live-decision prompts and feedback use
  adult-coach language ("denial," "weakside helper," "closeout
  off-balance"). Younger players (target market includes
  ~3rd-grade reading level) bounce off the wording before the
  basketball idea lands.
- **Why it hurts the product.** CourtIQ promises a *young player can
  use this*. Today the scene is gettable but the words aren't.
  Wording is the cheapest place to lose users.
- **Likely technical area.** `DECODER_LABELS` / `DECODER_HANDOFF`
  in `apps/web/app/train/page.tsx` (L40–L111); choice strings and
  feedback strings in `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json`;
  any prompt strings in `apps/web/lib/services/scenarioService.ts`;
  shell labels in `PhaseTracker`, `ChoiceCard`, `FeedbackPanel`,
  `DecoderLessonPanel`, `SelfReviewChecklist`.
- **Severity.** Major issue.

### 2.6 Overall scenario module still feels cramped / uneven

- **What the user sees.** The canvas is hemmed in by chrome.
  Decoder pill, scene chips, prompt block, and answer cards
  compete for the same vertical band. Spacing is uneven across
  breakpoints. The eye doesn't know where to land first.
- **Why it hurts the product.** Even if every piece individually
  works, the page still reads as "prototype with parts" instead
  of "one designed product." Fullscreen helps, but the shell
  itself also needs the cohesion pass that Phase H delivers.
- **Likely technical area.** `app/train/page.tsx` shell layout,
  `PremiumOverlay.tsx` in-canvas chrome (concept chip vs.
  decoder pill duplication noted in Section 17.9 of the visual
  plan), the glass tokens introduced in the Phase 6 module-shell
  work.
- **Severity.** Polish issue. Becomes a major issue if shipped
  next to a working replay + fullscreen + new geometry, because
  it would be the visible weak link.

---

## 3. Product North Star

CourtIQ should feel like:

- **A premium basketball training sim.** The court reads as
  basketball, not as graphics. Players move with intent. The
  scene rewards close looking.
- **A playable film room.** Pause, scrub, replay the consequence,
  rewatch the answer leg. The user is in control of the tape, not
  watching a video.
- **A clean decision trainer.** One question per rep. The scene
  freezes at the moment the decision matters. Cards are clear.
  Feedback teaches in one breath.
- **Simple enough for a young player.** A 3rd grader can read the
  prompt and know what to pick. Words are short. Sentences are
  short. The basketball meaning is preserved, not dumbed down.
- **Polished enough for a coach.** A coach watching over a
  player's shoulder doesn't wince. The body language reads. The
  controls feel professional. The fullscreen mode lets them point
  at the screen and teach.

### Ideal user loop

1. **Watch.** The play unfolds at 1x. Body language reads. Camera is
   broadcast 3/4. The user sees the situation develop.
2. **Freeze.** At the authored decision moment, motion stops. The
   answer cards mount. The user has time.
3. **Choose.** The user picks. The freeze is a real beat, not a
   rush.
4. **Replay the consequence.** For wrong picks, the wrongDemo leg
   plays out — the user sees what would have happened. For right
   picks, the answer-leg plays. Either way, a full body-language
   replay.
5. **Understand the lesson.** Feedback lands, decoder lesson opens,
   self-review checks the read. The lesson is one short sentence,
   not a paragraph.
6. **Use fullscreen if wanted.** At any point the user can expand
   the canvas to film-room scale and rewatch with controls intact.

---

## 4. Priority Ranking

The order is chosen so the most painful product gaps land first
and the most foundational fixes precede the cosmetic ones.

1. **Replay reliability** — broken core loop. Until replay is
   trustworthy, every other polish is wasted.
2. **Movement quality** — once replay works, the scene must
   actually be worth replaying. Stiff motion neutralizes any
   replay fix.
3. **Fullscreen mode** — a clean, isolated feature that unlocks
   the "playable film room" promise and de-risks the cramped
   shell.
4. **Player geometry redesign** — the visible weak link. Done
   after replay + motion because new geometry should be paired
   with motion that actually shows it off.
5. **Young-player copy simplification** — a relatively cheap pass
   that delivers a huge UX win, and only sticks if the scene
   below it is already trustworthy.
6. **Scenario expansion (ESC-01 / AOR-01 / SKR-01 authoring)** —
   intentionally last in this plan. New scenarios on top of a
   broken replay multiply the bug surface; new scenarios on top
   of a fixed replay are pure additive value.

### Why new scenarios should wait

Authoring ESC-01 / AOR-01 / SKR-01 today would:

- ride on top of the broken replay → the same replay bugs would
  surface in three new scenarios at once, tripling QA cost
- expose the stance heuristic flag noted in `courtiq-premium-scene-visual-system-plan.md`
  Section 18.4 (closest-defender denial bias) before the renderer
  is ready
- consume copy review effort before the global copy rules in
  Phase G are written, meaning the new scenarios would need a
  rewrite pass anyway
- delay the player-geometry redesign that will visually carry
  those scenarios

The cheapest path is: fix the engine, then fill it with content.

---

## 5. Recovery Roadmap Overview

| Phase | Goal | Why it matters | Priority | Depends on | Complexity | Suggested model |
|---|---|---|---|---|---|---|
| **A — Replay Audit** | Map the replay system end-to-end, isolate broken behaviors, name safe fix points. | Replay is the broken core loop. Cannot fix what is not understood. | P0 | — | Medium (read-heavy, no code) | Opus 4.7 High |
| **B — Replay Reliability Fix** | Make play/pause/restart/speed/consequence-replay behave correctly and recoverably. | Restores the entire learning loop. Unblocks every later phase. | P0 | A | High (state machine + timing) | Opus 4.7 Max |
| **C — Movement Quality Pass** | Make players, defenders, and the ball move in ways that show the basketball reason. | Without it, fixed replay still replays a stiff scene. | P1 | B | High (motion + stance + timing) | Opus 4.7 High |
| **D — Fullscreen Film Room Mode** | Add a real fullscreen toggle with usable replay controls inside it. | Unlocks the "playable film room" promise; relieves shell cramp. | P1 | B (controls must work) | Medium (browser API + layout) | Sonnet 4.6 Medium-High |
| **E — Player Geometry Strategy Spike** | Decide whether to refine the procedural builder, replace it with a richer code-built mesh, import a lightweight model, or hybridize. | Avoid throwing geometry work at the wrong approach. | P2 | C (motion is the testbed) | Medium (analysis + tiny prototype) | Opus 4.7 Max |
| **F — Player Geometry Redesign** | Implement the chosen path; ship a player that reads as an athlete and preserves Mac performance. | Visible weak link of the product. | P2 | E | High (visual + perf) | Opus 4.7 Max |
| **G — Young-Player Copy Pass** | Rewrite live-decision and feedback copy at ~3rd-grade reading level without losing basketball meaning. | Largest UX-per-line-changed return. | P3 | — (technically independent, but best after F so visible scene matches new tone) | Low–Medium (writing, not engineering) | Sonnet 4.6 Medium-High |
| **H — Final QA / Integration** | Validate replay + motion + fullscreen + geometry + copy on BDW-01; tune cohesion. | Ensures the parts ship as one product, not five fixes. | P0 (sequencing-wise) | A–G all landed | Medium (regression + tuning) | Opus 4.7 High |

---

## 6. Phase-by-Phase Plan

### Phase A — Replay Audit

#### Goal
Produce a written, file-level map of the replay system: data flow,
state transitions, control wiring, and a ranked list of where it
actually breaks. No code changes.

#### Why this phase matters
Phase B cannot land safely without knowing whether the replay bugs
are state-machine, timing, UI-wiring, or all three. Guessing the
fix risks regressions in `MotionController` or `ReplayStateMachine`,
both of which are explicitly flagged as risky-touch in
`courtiq-premium-scene-visual-system-plan.md` Section 17.6.

#### Files likely involved
- `apps/web/components/scenario3d/imperativeScene.ts` —
  `MotionController` (~L972+), `ReplayStateMachine` (~L1454+),
  `MOTION_PRE_DELAY_MS`, `swapMode`, `reset`.
- `apps/web/components/scenario3d/Scenario3DCanvas.tsx` —
  paused/playbackRate/resetCounter wiring, parent rAF loop,
  `motion.setPaused` / `motion.setPlaybackRate` effects.
- `apps/web/components/scenario3d/Scenario3DView.tsx` — overlay
  state ownership (`paused`, `playbackRate`, `restartTick`),
  `compositeResetCounter`, replayMode/resetCounter reset effect.
- `apps/web/components/scenario3d/PremiumOverlay.tsx` — restart,
  play/pause, speed selector buttons.
- `apps/web/components/scenario3d/ScenarioReplayController.tsx` —
  full-path replay phase emitter (frozen / consequence / answer).
- `apps/web/components/scenario3d/replayStateMachine.test.ts` —
  existing test scaffolding for the state machine.
- `apps/web/app/train/page.tsx` — picks the choice id, drives
  `pickedChoiceId`, "Show me again" button, `resetCounter` source.

#### Risks / boundaries
- **Read-only.** Do not edit `MotionController`, `ReplayStateMachine`,
  or any wiring file in this phase.
- Do not touch `Scenario3DCanvas` parent rAF loop or FPS guard.
- Do not alter the simple/full-path pin or quality tiers.
- Do not start authoring scenarios.

#### Acceptance criteria
- A new audit section exists at the bottom of this doc (or as a
  sibling doc) describing replay flow, broken behaviors, and
  recommended fix points.
- Each known replay symptom from Section 2.1 is mapped to at least
  one concrete file/line range.
- Each fix point is labeled "safe to edit," "edit with care," or
  "do not edit in Phase B."
- The audit ends with a 5–10 item ranked Phase B work list.

#### Suggested model
**Opus 4.7 High.** Reading-heavy, reasoning-heavy, no large code
output. Max thinking budget is unnecessary; high is enough.

#### Suggested commit style
- 1 audit commit (docs only).
- 0 implementation commits.
- 0 QA commits.

#### Micro-milestones

**A1 — Map replay flow**
- Objective: produce a sequence diagram (text or ASCII) of the
  replay flow from page load → freeze → choose → consequence →
  answer-leg → done → "show me again."
- Likely files: `imperativeScene.ts`, `Scenario3DCanvas.tsx`,
  `Scenario3DView.tsx`, `app/train/page.tsx`.
- What changes: append a "Replay Flow Map" subsection to this doc.
- Exit criteria: every state transition and every prop edge is
  named with the file and approximate line.
- Suggested commit message: `docs: map replay flow for recovery audit`

**A2 — Isolate broken behaviors**
- Objective: list each user-visible replay bug from Section 2.1
  and trace it to a specific code path or wiring gap.
- Likely files: same as A1.
- What changes: append a "Broken Behaviors" subsection with one
  entry per symptom.
- Exit criteria: every symptom has (a) reproduction notes, (b) a
  hypothesis pointing at a file/range, and (c) a confidence label
  (high/med/low).
- Suggested commit message: `docs: isolate replay broken behaviors`

**A3 — Identify safest fix points**
- Objective: classify each candidate fix surface as safe, careful,
  or off-limits.
- Likely files: same as A1.
- What changes: append a "Fix Surface Classification" table.
- Exit criteria: every method named in A2 hypotheses appears in
  the table with a class label and one-line rationale.
- Suggested commit message: `docs: classify replay fix surfaces`

**A4 — Produce Phase B recommendation**
- Objective: emit a ranked Phase B work list (5–10 items, each
  scoped to a single micro-milestone) and a "do not touch in
  Phase B" list.
- Likely files: this doc only.
- What changes: append a "Phase B Recommendation" subsection.
- Exit criteria: each item has a one-sentence change summary, an
  estimated diff size (S / M / L), and a dependency on prior items.
- Suggested commit message: `docs: recommend replay Phase B work list`



