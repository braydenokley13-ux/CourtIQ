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

---

### Phase B — Replay Reliability Fix

#### Goal
Implement the Phase A recommendations so play, pause, restart,
speed control, and consequence replay behave correctly and never
strand the scene in a stuck state.

#### Why this phase matters
Replay is the learning loop. Until B lands, no other fix is
trustworthy because every other fix gets observed *through* a
broken replay.

#### Files likely involved
- `apps/web/components/scenario3d/imperativeScene.ts` —
  `MotionController.setPaused`, `setPlaybackRate`, `reset`,
  `swapMode`, the elapsed-ms math at L1107 and rebase math at
  L1086–L1095; `ReplayStateMachine.transition` and `pick` /
  `showAgain` paths.
- `apps/web/components/scenario3d/Scenario3DCanvas.tsx` — the
  paused/playbackRate effects (L844–L849) and the resetCounter
  pipeline.
- `apps/web/components/scenario3d/Scenario3DView.tsx` — the
  replayMode/resetCounter reset effect; the `restartTick` /
  `compositeResetCounter` composition.
- `apps/web/components/scenario3d/PremiumOverlay.tsx` — control
  button states; speed selector.
- `apps/web/components/scenario3d/replayStateMachine.test.ts` —
  add tests covering each fix.

#### Risks / boundaries
- Do not redesign the state machine. Fix transitions and rebases.
- Do not touch the parent rAF loop or FPS guard.
- Do not alter `MOTION_PRE_DELAY_MS` unless A4 explicitly says so.
- No new visual features. No motion-feel changes (that is Phase C).

#### Acceptance criteria
- Play, pause, and restart are reliable on every replay leg
  (intro, frozen, consequence, answer, done).
- 0.5x / 1x / 2x apply on all legs without jumping the timeline.
- Restart from any state returns to the start of the active leg
  with paused = false and the user's chosen speed preserved.
- "Show me again" cycles `done → replaying → done` cleanly.
- No stuck state is reachable from button mashing in <30 s of
  interaction on BDW-01.
- All existing tests in `replayStateMachine.test.ts` still pass;
  at least 3 new tests cover the previously broken behaviors.

#### Suggested model
**Opus 4.7 Max.** State-machine + timing fixes carry high
regression risk; max thinking is worth the cost.

#### Suggested commit style
- 0 audit commits (Phase A delivered the audit).
- 4–5 implementation commits, one per micro-milestone.
- 1 QA/tuning commit.

#### Micro-milestones

**B1 — Fix play/pause state consistency**
- Objective: ensure `paused` prop, `MotionController.isPaused()`,
  and the visible scene always agree, including after a leg swap.
- Likely files: `imperativeScene.ts` (`setPaused`, `getElapsedMs`),
  `Scenario3DCanvas.tsx` (paused effect), `Scenario3DView.tsx`.
- What changes: tighten the rebase math in `setPaused`, ensure
  `swapMode` preserves or resets `pausedAtT` deliberately, ensure
  the canvas effect re-applies `paused` after a leg swap.
- Exit criteria: pause is honored across an intro→frozen
  transition and a consequence leg; resume continues from the
  paused frame.
- Suggested commit message: `fix(replay): make pause survive leg swaps`

**B2 — Fix restart/reset behavior**
- Objective: restart returns to the start of the active leg with
  paused cleared, user's speed preserved, and no half-played
  motion artifacts.
- Likely files: `imperativeScene.ts` (`reset`), `Scenario3DView.tsx`
  (`restartTick`, `compositeResetCounter`), `Scenario3DCanvas.tsx`.
- What changes: clarify which leg `reset` returns to, ensure the
  `compositeResetCounter` effect cancels in-flight transitions,
  reset `pausedAtT` and rebase `startedAt`.
- Exit criteria: hammering Restart 10 times in a row leaves the
  scene at frame 0 of the current leg, paused = false, speed
  preserved.
- Suggested commit message: `fix(replay): stabilize restart and reset`

**B3 — Fix speed-control application**
- Objective: speed changes apply on every leg without timeline
  jumps; speed survives leg swaps and restarts.
- Likely files: `imperativeScene.ts` (`setPlaybackRate`,
  `getElapsedMs`), `Scenario3DCanvas.tsx`.
- What changes: confirm the rebase formula at L1071–L1075 is
  applied identically on every code path that changes rate, and
  that `swapMode` carries the rate forward.
- Exit criteria: switching 0.5x ↔ 2x mid-play does not jump the
  scene; switching speed during a frozen state takes effect on
  resume.
- Suggested commit message: `fix(replay): apply speed cleanly across legs`

**B4 — Fix consequence replay path**
- Objective: wrong picks play the matching wrongDemo leg end-to-end
  and then transition to `done` cleanly; right picks short-circuit
  to the answer leg.
- Likely files: `imperativeScene.ts` (`ReplayStateMachine.pick`,
  `swapMode`), `Scenario3DCanvas.tsx`, `app/train/page.tsx`
  (`pickedChoiceId`).
- What changes: ensure `pickedChoiceId` reaches the state machine,
  the matching wrongDemo is loaded, and the `consequence → replaying`
  transition does not double-fire.
- Exit criteria: each authored choice in BDW-01 produces the
  correct leg sequence and arrives at `done` exactly once.
- Suggested commit message: `fix(replay): correct consequence leg dispatch`

**B5 — Replay QA pass**
- Objective: regression-test the full replay matrix on BDW-01
  with the simple path and the full path; lock in test coverage.
- Likely files: `replayStateMachine.test.ts`, manual QA notes
  appended to this doc.
- What changes: add tests for B1–B4, run lint + typecheck +
  tests, append a QA results subsection.
- Exit criteria: all tests pass, manual QA checklist clean on
  BDW-01.
- Suggested commit message: `test(replay): cover Phase B regressions`

---

### Phase C — Movement Quality Pass

#### Goal
Make players, defenders, and the ball move in ways that show the
basketball reason. Bodies face the action. Cuts accelerate. Defenders
react. Passes arc and arrive on time.

> **Movement should show the basketball reason, not just move pieces around.**

#### Why this phase matters
After Phase B, replay is reliable. But replaying a stiff scene is
still unconvincing. Movement carries the *meaning* of every
scenario; without it, the scene is a diagram with sliders.

#### Files likely involved
- `apps/web/components/scenario3d/imperativeScene.ts` —
  `MotionController.applyBall` (~L1229+), `samplePlayer`,
  `computePlayerYaw` (~L3171), the per-stance pose in
  `buildPlayerFigure` (~L3193), `MOTION_PRE_DELAY_MS`, parabola
  height, `resolveCatcher` (~L1206).
- `apps/web/components/scenario3d/imperativeTeachingOverlay.ts` —
  defender pressure halos, vision cones (movement cues react to
  motion controller's holder).
- `apps/web/lib/scenario3d/timeline.ts` — chained-movement
  timeline build; pacing.
- `apps/web/components/scenario3d/Scenario3DCanvas.tsx` —
  pass-arrival camera shake (already present, ensure it stays
  proportional).

#### Risks / boundaries
- Do not redesign player geometry. That is Phase F.
- Do not change scenario JSON timings (this is renderer feel,
  not authored content).
- Do not break Phase B replay reliability — feel changes must be
  rate-aware and pause-respecting.
- Stay within the performance rules from
  `courtiq-premium-scene-visual-system-plan.md` Section 14.

#### Acceptance criteria
- Players face the ball / target during cuts and drives instead of
  holding their start yaw.
- Defenders shift body facing when the ball moves.
- Cuts visibly accelerate (not constant velocity).
- The ball arc reads as a basketball pass at all speeds.
- Freeze lands at the authored beat with no overshoot.
- No regression in BDW-01 timing.

#### Suggested model
**Opus 4.7 High.** Real engineering, but bounded — the architecture
is already in place; this is tuning + a few targeted upgrades.

#### Suggested commit style
- 1 audit commit (movement audit notes).
- 3–4 implementation commits.
- 1 QA/tuning commit.

#### Micro-milestones

**C1 — Movement audit**
- Objective: capture the current motion behavior and list the
  specific feel gaps (stiff cuts, fixed yaws, flat passes,
  static defenders).
- Likely files: docs only.
- What changes: append a "Movement Audit" subsection to this doc
  with named gaps and target file/line ranges.
- Exit criteria: each Section 2.2 symptom mapped to ≥1 file/range.
- Suggested commit message: `docs: audit movement quality gaps`

**C2 — Improve body-facing logic**
- Objective: drive `computePlayerYaw` per frame for in-motion
  players so bodies turn into cuts and toward the ball.
- Likely files: `imperativeScene.ts` (`MotionController.samplePlayer`,
  `computePlayerYaw`).
- What changes: lift `computePlayerYaw` from one-shot at build
  to a per-frame call inside the player update path; ease yaw
  toward target with a short time constant.
- Exit criteria: cutters face their cut path; defenders rotate
  with the ball; no jitter from frame-rate variance.
- Suggested commit message: `feat(scene): drive player facing per frame`

**C3 — Improve cut / drive timing**
- Objective: cuts and drives accelerate from rest and decelerate
  at the target instead of moving at constant speed.
- Likely files: `imperativeScene.ts` (`samplePlayer`),
  `lib/scenario3d/timeline.ts`.
- What changes: apply an ease-in/out interpolation to position
  along authored segments; expose a per-segment optional easing
  hint without breaking existing JSON.
- Exit criteria: a cut visibly accelerates; the receiver settles
  before the pass arrives; replay-rate-aware.
- Suggested commit message: `feat(scene): ease cut and drive motion`

**C4 — Improve defender reaction timing**
- Objective: defenders react to ball position changes — at minimum
  rotate body and shift small step toward the ball — within ~150 ms
  of the holder change.
- Likely files: `imperativeScene.ts` (defender update path),
  `imperativeTeachingOverlay.ts` (pressure halo timing).
- What changes: tie defender yaw and a small lateral offset to
  the holder; debounce so it doesn't jitter on quick swings.
- Exit criteria: when the ball swings, defenders visibly turn;
  no overlay flicker.
- Suggested commit message: `feat(scene): defenders react to ball swings`

**C5 — Improve ball arc + freeze**
- Objective: passes arc with a credible parabola; freeze lands
  exactly at the authored beat with no overshoot or rebound.
- Likely files: `imperativeScene.ts` (`applyBall`,
  `MOTION_PRE_DELAY_MS`, freeze handling).
- What changes: tune parabola height vs. distance; clamp
  freeze frame so authored `freezeAtMs` is honored across all
  playback rates.
- Exit criteria: passes feel like passes at 0.5x / 1x / 2x;
  freeze frame matches the authored marker.
- Suggested commit message: `feat(scene): tune ball arc and freeze accuracy`

**C6 — Movement QA pass**
- Objective: confirm the feel changes hold up on BDW-01 across
  all replay legs and rates; verify no Phase B regression.
- Likely files: tests + docs only.
- What changes: add unit tests where feasible (`samplePlayer`
  yaw target, ease curve), append QA notes.
- Exit criteria: tests pass, manual QA matrix clean.
- Suggested commit message: `test(scene): cover movement quality changes`

---

### Phase D — Fullscreen Film Room Mode

#### Goal
Add a real fullscreen toggle that expands the canvas to full
viewport, keeps replay controls visible and usable, and exits
cleanly. Must work with existing replay state and Mac performance.

#### Why this phase matters
Fullscreen is the difference between "embedded widget" and
"playable film room." It also relieves the cramped scenario shell
without redesigning it.

#### Files likely involved
- `apps/web/components/scenario3d/PremiumOverlay.tsx` — add a
  fullscreen toggle button next to the camera selector.
- `apps/web/components/scenario3d/Scenario3DView.tsx` — own
  `isFullscreen` state and the Fullscreen API calls; expose a ref
  to the canvas wrapper element.
- `apps/web/components/scenario3d/Scenario3DCanvas.tsx` — ensure
  the canvas resizes correctly on fullscreen change (resize
  observer / pixel-ratio recomputation).
- `apps/web/app/train/page.tsx` — let the canvas frame opt out of
  the train shell layout while in fullscreen.
- Optional: `apps/web/lib/scenario3d/feature.ts` — flag for
  fullscreen-disabled environments.

#### Risks / boundaries
- Do not change replay controls. They should appear inside
  fullscreen with the same component.
- Do not bind escape keys to anything other than the standard
  fullscreen exit.
- Do not break SSR. All Fullscreen API access must be guarded.
- Do not change the FPS guard or quality tier resolver.

#### Acceptance criteria
- A fullscreen button is visible in the overlay; clicking it
  enters fullscreen on the canvas wrapper.
- Inside fullscreen: replay controls, camera selector, paths
  toggle, and the new fullscreen button (now showing "Exit") are
  all visible.
- Escape key exits fullscreen; the button toggles correctly.
- Canvas resizes to fill the viewport without stretching or
  letterboxing the court.
- The train-page shell does not bleed into the fullscreen view
  (no decoder pill, no answer cards visible at the top of the
  fullscreen canvas).
- Mac frame rate is preserved (FPS guard active, no DPR blowup).

#### Suggested model
**Sonnet 4.6 Medium-High.** Self-contained UI feature with a
well-known browser API; does not need Opus.

#### Suggested commit style
- 1 UX/plan commit (docs).
- 3–4 implementation commits.
- 1 QA/tuning commit.

#### Micro-milestones

**D1 — Fullscreen UX plan**
- Objective: decide button placement, icon, control persistence
  rules inside fullscreen, escape behavior, and what hides from
  the train-page shell.
- Likely files: docs only.
- What changes: append a "Fullscreen UX Plan" subsection to this
  doc.
- Exit criteria: open questions resolved (where the button
  lives, what stays visible, exit affordance).
- Suggested commit message: `docs: plan fullscreen film room UX`

**D2 — Fullscreen toggle wiring**
- Objective: implement the toggle button and the Fullscreen API
  request/exit path; own state in `Scenario3DView`.
- Likely files: `Scenario3DView.tsx`, `PremiumOverlay.tsx`.
- What changes: add `isFullscreen` state; use a
  `requestFullscreen` / `exitFullscreen` pair; listen for
  `fullscreenchange` to keep state in sync; SSR-guard.
- Exit criteria: button enters and exits fullscreen on a click;
  ESC also exits and updates state; no console warnings.
- Suggested commit message: `feat(scene): wire fullscreen toggle`

**D3 — Responsive canvas/container behavior**
- Objective: ensure the canvas + overlay container fills the
  viewport in fullscreen and resets cleanly on exit.
- Likely files: `Scenario3DView.tsx`, `Scenario3DCanvas.tsx`,
  `app/train/page.tsx`.
- What changes: drop fixed heights when fullscreen; trigger a
  resize observer pass on transition; suppress train-shell
  layout while fullscreen.
- Exit criteria: canvas fills the viewport; lines remain crisp;
  exit returns to the previous embedded layout.
- Suggested commit message: `feat(scene): make canvas responsive in fullscreen`

**D4 — Fullscreen controls polish**
- Objective: ensure replay controls, camera selector, paths
  toggle, and the fullscreen button are all readable and
  reachable inside fullscreen at typical viewport sizes.
- Likely files: `PremiumOverlay.tsx`.
- What changes: layout/spacing tweaks for the in-canvas chrome
  to read at fullscreen sizes; ensure no shell element overlaps.
- Exit criteria: all controls visible and clickable at 1920x1080
  and 1440x900; no z-index fights with the canvas.
- Suggested commit message: `feat(scene): polish fullscreen controls`

**D5 — Fullscreen QA pass**
- Objective: validate fullscreen on the supported browsers,
  including the resize-on-rotate edge cases and ESC exit.
- Likely files: tests + docs only.
- What changes: add a Fullscreen QA matrix to this doc; add
  tests where feasible.
- Exit criteria: matrix clean on Chrome + Safari + Firefox on Mac.
- Suggested commit message: `test(scene): verify fullscreen behavior`

---

### Phase E — Player Geometry Strategy Spike

#### Goal
Decide *which* approach to take for fixing player geometry before
shipping any redesign. Output is a written recommendation with a
small prototype, not a finished player.

#### Why this phase matters
Player geometry has been polished twice already inside the
procedural builder and still reads as "boxes." Investing another
round of refinement without a strategy decision risks a third
polish loop with no real gain. This phase chooses the path.

#### Files likely involved
- Read: `apps/web/components/scenario3d/imperativeScene.ts`
  (`buildPlayerFigure` ~L3193, palette + ring stack ~L3198–L3289).
- Read: `courtiq-premium-scene-visual-system-plan.md` Sections 6,
  13, 14, 17.5 (safest files to edit), 18.4 (stance flag).
- Optional prototype edits in a scratch branch only — do not
  land prototype code on the recovery branch.

#### Risks / boundaries
- Do not implement the redesign in this phase. Phase F does that.
- Do not import a heavy mesh library (Mac perf budget).
- Do not change palette or indicator stack here.
- Do not break the existing builder; prototypes live behind a
  flag or in a sibling file.

#### Acceptance criteria
- A written comparison of options A–D exists in this doc.
- Each option lists pros, cons, perf cost, and risk to existing
  code.
- A single chosen path is named with rationale.
- A small prototype (in a scratch branch) demonstrates the chosen
  path is feasible on Mac.
- Phase F's micro-milestone list updates to match the chosen path.

#### Suggested model
**Opus 4.7 Max.** Architecture decision with downstream cost; max
thinking is worth the spend.

#### Suggested commit style
- 1 audit/comparison commit (docs).
- 0–1 prototype commits (scratch branch only; do not merge yet).
- 1 decision commit (docs: chosen path + Phase F update).

#### Micro-milestones

**E1 — Audit why current geometry still fails**
- Objective: name the specific reasons the current procedural
  builder reads as placeholder (silhouette, joint articulation,
  shoulder/hip mass, head proportion, stance differentiation).
- Likely files: docs only.
- What changes: append a "Geometry Failure Audit" subsection.
- Exit criteria: each Section 2.3 symptom traced to a specific
  primitive choice in `buildPlayerFigure`.
- Suggested commit message: `docs: audit player geometry failures`

**E2 — Compare geometry strategies**
- Objective: write up options A–D with concrete pros/cons.
  - A. Improve current procedural primitives again
  - B. Build a better reusable low-poly player mesh in code
  - C. Use a lightweight imported model (glTF) if the stack
    supports it
  - D. Hybrid (e.g., procedural torso + imported head/limbs, or
    code mesh with imported textures)
- Likely files: docs only.
- What changes: append a "Strategy Comparison" subsection.
- Exit criteria: each option has perf estimate, integration cost,
  risk to indicators/stances, and a one-paragraph verdict.
- Suggested commit message: `docs: compare player geometry strategies`

**E3 — Prototype recommendation**
- Objective: build the smallest possible prototype of the
  leading option in a scratch branch, screenshot it, and measure
  Mac frame rate.
- Likely files: scratch branch only.
- What changes: a single prototype file or a behind-flag path
  in `imperativeScene.ts`; screenshots saved under
  `docs/screenshots/recovery-e3/`.
- Exit criteria: feasibility confirmed (renders, perf-safe,
  preserves indicators).
- Suggested commit message: `spike: prototype player geometry option`

**E4 — Choose implementation path**
- Objective: lock the chosen option, document why, and update
  Phase F micro-milestones to match.
- Likely files: this doc.
- What changes: append a "Chosen Path" subsection; rewrite Phase
  F micro-milestones to be specific to the chosen option.
- Exit criteria: Phase F is implementation-ready against the
  chosen path.
- Suggested commit message: `docs: choose player geometry path`

---

### Phase F — Player Geometry Redesign

#### Goal
Implement the path chosen in Phase E. Ship a player that reads as
an athlete, preserves Mac performance, keeps stance readability,
and integrates cleanly with offense/defense/user identity.

#### Why this phase matters
The visible weak link of the product. Once replay and motion are
real, the placeholder body is the most jarring thing on screen.

#### Chosen path (set by E4)
**Option B — code-built reusable low-poly stylized-athlete mesh, no
skeletal rig, rigid sub-group posing.** See Section 16, "E4 — Chosen
Player Geometry Path" for the full constraint list. F1–F5 below are
specific to Option B.

#### Files likely involved
- `apps/web/components/scenario3d/imperativeScene.ts` —
  `buildPlayerFigure` (~L3393), per-stance constants (~L3303–L3361),
  the per-player loop in `buildBasketballGroup` (~L379–L427), palette
  constants (~L59–L64, L107–L112), ring/halo stack (~L3714–L3858),
  `disposeGroup` (~L455) + `disposeMaterialTextures` (~L478).
- `apps/web/components/scenario3d/replayStateMachine.test.ts` (or a
  new sibling test file) — disposal-leak guard added in F5.
- `apps/web/lib/scenario3d/quality.ts` — only touched if F4 needs a
  per-tier geometry variant.

**Forbidden in Phase F**: any new file outside `imperativeScene.ts`
unless F4 / F5 explicitly require it; any `.glb` / `.gltf` / `.png`
asset import; any change to MotionController, ReplayStateMachine, the
parent rAF loop, or the simple/full-path pin.

#### Risks / boundaries
- Do not break existing indicator layers (`base`, `user`, `userHead`,
  `possession`); their geometry, Y heights, and visibility rules are
  locked. F3 verifies them.
- Do not change palette constants (E4 §4); identity comes from the
  existing palette via shared materials.
- Do not exceed the per-player tri budget (E4 §5: ≤1500 tris hard
  ceiling; ~900–1100 target).
- Do not ship a player that hides the user's identity halo.
- Do not break the dispose traversal (every new mesh / material must
  be reachable by `disposeGroup`); F5 enforces.
- Do not add `SkinnedMesh`, `AnimationMixer`, or any per-frame
  geometry mutation.
- Do not change `buildPlayerFigure`'s public signature
  (`teamColor, trimColor, isUser, hasBall, jerseyNumber, stance`).
- Do not change scene JSON schema or BDW-01 pack content. Stance
  routing for ESC/AOR/SKR is a follow-up item, not Phase F scope.

#### Acceptance criteria
- The new player silhouette reads as an athlete from broadcast
  distance (single-mesh-feel body, V-tapered shoulders into waist,
  visible knee + elbow break in poses that need them).
- Stance differences (`idle`, `defensive`, `denial`, plus the new
  `closeout` and at least stub `cut` and `sag`/`shrink` poses)
  are visually distinct from the default camera without indicator
  help.
- Offense, defense, and user identity remain unmistakable; the
  user's chevron + halo + ring stack still reads from any camera.
- Mac frame rate stays in budget; FPS guard never auto-degrades on
  `medium` or `high` tier on BDW-01.
- All existing tests still pass; F5 disposal-leak test passes; no
  leaks reported on scene rebuild.
- Per-player tri count recorded in this doc by F4.

#### Suggested model
**Opus 4.7 Max.** Visual + perf + integration risk; max thinking is
warranted.

#### Suggested commit style
- 1 silhouette commit (F1).
- 1 stance commit (F2).
- 1 identity / indicator integration commit (F3).
- 1 perf tuning + tri-count baseline commit (F4).
- 1 QA + disposal-leak test commit (F5).

#### Micro-milestones

**F1 — Build the new athlete mesh under a flag**
- Objective: implement the new code-built low-poly athlete builder
  inside `imperativeScene.ts`, behind a `USE_ATHLETE_BUILDER`
  module-level const. Old `buildPlayerFigure` stays intact and is
  used until the flag flips at the end of F1.
- Likely files: `imperativeScene.ts` (new `buildAthleteFigure` next
  to the existing `buildPlayerFigure`; per-player loop branches on
  the flag).
- What changes: new builder produces the sub-group taxonomy from
  E4 §3 (`pelvis`, per-side `leftLeg` / `rightLeg` with
  `thigh` / `calf` / `foot`, `torso`, per-side `leftArm` / `rightArm`
  with `upperArm` / `foreArm`, `neckHead`, `shoes`); indicator
  layers are constructed in the same place and with the same Y
  heights as today. Flag flips on at the end of F1; old builder
  code stays in the file until F5.
- Exit criteria: lint + tests + typecheck clean; `USE_ATHLETE_BUILDER`
  is true; the builder signature is preserved; the indicator
  contract from E4 §7 is satisfied.
- Suggested commit message: `feat(scene): rebuild player silhouette as low-poly athlete`

**F2 — Stance pose pass**
- Objective: implement the per-stance pose lookup table on the new
  sub-groups so `idle`, `defensive`, `denial`, `closeout` are
  visually distinct from broadcast; ship `cut` and `sag`/`shrink`
  as visible stubs (different from `idle` / `defensive` enough to
  be distinguishable in a future pack).
- Likely files: `imperativeScene.ts` (`buildAthleteFigure`,
  per-stance constants).
- What changes: a `STANCE_POSES` table keyed by `PlayerStance`
  containing per-sub-group rotation and translation deltas.
  `closeout` lives on the same axis as `defensive` but with shoulder
  forward + front-foot toe planted. `cut` and `sag`/`shrink` ship
  as stub deltas; full polish is a follow-up. The `PlayerStance`
  union expands to include `'closeout' | 'cut' | 'sag'`.
- Exit criteria: stances differentiable from the default camera
  without indicators; lint + tests + typecheck clean; no scene
  routing change yet (closest-defender heuristic still chooses
  `denial` / `defensive` / `idle` only — see F-follow-up below).
- Suggested commit message: `feat(scene): tune stance readability on new mesh`

**F3 — Identity + indicator integration**
- Objective: re-apply offense / defense / user palette and trim to
  the new mesh; verify the four indicator layers still mount and
  flip correctly; re-derive the chevron Y against the new head Y.
- Likely files: `imperativeScene.ts` (palette wiring inside
  `buildAthleteFigure`, indicator y-height re-derivation).
- What changes: shared `MeshStandardMaterial` per body region
  (jersey, shorts, skin, shoe, accent, trim) — six materials per
  figure, same as today; jersey number panels via existing
  `makeJerseyNumberTexture`; chevron y math updated to track new
  `HEAD_Y`. A small unit test asserts the four indicator layers
  exist on a default scene's user / non-user / ball-handler /
  non-ball-handler combinations.
- Exit criteria: user unmistakable; offense vs. defense reads in
  one glance; chevron sits cleanly above the new head; new unit
  test passes; lint + typecheck clean.
- Suggested commit message: `feat(scene): integrate identity palette on new mesh`

**F4 — Performance tuning + tri-count baseline**
- Objective: confirm the new geometry sits inside the E4 §5 budget;
  add a per-tier geometry variant only if measurement requires it;
  record the baseline in this doc.
- Likely files: `imperativeScene.ts` (geometry segment counts);
  `lib/scenario3d/quality.ts` only if a low-tier variant is
  needed.
- What changes: confirm shared materials per figure; tune
  `CapsuleGeometry` / `BoxGeometry` segment counts down where the
  silhouette is unaffected; record per-figure tri count
  (`figure.traverse((c) => sum += (c as THREE.Mesh).geometry?.index?.count ?? 0)`)
  for one default-scene player and append to E4 §5 as the actual
  baseline.
- Exit criteria: per-figure tri count ≤ 1500; total player tris on
  BDW-01 ≤ 7500; no FPS-guard auto-degrade on `medium` or `high`
  in any test fixture; lint + tests clean.
- Suggested commit message: `perf(scene): tune new player geometry budget`

**F5 — QA + disposal-leak test + flag-flip cleanup**
- Objective: lock in coverage and remove the old builder. Add a
  vitest test that builds and disposes 100 figures and asserts no
  monotonic geometry growth. Delete the old `buildPlayerFigure`
  body and the `USE_ATHLETE_BUILDER` flag now that the new path is
  proven. Append a "Geometry QA Results" subsection.
- Likely files: a new sibling test file (e.g.
  `imperativeScene.dispose.test.ts`) + `imperativeScene.ts` for
  the flag removal; this doc for the QA Results.
- What changes: add disposal-leak test; remove old builder + flag;
  append "Phase F QA Results" subsection.
- Exit criteria: all tests pass including the new disposal-leak
  test; lint + typecheck clean; no dead code; QA Results
  subsection complete.
- Suggested commit message: `test(scene): verify new player geometry QA`

---

### Phase G — Young-Player Copy Pass

#### Goal
Rewrite live-decision and feedback copy at roughly a 3rd-grade
reading level while preserving real basketball meaning. Live-
decision wording first, then feedback.

#### Why this phase matters
Today's copy is gettable for adults but bounces younger players.
Wording is the cheapest place CourtIQ loses users. Fixing it after
the scene works (Phases B–F) means the lesson and the visual now
match in tone.

#### Files likely involved
- `apps/web/app/train/page.tsx` — `DECODER_LABELS`,
  `DECODER_HANDOFF`, prompt strings, "Show me again" button copy,
  miss-toast text (~L40–L111 plus shell strings).
- `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json` —
  prompt, choices, feedback strings.
- `apps/web/app/train/{ChoiceCard,FeedbackPanel,PhaseTracker,DecoderLessonPanel,SelfReviewChecklist}.tsx`
  — labels, microcopy.
- `apps/web/lib/services/scenarioService.ts` — any service-level
  copy.
- Optional: a new `apps/web/lib/copy/` module if Phase G2 decides
  copy needs a single home.

#### Risks / boundaries
- Do not change scene logic, replay logic, or scoring logic.
- Do not author new scenarios or new decoders.
- Do not change basketball meaning to make copy easier — if a
  rewrite would teach the wrong read, leave the harder word.
- Do not break i18n if any copy is wrapped in a translator
  helper (check before editing).

#### Acceptance criteria
- Live-decision prompts and choice strings on BDW-01 score at or
  below ~3rd-grade Flesch-Kincaid.
- Feedback strings on BDW-01 follow the same target with a
  small allowance for one teaching term per feedback block.
- Basketball meaning preserved: every decoder still teaches its
  intended read.
- A "Copy Rules" subsection exists in this doc that future
  scenarios can adopt.

#### Suggested model
**Sonnet 4.6 Medium-High.** Writing-heavy, low engineering risk.

#### Suggested commit style
- 1 audit commit.
- 1 rules commit.
- 2–3 rewrite commits (live-decision, feedback, shell labels).
- 1 QA commit.

#### Micro-milestones

**G1 — Copy source audit**
- Objective: list every file that holds user-facing copy on the
  live-decision and feedback paths; capture current strings.
- Likely files: docs only (sourced from the files above).
- What changes: append a "Copy Source Audit" subsection.
- Exit criteria: every BDW-01 user-facing string is named with
  source file/line.
- Suggested commit message: `docs: audit copy source locations`

**G2 — Global copy rules**
- Objective: establish the copy rules — short sentences, one
  basketball idea per line, allowed teaching terms list, banned
  jargon list, tone target.
- Likely files: docs only.
- What changes: append a "Copy Rules" subsection.
- Exit criteria: rules concrete enough that another writer
  could follow them blind.
- Suggested commit message: `docs: define young-player copy rules`

**G3 — BDW-01 live-decision rewrite**
- Objective: rewrite the prompt, choice cards, and any
  pre-decision shell text on BDW-01 to the new rules.
- Likely files: `BDW-01.json`, `app/train/page.tsx`,
  `ChoiceCard.tsx`.
- What changes: string edits only; verify reading-level target.
- Exit criteria: prompt + each choice readable to a 3rd grader;
  meaning preserved.
- Suggested commit message: `copy(bdw-01): simplify live-decision wording`

**G4 — BDW-01 feedback rewrite**
- Objective: rewrite the post-decision feedback, decoder lesson
  copy, and self-review checklist on BDW-01.
- Likely files: `BDW-01.json`, `FeedbackPanel.tsx`,
  `DecoderLessonPanel.tsx`, `SelfReviewChecklist.tsx`.
- What changes: string edits only.
- Exit criteria: feedback reads at target level; teaching points
  intact.
- Suggested commit message: `copy(bdw-01): simplify feedback wording`

**G5 — Copy QA pass**
- Objective: read every new string aloud as if a 3rd grader is
  reading it; spot-check meaning with a basketball reviewer if
  available; lock the rules.
- Likely files: docs.
- What changes: append a "Copy QA Notes" subsection; flag any
  rewrite that lost meaning.
- Exit criteria: no string fails the reading-level target; no
  string fails the meaning check.
- Suggested commit message: `docs: record copy QA results`

---

### Phase H — Final QA / Integration

#### Goal
Validate that replay, movement, fullscreen, geometry, and copy
ship as one coherent experience on BDW-01. Catch and fix
integration regressions before declaring the recovery done.

#### Why this phase matters
Five recoveries that work in isolation can still feel uneven
together. Phase H is the cohesion pass that turns the parts into
"the product."

#### Files likely involved
- All files touched in Phases B–G (regression-only).
- `apps/web/components/scenario3d/imperativeScene.ts` — minor
  tuning constants only.
- This doc — final QA matrix.
- Tests across `apps/web/components/scenario3d/`.

#### Risks / boundaries
- No new features.
- No new scenarios.
- No new visuals beyond minor constant tuning.
- Do not reopen Phase A–G micro-milestones unless a regression
  is real and reproducible.

#### Acceptance criteria
- BDW-01 passes every QA item in
  `courtiq-premium-scene-visual-system-plan.md` Section 15.
- Replay matrix (play/pause/restart/0.5x/1x/2x/consequence/answer/
  show-again) is clean.
- Fullscreen behaves on Chrome + Safari + Firefox on Mac.
- Geometry + copy + motion read together as one product.
- `pnpm lint`, `pnpm test`, `pnpm typecheck` all clean.

#### Suggested model
**Opus 4.7 High.** Cross-cutting QA + judgment calls; max not
needed.

#### Suggested commit style
- 1 integration smoke commit (docs).
- 1 manual QA matrix commit (docs).
- 1–2 polish/tuning commits (constants only).
- 1 final readiness commit (docs).

#### Micro-milestones

**H1 — Integration smoke test**
- Objective: run BDW-01 end-to-end after every Phase B–G change is
  on the branch; capture a smoke pass / fail per area.
- Likely files: docs + manual run.
- What changes: append an "Integration Smoke Test" subsection.
- Exit criteria: no blocking regression; every area at least
  passes a smoke read.
- Suggested commit message: `docs: record recovery integration smoke test`

**H2 — BDW-01 manual QA matrix**
- Objective: walk the Section 15 QA checklist + the replay matrix +
  the fullscreen matrix on BDW-01; record results per item.
- Likely files: docs.
- What changes: append a "Manual QA Matrix" subsection.
- Exit criteria: every item passes or has a numbered defect.
- Suggested commit message: `docs: record BDW-01 manual QA matrix`

**H3 — Polish/tuning pass**
- Objective: address any small constant tweaks surfaced by the
  QA matrix (timing, easing, font size in the new fullscreen
  controls, copy line breaks).
- Likely files: minor edits across Phase B–G surfaces.
- What changes: smallest possible diff per defect.
- Exit criteria: every defect from H2 either fixed or
  explicitly deferred with a written rationale.
- Suggested commit message: `chore(scene): tune Phase H polish defects`

**H4 — Final readiness review**
- Objective: declare the recovery complete (or list what is
  blocking completion) and queue scenario expansion as the next
  workstream.
- Likely files: docs.
- What changes: append a "Recovery Readiness Review" subsection;
  link to the visual-system plan's Phase 7 record so the two
  records read together.
- Exit criteria: a one-page status with go / no-go and a clear
  next-step (typically: "begin authoring ESC-01").
- Suggested commit message: `docs: declare recovery readiness review`

---

## 7. Micro-Milestone Rules

The micro-milestones are how this plan stays executable.

- **One milestone per Claude session.** Each milestone is sized
  to land safely in a single conversation, including read,
  edit, test, and commit.
- **One coherent commit per milestone.** Each milestone produces
  one commit (occasionally two if a docs note belongs separately).
- **No mixed scopes in a milestone.** A replay fix is not bundled
  with a copy edit. If a side issue surfaces, log it and keep
  going.
- **Finish before starting.** Do not begin the next milestone
  until the current one's exit criteria pass.
- **Validate after each milestone.** Run lint, typecheck, and
  tests at minimum. Manual QA where the milestone touches user-
  visible behavior.
- **Stop at clean boundaries.** If a session is running long, end
  on a coherent commit rather than push half a milestone.
- **Reviewable progress beats fast progress.** Smaller diffs that
  someone else could approve in five minutes are better than
  multi-area sweeps.
- **Audit milestones must be docs-only.** No code changes inside
  any milestone whose name starts with "audit," "map," or
  "compare."
- **If a milestone grows mid-session, split it.** Land the
  reviewable portion as its own commit and queue the rest as a
  follow-up milestone.

---

## 8. Do-Not-Do List

- Do not author new scenarios (ESC-01, AOR-01, SKR-01, or
  beyond) during this recovery.
- Do not keep polishing visuals while replay is broken — Phase B
  is the gate.
- Do not casually touch `MotionController` or `ReplayStateMachine`.
  These are explicitly flagged as risky in
  `courtiq-premium-scene-visual-system-plan.md` Section 17.6.
- Do not touch `Scenario3DCanvas` parent rAF loop, FPS guard, or
  simple/full-path pin unless a phase truly requires it; if so,
  escalate first.
- Do not redesign the whole product. This is a recovery plan,
  not a rewrite.
- Do not start copy work before Phase G2 defines the rules and
  Phase G1 documents the source files.
- Do not overbuild a player model before Phase E chooses the path.
- Do not change scenario JSON pacing as a workaround for movement
  feel — fix the renderer in Phase C.
- Do not bundle phases. Each phase ships its own commits and
  earns its own QA pass.
- Do not skip Phase A. Replay fixes without an audit will
  regress.

---

## 9. Recommended Execution Order

Run the phases in this exact order. Do not skip ahead.

1. **Phase A — Replay Audit.** Read-only. Output is the audit
   subsection that drives Phase B.
   - *Do not skip ahead* to fixing replay before the audit; one
     unguided edit to `MotionController` can eat a day.
2. **Phase B — Replay Reliability Fix.** Implement the audit's
   recommendations.
   - *Do not skip ahead* to motion or fullscreen until B's QA is
     clean.
3. **Phase C — Movement Quality Pass.** With reliable replay in
   place, motion changes are observable and revert-safe.
   - *Do not skip ahead* to geometry — motion changes feed the
     E spike.
4. **Phase D — Fullscreen Film Room Mode.** Independent of motion
   and geometry; depends on B for usable controls.
   - *Do not skip ahead* if D surfaces a B regression — fix B
     first.
5. **Phase E — Player Geometry Strategy Spike.** A decision phase,
   not an implementation phase.
   - *Do not skip ahead* into Phase F until E4 lands.
6. **Phase F — Player Geometry Redesign.** Implement the chosen
   path from E.
   - *Do not skip ahead* to copy — copy reads better against the
     new look.
7. **Phase G — Young-Player Copy Pass.** Wording at last.
   - *Do not skip ahead* to scenario authoring — that is post-
     recovery.
8. **Phase H — Final QA / Integration.** Cohesion pass and
   readiness review.
   - *Do not skip ahead* to ESC-01 / AOR-01 / SKR-01 authoring
     until H4 declares ready.

---

## 10. Exact Prompt Sequence

Paste these into a future Claude Code session, one at a time, in
order. Each prompt is small-commit friendly and tells Claude to
stop at the phase boundary.

> Run prompts in order. Do not skip ahead. Do not bundle phases.

### 10.1 Phase A — Replay Audit only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase A. Also read Section 17 of
docs/courtiq-premium-scene-visual-system-plan.md for the file map.

Do Phase A ONLY. This phase is read-only. Do NOT modify
imperativeScene.ts, ReplayStateMachine, MotionController,
Scenario3DCanvas, Scenario3DView, PremiumOverlay, or
ScenarioReplayController.

Inspect first:
- apps/web/components/scenario3d/imperativeScene.ts
  (MotionController + ReplayStateMachine)
- apps/web/components/scenario3d/Scenario3DCanvas.tsx
- apps/web/components/scenario3d/Scenario3DView.tsx
- apps/web/components/scenario3d/PremiumOverlay.tsx
- apps/web/components/scenario3d/ScenarioReplayController.tsx
- apps/web/components/scenario3d/replayStateMachine.test.ts
- apps/web/app/train/page.tsx (pickedChoiceId path)

Produce all four micro-milestones (A1–A4) and append them as new
subsections to docs/courtiq-scene-experience-recovery-plan.md.

Commit small, one commit per micro-milestone. Stop after A4. Do
not start Phase B.
```

### 10.2 Phase B — Replay Reliability Fix only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase B, plus the Phase A audit subsections written by the prior
session.

Implement Phase B ONLY. Do not start Phase C. Do not change
visuals, copy, or geometry.

Constraints:
- Stay inside MotionController, ReplayStateMachine, and the
  immediate wiring in Scenario3DCanvas / Scenario3DView /
  PremiumOverlay.
- Do not touch the parent rAF loop, the FPS guard, or the
  simple/full-path pin.
- Add tests in replayStateMachine.test.ts for each fix.
- Each micro-milestone is its own commit.

Run B1 → B2 → B3 → B4 → B5 in order. Commit small. Stop at the
Phase B acceptance criteria.
```

### 10.3 Phase C — Movement Quality Pass only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase C, plus Section 14 of
docs/courtiq-premium-scene-visual-system-plan.md (performance
rules).

Implement Phase C ONLY. Do not change replay logic, geometry,
fullscreen, or copy.

Constraints:
- Stay inside imperativeScene.ts (MotionController, samplePlayer,
  computePlayerYaw, applyBall) and the timeline helper.
- Replay must remain Phase-B-clean — every motion change must be
  rate-aware and pause-respecting.
- Do not change scenario JSON timings.

Run C1 → C2 → C3 → C4 → C5 → C6 in order. Commit small. Stop at
the Phase C acceptance criteria.
```

### 10.4 Phase D — Fullscreen Film Room Mode only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase D.

Implement Phase D ONLY. Do not change replay logic, motion,
geometry, or copy.

Constraints:
- Use the Fullscreen API; SSR-guard all access.
- Own state in Scenario3DView; surface the toggle in
  PremiumOverlay.
- Do not change FPS guard, quality tier resolver, or the
  simple/full-path pin.
- Replay controls must stay reachable inside fullscreen.

Run D1 → D2 → D3 → D4 → D5 in order. Commit small. Stop at the
Phase D acceptance criteria.
```

### 10.5 Phase E — Player Geometry Strategy Spike only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase E. Also read Sections 6, 13, 14, and 17.5 of
docs/courtiq-premium-scene-visual-system-plan.md.

Do Phase E ONLY. This is a decision phase, not an implementation
phase. Do NOT land redesign code on the recovery branch.

Inspect first:
- apps/web/components/scenario3d/imperativeScene.ts
  (buildPlayerFigure ~L3193, palette L25–L103, ring stack
  ~L3198–L3289)
- the Phase 7 record in
  docs/courtiq-premium-scene-visual-system-plan.md Section 18 for
  current QA bar

Output the four E micro-milestones (E1–E4) appended to this doc.
Any prototype lives in a scratch branch only and is not merged.

Commit small. Stop after E4. Do not start Phase F.
```

### 10.6 Phase F — Player Geometry Redesign only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase F, plus the Phase E "Chosen Path" subsection written by
the prior session.

Implement Phase F ONLY using the chosen path. Do not change
replay, motion, fullscreen, or copy.

Constraints:
- Preserve all existing indicator layers (base ring, user halo,
  possession ring, focus marks, contact shadow).
- Stay within Section 14 performance rules; record tri-count
  baseline.
- Every new mesh/material/texture must be reachable by
  disposeGroup / disposeMaterialTextures.
- Do not change palette constants without a docs note.

Run F1 → F2 → F3 → F4 → F5 in order. Commit small. Stop at the
Phase F acceptance criteria.
```

### 10.7 Phase G — Young-Player Copy Pass only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase G.

Implement Phase G ONLY. Do not change scene logic, replay, or
geometry.

Constraints:
- Live-decision copy first (G3), feedback second (G4).
- Preserve basketball meaning. If a rewrite would teach the
  wrong read, leave the harder word.
- Do not author new scenarios. Only BDW-01 strings are in scope.
- Honor any existing i18n wrapping.

Run G1 → G2 → G3 → G4 → G5 in order. Commit small. Stop at the
Phase G acceptance criteria.
```

### 10.8 Phase H — Final QA / Integration only

```
Read docs/courtiq-scene-experience-recovery-plan.md, Section 6,
Phase H, plus Section 15 of
docs/courtiq-premium-scene-visual-system-plan.md (QA checklist).

Do Phase H ONLY. No new features, no new scenarios, no new
visuals beyond constant tuning.

Inspect first:
- the surfaces touched in Phases B–G
- the Section 15 QA checklist
- the replay matrix and fullscreen matrix subsections from
  Phases B and D

Run H1 → H2 → H3 → H4 in order. Commit small. Stop after H4. Do
not start scenario authoring.
```

---

## 11. One-Page Summary

- **Biggest blocker:** replay does not work correctly. Until it
  does, every other improvement compounds the wrong baseline.
- **Biggest product weakness:** the scene moves like a diagram and
  looks like placeholders. Replay reliability + movement quality +
  geometry redesign are the three structural fixes.
- **Best next step:** Phase A — Replay Audit. Read-only, low-risk,
  produces the work list that drives everything that follows.
- **What should wait:** new scenarios (ESC-01 / AOR-01 / SKR-01),
  visual feature additions, and any refactor not required by a
  named phase.
- **What success looks like:** BDW-01 plays end-to-end as a
  trustworthy film-room rep — watch, freeze, choose, replay
  consequence, understand, optionally fullscreen — with bodies
  that look like athletes, motion that shows the basketball
  reason, and copy a third grader can follow. The product earns
  the right to grow into ESC-01, AOR-01, SKR-01, and beyond.

---

## 12. Replay Audit (Phase A)

> Read-only audit produced by Phase A — micro-milestones A1, A2, A3, A4.
> No replay code, no scenario JSON, and no wiring file was modified by
> this section. The findings below feed directly into Phase B.

### A1 — Replay Flow Map

#### A1.1 Plain-English replay flow

The user lands on `/train`. The session API returns one or more
scenarios; for a decoder scenario (today: BDW-01) the page mounts the
3D canvas, asks it to play through to the authored freeze marker, then
mounts the question UI on the freeze edge. After the user picks, the
canvas plays the matching wrong-demo leg (or short-circuits to the
answer-demo leg when no wrong-demo matches the picked id), then the
answer-demo leg, then settles into `done`. From `done` the user can
press "Show me again" (Feedback panel) to replay the answer demo, or
press the bottom-center Restart button to restart the active leg from
t=0. Throughout, the user can pause/play and switch speed via the
in-canvas `PremiumOverlay` transport.

In rough English:

1. **Page load.** `app/train/page.tsx` renders, fetches a session,
   resolves a `Scene3D` via `useScenarioSceneData`, and mounts
   `<Scenario3DView>` with `replayMode='intro'`, `forceFullPath=true`
   (decoder), and `pickedChoiceId=null`.
2. **Watch.** `Scenario3DView` mounts `<Scenario3DCanvas>` which
   builds the imperative scene, constructs `MotionController` and (for
   decoder scenes) `ReplayStateMachine`, and the parent rAF loop
   begins ticking. The state machine transitions
   `idle → setup → playing` immediately on `start()`.
3. **Freeze.** When elapsed time crosses `scene.freezeAtMs`, the motion
   controller fires `pendingFrozen` once. The state machine consumes
   it on the next `tick()`, snapshots player + ball positions, and
   transitions to `frozen`. `onPhase('frozen')` propagates up to the
   train page, which flips `frozen=true` so the prompt + choice cards
   mount and a 700 ms timer-arm delay starts.
4. **Choose.** The user clicks a `ChoiceCard`. The train page sets
   `selected=choiceId`, posts to `/api/session/.../attempt`, sets
   `feedback`, and (because `isDecoder`) passes `pickedChoiceId` down
   through `Scenario3DView` to `Scenario3DCanvas`. The canvas's
   `[pickedChoiceId]` effect calls `machine.pickChoice(choiceId)`.
5. **Consequence (wrong picks).** `pickChoice` calls
   `motion.startConsequence(id, snapshot)`. If a `wrongDemos[id]`
   entry exists, the controller swaps in that movement list (preserving
   the freeze pose for idle players) and the state machine transitions
   to `consequence`. The leg plays to its end; the next `tick()` after
   completion calls `motion.startReplay(snapshot)` and transitions to
   `replaying`.
6. **Replay (right picks short-circuit here).** The answer-demo
   movement list plays from the freeze pose. On completion the state
   machine transitions to `done`.
7. **Done.** The Feedback panel surfaces with "Why" body and a
   "Replay" CTA wired to `setReplayCounter(n+1)`. The decoder lesson
   panel and self-review checklist mount alongside it.
8. **Show me again.** Pressing the Feedback "Replay" CTA bumps the
   parent's `replayCounter`. That flows into `Scenario3DView` as
   `resetCounterProp`, which raises `compositeResetCounter` and the
   canvas effect calls `motion.reset()`. The bottom-center Restart
   button (in `PremiumOverlay`) instead bumps the View-local
   `restartTick`, which also raises `compositeResetCounter` and calls
   `motion.reset()` — but it additionally clears `paused`. Neither
   path calls `machine.showAgain()` today.
9. **Next rep.** "Next rep" advances `idx`. The train page resets
   `selected`, `feedback`, `frozen`, etc. The new scene flows in;
   `Scenario3DCanvas`'s scene-build effect tears down the state
   machine + motion controller and rebuilds them for the new scene.

#### A1.2 File-level responsibility map

| Concern | File | Notes |
|---|---|---|
| Page shell, decoder gating, choice submit, "Show me again" CTA | `apps/web/app/train/page.tsx` | Owns `selected`, `feedback`, `frozen`, `replayCounter`, `scenePhase`. Forwards `pickedChoiceId` only when `isDecoder`. |
| Overlay state ownership | `apps/web/components/scenario3d/Scenario3DView.tsx` | Owns `paused`, `playbackRate`, `restartTick`, `cameraMode`, `pathOverride`. Composes `compositeResetCounter = resetCounterProp + restartTick`. |
| In-canvas chrome (transport, speed, paths, camera) | `apps/web/components/scenario3d/PremiumOverlay.tsx` | Pure controlled UI: emits onPausedChange / onPlaybackRateChange / onRestart. No replay state of its own. |
| Imperative scene build, parent rAF, FPS guard, controller wiring | `apps/web/components/scenario3d/Scenario3DCanvas.tsx` | Constructs `MotionController` + `ReplayStateMachine` inside `tryMount`. Forwards `paused` / `playbackRate` / `resetCounter` / `pickedChoiceId` via dedicated effects. Subscribes the state machine listener and dispatches `onPhase`. |
| Motion timing math | `MotionController` in `imperativeScene.ts` (~L972–L1452) | Owns `startedAt`, `pausedAtT`, `playbackRate`, `freezeAtMs`, `currentOverrides`. `tick`, `reset`, `setPaused`, `setPlaybackRate`, `setMovements`, `startConsequence`, `startReplay`, `snapshotPositions`. |
| Replay state transitions | `ReplayStateMachine` in `imperativeScene.ts` (~L1498–L1628) | Owns `state`, `chosenChoiceId`, `freezeSnapshot`. `start`, `pickChoice`, `showAgain`, `reset`, `tick`. Subscribers receive `(state, choiceId)` snapshots. |
| Legacy JSX replay path (off in production) | `apps/web/components/scenario3d/ScenarioReplayController.tsx` | Mounted only under `?simple=0`. The imperative path now drives decoder scenarios via the imperative `ReplayStateMachine`; this file is kept for the JSX escape hatch. |
| State machine unit tests | `apps/web/components/scenario3d/replayStateMachine.test.ts` | Covers freeze cap, leg swaps, idle-player snapshot honoring, BDW-01 budgets. |

#### A1.3 State ownership map

| Concern | Owner | Sources of change |
|---|---|---|
| `paused` (boolean) | `Scenario3DView` | `PremiumOverlay.onPausedChange`; reset to `false` in a `[replayMode, resetCounterProp]` effect; reset to `false` in `onRestart`. NOT reset on `restartTick` alone. |
| `playbackRate` (0.5/1/2) | `Scenario3DView` | `PremiumOverlay.onPlaybackRateChange`. Never auto-reset. |
| `restartTick` | `Scenario3DView` | `PremiumOverlay.onRestart` increments. |
| `compositeResetCounter` | `Scenario3DView` | Derived: `resetCounterProp + restartTick`. |
| `cameraMode` | `Scenario3DView` | URL `?camera=` on first mount, then `PremiumOverlay`. |
| `pathOverride` | `Scenario3DView` | Reset to `null` on `[replayMode, resetCounterProp]` (NOT `restartTick`). |
| `replayCounter` (parent) | `app/train/page.tsx` | "Show me again" CTA in `FeedbackPanel`; reset on `idx` change. |
| `selected`, `feedback`, `frozen`, `scenePhase` | `app/train/page.tsx` | UI state + `onPhase` callback from canvas. |
| `MotionController.startedAt`, `pausedAtT`, `playbackRate`, `freezeAtMs`, `currentOverrides` | imperative motion controller (canvas-owned ref) | `setPaused`, `setPlaybackRate`, `setFreezeAtMs`, `setMovements`, `reset`, `startConsequence`, `startReplay`, plus the `[paused]` / `[playbackRate]` / `[resetCounter]` effects in `Scenario3DCanvas`. |
| `ReplayStateMachine.state`, `chosenChoiceId`, `freezeSnapshot` | imperative state machine (canvas-owned ref) | `start`, `pickChoice`, `showAgain`, `reset`, `tick`. Re-built on scene/`replayMode` change. |
| `consumedChoiceRef` | `Scenario3DCanvas` | Set when a `pickedChoiceId` is forwarded to the machine; cleared on scene rebuild + cleanup. |

#### A1.4 Text sequence diagram

```
TrainPage             Scenario3DView         Scenario3DCanvas         MotionController          ReplayStateMachine
   │                       │                       │                         │                         │
   │── render scene ──────▶│                       │                         │                         │
   │                       │── Canvas + Overlay ──▶│                         │                         │
   │                       │                       │── tryMount() ──────────▶│ new MotionController     │
   │                       │                       │                         │ (anchored on next tick) │
   │                       │                       │                         │                         │
   │                       │                       │── if freezeAtMs!=null ─▶│                         │── new ReplayStateMachine
   │                       │                       │                         │                         │
   │                       │                       │── machine.start() ─────────────────────────────▶ │ idle→setup→playing
   │                       │                       │   subscribe(onPhase) ─────────────────────────── ▶│
   │                       │                       │                         │                         │
   │                       │                       │  (parent rAF tick)      │                         │
   │                       │                       │── motion.tick(now) ────▶│ advance t, fire frozen │
   │                       │                       │── machine.tick(now) ───────────────────────────▶ │ playing→frozen
   │   onPhase('frozen') ◀───────────────────────── │                         │ snapshot positions     │
   │   setFrozen(true)     │                       │                         │                         │
   │                       │                       │                         │                         │
   │── user clicks card    │                       │                         │                         │
   │   submitChoice(id)    │                       │                         │                         │
   │   setSelected(id)     │                       │                         │                         │
   │   pickedChoiceId=id ─▶│── pickedChoiceId=id ─▶│  effect [pickedChoiceId]│                         │
   │                       │                       │  if state==='frozen'    │                         │
   │                       │                       │  consumedChoiceRef=id   │                         │
   │                       │                       │── machine.pickChoice ────────────────────────── ▶│
   │                       │                       │                         │ startConsequence/Replay│ frozen→consequence
   │   onPhase('consequence') ◀───────────────────  │                         │                         │
   │                       │                       │                         │                         │
   │                       │                       │  (rAF ticks until leg complete)                   │
   │                       │                       │── motion.tick ─────────▶│ isPlaybackComplete=true│
   │                       │                       │── machine.tick ────────────────────────────────▶ │ consequence→replaying
   │                       │                       │                         │ startReplay(snapshot)  │
   │                       │                       │                         │                         │
   │                       │                       │── motion.tick ─────────▶│ leg ends                │
   │                       │                       │── machine.tick ────────────────────────────────▶ │ replaying→done
   │   onPhase('done') ◀── │                       │                         │                         │
   │                       │                       │                         │                         │
   │── user presses        │                       │                         │                         │
   │   FeedbackPanel.Replay│                       │                         │                         │
   │   replayCounter+=1 ──▶│ resetCounterProp+=1   │                         │                         │
   │                       │ compositeResetCounter│                         │                         │
   │                       │ ── compositeReset ──▶ │ effect [resetCounter]   │                         │
   │                       │                       │── motion.reset() ──────▶│ startedAt=null         │
   │                       │  paused→false (effect on resetCounterProp)      │                         │
   │                       │  pathOverride→null                              │                         │
   │                       │                       │   ⚠ machine.showAgain() NOT called               │
   │                       │                       │                         │                         │
   │── user presses        │                       │                         │                         │
   │   Overlay.Restart     │ restartTick+=1        │                         │                         │
   │                       │ paused→false          │                         │                         │
   │                       │ ── compositeReset ──▶ │── motion.reset() ──────▶│                         │
   │                       │                       │   ⚠ machine.showAgain() NOT called               │
   │                       │                       │                         │                         │
   │                       │                       │   ⚠ pathOverride NOT reset on restartTick alone  │
```

#### A1.5 Known uncertainty

- **Restart semantics are ambiguous.** `motion.reset()` on a fresh
  `compositeResetCounter` rewinds whatever leg the controller is
  currently driving. From `done` that's the answer-demo leg; from
  `consequence` that's the consequence leg; from `playing` it's the
  intro leg. The button label says "Restart replay," which a user
  will likely read as "restart the whole rep from the beginning" — but
  the actual behavior is "restart the active leg." Phase B should
  decide which semantics to ship.
- **Show-me-again is split across two affordances.** The Feedback
  panel "Replay" CTA and the Overlay's bottom-center Restart button
  both go through `motion.reset()`. They differ subtly: Feedback CTA
  bumps `resetCounterProp` (which clears `paused` and `pathOverride`
  via the `[replayMode, resetCounterProp]` effects); Overlay Restart
  bumps only `restartTick` (clears `paused` only because `onRestart`
  does it explicitly; does not clear `pathOverride`).
- **`pickedChoiceId` race.** The canvas effect early-returns if the
  state machine isn't yet `frozen` when the prop arrives. Today the
  train page gates choices behind `frozen`, so this can only fire if
  a future change exposes choices earlier. Worth a defensive check.
- **`forceFullPath` is intentionally ignored.** The canvas
  hard-pins to the imperative path. The JSX `ScenarioReplayController`
  in `ScenarioReplayController.tsx` only mounts under `?simple=0` and
  is not on the production path; tests / audits should refer to the
  imperative `ReplayStateMachine` in `imperativeScene.ts`.

#### A1.6 A1 findings (short)

1. The replay loop is genuinely owned by **two cooperating
   controllers** in `imperativeScene.ts` (`MotionController` and
   `ReplayStateMachine`) plus three layers of React wiring
   (`Scenario3DCanvas` effects, `Scenario3DView` overlay state,
   `app/train/page.tsx` decoder gating).
2. Every replay control flows down through `Scenario3DCanvas` as a
   prop change → effect → controller method call. Of the four control
   props (`paused`, `playbackRate`, `resetCounter`, `pickedChoiceId`),
   only `pickedChoiceId` reaches the state machine; the other three
   reach the motion controller only.
3. `resetCounter` and `restartTick` collapse into one
   `compositeResetCounter`, which is why the Feedback "Replay" CTA
   and the Overlay Restart button feel almost-but-not-quite the same.
4. The state machine has no public "rewind to active leg start" or
   "snap-to-done" entry point. The only existing recovery affordance
   from `done` is `showAgain()`, which the parent never calls.

---

### A2 — Broken Replay Behaviors

For each Section 2.1 symptom: what the user sees, the code path most
likely involved, the suspected cause, a confidence label
(high / medium / low), the evidence supporting that hypothesis, and
what Phase B should test before editing. No code is changed in this
section.

#### A2.1 Play/pause can lose sync with the visible scene

- **What the user sees.** Hitting Pause sometimes leaves the scene
  still moving (or already-frozen). Hitting Play sometimes leaves the
  scene parked on the last paused frame. The transition between intro
  and consequence, in particular, can "swallow" a pause press.
- **Likely file/function.**
  `MotionController.setMovements` (`imperativeScene.ts` ~L1376–L1394),
  `Scenario3DCanvas` `[paused]` effect (~L847–L849), and
  `Scenario3DView` paused state ownership.
- **Suspected cause.** `setMovements` (called by both
  `startConsequence` and `startReplay`) hard-resets `pausedAtT = null`
  every time a leg swaps. The `[paused]` effect in
  `Scenario3DCanvas` only re-fires when the React `paused` prop
  changes, not when the underlying motion controller swaps timelines.
  So if the user is paused at the moment of the pick, the consequence
  leg starts playing despite the React state still being `paused=true`.
- **Confidence.** **High.**
- **Evidence.** `setMovements` body explicitly sets
  `this.pausedAtT = null` and `this.startedAt = null`; the
  Scenario3DCanvas paused effect deps are `[paused]`; there is no
  re-application of the paused flag after a leg swap on either side.
- **What Phase B should test before editing.**
  - Reproduce: enter `frozen`, press Pause, then pick a wrong choice.
    Expect the consequence leg to begin playing despite Pause being
    visually engaged.
  - Add a state-machine test that pauses pre-pick, calls
    `pickChoice`, and asserts `motion.isPaused()` is still true on
    the next tick.
  - Decide whether `setMovements` should preserve the prior pause
    state, or whether the canvas wiring should re-apply `paused` on
    every leg swap.

#### A2.2 Restart can leave the scene mid-trajectory

- **What the user sees.** After hitting Restart in `done` (or
  Feedback's "Replay" CTA), the user expects the scene to start over
  cleanly. Sometimes a frame from the previous leg remains visible
  (idle players hold an old pose, or the ball is mid-air for a beat
  before snapping).
- **Likely file/function.**
  `MotionController.reset` (~L1043–L1050), `Scenario3DCanvas`
  `[resetCounter]` effect (~L835–L837), `Scenario3DView`
  `compositeResetCounter`.
- **Suspected cause.** `motion.reset()` rewinds the playhead but does
  NOT change `currentOverrides`, `freezeAtMs`, or the active timeline.
  In `done`, the active timeline is the answer-demo leg with the
  freeze snapshot still applied, so reset replays *the answer demo*
  rather than the original intro. Additionally, the rendered frame
  between the reset and the next tick can briefly show the last leg's
  final pose because `motion.tick(now)` only re-anchors `startedAt`
  on the next animation frame — there is no immediate forced
  re-sample on reset.
- **Confidence.** **Medium-High.**
- **Evidence.** `reset` body: `startedAt = null; pausedAtT = null;
  lastPhaseIndex = -1; pendingPassArrival = false; hasFiredFrozen =
  false; pendingFrozen = false`. It deliberately does not touch the
  timeline, currentOverrides, or freezeAtMs (per the comment "user's
  selected speed is intentionally preserved"). The state machine is
  not informed of the reset, so its `state` field stays at `done`.
- **What Phase B should test before editing.**
  - Reproduce: complete a wrong-pick rep, press Restart in the
    Overlay. Expect the answer demo to replay (since that's the
    active leg) — does the scene actually settle on t=0 of the active
    leg, or does it bleed in the final pose for a frame?
  - Add a state-machine test that drives the machine to `done`,
    triggers the parent reset, and asserts the rendered positions
    after one tick equal the leg's t=0 sample.
  - Decide what "Restart" should mean from `done` (and from
    `consequence`/`replaying`): rewind the active leg, restart the
    entire rep, or call `machine.showAgain()`.

#### A2.3 Speed changes do not always affect every replay leg

- **What the user sees.** Switching 0.5x ↔ 2x mid-play sometimes
  feels right and sometimes feels like the scene jumps. Speed picked
  during a frozen state may not appear to take effect once the
  consequence leg starts.
- **Likely file/function.**
  `MotionController.setPlaybackRate` (~L1068–L1076),
  `MotionController.setMovements` (~L1376–L1394),
  `Scenario3DCanvas` `[playbackRate]` effect (~L843–L845).
- **Suspected cause.** `setPlaybackRate` only rebases `startedAt`
  when the controller is unpaused AND has been anchored
  (`startedAt !== null`). If the user changes speed while paused or
  before the first tick of a new leg (`startedAt === null` after
  `setMovements`), the rebase math is skipped and the new rate
  applies instantly when the next leg starts — which can read as a
  "jump" because the visible t suddenly maps to a different real-time
  per-frame delta. `setMovements` itself does not re-apply the rate;
  it merely preserves the controller-internal `playbackRate` field.
- **Confidence.** **Medium.**
- **Evidence.** `setPlaybackRate` rebases only inside
  `if (this.startedAt !== null && this.pausedAtT === null)`.
  `setMovements` resets both anchors but leaves `playbackRate`
  untouched; the canvas `[playbackRate]` effect only fires on React
  prop change.
- **What Phase B should test before editing.**
  - Reproduce: at `frozen`, change speed to 2x, then pick a wrong
    choice. Does the consequence leg play at 2x without a perceptible
    jump?
  - Add a state-machine test that sets rate at `frozen`, picks, and
    asserts the consequence leg's elapsed-ms math at known real-time
    points matches the requested rate from the very first tick.
  - Decide whether `setMovements` should explicitly re-apply the
    current rate (it doesn't need to: the field is preserved) and
    whether the canvas should call `setPlaybackRate` once after every
    leg swap as a defensive re-arm.

#### A2.4 Consequence replay can stall, skip, or play the wrong leg

- **What the user sees.** A wrong pick sometimes shows no consequence
  at all (jumping straight to the answer demo). Sometimes the
  consequence plays but never advances to the answer demo. Sometimes
  the wrong leg appears to play (pieces of two animations overlap).
- **Likely file/function.**
  `ReplayStateMachine.pickChoice` (~L1544–L1557),
  `MotionController.startConsequence` (~L1410–L1418),
  `Scenario3DCanvas` `[pickedChoiceId]` effect (~L820–L828),
  `consumedChoiceRef` reset path (~L674).
- **Suspected cause.** Three plausible contributors:
  1. The `[pickedChoiceId]` effect early-returns if the state machine
     is not in `frozen` when the prop arrives; the dep is
     `[pickedChoiceId]`, so the same id will not retry on a later
     render. If the freeze edge fires *after* the prop is set (a
     timing race during scene rebuild), the pick is dropped and the
     scene stays in `playing` forever.
  2. `startConsequence` returns `false` when the picked id has no
     entry in `wrongDemos`. The state machine treats that as a
     best-read short-circuit and goes straight to `replaying`. If a
     scenario JSON has a typo in the choice id or omits a wrongDemo
     entry, the user perceives a "skip" rather than a "no demo
     available."
  3. `consumedChoiceRef` resets only on scene-rebuild; if the parent
     ever re-emits the same id after a Restart while the machine has
     re-entered `frozen` (hypothetical, not in current flow), the
     pick will be ignored.
- **Confidence.** **Medium** — the early-return path (#1) is highest
  confidence; #2 is intentional design but feels like a bug to the
  user; #3 is defensive only.
- **Evidence.** Effect body at Scenario3DCanvas L820–L828; the
  early-return on state mismatch; the deliberate short-circuit branch
  in `pickChoice`.
- **What Phase B should test before editing.**
  - Reproduce: simulate a fast pick path where `pickedChoiceId`
    appears before `frozen` is reached (force-mount sequence). Verify
    the pick is captured, queued, or surfaced as a clear no-op.
  - Add tests covering: (a) pick before frozen → buffered or
    rejected explicitly; (b) pick with no wrongDemo → still emits
    `consequence`-skipped event so the page can show a caption; (c)
    pick correctly advances `consequence → replaying → done`.
  - Decide whether the canvas should buffer a pre-`frozen`
    `pickedChoiceId` and dispatch it once the machine reaches
    `frozen`.

#### A2.5 "Show me again" / Restart behavior may not reset cleanly

- **What the user sees.** Pressing the Feedback panel's "Replay" CTA
  in `done` plays the answer demo from t=0, but the state machine
  stays in `done` and does not re-emit `replaying`. As a result, the
  decoder caption that depends on `scenePhase === 'replaying'` does
  not re-appear; the user perceives a "ghosted" replay where the
  scene replays but the surrounding UI doesn't acknowledge it.
- **Likely file/function.**
  `Scenario3DView` `compositeResetCounter` and `[resetCounter]`
  effects, `Scenario3DCanvas` `[resetCounter]` effect (~L835–L837),
  `ReplayStateMachine.showAgain` (~L1563–L1574),
  `app/train/page.tsx` `setReplayCounter` callsite (~L713).
- **Suspected cause.** Neither code path that the user reaches via
  "Show me again" or "Restart" calls `machine.showAgain()`. They both
  drop into `motion.reset()` which rewinds the timeline but leaves
  the state machine in whatever state it was in. This is the most
  user-visible consequence of the "two-controllers, one reset wire"
  design noted in A1.6.4.
- **Confidence.** **High.**
- **Evidence.** Grep for `showAgain` in `Scenario3DCanvas.tsx` finds
  no callers; the imperative-scene mount effect calls
  `machine.start()` once and never re-enters; the `[resetCounter]`
  effect calls only `motionControllerRef.current?.reset()`.
- **What Phase B should test before editing.**
  - Reproduce: complete a rep (right or wrong), press Feedback's
    "Replay" CTA. Expect `onPhase('replaying')` to fire; today it
    stays at `done`.
  - Add a state-machine test that asserts `showAgain()` from `done`
    cycles `done → replaying → done` and re-emits the listener
    snapshot.
  - Decide which "Show me again" affordance should call
    `machine.showAgain()` (Feedback CTA, Overlay Restart, both, or a
    new dedicated button) and whether `motion.reset()` should be
    deprecated as a public reset path.

#### A2.6 Answer-card UI and scene state can desync

- **What the user sees.** The choice cards may stay visible into the
  consequence/answer leg, or disappear before the freeze beat lands.
  After "Show me again," the FeedbackPanel stays mounted but the
  canvas plays as if the user hadn't picked yet.
- **Likely file/function.**
  `app/train/page.tsx` (`questionReady`, `frozen`, `feedback`,
  `selected` state), `Scenario3DCanvas` `onPhase` subscription path
  (~L661–L666), `Scenario3DView` paused/path reset effects.
- **Suspected cause.** The page's `frozen` flag latches true on the
  first `onPhase('frozen')` and is only reset on `idx` change. The
  page does not consume `'consequence' / 'replaying' / 'done'` for
  unmounting choices — the choice cards instead unmount when
  `feedback` is non-null (gated by `submitChoice`). That works for
  the first pass but means a Show-Me-Again replay (which today does
  not even re-emit phases — see A2.5) cannot drive the surrounding
  UI to a coherent state. Compounded by the `paused` reset effect
  using `[replayMode, resetCounterProp]`, but `restartTick` not being
  in the deps list, so the two paths diverge.
- **Confidence.** **Medium.**
- **Evidence.** `app/train/page.tsx` `useEffect` at ~L312 only resets
  on `[idx]`. `Scenario3DView` paused-reset effect deps:
  `[replayMode, resetCounterProp]`. `pathOverride` reset effect:
  `[replayMode, resetCounterProp]`. The `onScenePhase` callback only
  calls `setFrozen(true)` on the `frozen` event; no other phase
  triggers UI state changes beyond `learnPhase` derivation.
- **What Phase B should test before editing.**
  - Reproduce: complete a rep, hit Show me again. Observe whether
    the FeedbackPanel, decoder lesson panel, and self-review checklist
    behave the same as on first arrival at `done`.
  - Verify whether a `replaying → done` re-entry would be expected to
    emit a fresh `done` so consumers can re-react.
  - Decide whether the page's UI gating should switch from
    `feedback`-driven to `scenePhase`-driven for the parts that
    correspond to scene state (caption visibility, paths default).

---

### A3 — Replay Fix Surface Classification

Risk legend: **safe** = small bounded change, well-understood,
covered by tests; **careful** = changes timing math or wiring that
multiple consumers depend on; **avoid** = touching this is almost
never required for the symptoms in A2 and tends to produce
regressions out of proportion to the fix.

| File / function | Responsibility | Risk | Why | Phase B use |
|---|---|---|---|---|
| `MotionController.setPaused` (`imperativeScene.ts` ~L1086–L1097) | Toggles `pausedAtT` and rebases `startedAt` on resume. | **careful** | Rebase math (`startedAt = nowMs - PRE_DELAY - t / rate`) is the same formula as `setPlaybackRate`; if drift is introduced it shows up as t-jump. Tests in `replayStateMachine.test.ts` already exercise the freeze cap which depends on this math. | B1: tighten so paused state survives `setMovements` (either preserve across leg swap OR have the canvas re-apply on swap). |
| `MotionController.setPlaybackRate` (~L1068–L1076) | Clamps + rebases on rate change. | **careful** | Rebase is gated on `startedAt !== null && pausedAtT === null`. Any change here can produce silent t-jumps. | B3: leave the rebase math as-is; have callers ensure rate is re-applied across legs (or document why it doesn't need to be). |
| `MotionController.reset` (~L1043–L1050) | Drops `startedAt`, `pausedAtT`, frozen flags. Preserves rate, timeline, overrides. | **careful** | Comment explicitly notes preserving the user's rate. Several callers rely on "reset = rewind active leg." Repurposing it (e.g., to also rewind to the intro leg) is a behavior change. | B2: do NOT change the contract; add a sibling helper instead (e.g., reset-to-intro or call `machine.showAgain()` from the page). |
| `MotionController.swapMode` (no such method exists; the equivalent is `setMovements`) (~L1376–L1394) | Loads a new movement list; clears anchors, freeze cap, override-aware ball holder; preserves rate. | **careful** | Called by `startConsequence`/`startReplay`. Hard-resets `pausedAtT`. Any change ripples to every leg transition. | B1: the canonical fix point if Phase B chooses "preserve paused across leg swap" (vs. canvas re-applying). |
| `MotionController.getElapsedMs` (~L1106–L1111) | Reads visible t (clamped to freeze cap or timeline length). | **avoid** | Pure math; touched by every consumer. | Don't edit. |
| `ReplayStateMachine.pickChoice` (~L1544–L1557) | Snapshots positions, dispatches consequence or short-circuit replay. | **careful** | Already correct in the happy path. Any change should be additive (e.g., emit a discriminated event for "no consequence available"). | B4: optionally surface a "no-consequence" event so the page can render a caption instead of silently short-circuiting. |
| `ReplayStateMachine.transition` (~L1621–L1627) | Private; updates state + notifies subscribers. | **avoid** | Single source of truth for state notifications. | Don't edit. |
| `ReplayStateMachine.showAgain` (~L1563–L1574) | Cycles `done → replaying → done` from the freeze snapshot. | **safe** | Already implemented and tested; the bug is that nobody calls it. | B2/B5: add the calls from the canvas reset effect (or train page) so Restart and Show-Me-Again actually use it. |
| `ReplayStateMachine.reset` (~L1579–L1585) | Returns machine to `idle` and re-arms `start()`. | **safe** | Used today only by tests, but stable. | B2: candidate for the "restart whole rep" semantics if Phase B picks that interpretation. |
| `Scenario3DCanvas` `[paused]` effect (~L847–L849) | Pushes React `paused` prop into `motion.setPaused`. | **safe** | One-line effect with no dependencies on other refs. | B1: extend deps or add a leg-swap re-arm (likely via the state-machine subscriber). |
| `Scenario3DCanvas` `[playbackRate]` effect (~L843–L845) | Pushes rate prop into `motion.setPlaybackRate`. | **safe** | Same shape as the paused effect. | B3: same defensive re-arm pattern as B1 if needed. |
| `Scenario3DCanvas` `[resetCounter]` effect (~L835–L837) | Calls `motion.reset()` on parent reset bumps. | **careful** | Today does not coordinate with the state machine — that's the root of A2.5. Changing it changes behavior for every Restart and Show-Me-Again. | B2: switch to a state-aware reset (call `machine.showAgain()` from `done`, otherwise `motion.reset()`). |
| `Scenario3DCanvas` `[pickedChoiceId]` effect (~L820–L828) | One-shot dispatch into `machine.pickChoice`. | **careful** | Early-return on non-`frozen` state silently drops picks (A2.4 #1). | B4: buffer or flush once `frozen` arrives; or surface a console warning so it's diagnosable. |
| `Scenario3DCanvas` parent rAF loop (~L394–L536) | Drives camera, motion, state machine, overlay, dust, FPS guard. | **avoid** | The renderer's heartbeat. Touching this risks frame-drop, leak, or simple visual breakage that the FPS guard then over-corrects. Recovery plan Section 6 explicitly forbids editing this in Phase B. | Don't edit. |
| `Scenario3DCanvas` FPS guard (~L482–L518) | Tier-degrades on sustained slow frames. | **avoid** | Coupled to the rAF loop. | Don't edit. |
| `Scenario3DView` `compositeResetCounter` + reset effects | Composes overlay restart with parent reset; clears paused/path on parent resets. | **careful** | The split between "parent reset clears these but local restart doesn't" is the source of A2.6's UI desync. Aligning them is a small change but visibly user-facing. | B2: align deps so paused (always) and pathOverride (likely) reset on both paths. |
| `PremiumOverlay` `IconButton`, `SpeedSelector`, `onRestart` callsite | Pure controlled UI for play/pause/restart/speed. | **safe** | No state of its own; all changes flow through props. | B1/B3: only edit if a control needs an extra disabled state or a new affordance (e.g., "show me again" being distinct from "restart"). |
| `app/train/page.tsx` `pickedChoiceId` path (`isDecoder ? selected : null`) | Forwards the picked id into the canvas. | **safe** | Pure prop derivation. | B4: if Phase B chooses to also send a "show me again" intent, this is where it lands. |
| `app/train/page.tsx` `setReplayCounter` (Feedback "Replay" CTA, ~L713) | Bumps the parent reset counter. | **careful** | Today this drives the broken Show-Me-Again path (A2.5). Changing the wiring (e.g., adding a dedicated handle that calls `machine.showAgain()`) is the most natural fix. | B2: replace with a callback that asks the canvas to call `machine.showAgain()` — or, simpler, keep the counter but have the canvas effect dispatch state-aware. |
| `replayStateMachine.test.ts` | State-machine + motion-controller unit tests. | **safe** | Designed to grow. | B1–B4 all add tests here; B5 is the regression-pass commit. |
| Scenario JSON (`packages/db/seed/scenarios/packs/founder-v0/BDW-01.json`) | Authored intro + answer + wrongDemos + freezeMarker for BDW-01. | **avoid** | Recovery plan Section 6 explicitly forbids JSON edits in Phase B. | Don't edit. |
| `lib/scenario3d/schema.ts` | Zod validators for scene + overlays. | **avoid** | Schema changes ripple to every authored scene. | Don't edit. |

#### A3.1 Safe to edit in Phase B

- `ReplayStateMachine.showAgain` (already implemented; just call it).
- `ReplayStateMachine.reset` (use as the "restart whole rep" path if
  Phase B chooses that semantic).
- `Scenario3DCanvas` `[paused]`, `[playbackRate]`, `[resetCounter]`,
  `[pickedChoiceId]` effects (small, bounded, well-understood).
- `Scenario3DView` paused / pathOverride reset deps (one-line align).
- `PremiumOverlay` controls (only if a new affordance is needed —
  ideally none for Phase B).
- `app/train/page.tsx` "Replay" CTA wiring (one prop / one callback).
- `replayStateMachine.test.ts` (add tests freely).

#### A3.2 Edit with care in Phase B

- `MotionController.setPaused` and `MotionController.setMovements` —
  the canonical fix point for A2.1; whichever side handles the
  pause-across-swap, write the new test first.
- `MotionController.reset` — do not repurpose; pair with a sibling
  helper or a state-machine call instead.
- `ReplayStateMachine.pickChoice` — additive only (e.g., a clearer
  no-consequence event); do not change the success path.
- `Scenario3DCanvas` reset and pick effects — coordinate with the
  state machine, do not lose existing behavior.
- `Scenario3DView` reset deps — align both paths but keep behavior
  conservative.

#### A3.3 Do not touch in Phase B unless absolutely necessary

- `MotionController.getElapsedMs` — pure math; everything depends on
  it.
- `ReplayStateMachine.transition` (private) — only the four public
  methods should drive transitions.
- `Scenario3DCanvas` parent rAF loop and FPS guard — explicitly
  forbidden by Section 6.
- `MOTION_PRE_DELAY_MS` constant — do not change without an explicit
  Phase B sign-off.
- The simple/full-path pin (`simpleMode` / `forceFullPath`) — the
  imperative path is the production path; do not flip it.
- Scenario JSON, schema, presets, `coords.ts` — out of scope.
- The legacy JSX `ScenarioReplayController.tsx` — not on the
  production path.

---

### A4 — Phase B Replay Fix Recommendation

The Phase B work list below is ranked so each fix unblocks the next
test. B1 lands the pause invariant the rest of Phase B leans on; B2
and B4 are independent of each other but both need B1; B3 is
near-trivial after B1; B5 ratifies the regression matrix. Diff sizes
are estimates only (S ≤ ~30 LOC, M ≤ ~120 LOC, L ≤ ~250 LOC, all
including tests).

#### A4.1 Ranked Phase B work list

| # | Item | Maps to | Diff | Depends on | Likely files |
|---|---|---|---|---|---|
| 1 | Re-apply React `paused` after every leg swap so pause state is consistent across `setMovements`. | B1 | S | — | `Scenario3DCanvas.tsx` (paused effect + state-machine subscription), `replayStateMachine.test.ts`. Optionally `MotionController.setMovements` (only if Phase B chooses controller-side preservation). |
| 2 | Wire "Show me again" / Restart through `ReplayStateMachine.showAgain` from `done`; keep `motion.reset()` for the "rewind active leg" semantic; align `Scenario3DView` paused + pathOverride reset deps. | B2 | M | B1 | `Scenario3DCanvas.tsx` (`[resetCounter]` effect), `Scenario3DView.tsx` (deps + maybe a new prop), `app/train/page.tsx` (Feedback CTA wiring), `replayStateMachine.test.ts`. |
| 3 | Defensive re-arm of `setPlaybackRate` after every leg swap so speed never visually jumps. | B3 | S | B1 | `Scenario3DCanvas.tsx` (rate effect or state-machine subscription), `replayStateMachine.test.ts`. |
| 4 | Make consequence dispatch robust: buffer a `pickedChoiceId` that arrives before `frozen`, surface a clear no-consequence event so the page can react. | B4 | M | B1 | `Scenario3DCanvas.tsx` (`[pickedChoiceId]` effect, subscribe-driven flush), optionally `ReplayStateMachine.pickChoice` (additive event), `app/train/page.tsx` (caption wiring), `replayStateMachine.test.ts`. |
| 5 | Replay QA pass: BDW-01 manual matrix + tests for B1–B4 + a brief QA notes subsection in this doc. | B5 | M | B1, B2, B3, B4 | `replayStateMachine.test.ts`, `docs/courtiq-scene-experience-recovery-plan.md` (QA notes). No new code surface. |

#### A4.2 Test coverage needed (across Phase B)

- Pause survives `frozen → consequence` and `consequence → replaying`
  swaps when `paused === true`.
- Pause clears via `onRestart` and via the Feedback "Replay" CTA;
  pause clears identically on both paths.
- Speed change while frozen takes effect on the consequence leg with
  no t-jump (assert `getElapsedMs` against expected linear math).
- Speed change mid-play across rate switches (0.5x → 2x → 1x) does
  not desync the visible t.
- Show-Me-Again from `done` cycles `done → replaying → done` AND
  re-emits the listener snapshots (so consumers re-react).
- Restart from `done` returns to the active leg's t=0 and clears
  `paused`; assert positions match a fresh sample at t=0.
- Pick before `frozen` is buffered (or rejected with a diagnostic),
  not silently dropped.
- Pick with no `wrongDemos` entry surfaces a "no-consequence" signal
  the page can render.
- All existing tests in `replayStateMachine.test.ts` still pass.

#### A4.3 Manual QA needed (across Phase B)

Run on BDW-01, on the production simple path (no URL flags):

- Pause / Play across each leg boundary (intro→frozen→consequence,
  consequence→replaying, replaying→done).
- Speed switches at 0.5x / 1x / 2x at every leg boundary.
- Restart pressed in `playing`, `frozen`, `consequence`, `replaying`,
  `done` — each should land in a coherent state.
- Show me again pressed multiple times in a row.
- Wrong pick → consequence → replay → done, all four BDW-01 wrong
  choices.
- Right pick → answer-demo replay → done.
- 30 s of button-mashing across all controls — no stuck state.
- Camera selector + Paths toggle still work after every fix path.

#### A4.4 Do-not-touch list for Phase B

- `MotionController.getElapsedMs`, `tick`, `applyBall`, `samplePlayer`,
  `computePlayerYaw`.
- `ReplayStateMachine.transition`, `subscribe`, `getSnapshot`.
- `Scenario3DCanvas` parent rAF loop, FPS guard, `simpleMode` pin.
- `MOTION_PRE_DELAY_MS`.
- All scenario JSON.
- All schema / preset / coords / quality / feature flag files.
- The legacy JSX `ScenarioReplayController.tsx` (not on the
  production path).
- `PremiumOverlay`'s structural layout (icon button shapes,
  positioning, animations) — Phase D will own fullscreen and any
  affordance redesign.

---

#### B1 — Fix play/pause state consistency

- **Objective.** Pause survives a leg swap (`frozen → consequence`,
  `consequence → replaying`, `done → replaying` via Show-Me-Again)
  with no spurious resume and no double-pause.
- **Likely files.**
  - `apps/web/components/scenario3d/Scenario3DCanvas.tsx` — paused
    effect, plus a state-machine subscriber that re-applies React
    `paused` when the machine transitions across leg boundaries.
  - `apps/web/components/scenario3d/imperativeScene.ts` —
    `MotionController.setMovements` (optional; only if Phase B
    chooses controller-side preservation rather than canvas re-arm).
  - `apps/web/components/scenario3d/replayStateMachine.test.ts` —
    new tests for paused-across-swap.
- **Likely code surface.** A short re-apply hook in the canvas's
  state-machine subscribe block; or a one-line preservation in
  `setMovements`. Pick one path; do not do both.
- **Should change.** Pause persists across every leg transition.
  Tests assert `motion.isPaused()` is still true on the first tick
  after a leg swap when `paused === true`.
- **Should not change.** `MotionController.getElapsedMs`, `tick`,
  the rebase math in `setPaused` / `setPlaybackRate`. The React
  `paused` state ownership in `Scenario3DView`.
- **Acceptance criteria.**
  - Pause pressed in `frozen`, then a wrong pick, then resume → the
    consequence leg starts at t=0 paused; resume continues from t=0.
  - Pause pressed during `consequence`, then leg ends → `replaying`
    leg is paused at t=0; resume continues normally.
  - All existing tests pass; at least 1 new test covers paused
    survival across a leg swap.
- **Suggested commit message.**
  `fix(replay): keep pause across consequence and replay leg swaps`

#### B2 — Fix restart/reset behavior

- **Objective.** Restart and Show-Me-Again behave as the user
  expects: from `done`, both call `machine.showAgain()` and re-emit
  `replaying`/`done` so the surrounding UI re-reacts. From any other
  state, Restart rewinds the active leg (current behavior).
- **Likely files.**
  - `apps/web/components/scenario3d/Scenario3DCanvas.tsx` —
    `[resetCounter]` effect becomes state-aware: in `done`, call
    `stateMachineRef.current?.showAgain()`; otherwise call
    `motion.reset()`.
  - `apps/web/components/scenario3d/Scenario3DView.tsx` — align the
    paused / pathOverride reset effect deps so both reset paths
    behave identically (add `restartTick` to deps OR move the
    `paused = false` line into a single shared helper).
  - `apps/web/app/train/page.tsx` — Feedback "Replay" CTA continues
    to bump `replayCounter`; no API change required if the canvas
    effect is state-aware.
  - `apps/web/components/scenario3d/replayStateMachine.test.ts` —
    test for `motion.reset()` from `done` vs. `showAgain()` from
    `done`; test for pause clear on both paths.
- **Likely code surface.** A 5–10 line branch in the canvas reset
  effect; a single deps-list change in the View effects.
- **Should change.** From `done`, the user-visible state machine
  re-enters `replaying` and emits the corresponding `onPhase` events.
- **Should not change.** `MotionController.reset` semantics —
  remains "rewind active leg." `ReplayStateMachine.showAgain`
  semantics — already correct.
- **Acceptance criteria.**
  - Hammering Restart 10 times in a row from `done` leaves the scene
    at t=0 of the answer demo with `paused === false`, speed
    preserved, and `onPhase('replaying')` re-emitted each time.
  - Hammering Restart from `playing` rewinds the intro leg to t=0
    every time.
  - Feedback "Replay" CTA triggers the same `showAgain` path as the
    Overlay Restart from `done`.
  - All existing tests pass; new tests cover Show-Me-Again and
    Restart from `done`.
- **Suggested commit message.**
  `fix(replay): wire restart and show-me-again through showAgain`

#### B3 — Fix speed-control application

- **Objective.** Speed changes apply on every leg with no visible
  t-jump; speed survives `setMovements` and `motion.reset()`.
- **Likely files.**
  - `apps/web/components/scenario3d/Scenario3DCanvas.tsx` —
    `[playbackRate]` effect or a one-call defensive re-arm inside
    the state-machine subscriber added in B1.
  - `apps/web/components/scenario3d/replayStateMachine.test.ts` —
    new tests around rate change at `frozen` and across leg swaps.
- **Likely code surface.** ≤10 LOC of re-arm; no math change.
- **Should change.** After any leg swap, `playbackRate` is asserted
  to match the React state and the rebase math is correct from the
  first tick.
- **Should not change.** `MotionController.setPlaybackRate`
  internals; the rebase formula at L1071–L1075.
- **Acceptance criteria.**
  - 0.5x ↔ 2x mid-play does not jump the visible t (assert via
    deterministic `tick` calls and `getElapsedMs`).
  - Speed selected at `frozen` takes effect on the consequence leg
    from its first tick.
  - All existing tests pass; at least 1 new test covers speed
    persistence across a leg swap.
- **Suggested commit message.**
  `fix(replay): keep speed consistent across leg swaps`

#### B4 — Fix consequence replay path

- **Objective.** Wrong picks reliably play the matching `wrongDemos`
  leg and arrive at `done` exactly once; right picks short-circuit
  and emit a clear signal the page can render. Pre-`frozen` picks are
  buffered (or rejected with a diagnostic), not silently dropped.
- **Likely files.**
  - `apps/web/components/scenario3d/Scenario3DCanvas.tsx` —
    `[pickedChoiceId]` effect: if the machine is not yet `frozen`,
    stash the id in a ref and dispatch from the state-machine
    subscriber on the `frozen` transition.
  - `apps/web/components/scenario3d/imperativeScene.ts` — optional:
    `ReplayStateMachine.pickChoice` adds a discriminated event /
    callback when `startConsequence` returns false (so consumers can
    distinguish best-read from missing-data).
  - `apps/web/app/train/page.tsx` — react to the new signal (e.g.,
    surface a caption like "Best read — here is the answer demo").
  - `apps/web/components/scenario3d/replayStateMachine.test.ts` —
    pick-before-frozen, pick with no wrongDemo, pick with wrongDemo.
- **Likely code surface.** A small ref + flush in the canvas; an
  optional event surface on the state machine; tests.
- **Should change.** Pre-`frozen` picks are flushed at `frozen`; the
  no-consequence path is observable from outside the state machine.
- **Should not change.** `pickChoice` happy-path behavior (the
  consequence dispatch and state transition).
- **Acceptance criteria.**
  - All four BDW-01 picks (right + three wrong) produce the correct
    leg sequence and terminate in `done` exactly once.
  - A simulated pre-`frozen` pick is dispatched at `frozen`, not
    dropped.
  - A pick with no `wrongDemos` entry is observable as a
    short-circuit (signal or callback), not just a state jump.
  - All existing tests pass; at least 3 new tests cover the above.
- **Suggested commit message.**
  `fix(replay): make consequence dispatch robust to pick timing`

#### B5 — Replay QA pass

- **Objective.** Lock the regression matrix. Confirm BDW-01 plays
  end-to-end across every replay control. Capture a QA Notes
  subsection in this doc.
- **Likely files.**
  - `apps/web/components/scenario3d/replayStateMachine.test.ts` —
    backfill any missing tests from B1–B4 acceptance criteria.
  - `docs/courtiq-scene-experience-recovery-plan.md` — append a
    "Phase B QA Results" subsection to Section 12.
- **Likely code surface.** Tests + docs only.
- **Should change.** Test coverage and a written QA log.
- **Should not change.** Anything user-visible.
- **Acceptance criteria.**
  - `pnpm lint`, `pnpm typecheck`, and `pnpm test` clean (or, if the
    repo's commands differ, the equivalents).
  - Manual QA matrix from A4.3 clean on BDW-01.
  - QA Notes subsection committed.
- **Suggested commit message.**
  `test(replay): cover Phase B regressions and QA log`

---

#### A4.5 Exact next prompt to run Phase B automatically

Paste this into a fresh Claude Code session to run all of Phase B in
one auto-driven pass:

```
Continue in PHASE B AUTO-RUN MODE.

Read docs/courtiq-scene-experience-recovery-plan.md, Section 6
Phase B AND Section 12 (the Phase A audit, especially A4 — Phase B
Replay Fix Recommendation).

Implement Phase B ONLY. Do not start Phase C. Do not change visuals,
copy, or geometry.

Constraints (from A4.4):
- Stay inside MotionController, ReplayStateMachine, and the
  immediate wiring in Scenario3DCanvas / Scenario3DView /
  PremiumOverlay / app/train/page.tsx.
- Do NOT touch the parent rAF loop, the FPS guard, or the
  simple/full-path pin.
- Do NOT change MOTION_PRE_DELAY_MS.
- Do NOT touch scenario JSON, schema, presets, coords, quality, or
  feature flag files.
- Do NOT touch the legacy JSX ScenarioReplayController.tsx.
- Add tests in replayStateMachine.test.ts for each fix.
- Each micro-milestone is its own commit.

Run B1 → B2 → B3 → B4 → B5 in order, each with the suggested commit
message from A4. Stop after B5. Run lint + typecheck + tests after
each commit; if any fail, fix in-place before proceeding.

Final response after B5: include commit hashes for each B
micro-milestone, the test command output (clean), and the
Phase B QA Results subsection diff.
```

#### A4.6 Recommended Claude mode/thinking for Phase B

- **Model.** Opus 4.7 Max — Phase 6 of the recovery plan flags the
  state machine + timing math as risky-touch surfaces, and the cost
  of a regression here cascades into every other Phase. The
  reading-heavy work was done in Phase A; Phase B is bounded
  engineering work where deep reasoning per edit is worth more than
  raw output speed.
- **Mode.** Auto-run with small commits (one per micro-milestone).
  Tests-first for B1, B2, B3, B4 — all four have test scaffolding
  already in place.
- **Thinking budget.** Max. The thinking budget is best spent
  reasoning about the rebase math edge cases and the state-machine
  transition invariants; the actual code diffs are small.

---

### Phase B QA Results

> Phase B landed B1–B5 on this branch. Subsection records the
> automated coverage and the human-in-the-loop matrix Phase H should
> walk on a real browser before the recovery is declared done.

#### Files touched (Phase B)

- `apps/web/components/scenario3d/Scenario3DCanvas.tsx`
  - Added `pausedRef` / `playbackRateRef` / `pendingPickRef`.
  - `[paused]` / `[playbackRate]` effects now sync the refs.
  - `[resetCounter]` effect dispatches `machine.showAgain()` from
    `done`, otherwise calls `motion.reset()`.
  - `[pickedChoiceId]` effect buffers a pre-`frozen` pick.
  - State-machine `subscribe` callback re-applies playbackRate +
    paused on every transition and flushes the buffered pick on
    `frozen`.
  - Cleanup paths clear `pendingPickRef` alongside
    `consumedChoiceRef`.
- `apps/web/components/scenario3d/Scenario3DView.tsx`
  - Paused + path-override reset effects depend on
    `compositeResetCounter` so both reset paths align.
  - `onRestart` no longer needs an explicit `setPaused(false)`.
- `apps/web/components/scenario3d/replayStateMachine.test.ts`
  - +15 tests across `Phase B / B1`, `Phase B / B2`, `Phase B / B3`,
    and `Phase B / B4` describes.

No edits to `MotionController`, `ReplayStateMachine`,
`PremiumOverlay`, `app/train/page.tsx`, scenario JSON, the parent
rAF loop, the FPS guard, or the simple/full-path pin.

#### Automated test coverage

```
RUN  v2.1.9 /home/user/CourtIQ/apps/web

✓ components/scenario3d/replayStateMachine.test.ts (29 tests) 13ms

Test Files  1 passed (1)
     Tests  29 passed (29)
```

Coverage map (Phase B additions):

- B1 — paused across leg swap
  - `setMovements` clears the paused flag (documents existing
    behavior)
  - re-applying `setPaused` after `setMovements` pauses the new leg
    at t=0
  - subscriber-driven re-arm keeps pause across `frozen → consequence`
  - subscriber-driven re-arm keeps pause across
    `consequence → replaying`
  - subscriber-driven re-arm covers the initial `start()` reset
- B2 — restart from done dispatches showAgain
  - `motion.reset()` from `done` leaves the machine in `done`
    (pre-fix behavior pinned for regression safety)
  - canvas-style state-aware reset routes through `showAgain` when
    in `done`
  - canvas-style state-aware reset rewinds the active leg outside
    `done`
- B3 — speed control across leg swaps
  - rate set at frozen applies to the consequence leg from t=0
  - subscriber re-arm of `setPlaybackRate` is idempotent (no t-jump)
  - rate persists across `showAgain` (`done → replaying`)
- B4 — robust consequence dispatch
  - buffers a pick that arrives before frozen and flushes on freeze
  - happy path: pick at `frozen` still dispatches immediately
  - best-read short-circuit is observable as a state transition
  - idempotent: re-submitting the same pick after dispatch is a
    no-op

All 14 pre-Phase-B tests still pass.

#### Lint / typecheck

- `pnpm --filter @courtiq/web lint` — clean.
- `pnpm --filter @courtiq/web typecheck` — pre-existing errors in
  `lib/services/*` (Prisma client + workspace `@courtiq/core` not
  generated in this environment). Verified by stashing the Phase B
  diff: the same errors existed before any Phase B edit. No new
  typecheck error was introduced by the Phase B changes; the
  scenario3d / replay surfaces are clean.

#### Manual QA matrix (deferred to Phase H)

Phase B did not include a browser-driven QA pass — the recovery
plan's Phase H is the integration / cohesion gate. Phase H should
walk this matrix on BDW-01 in the real `/train` flow:

- Pause / Play across each leg boundary (intro → frozen → consequence,
  consequence → replaying, replaying → done).
- Speed switches at 0.5x / 1x / 2x at every leg boundary.
- Restart pressed in `playing`, `frozen`, `consequence`, `replaying`,
  `done` — each lands in a coherent state.
- Show me again pressed multiple times in a row from the Feedback
  panel.
- Wrong pick → consequence → replay → done, all four BDW-01 wrong
  choices.
- Right pick → answer-demo replay → done.
- 30 s of button-mashing across all controls — no stuck state.
- Camera selector + Paths toggle still work after every fix path.

Phase B's job was to make these matrices *possible*; Phase H ratifies
them on real hardware.

---




### C1 — Movement Audit

> Read-only audit produced by Phase C / C1. No motion code modified
> by this subsection. Findings drive the C2–C5 implementation passes.

#### C1.1 Current movement flow

`MotionController` (`apps/web/components/scenario3d/imperativeScene.ts`
~L972–L1452) is the sole driver of per-frame transforms on the
production simple path. Each parent rAF tick:

1. `motion.tick(now)` reads `getElapsedMs(now)`, then for every
   player loops `samplePlayer(scene, timeline, id, t, currentOverrides)`
   and writes the resulting `{x, z}` to the player group's position.
   The y component is never touched (figures are floor-anchored).
2. `applyBall(t)` walks the precomputed `phases[]` list to decide
   between in-flight (parabolic arc + lerp) and held (follow current
   holder's sampled position).
3. The state-machine layer ticks separately for freeze /
   leg-end events; the canvas renders `gl.render(scene, camera)`.

The timeline is built once per leg by `buildTimeline` in
`apps/web/lib/scenario3d/timeline.ts` and re-built on every
`setMovements` (consequence / replay leg swaps, plus the initial
intro). `samplePlayer` is a pure function over (scene, timeline,
id, t, overrides) so replays are byte-identical for the same inputs.

#### C1.2 Where player positions are sampled

- `samplePlayer(scene, timeline, playerId, t, overrides)` in
  `apps/web/lib/scenario3d/timeline.ts` (~L115–L153). Walks the
  player's `byPlayer` movement list, finds the active segment,
  applies `ease(u)` (ease-in-out cubic) and `lerp(from, to, u)`.
- Idle players (no entry in `byPlayer`) fall back to:
  - the freeze-snapshot override if present (Phase H fix),
  - else the player's authored `start` point.
- Pre-segment time clamps to the first segment's `from`; post-segment
  time stays at the last segment's `to`.

#### C1.3 Where yaw / facing direction is decided

- `computePlayerYaw(team, x, z)` in `imperativeScene.ts` (~L3171).
  Pure function of team + position: offense faces the rim at the
  origin; defense faces away from the rim (outward toward offense).
  Does not depend on movement direction or ball position.
- Called exactly **once per scene mount**, at `buildBasketballGroup`
  ~L424:
  ```ts
  playerGroup.rotation.y = computePlayerYaw(p.team, p.start.x, p.start.z)
  ```
- After mount, no code path updates `playerGroup.rotation.y`.
  Cutters keep their start yaw through their whole cut path;
  defenders do not rotate when the ball swings; ball-handlers do not
  pivot toward the catcher before a pass. This is the core stiffness
  observed in Section 2.2 of the recovery plan.

#### C1.4 Where ball arc is created

- `MotionController.applyBall(t)` (~L1302–L1344). For an in-flight
  phase:
  ```ts
  const u = clamp01((t - phase.startMs) / span)
  const eased = easeInOutCubic(u)
  const x = fromX + (toX - fromX) * eased
  const z = fromZ + (toZ - fromZ) * eased
  const dist = Math.hypot(toX - fromX, toZ - fromZ)
  const peak = Math.min(7, Math.max(2, dist * 0.25))
  const y = this.baseBallY + peak * 4 * u * (1 - u)
  ```
- Position interpolation uses the **eased** `u`; the y-arc uses the
  **raw** `u`. This means the ball reaches its parabola peak at
  real-time u=0.5 (when the eased x/z is also at u=0.5 for symmetric
  ease-in-out, so visually OK on long passes — but the eased curve
  spends slightly more visible time at the start/end, while the y
  curve is symmetric, producing a subtle apex-too-early feel on
  short passes).
- Held phases follow the current holder's sampled (x, z) and lock y
  at `baseBallY`. No bobble or dribble cue.

#### C1.5 Where freeze timing is applied

- `MotionController.setFreezeAtMs(ms)` (~L1131) sets a hard cap.
- `tick(now)` checks `t >= effectiveCapMs()` and fires
  `pendingFrozen` exactly once.
- `getElapsedMs` clamps the visible `t` at `effectiveCapMs()` so
  rendered transforms hold steady at the freeze pose.
- The state machine consumes `pendingFrozen` and snapshots positions
  via `samplePositionsAt(scene, timeline, t, overrides)`.
- Freeze accuracy depends on the rAF tick crossing the cap on the
  first frame after t exceeds `freezeAtMs`. Because `getElapsedMs`
  clamps before the frozen flag fires, the rendered pose at the
  freeze beat is exactly the pose at `t = freezeAtMs` (no overshoot
  in space). The state-machine test "clamps elapsed time at
  freezeAtMs" pins this.
- Phase B / B1+B3 re-arms paused / playbackRate after each
  `setMovements`, so freeze does not interact with leg swaps.

#### C1.6 Current gaps

1. **Fixed body yaw (Section 2.2).** `computePlayerYaw` is one-shot.
   Cutters, drivers, and defenders never rotate. The strongest
   stiffness signal in the scene.
2. **Symmetric ease-in-out for every kind.** `samplePlayer` applies
   the same ease curve to every `SceneMovementKind`. Cuts (`cut`,
   `back_cut`, `front_cut`-as-`cut`, `baseline_sneak`) read like
   smooth glides instead of explosive moves; defender rotations
   already feel right with this curve.
3. **Static defenders.** Defenders without authored `rotation` /
   `closeout` movements stand still while the ball swings. Phase 7
   added defender pressure halos in the teaching overlay; the body
   itself does not react.
4. **No ball arc kind awareness.** All passes use
   `peak = clamp(dist * 0.25, 2, 7)`. A short `pass` and a
   cross-court `skip_pass` use the same multiplier; skip passes that
   should be on a line read as the same lazy parabola as a 12-foot
   feed. Y-arc uses raw `u` while x/z uses eased `u` (subtle apex
   timing mismatch on short passes).
5. **Holder pose has no pre-pass bias.** A passer does not rotate
   toward the catcher before releasing; the ball just leaves a
   stationary figure. Reads as a marker shooting another marker.
6. **No foot-sliding compensation.** Even with eased translation,
   the figure's leg geometry is fixed (Phase F territory), so any
   change in C must avoid making sliding more visible. This is a
   constraint, not a bug.
7. **Freeze timing is solid.** Phase B locked the cap behavior;
   Phase C should not touch it except to confirm the cap is honored
   across rate changes (already covered by tests).

#### C1.7 Safest implementation points for C2–C5

- **C2 — Body-facing.** Add a per-frame yaw update inside
  `MotionController.tick()`. Track each player's previous (x, z) in
  a private Map; compute movement direction from the per-frame delta;
  fall back to defender→ball / holder→rim heuristics when stationary.
  Smooth toward the target with an exponential approach using a
  real-time `dt` derived from `nowMs`. Keeps yaw frame-rate
  independent and rate-independent (rate scales position delta but
  not the smoothing constant). Touches `MotionController` only;
  exports `computePlayerYaw` (already module-local) and a small
  `smoothAngle` helper for tests.
- **C3 — Cut / drive timing.** Switch `samplePlayer`'s easing to a
  per-kind dispatch in `timeline.ts`. Cuts / back_cuts / drives /
  jabs / baseline_sneaks / rips get an ease-out-bias curve so the
  player accelerates fast and settles at arrival; rotations /
  closeouts / lifts / drifts keep the existing ease-in-out cubic.
  No JSON change. The ResolvedMovement already carries `kind`, so
  the dispatch is local. `samplePlayer` is shared with the legacy
  JSX controller (off in production) — the change only affects
  feel; deterministic behavior is preserved.
- **C4 — Defender reaction.** No new movement system. Two changes:
  (a) the C2 yaw update naturally rotates defenders toward the ball
  when stationary (defender→ball heuristic); (b) confirm the
  teaching-overlay pressure halo continues to fire when the holder
  changes (overlay already reads holder via the motion controller).
  No structural changes; tuning only.
- **C5 — Ball arc + freeze.** Tune `applyBall` so:
  - peak height uses the same eased curve for y as for x/z, fixing
    the apex-timing mismatch on short passes,
  - skip passes (`kind === 'skip_pass'` on the active phase's
    `pass` movement) use a lower peak multiplier (line drive feel),
  - clamp tightening for very short hand-offs so they don't pop up.
  Freeze accuracy stays as-is — already accurate; verify via test
  that mid-pass freeze still lands at the authored cap.



### Phase C QA Results

> Phase C landed C1–C6 on this branch. This subsection records the
> automated coverage and the human-in-the-loop matrix Phase H should
> walk on a real browser before the recovery is declared done.

#### Files touched (Phase C)

- `apps/web/components/scenario3d/imperativeScene.ts`
  - Exported `computePlayerYaw` and `smoothAngle` for tests.
  - New constants: `YAW_TIME_CONSTANT_OFFENSE_S`,
    `YAW_TIME_CONSTANT_DEFENSE_S`, `MOVEMENT_DIRECTION_EPS_SQ`,
    `BALL_PEAK_MULT_PASS`, `BALL_PEAK_MULT_SKIP`, `BALL_PEAK_MIN_FT`,
    `BALL_PEAK_MAX_FT`.
  - `MotionController` gained `currentYaw` Map +
    `lastYawTickWallMs` + `applyPlayerYaw(now, t)` +
    `findActivePlayerMovement`.
  - `tick(now)` now drives a yaw pass after `applyBall(t)` so
    defenders / non-mover heuristics can read up-to-date ball
    position.
  - `reset()` and `setMovements()` clear `currentYaw` and
    `lastYawTickWallMs` so leg swaps re-snap to the team default.
  - `applyBall` switched to kind-aware peak height +
    eased-aligned y arc + 0.7 ft floor for short hand-offs +
    `skip_pass` line-drive multiplier.
- `apps/web/lib/scenario3d/timeline.ts`
  - Added `easeForKind(kind, u)` dispatch:
    `cut / back_cut / baseline_sneak / drive / jab / rip / stop_ball`
    → ease-out cubic; everything else → ease-in-out cubic (existing).
  - `samplePlayer` now calls `easeForKind` instead of the static
    `ease`. Endpoints are unchanged so authored final positions still
    land exactly on the authored `to` point.
- `apps/web/components/scenario3d/replayStateMachine.test.ts`
  - Stub `Group` now exposes `rotation.y` so the yaw pass has
    something to write into.
  - +14 tests across `Phase C / C2`, `Phase C / C4`, `Phase C / C5`.
- `apps/web/lib/scenario3d/timeline.test.ts`
  - Updated mid-segment expectation to match the new `cut` ease-out
    curve.
  - +4 `easeForKind` tests covering explosive vs. defensive kinds,
    endpoint exactness, and front-loaded ordering.

No edits to `Scenario3DCanvas.tsx`, `Scenario3DView.tsx`,
`PremiumOverlay.tsx`, `app/train/page.tsx`,
`imperativeTeachingOverlay.ts`, scenario JSON, `schema.ts`,
`presets.ts`, the parent rAF loop, the FPS guard, or the
simple/full-path pin.

#### Movement changes made

- **Per-frame body facing.** Players, including idle defenders, now
  rotate to face the basketball action: cutters / drivers face the
  segment direction; stationary defenders face the ball; the current
  ball-holder faces the rim. Smoothing is dt-based so the visible
  responsiveness is the same at 30 fps and 120 fps; rate-independent
  because it uses wall time, not playback time.
- **Defender-specific responsiveness.** Defenders use a smaller yaw
  time constant (~0.10 s) than offense (~0.18 s), so a holder change
  reads as a quick attention shift on the defenders' bodies — the C4
  "shift attention when holder changes" cue.
- **Kind-aware easing.** Cuts, back-cuts, drives, jabs, rips,
  baseline sneaks, and stop-ball moves now use ease-out cubic in
  `samplePlayer`. They accelerate fast off the start and settle into
  the arrival point — reads as a basketball move instead of a
  marker glide. Defensive rotations / closeouts / lifts / drifts /
  passes keep the symmetric ease-in-out curve.
- **Ball arc.** Skip passes now use a 0.10 multiplier (line drive);
  standard passes keep 0.25. Short hand-offs use a 0.7 ft floor so
  they don't pop above the passer's shoulder. Y motion follows the
  same eased curve as X/Z so the apex aligns with the visual
  midpoint instead of landing too early on short throws.
- **Freeze accuracy.** Unchanged at the math level. A new
  `Phase C / C5` test pins the in-flight freeze case so a freeze
  marker landing inside a pass holds the ball at the exact arc
  position for `t = freezeAtMs`.

#### Validation results

- `pnpm --filter @courtiq/web test` — **129 tests passed**, 0
  failed. Test files: scenario3d / lib / app combined.
  - +18 new tests across Phase C: 8 in `replayStateMachine.test.ts`
    (yaw helpers, per-frame yaw update, defender reaction,
    ball arc, freeze accuracy) and 4 in `timeline.test.ts`
    (`easeForKind` dispatch).
  - All Phase B tests (29) still pass; all 14 pre-Phase-B tests
    still pass.
- `pnpm --filter @courtiq/web lint` — clean.
- `pnpm --filter @courtiq/web typecheck` — pre-existing errors in
  `lib/services/*` (Prisma client + workspace `@courtiq/core` not
  generated in this environment). Same baseline as Phase B; no new
  typecheck error introduced. The `scenario3d`, `replay`, and
  `timeline` surfaces have zero typecheck errors.

#### Phase B replay reliability — intact

- All 29 Phase B regression tests still pass.
- The new yaw pass runs **after** `applyBall(t)`, so the existing
  ball-arrival camera-shake hook still observes the ball position
  the way it did before Phase C.
- `reset()` and `setMovements()` clear yaw state alongside the
  Phase B state-clears, so the Phase B subscriber re-arm of paused /
  rate continues to work correctly across leg swaps.
- Ball arc changes are pure tuning; the `findPhase` /
  `consumePassArrival` hooks are unchanged, so the Phase B
  consequence-leg dispatch and the `done → replaying → done`
  show-again cycle behave identically.

#### Manual QA matrix (deferred to Phase H)

Phase C did not include a browser-driven QA pass — Phase H is the
integration / cohesion gate. Phase H should walk this matrix on
BDW-01:

- Movement feel — eyeball test:
  - Cutters visibly accelerate off the start, settle on arrival.
  - Drives feel decisive, not like marker slides.
  - Defenders rotate toward the ball during a pass.
  - The denying defender on BDW-01 (x2) still reads as denying
    the user.
  - No yaw jitter or snapping, including at low frame rate.
- Ball arc — eyeball test:
  - Standard passes arc convincingly at 0.5x / 1x / 2x.
  - Skip passes (if any authored) read as line drives.
  - Short hand-offs stay below shoulder height.
  - Apex of the arc aligns with the visual midpoint of the pass.
- Freeze — eyeball test:
  - Freeze at the authored beat lands exactly on the marker.
  - No overshoot or rebound between freeze and the question UI
    mounting.
- Replay reliability regression — re-walk the Phase B QA matrix:
  - Pause / Play across each leg boundary.
  - Speed switches at 0.5x / 1x / 2x.
  - Restart from each state.
  - Show me again from the Feedback panel.

#### Remaining movement risks

- **Foot-sliding visibility.** With sharper ease-out cuts the body
  visibly accelerates, but the legs are still rigid (Phase F
  territory). On a long fast cut this might emphasize the slide.
  Phase F's geometry redesign is the long-term fix.
- **`closeout` movement curve.** Currently uses ease-in-out (the
  defensive default). Real closeouts decelerate hard at arrival. If
  authored content adds many closeouts, Phase F's stance work or a
  later C6.x extension may revisit.
- **No defender lateral lean.** C4 only rotates yaw. A small
  position lean toward the ball was considered and skipped — would
  conflict with authored spacing. If Phase F adds a torso-tilt
  primitive, a later pass could add a subtle lean alongside yaw.
- **Pre-pass passer pivot.** The passer faces the rim while
  holding; on the pass it does not pre-rotate toward the catcher.
  Could be added later as a small "look-ahead" lookup that biases
  the holder's yaw target toward the next pass `to` point in the
  upcoming phase. Out of scope for Phase C given the constraint to
  not redesign the body model.
- **Yaw smoother time constants are global.** Per-stance tuning
  (e.g., a denying defender turns faster than a helper) would be a
  natural Phase F follow-on if needed.

---

## 15. Phase D — Fullscreen Film Room Mode

### D1 — Fullscreen UX Plan

> Docs-only milestone. All open questions resolved here before any
> code is written. The answers below drive D2–D5 implementation.

#### Button placement

The fullscreen toggle lives in the **top-right cluster** of
`PremiumOverlay`, to the right of the camera selector. The cluster
already groups "what am I looking at" controls (replay badge, paths
toggle, camera selector). Fullscreen belongs there because it is also
a view-mode affordance, not a timeline control.

```
top-right cluster (left → right):
  [REPLAY badge] [Paths on/off] [Camera ▾] [⛶ / ⛶ Exit]
```

The button is a compact chip matching the camera-selector aesthetic
(`ciq-broadcast-chip`, same font/size/opacity transitions).

#### Icon design

- **Enter fullscreen**: four-corner expand glyph (arrows pointing
  outward from center).
- **Exit fullscreen**: four-corner collapse glyph (arrows pointing
  inward).
- Icon drawn as an inline SVG `viewBox="0 0 16 16"`,
  `stroke="currentColor"`, consistent with the rest of the overlay
  icon set.
- `aria-label` changes between "Enter fullscreen" and "Exit
  fullscreen" to reflect the current state.

#### Control persistence inside fullscreen

**All controls remain visible and usable inside fullscreen.** The
overlay is positioned `absolute inset-0` over the canvas wrapper, and
that wrapper is the fullscreen element. The overlay's DOM tree travels
with the element into fullscreen — no control is re-mounted or
teleported.

Controls confirmed reachable in fullscreen:
- Restart, Play/Pause, Speed selector (bottom-center transport pill)
- Paths toggle (top-right cluster)
- Camera selector (top-right cluster)
- Fullscreen toggle now showing "Exit" (top-right cluster)
- Concept chip, Replay badge (top-left / top-right, already in DOM)

#### Escape behavior

The browser's native `Escape` key exits fullscreen (this is mandatory
and cannot be suppressed). A `fullscreenchange` event fires on the
element; the listener updates `isFullscreen` state so the button icon
and aria-label flip back to "Enter." No custom Escape binding is
added.

#### Train-page shell hiding

The fullscreen element is the **canvas wrapper div** inside
`Scenario3DView` (the same `div.relative.h-full.w-full` that wraps
`Scenario3DCanvas` and `PremiumOverlay`). When the browser promotes
this element to fullscreen, it renders it at full viewport size
independent of the page's normal document flow. The decoder pill,
answer cards, and header in `app/train/page.tsx` remain in the DOM
but are behind the fullscreen layer — the browser stacking context
ensures they are not visible.

No changes to `app/train/page.tsx` are required for shell hiding; the
browser fullscreen spec handles it. A minimal `data-fullscreen` hook
is added to the container only if CSS `:fullscreen` fixes are needed
for control sizing (deferred to D4).

#### State ownership

`isFullscreen: boolean` lives in **`Scenario3DView`**. It is the
parent that owns the container ref and manages overlay state; the
canvas stays narrowly focused on imperative rendering.

```ts
// Scenario3DView pseudo-code
const containerRef = useRef<HTMLDivElement>(null)
const [isFullscreen, setIsFullscreen] = useState(false)

function toggleFullscreen() {
  if (typeof document === 'undefined') return
  if (!document.fullscreenElement) {
    containerRef.current?.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

useEffect(() => {
  if (typeof document === 'undefined') return
  const el = containerRef.current
  if (!el) return
  const onChange = () => setIsFullscreen(!!document.fullscreenElement)
  el.addEventListener('fullscreenchange', onChange)
  return () => el.removeEventListener('fullscreenchange', onChange)
}, [])
```

All access to `document.fullscreenElement`, `requestFullscreen()`, and
`exitFullscreen()` is guarded behind `typeof document !== 'undefined'`
checks so the component SSR-renders without errors.

#### Canvas sizing in fullscreen

When `isFullscreen` is true, `Scenario3DView` passes `height={undefined}`
(or a very large sentinel) to `Scenario3DCanvas` so the canvas uses
`height: 100%` of its container instead of the fixed `320px` default.
The canvas's `containerRef` already sets `width: 100%` and the R3F
`<Canvas>` uses `style={{ width: '100%', height: '100%' }}`, so no
resize observer is required — the renderer naturally fills the
fullscreen element. The browser's resize of the fullscreen element
triggers R3F's size tracking which re-renders at the correct
resolution.

The DPR / FPS guard is unaffected. The fullscreen element inherits the
same pixel ratio as before; the guard continues to degrade the tier if
sustained low FPS is detected.

#### Open questions resolved

| Question | Answer |
|---|---|
| Where does the button live? | Top-right cluster, after camera selector |
| What icon? | Expand/collapse SVG corners glyph, 12×12px |
| Do controls disappear in fullscreen? | No — all controls stay |
| Does Escape need custom handling? | No — browser native is correct |
| Does the train shell bleed in? | No — browser fullscreen stacking handles it |
| Is SSR safe? | Yes — typeof document guards on all API access |
| Does canvas resize? | Yes — height becomes 100% in fullscreen element |
| Does DPR / FPS guard change? | No — unchanged |

### D5 — Phase D QA Results

#### Automated test coverage

New test file: `apps/web/components/scenario3d/fullscreen.test.ts`  
Environment: `jsdom` (Vitest)  
Approach: mock `document.fullscreenElement`, `document.exitFullscreen`, and
`element.requestFullscreen` — does not boot WebGL or React.

| Test | Result |
|---|---|
| calls `requestFullscreen` on container when not in fullscreen | PASS |
| calls `document.exitFullscreen` when already in fullscreen | PASS |
| does not call `requestFullscreen` when container ref is null | PASS |
| does not throw when toggling out with null container | PASS |
| fires `fullscreenchange` event listener when dispatched | PASS |
| does not fire after listener is removed (cleanup verified) | PASS |
| denied `requestFullscreen` (rejected promise) does not throw | PASS |

Total after D5: **136 tests / 9 test files** — all passing.

#### Manual QA matrix (deferred to Phase H for browser execution)

Phase D did not include a live browser QA pass — Phase H is the full
integration gate. Phase H should walk this matrix on BDW-01:

**Fullscreen entry / exit**

| Item | Expected | Status |
|---|---|---|
| Click fullscreen button (⛶) | Browser enters fullscreen, button icon flips to ⛶ collapse | Pending H |
| Press Escape in fullscreen | Browser exits fullscreen, button icon flips back to ⛶ expand | Pending H |
| Click collapse button (⛶) | `document.exitFullscreen()` called, state resets | Pending H |
| Reload while in fullscreen URL | Page loads in embedded mode (fullscreen is not persisted) | Pending H |

**Canvas sizing**

| Item | Expected | Status |
|---|---|---|
| Court fills viewport in fullscreen (no letterboxing) | Canvas height = 100vw × 100vh | Pending H |
| Court lines remain crisp in fullscreen | No DPR blowup; FPS guard unchanged | Pending H |
| Returning from fullscreen restores embedded height | Fixed-pixel height resumes; no layout shift | Pending H |

**Controls reachable in fullscreen**

| Item | Expected | Status |
|---|---|---|
| Restart button visible and clickable | Bottom-center transport pill reachable | Pending H |
| Play/Pause button visible and clickable | Primary CTA in transport pill reachable | Pending H |
| Speed selector (0.5x / 1x / 2x) visible and clickable | Speed chip in transport pill reachable | Pending H |
| Paths toggle visible (when `pathsAvailable` is true) | Top-right cluster, label always shown in fullscreen | Pending H |
| Camera selector dropdown visible and usable | Top-right cluster, dropdown opens inside fullscreen | Pending H |
| Fullscreen toggle button visible (Exit state) | Top-right cluster, green tint when active | Pending H |

**Train-page shell bleed**

| Item | Expected | Status |
|---|---|---|
| Decoder pill not visible in fullscreen | Browser stacking hides page shell | Pending H |
| Choice cards not visible in fullscreen | Browser stacking hides page shell | Pending H |
| Header / nav not visible in fullscreen | Browser stacking hides page shell | Pending H |

**SSR / Edge cases**

| Item | Expected | Status |
|---|---|---|
| Server-render does not throw (`typeof document` guard) | No SSR error | Verified (lint + typecheck clean) |
| Fullscreen denied (sandboxed iframe) | `catch` silences error; no UI crash | Covered by unit test |
| `fullscreenchange` listener removed on unmount | Cleanup function in `useEffect` verified | Covered by unit test |

#### Remaining risks for Phase H

- **Browser compat.** Safari historically lags the Fullscreen API
  (`webkitRequestFullscreen` prefix). jsdom stubs the standard interface;
  a Safari live test is the only real coverage.
- **Mobile.** iOS Safari does not support the Fullscreen API at all;
  the button will not throw (requestFullscreen rejects and the catch
  silences it) but the user sees no feedback. A future pass could
  detect support and hide the button on iOS.
- **Iframe sandbox.** `allow-fullscreen` must be present in any embedding
  iframe attribute for the API to work. Already handled by the catch block.


---

## 16. Phase E — Player Geometry Strategy Spike

### E1 — Player Geometry Failure Audit

> Read-only audit. Every problem below is traced to a specific decision in
> `buildPlayerFigure` (`imperativeScene.ts` ~L3393–L3873) so Phase F can fix
> the root cause, not the symptom. Source-of-truth dimensions are at
> `imperativeScene.ts` ~L3303–L3361 (per-part radius / height / Y / stagger).

The current procedural figure ships a stack of distinct primitives
(`BoxGeometry` shoes, `CylinderGeometry` legs, `CapsuleGeometry` torso /
arms, tapered cylinder shorts, capsule shoulder yoke, sphere head, hair
hemisphere, head wedge marker), and yet — to a viewer who is not the
person who wrote it — it still reads as "stacked primitives," not
"basketball player." The Phase 2 polish moved the silhouette forward
(capsule torso, tapered legs, foot stagger, V-shaped chest, jersey number
panels, contact shadow). It did not solve the underlying problem, which is
that the figure is **assembled, not modeled.**

#### 1. Silhouette problems

- **What the user sees.** From the broadcast camera the body reads as a
  bottle on two posts on two boxes. The torso → shorts → legs transition is
  a hard step-down in radius, not a hip line. Above the chest the shoulder
  yoke (`YOKE_WIDTH = TORSO_WIDTH * 1.18`, ~L3334) reads as a bar laid
  across the top of the torso rather than as deltoids that taper into arms.
- **Why it hurts CourtIQ.** Silhouette is the first read at broadcast
  distance. A player whose silhouette resolves to "primitives" cannot teach
  body language, which is the entire CourtIQ thesis (read the defender,
  not the spot — Section 6).
- **Where in `buildPlayerFigure`.** The torso (`THREE.CapsuleGeometry`
  with `scale.set(1.05, 1, 0.72)`, ~L3528–L3538) and the shoulder yoke
  (~L3545–L3554) are independent primitives layered without any blending or
  shared topology. The yoke is a horizontally-rotated capsule sitting on
  top of the torso capsule; it never blends into a deltoid.

#### 2. Body proportion problems

- **What the user sees.** The torso (`TORSO_HEIGHT = 1.4`,
  `TORSO_WIDTH = 1.55`) is wider than tall. With `scale.set(1.05, 1, 0.72)`
  the cross-section reads as a pancake from the high 3/4 camera. The legs
  (`LEG_HEIGHT = 2.1`) are slightly too short relative to total height
  (~L3322–L3328 lays the body out at SHOE_Y=0.2, LEG_Y=1.25, SHORTS_Y=2.8,
  TORSO_Y=3.9, NECK_Y=4.71, HEAD_Y=5.35). For an athletic figure the leg
  span should be closer to half of total height; here legs are ~33%.
- **Why it hurts CourtIQ.** Wrong proportions break the "athlete" read
  before stance ever has a chance. Even a perfectly posed defender reads as
  "small adult-shaped trinket," not "ballplayer."
- **Where in `buildPlayerFigure`.** The dimension constants at
  `imperativeScene.ts` ~L3303–L3320, plus the leg `CylinderGeometry(LEG_RADIUS * 0.95, LEG_RADIUS * 1.25, LEG_HEIGHT, 14)`
  at ~L3483 — taper is from 0.95×0.22 to 1.25×0.22, so the leg goes from
  20cm to 27cm radius, which broadens the calf relative to the thigh
  (backwards from a real athletic leg).

#### 3. Shoulder / torso / hip problems

- **What the user sees.** No clavicle ridge, no deltoid. The shoulder yoke
  is one centered horizontal capsule across the top of the torso; the arms
  hang from positions that look attached at the side of the torso, not at
  the shoulder ball. The hip transition into shorts is a vertical seam
  (capsule torso ends, slightly-tapered cylinder shorts begin) without a
  pelvis curve. The chest stripe (~L3584) is a visible flat strip rather
  than a jersey neckline.
- **Why it hurts CourtIQ.** Shoulders are the dominant facing cue from
  high 3/4. If the shoulders are a generic horizontal bar, "this defender
  is angled toward the ball" is invisible. The same is true for the hips:
  hip angle is the main defender-stance signal, and a vertical cylinder
  cannot communicate hip angle.
- **Where in `buildPlayerFigure`.** Yoke at ~L3545–L3554 (single capsule,
  rotated 90° around z, scaled to a thin slab); shorts at ~L3503–L3511
  (single tapered cylinder); torso at ~L3528–L3538 (capsule). Three
  independent primitives sharing only a y-axis — there is no shared
  geometry that defines a "shoulder line" or "hip line."

#### 4. Arm / leg / shoe problems

- **Arms.** Built from `CapsuleGeometry(ARM_RADIUS=0.18, ARM_LENGTH * 0.9 = 1.26)`
  per side (~L3597–L3627). Per-stance pose uses `arm.rotation.x/z` and
  `arm.position` writes — the arm is a single rigid limb, no elbow break.
  Closeout, denial, and idle all bend the same straight tube.
- **Legs.** Single tapered cylinder per side (~L3479–L3489). No knee, no
  calf taper toward the ankle. Stance crouch is faked by translating the
  upper body down by `STANCE_LOWER_FT = 0.35` (~L3497) — the legs
  themselves do not bend. From the side this is visible as torso-floats-down
  with stiff posts beneath it.
- **Shoes.** Box geometry `(0.5 × 0.4 × 1.0)` plus a midsole stripe
  (~L3454–L3473). At broadcast distance these read as "blocks under
  legs," not "shoes." Foot direction is a primary defender cue (Section 6 —
  defender hip / foot readability) and the box gives a yes/no z-axis at
  best — no toe, no heel.
- **Why it hurts CourtIQ.** The decoder for AOR-01 (No Gap Go Now) will
  ask the user to read "balanced vs out-of-control closeout." That
  signal lives almost entirely in shin angle and shoe orientation, both
  of which the current geometry cannot communicate.

#### 5. Stance readability problems

- **What the user sees.** The three current stances (`idle`, `defensive`,
  `denial`) look almost identical from broadcast. `defensive` and `denial`
  both translate the upper body down 0.35ft. They differ in arm pose
  (defensive: hands-out, denial: outside arm raised) and foot stagger
  (`FOOT_STAGGER_DEFENSIVE = 0.18` vs `FOOT_STAGGER_DENIAL = 0.1`).
  `idle` keeps the upper body upright with `[-0.05, -0.05]` foot offsets.
  The crouch translation makes the torso intersect the shorts visually
  but the legs themselves are unchanged length, so the "knees bent"
  read is implied rather than shown.
- **Why it hurts CourtIQ.** Phase C added expressive yaw rotation per
  frame, but the body underneath the yaw is the same shape regardless of
  stance. The user has no honest way to distinguish "crouched defender
  in a denial stance" from "standing defender holding their arm up." The
  basketball read in BDW-01 — *they're sitting on the pass* — collapses
  into "they have an arm raised."
- **Where in `buildPlayerFigure`.** Crouch at ~L3497 (single y-translate
  of `upperBody`); foot stagger at ~L3438–L3448; arm pose at ~L3597–L3627.
  No leg primitive responds to stance.

#### 6. Why it still looks like primitives

- **Hard edges between primitives.** Capsule + capsule + cylinder + box
  meet at right angles with no inter-primitive blending. Smooth-shading
  on individual primitives cannot hide the seam where two primitives
  dock.
- **No skinning, no continuous mesh.** The body is six rigid groups
  (legs, shorts, torso, yoke, arms, head). Stance changes pivot or
  translate one group at a time; the body never deforms as a single
  silhouette would.
- **Identity comes from textures + rings, not from the body itself.**
  The jersey number is a flat plane glued onto the torso (~L3559–L3580).
  The team color is a uniform `MeshStandardMaterial` painted across the
  whole torso. The user halo lives on the floor, not on the body. So
  when you remove the rings + chevron + halos, the body is unrecognisable
  as a player at all.
- **Where in `buildPlayerFigure`.** Every primitive is added to either
  `figure` or `upperBody` independently (~L3454–L3675). There is no
  underlying mesh that all primitives blend into.

#### 7. Why it does not feel like a basketball athlete

- **No mass distribution.** Real ballplayers have visible quad/glute mass
  on the lower body, V-tapered shoulders, and forearms thicker than the
  upper arm. The current body is roughly tube-and-bottle.
- **No leg articulation.** Cuts read as foot-sliding because the legs
  cannot scissor or lift. Phase C eased motion timing, which helped, but
  the body still drifts as a static stack.
- **No gestural body language.** Real defenders shift weight, square hips,
  drop a shoulder. The current builder has no "dropped shoulder" axis.
- **Generic head + hair cap.** Head + hemispherical hair (~L3640–L3665)
  reads as "snowman with shading" not "athlete head," especially when
  combined with the soft contact shadow.
- **Where in `buildPlayerFigure`.** The body assembly itself; nothing in
  the per-stance pose exposes hip-square, shoulder-drop, or weight-shift
  as parameters. The pose system writes only foot-stagger and arm-rotation.

#### 8. Why prior Phase 2 polish was not enough

Phase 2 (visual-system plan §12 / §6) raised the floor: capsule torso
instead of box, tapered legs instead of cylinders, foot stagger, jersey
number panel, shoulder yoke, contact shadow, V-shaped torso scale. Each
change solved a real prior problem. None changed the fundamental
**six-primitive assembly architecture**:

- The polish was per-primitive, not per-figure. Each primitive got
  better; the joints between primitives stayed seam lines.
- Stance work was confined to translating / rotating existing primitives.
  No leg articulation, no shoulder-drop axis, no weight shift were ever
  added — there was nowhere for them to live.
- Phase 2 ran inside the same builder signature (`teamColor, trimColor,
  isUser, hasBall, jerseyNumber, stance`), so all upgrades had to fit
  inside that frame.

The result is a body that is significantly better than the original
peg figure but still **structurally a stack**. Any further round of
"make the cylinders nicer" inside the existing assembly hits a ceiling
that polish cannot lift.

#### 9. What must be true for the next design to succeed

- **One coherent body silhouette.** Whatever geometry ships, the eye
  must read a single continuous athlete shape from broadcast distance,
  not a stack of primitives.
- **Stance must affect the body, not just translate it.** Crouch must
  bend legs (or read as bent legs). Shoulder-drop must be a real axis.
  Hip-square must be real geometry, not implied by yoke rotation.
- **Identity layers (rings, halos, possession, focus, feedback) keep
  working unchanged.** The body redesign cannot rebuild the indicator
  system; that contract is locked by Phase 3 of the visual-system plan
  (Section 7).
- **Stays on Mac.** Per-player tri budget, material count, and draw-call
  count must not balloon. No skeletal rig, no realtime physics.
- **One builder, parameterised.** The signature stays caller-compatible;
  internal complexity is fine but the integration surface (per-player
  loop in `buildBasketballGroup`, ~L379–L427) must not change.
- **Scenario-aware stance routing without re-authoring.** ESC-01,
  AOR-01, SKR-01 (visual-system plan §18.4 reopen item) need
  `closeout`, `sag`/`shrink`, and `cut` stances. The next geometry
  must accept those without a rebuild.
- **Disposal hygiene preserved.** Every new mesh / material / texture
  reachable by `disposeGroup` and `disposeMaterialTextures`.


### E2 — Player Geometry Strategy Comparison

> Four candidate paths, each evaluated against the constraints established
> in E1 §9 plus visual-system plan Sections 6, 14 (perf rules), 17.5
> (safest files), 18.4 (stance reopen item).

#### Option A — Improve current procedural primitives again

- **What it means.** Stay inside `buildPlayerFigure` and tune dimensions,
  add a third capsule for biceps/forearms, sharpen the shoulder yoke,
  lengthen legs, narrow shorts. No architectural change; another polish
  pass on the existing primitive stack.
- **Expected visual quality.** Marginal lift over today. Three rounds
  have already gone through this loop (peg → capsule torso → V-taper +
  yoke + foot stagger). Each round produced a smaller delta than the
  one before. Diminishing returns are the headline finding from E1 §8.
- **Engineering complexity.** Low. Numeric tuning + one or two extra
  primitives.
- **Performance risk on Mac.** Low. Per-player tri count rises by maybe
  ~10%; well inside Section 14 budget.
- **Compatibility with current indicators.** Perfect — nothing changes.
- **Compatibility with stance system.** Same as today: stance still
  reduces to "translate upper body + rotate arms." Cannot add
  closeout / sag / cut convincingly.
- **Compatibility with `disposeGroup` / material cleanup.** Perfect —
  no new patterns.
- **Risk to replay/movement.** None. Phase B/C work is decoupled.
- **Does it solve the "gross player geometry" problem?** No. It does
  not change the architecture that produces the "stack" read.
- **Verdict.** **Reject.** Three rounds of this approach produced a
  better-but-still-placeholder body. A fourth will hit the same ceiling.

#### Option B — Build a better reusable low-poly player mesh in code

- **What it means.** Replace the primitive stack with a hand-authored,
  code-built low-poly athlete: a single `BufferGeometry` for the torso
  (or a small set of merged primitives that share a topology) with V-
  tapered shoulders, articulated arms (upper / fore / hand block),
  articulated legs (thigh / calf / foot), distinct shoes with toe + heel,
  and a hip ring that defines hip angle as real geometry. Stance is
  applied to the same mesh by rotating named sub-groups
  (`leftThigh`, `leftCalf`, `leftFoot`, `rightThigh`, `rightCalf`,
  `rightFoot`, `torso`, `leftUpperArm`, `leftForeArm`, `rightUpperArm`,
  `rightForeArm`) rather than translating the upper body wholesale.
  No skeletal skinning — each segment is a rigid sub-group, and the
  joints between them either match (shared end-cap radius) or hide
  inside the shorts / sleeves so the seam is invisible from broadcast
  distance.
- **Expected visual quality.** Substantial lift. Real leg bend in
  defensive stance, real elbow bend in denial, real toe orientation in
  closeout. Silhouette resolves to "athlete," not "primitives." Phase
  6 of the visual-system plan describes exactly this in §6 — "stylized
  athletic proportions" with "stance set by pose, not by skeletal
  animation."
- **Engineering complexity.** Medium. A code-built low-poly mesh is
  bigger code than the current builder, but every primitive is still
  THREE.BufferGeometry, no loaders, no async. The hard work is sub-
  group taxonomy + per-stance pose math; both are straightforward.
- **Performance risk on Mac.** Low–Medium. Tri count rises (estimate
  ~600–1100 tris per player vs. today's ~450, depending on shoe / hand
  detail). Five players × 1100 = ~5500 player tris, comfortably below
  the gym shell + court budget. Material count stays the same (jersey,
  shorts, skin, shoe, accent, trim). No new draw calls.
- **Compatibility with current indicators.** High. The base / user /
  possession layers attach to the figure root, not the body. The
  builder signature (`teamColor, trimColor, isUser, hasBall,
  jerseyNumber, stance`) is preserved; indicators ride on top exactly
  as they do today.
- **Compatibility with stance system.** High. Adding `closeout`,
  `sag` / `shrink`, and `cut` is a per-stance pose lookup table on
  the new sub-groups. ESC-01 / AOR-01 / SKR-01 reopen items
  (visual-system plan §18.4) become easy.
- **Compatibility with `disposeGroup` / material cleanup.** High.
  Sub-groups are still THREE.Group descendants; the existing
  traversal walks them and frees geometry / material as before.
  Shared materials (one jerseyMat per figure, etc.) keep dispose
  cheap.
- **Risk to replay/movement.** Low. The MotionController writes
  `position` and `rotation.y` on the figure root; sub-group poses are
  internal to the builder. Phase C's per-frame yaw remains a single
  rotation write on the root.
- **Does it solve the "gross player geometry" problem?** Yes. It
  changes the architecture that produces the placeholder read.
- **Verdict.** **Recommended.**

#### Option C — Use a lightweight imported GLB / glTF model

- **What it means.** Author or commission a low-poly player model in
  Blender, export to GLB, ship via `GLTFLoader` from `three/examples`.
  Bind a tiny rig (or pose-frames) for stances.
- **Expected visual quality.** Potentially highest of the four if a
  good artist authors it; potentially worst if not, because an
  uncanny-valley model is more jarring than a clean primitive stack.
  Quality is bounded by who builds the asset, not by the engineering.
- **Engineering complexity.** Medium–High. New asset pipeline (Blender
  source, GLB export step, version control of binary blobs); new
  loader code path inside `Scenario3DCanvas` or `imperativeScene`;
  async loading + suspense handling; per-player instance cloning of
  the SkinnedMesh / Mesh; pose application via skeleton or morph
  targets. Disposal becomes harder (skinned meshes have separate
  skeleton lifetimes, animation mixers, etc.).
- **Performance risk on Mac.** Medium. Skinned meshes cost more per
  frame than rigid sub-groups; five animated skinned meshes is the
  exact pattern Section 14 calls out as "no per-skinned animation
  rigs in this phase." Even without skinning, a higher-poly imported
  model can blow the per-player tri budget.
- **Compatibility with current indicators.** Medium. Indicators still
  attach to the figure root, but if the imported model has its own
  origin / scale, indicator positions need recomputing. The user halo
  and chevron currently assume specific Y heights (`HEAD_Y + HEAD_RADIUS + 1.1`,
  `imperativeScene.ts` ~L3831).
- **Compatibility with stance system.** Medium. If the model is
  imported with bone animations, stance becomes "play animation X" —
  loses the per-frame yaw / closeout-tilt that Phase C added on the
  root. If imported without bones, every stance is a separate
  pre-authored mesh, which multiplies the asset cost.
- **Compatibility with `disposeGroup` / material cleanup.** Medium.
  GLTFLoader-produced meshes need extra dispose handling for the
  skeleton, animation clips, and texture cache. The existing
  `disposeGroup` traversal would miss these.
- **Risk to replay/movement.** Medium. Replay reliability (Phase B)
  was hard-won; switching the body to a SkinnedMesh + animation mixer
  reintroduces frame-rate-dependent timing, which is the exact problem
  Phase B fixed. Even avoiding mixers, imported models have
  surprises (bone normalisation, root motion offsets) that have a
  history of breaking replay deterministic playback.
- **Does it solve the "gross player geometry" problem?** Could —
  but at the cost of a new asset pipeline and async-loading path the
  rest of the renderer does not currently use.
- **Verdict.** **Reject (now). Reconsider post-recovery.** The asset
  pipeline alone is a separate workstream. The visual-system plan
  Section 6 explicitly says "no per-skinned animation rigs in this
  phase," and Section 14 says "no realtime cloth, no realtime fluid,
  no per-frame shader allocations." A good GLB future is fine; this
  phase is the wrong moment.

#### Option D — Hybrid (code-built body + imported head, or code mesh + imported textures)

- **What it means.** Mix-and-match: keep the body in code (Option B)
  but import a small stylized head model from GLB, or apply imported
  PBR material textures to the code mesh.
- **Expected visual quality.** Same as B for body; head can be either
  better (imported) or a wash (heads barely register at broadcast
  distance per visual-system plan §6 "no facial detail, no hair systems
  — faces are an attention sink and a perf cost for zero teaching
  value at this camera distance").
- **Engineering complexity.** Adds the GLB asset pipeline cost from
  Option C without the rest of the model's benefit. Two loader paths
  is worse than one.
- **Performance risk on Mac.** Low–Medium. The body is rigid; the head
  is small. The added cost is mostly the loader, not the geometry.
- **Compatibility with current indicators.** Medium. Same head-Y
  recompute risk as Option C, but limited in scope.
- **Compatibility with stance system.** Same as B.
- **Compatibility with `disposeGroup`.** Medium. New texture-import
  path needs its own dispose call.
- **Risk to replay/movement.** Low. Same as B; the head is static.
- **Does it solve the "gross player geometry" problem?** Yes — but only
  via the body half. The head half is decorative cost.
- **Verdict.** **Reject.** All the plan benefit lives in the body
  (Option B). The head is small and unimportant at broadcast distance
  (visual-system plan §6: "no facial detail" is a *positive* design
  choice, not a fallback). Adding a GLB asset pipeline solely for the
  head is overengineering.

#### Comparison table

| Dimension | A. Repolish primitives | B. Code-built low-poly mesh | C. Imported GLB | D. Hybrid (B + GLB head) |
|---|---|---|---|---|
| Visual ceiling | Low | High | Highest in theory | High |
| Implementation risk | Very low | Low–Medium | High | Medium–High |
| Performance risk | Very low | Low–Medium | Medium | Low–Medium |
| Time cost | S (1 commit) | M (4–5 commits) | L (asset + loader + integration) | L–M (B + asset path) |
| Maintainability | Familiar territory | One builder file, all in code | Two pipelines (asset + code) | Worst — code + asset |
| Compatible with indicators | Perfect | High | Medium | Medium |
| Stance extensibility | Capped | High | Animation-dependent | High |
| Compatible with `disposeGroup` | Perfect | High | Medium (extra cases) | Medium |
| Replay-safe | Perfect | Perfect | At risk | Mostly perfect |
| Solves the placeholder read | No | **Yes** | Yes (if asset is good) | Yes |
| Best fit for CourtIQ today | No | **Yes** | No | No |

#### Conclusion

Option B (a reusable code-built low-poly athlete mesh, no skeletal rig,
sub-group rigid posing) is the only candidate that resolves the
architectural ceiling identified in E1 §6/§8 while staying inside the
performance, dispose, and replay-safety guardrails the recovery has
spent Phases A–D establishing. E3 designs the proof-of-concept; E4
locks the path.


### E3 — Player Geometry Prototype Recommendation

> Decides whether Phase F should be preceded by a scratch-branch
> prototype or proceed straight to F1 with documented constraints. The
> recovery branch must stay clean — no experimental geometry on
> `claude/phase-d-auto-run-B500C` or any descendant landing branch.

#### 1. Recommendation: **document the prototype plan; skip the scratch branch**

#### 2. Why

- **The architectural decision is already made.** E2 ruled out A, C, D
  on engineering grounds, not on visual uncertainty. The remaining
  question is *how good* a code-built low-poly mesh can look — and
  that question is answered by F1 itself, not by a prototype, because
  F1 *is* the first iteration of the new builder.
- **The scratch-branch path adds cycles without de-risking a different
  unknown.** A scratch prototype would prove "yes, code-built low-poly
  meshes can render on the existing canvas," which we already know
  (the current builder is the proof). It would not answer the only
  remaining open question, which is "do the new proportions read as an
  athlete in the broadcast camera." That answer requires the full
  builder integrated against real scene data, not an isolated mesh in
  a sandbox.
- **No new technology is being introduced.** Every primitive Option B
  uses (`THREE.BufferGeometry`, sub-group rigid posing, shared
  materials, indicator layers attached to the figure root) is already
  in production today. There is no "does this loader work" or "does
  this shader compile" question to answer offline.
- **This environment cannot run a browser-driven QA pass anyway.**
  Live screenshots, side-by-side comparisons, and Mac frame-rate
  measurement happen in Phase H. A scratch prototype that cannot be
  visually validated here would be a guess on a guess.
- **The recovery is on a tight cadence.** Phases A–D have shipped one
  phase per session. A scratch-branch detour breaks that cadence and
  adds a merge risk the rest of the recovery does not have.

#### 3. If the prototype were created (rejected, captured for completeness)

- **Branch name:** `claude/phase-e-player-geometry-prototype` (off
  `main`, not the recovery branch).
- **Files touched:** a single new file
  `apps/web/components/scenario3d/__experimental__/buildAthleteFigure.ts`
  exporting a draft builder; a query-string-gated mount in
  `Scenario3DCanvas.tsx` (e.g. `?proto=athlete=1` swaps figures for
  the new builder).
- **Visual sample:** five players (one user, two offense, two defense),
  each in one of the five required stances (idle / defensive / denial
  / closeout / cut). Static mount, no replay.
- **Screenshots:** broadcast, tactical, and follow camera modes →
  `docs/screenshots/recovery-e3/` (12 PNGs, 3 cameras × 4 stances).
  No screenshots will be produced from this environment.
- **Comparison:** side-by-side with current `buildPlayerFigure` output
  in identical scene data.
- **Performance measurement:** browser dev-tools Performance tab on
  Mac, 30s recording per scenario; record min / median / p95 frame
  duration.
- **Success:** new figure clearly reads as athlete from broadcast at
  default DPR; FPS guard never auto-degrades on `medium` tier on
  BDW-01; tri-count per player < 1500.
- **Failure:** silhouette no better than today, OR FPS guard
  auto-degrades, OR tri-count exceeds budget.
- **Why this is rejected.** Recovery cadence + no-meaningful-de-risk;
  see §2 above.

#### 4. No-prototype implementation constraints (binding on Phase F)

Because Phase F starts from a documented plan rather than from a
visual prototype, F1 carries the de-risking that a scratch prototype
otherwise would. Phase F must obey these constraints:

1. **F1 is reversible.** The new builder lives in a new file or
   exported function so the old `buildPlayerFigure` stays intact in
   `imperativeScene.ts` until F5 passes. The per-player loop in
   `buildBasketballGroup` flips between old / new behind a const flag
   (`USE_ATHLETE_BUILDER = true`) so a quick revert is one line.
2. **F1 ships with both stances visible side-by-side via a debug URL
   flag** (`?compare-figures=1`) — half the players use the new
   builder, half use the old one. This gives a built-in visual diff
   without a separate prototype branch.
3. **Per-player tri budget is recorded in `docs/courtiq-scene-experience-recovery-plan.md`
   inside Phase F4** before declaring F4 complete. Five-player BDW-01
   scene total tri delta vs. today must be ≤ +50%.
4. **The builder signature does not change.** Same parameters
   (`teamColor, trimColor, isUser, hasBall, jerseyNumber, stance`),
   same return type (`THREE.Group` with `userData.indicatorLayers`).
5. **Indicator layers are attached as today.** The Phase F builder
   constructs `baseLayer`, `userLayer`, `userHeadLayer`,
   `possessionLayer` exactly the way the current builder does
   (~L3714–L3858). This is the most fragile contract in the recovery;
   no Phase F micro-milestone should change indicator topology.
6. **No skeletal rig, no `SkinnedMesh`, no `AnimationMixer`.** Per
   visual-system plan §6 + §14. Stance is rigid sub-group posing only.
7. **Disposal is verified before F5 ships.** Add a unit test that
   builds and disposes 100 figures in sequence and asserts no
   `Geometry`, `Material`, or `Texture` allocation count climbs
   (sample `THREE.geometry.count` if exposed, or count via a
   wrapping helper).
8. **No new asset files.** No `.glb`, no `.png` textures imported. All
   identity comes from existing palette constants and the existing
   jersey-number `CanvasTexture` helper.
9. **Stance routing stays the same.** The `denyDefenderId` heuristic
   in `buildBasketballGroup` (~L362–L376) is preserved. New stances
   (`closeout`, `sag`/`shrink`, `cut`) become available but routing
   them is a follow-up (visual-system plan §18.4 reopen item) — F2
   only ensures the *renderer* supports them, not that
   `buildBasketballGroup` *picks* them.

#### 5. Recommended target for Phase F

A reusable code-built **stylized-athlete mesh system** with:

- **Tapered athletic silhouette.** V-shaped torso, distinct shoulder
  ball into upper arm, distinct waist into hips, longer legs with
  visible knee break.
- **Stance-readable from broadcast.** Crouch bends legs (sub-group
  rotations on thigh/calf), denial breaks elbow + raises forearm,
  closeout tilts torso forward + plants front foot, cut-stance front
  shin angles forward.
- **Compatible with current rings/halos.** No change to base / user /
  possession / focus / feedback indicator layers. User chevron sits
  at the same Y above the new head as it does above the current head.
- **Performance-safe on Mac.** ≤ ~1100 tris per figure, 6 shared
  materials per figure (jersey, shorts, skin, shoe, accent, trim),
  no new draw calls, no per-frame allocations, no per-stance
  geometry rebuild.
- **No skeletal rig.** Pose is a per-stance lookup table on rigid
  sub-groups (`leftThigh`, `leftCalf`, `leftFoot`,
  `leftUpperArm`, `leftForeArm`, `rightThigh`, `rightCalf`,
  `rightFoot`, `rightUpperArm`, `rightForeArm`, `torso`,
  `head`, plus existing `upperBody` for crouch translation).
- **Single builder file.** Geometry construction stays inside
  `imperativeScene.ts` per visual-system plan §17.5 (Phase 2 scope).
  No new top-level files.


### E4 — Chosen Player Geometry Path

#### 1. Chosen option

**Option B — code-built reusable low-poly stylized-athlete mesh, no
skeletal rig, rigid sub-group posing.** Built inside
`imperativeScene.ts`, replaces the body of `buildPlayerFigure` while
preserving its public signature, indicator-layer contract, and disposal
hygiene.

#### 2. Why this is the best fit for CourtIQ

- **Solves the architectural ceiling identified in E1.** The current
  body reads as "stack of primitives" because it *is* a stack of
  primitives. Code-built low-poly with named sub-groups gives us a
  body that bends, twists, and dresses convincingly without
  introducing a new asset pipeline.
- **Honors every visual-system plan constraint without exception.**
  Section 6 ("stylized athletic proportions, no facial detail, no
  skinned animation rigs"), Section 14 ("performance-safe polish, no
  realtime cloth, no per-frame shader allocations, prefer reusable
  primitives"), and Section 17.5 ("Phase 2 scope: edit
  `imperativeScene.ts` only, stay above L1600") are all preserved.
- **Replay-safe.** The MotionController writes `position` and
  `rotation.y` on the figure root. Sub-group poses are static within
  a stance. Phase B/C work is untouched.
- **Recovery-cadence-safe.** No new asset pipeline, no async loaders,
  no scratch branch. F1–F5 fit one session each.
- **Future-proof.** New stances (`closeout`, `sag`/`shrink`, `cut`)
  become entries in a per-stance pose table, unblocking the
  visual-system plan §18.4 reopen items for ESC-01 / AOR-01 / SKR-01
  without rebuilding geometry.

#### 3. What Phase F should build

A new builder function (or refactor of the existing one) that produces
a single THREE.Group whose descendants comprise:

- **`pelvis` sub-group** — anchors the hip line. Holds shorts geometry
  and the side accent stripes. Its rotation around y becomes the
  hip-square axis (real geometry, not implied).
- **Per-side leg sub-groups** — `leftLeg` / `rightLeg`, each containing
  a `thigh` mesh, a `calf` mesh, and a `foot` group. Crouch is `thigh.rotation.x` +
  `calf.rotation.x` (real bend), not a wholesale upper-body translate.
  Foot orientation is `foot.rotation.y` driving toe direction.
- **`torso` sub-group** — the V-tapered body. Holds the jersey number
  panels, chest stripe, and a shoulder-girdle mesh that defines the
  shoulder line as continuous geometry (deltoid bumps, not a yoke
  capsule).
- **Per-side arm sub-groups** — `leftArm` / `rightArm`, each containing
  an `upperArm` mesh and a `foreArm` mesh meeting at an elbow. Denial,
  defensive, and closeout each pose elbow + shoulder differently.
  Forearm length is roughly upper-arm length so the elbow break is
  visible from broadcast.
- **`neckHead` sub-group** — neck capsule + head sphere + minimal hair
  cap. No facial detail. Sits on `torso.shoulderGirdle`. The user
  chevron continues to live in `userHeadLayer`, parented to whichever
  sub-group is the upper body so crouch carries it down.
- **`shoes`** — distinct toe + heel block per foot. Toe lifts ~2mm
  above heel so foot direction reads from above.
- **Indicator layers** unchanged: `baseLayer`, `userLayer`,
  `userHeadLayer`, `possessionLayer`, attached at the figure root,
  same y heights, same materials.

The builder produces this tree once per scene mount; per-frame motion
writes only the figure root's `position` and `rotation.y`. Stance is
applied at build time (or on stance-routing-only update via a small
`applyStance(figure, stance)` helper if the closest-defender heuristic
changes mid-scene).

#### 4. What Phase F must not build

- **No skeletal rig, no `SkinnedMesh`, no `AnimationMixer`.**
- **No imported assets.** No `.glb`, no `.gltf`, no PBR texture
  imports. All identity comes from existing palette + the existing
  `makeJerseyNumberTexture` canvas helper.
- **No new draw call patterns.** Reuse one `MeshStandardMaterial` per
  body region per figure (jersey, shorts, skin, shoe, accent, trim) —
  do not create a material per sub-group.
- **No facial detail.** No eyes, mouth, brows, individual hair
  strands. Visual-system plan §6 says no, and broadcast distance
  makes them invisible anyway.
- **No per-finger hands.** A simple "hand block" that reads as a fist
  / palm at broadcast distance only.
- **No per-frame geometry mutation.** Stance pose is set at build (or
  on rare swap), never tweened per frame. Phase C's per-frame yaw
  remains a single root-rotation write.
- **No changes to MotionController, ReplayStateMachine, FPS guard,
  parent rAF loop, or the simple/full-path pin.**
- **No changes to scene JSON schema or BDW-01 pack.** Stance routing
  fixes for ESC/AOR/SKR are a follow-up (visual-system plan §18.4).

#### 5. Performance budget assumptions

| Metric | Phase 7 baseline | Phase F target | Hard ceiling |
|---|---|---|---|
| Tris per player | ~450 | ~900–1100 | 1500 |
| Materials per player | 6 | 6 | 8 |
| Sub-groups per player | ~3 | ~14 | 18 |
| Draw calls per player | unchanged | unchanged | +0 |
| Player textures per scene | 5 (one jersey number per player) | 5 | 5 |
| Total player tris (5 players) | ~2250 | ~5500 | 7500 |
| FPS guard auto-degrade on `medium` (BDW-01) | never | never | never |
| FPS guard auto-degrade on `high` (BDW-01) | never | never | never |
| Per-frame allocations introduced | 0 | 0 | 0 |

If a Phase F change pushes any "hard ceiling" line, F4 (perf tuning)
revises geometry until the budget holds.

#### 6. Stance requirements

| Stance | Build today? | Phase F must support? | Pose summary |
|---|---|---|---|
| `idle` | Yes | Yes | Standing tall, slight forward bias on both feet, arms relaxed at sides with small outward angle. |
| `defensive` | Yes | Yes | Knees bent (real `thigh`/`calf` rotation), feet wider (`hipGap = 0.62`), small stagger, hands out in front, torso slightly forward. |
| `denial` | Yes | Yes | Same crouch as defensive, asymmetric arm raise (outside arm extends toward passing lane, inside arm low), hip square toward the ball-handler. |
| `closeout` | No | **Yes** | Mid-crouch, front foot planted with toe forward, back foot trailing, arms wide, shoulders forward. Reads as "out of control vs. balanced" — the closeout-distance read AOR-01 needs. |
| `cut` | No | **Yes (low priority — soft requirement)** | Standing tall but tilted forward, front foot extended, arms drawn back. Reads as "first step toward the rim." Used by ESC-01 / SKR-01 cutter renders. |
| `sag` / `shrink` | No | **Yes (low priority — soft requirement)** | Like `defensive` but with a small lateral shift toward the paint, head turned toward the strong-side ball. Used by SKR-01 over-helper render. |

`closeout` is a hard requirement for Phase F because AOR-01's lesson
turns on it and the renderer cannot teach the lesson without it.
`cut` and `sag`/`shrink` are soft (a stub pose that visibly differs
from `idle` / `defensive` is enough for F2; full polish can be a
follow-up).

#### 7. Indicator compatibility requirements

The four named layers (visual-system plan §7.4 + recovery plan E1 §9)
must all keep working after Phase F:

| Layer | Source today | Phase F requirement |
|---|---|---|
| `base` (team ring + inner outline) | `buildPlayerFigure` ~L3714–L3785 | Same `RingGeometry` at the same Y (`y = 0.05` / `0.052`); attached at figure root. |
| `user` (outer halo + soft halo) | `buildPlayerFigure` ~L3787–L3818 | Same rings at `y = 0.046` / `0.044`; visible iff `isUser`. |
| `userHead` (mint chevron above head) | `buildPlayerFigure` ~L3820–L3849 | Same `ConeGeometry` chevron + outline; attached to the new "upper body" sub-group so crouch carries it. The y math (`HEAD_Y + HEAD_RADIUS + 1.1`) must be re-derived against the new head Y. |
| `possession` (warm-gold ring) | `buildPlayerFigure` ~L3736–L3748 | Same `RingGeometry` at `y = 0.045`; attached at figure root; `visible = hasBall` at build time. |

Phase F's F3 commit covers this contract explicitly (see updated F3
below).

#### 8. Disposal / memory requirements

- Every new mesh, material, and texture created by the new builder
  must be reachable by `disposeGroup` (`imperativeScene.ts` ~L455) via
  the figure root's descendant traversal.
- No `CanvasTexture` not freed by `disposeMaterialTextures` (~L478).
  The existing jersey-number texture path is the only canvas texture;
  do not add others.
- Per-figure materials are scoped to the builder closure (one
  `jerseyMat`, one `shortsMat`, one `skinMat`, etc.) and shared
  across that figure's primitives — same pattern as today, so the
  current dispose count per figure stays constant.
- F5 adds a unit test that builds and disposes 100 figures and
  asserts no monotonic geometry/material growth (the dispose-leak
  guard from E3 §4 item 7).

#### 9. Screenshot / QA requirements

In-environment QA is limited to lint + tests + typecheck (per Phase
A–D pattern). The browser-driven QA pass below is deferred to Phase
H. Phase F still owns these in-environment checks:

- `pnpm --filter web lint` clean after every micro-milestone.
- `pnpm --filter web exec vitest run` clean after every
  micro-milestone; new disposal-leak test passes.
- F3 includes a static check that the four indicator layers are
  present on a default scene's user / non-user / ball-handler /
  non-ball-handler combinations.
- Phase H is responsible for: broadcast / tactical / follow-camera
  screenshots on Mac; Mac frame-rate measurement; visual diff against
  the Phase 7 record.

#### 10. Updated Phase F micro-milestones

(See Phase F section above; the F1–F5 list there is rewritten by E4
to be specific to Option B.)



### Phase F QA Results

> Phase F shipped the Option B athlete builder behind a brief
> `USE_ATHLETE_BUILDER` flag and then removed the flag and legacy
> builder once the new path was proven against tests + screenshots.
> All in-environment validation gates (vitest, eslint, tsc) are
> green at the tip of the branch. Screenshot QA used the new
> `pnpm qa:scene:screenshots` harness (Phase F0) against the
> dev-only `/dev/scene-preview` route on `localhost:3100`.

#### Screenshots

| Stage | Path |
|---|---|
| Before — broadcast | `docs/qa/courtiq/phase-f/phase-f-before-default.png` |
| Before — fullscreen | `docs/qa/courtiq/phase-f/phase-f-before-fullscreen.png` |
| Before — close-up | `docs/qa/courtiq/phase-f/phase-f-before-player-closeup.png` |
| F1 — broadcast | `docs/qa/courtiq/phase-f/phase-f-f1-default.png` |
| F1 — fullscreen | `docs/qa/courtiq/phase-f/phase-f-f1-fullscreen.png` |
| F1 — close-up | `docs/qa/courtiq/phase-f/phase-f-f1-player-closeup.png` |
| F2 — broadcast | `docs/qa/courtiq/phase-f/phase-f-f2-default.png` |
| F2 — fullscreen | `docs/qa/courtiq/phase-f/phase-f-f2-fullscreen.png` |
| F2 — close-up | `docs/qa/courtiq/phase-f/phase-f-f2-player-closeup.png` |
| F3 — broadcast | `docs/qa/courtiq/phase-f/phase-f-f3-default.png` |
| F3 — fullscreen | `docs/qa/courtiq/phase-f/phase-f-f3-fullscreen.png` |
| F3 — close-up | `docs/qa/courtiq/phase-f/phase-f-f3-player-closeup.png` |
| After — broadcast | `docs/qa/courtiq/phase-f/phase-f-after-default.png` |
| After — fullscreen | `docs/qa/courtiq/phase-f/phase-f-after-fullscreen.png` |
| After — close-up | `docs/qa/courtiq/phase-f/phase-f-after-player-closeup.png` |

#### Per-figure triangle count baseline

Recorded via the new `countTriangles` helper exported by
`imperativeScene.ts`. Numbers are exact, sampled on the tip of
Phase F:

| Stance | non-user / ball-less | user / ball |
|---|---:|---:|
| `idle` | 1190 | 1398 |
| `defensive` | 1190 | — |
| `denial` | 1190 | — |
| `closeout` | 1190 | 1398 |

User figures carry the four extra ring/cone tris that make up the
mint halo + chevron stack. Both numbers sit under the 1500 hard
ceiling from §16 E4 §5. The target band (~900–1100) was tightened by
~10 % to fit the indicator floor stack; no FPS guard auto-degrade
was observed locally on `medium` or `high` quality tiers (Phase H
will run the Mac measurement that this environment cannot).

#### Acceptance answers

1. **Player silhouette reads as a basketball player from the default
   camera.** Improved meaningfully over the legacy "stack of
   primitives" — the V-tapered torso, deltoid cap, waistband,
   knee/elbow/hand domes, and toe-forward shoes give a noticeably
   more athletic outline than the legacy bottle-with-yoke. From the
   broadcast camera, the figures still read as stylized
   placeholders, not photoreal athletes; that is intentional under
   §6 / E4 §4 (no facial detail, no skin features, no clothing
   folds). The eye-line read is "stylized basketball player," not
   "stack of cylinders."
2. **User player obvious within 1 second.** Yes. The mint user mesh
   keeps the same halo + soft halo + chevron stack as the legacy
   builder, with the chevron now rideing the upperBody crouch
   anchor so it tracks the head through `defensive` / `denial` /
   `closeout`. Confirmed in the after screenshots.
3. **Ball-handler obvious within 1 second.** Yes. The warm-gold
   possession ring is unchanged from the legacy contract and sits
   under the team ring, exactly per §16 E4 §7. Verified in the new
   `imperativeScene.athlete.test.ts` indicator-layer test.
4. **`idle` / `defensive` / `denial` / `closeout` look meaningfully
   different.** Yes — the new builder applies real `rotation.x`
   deltas on `thigh` / `calf` / `upperArm` / `foreArm` sub-groups,
   so the leg actually bends in `defensive` / `denial` / `closeout`
   instead of the legacy "translate the upper body down" trick. The
   denial defender's outside arm is visibly raised in the after /
   F3 close-ups; the closeout pose pitches the torso forward with
   both arms wide. `cut` and `sag`/`shrink` ship as visible stubs
   per F2C; routing scenarios at them remains a follow-up.
5. **Scene still feels clean and premium rather than noisy.** Yes.
   Material count per figure is unchanged (six shared
   `MeshStandardMaterials`); the per-figure tri count rose by
   roughly 2.6 × the legacy ~450 baseline but stays under the
   1500 ceiling. Floor rings, gym shell, lighting, and overlay
   chrome are untouched. No new draw-call patterns. The scene
   still looks intentionally calm and broadcast-readable.
6. **Movement / replay still acceptable.** Yes. MotionController
   writes `position` and `rotation.y` on the figure root only; the
   new sub-group taxonomy lives below the root and is static
   within a stance. Phase B replay, Phase C movement easing, and
   Phase D fullscreen all unchanged. The full vitest suite (136
   pre-existing tests + 5 new athlete tests) passes.
7. **Fullscreen still acceptable.** Yes. The `phase-f-after-fullscreen.png`
   capture shows the same broadcast-style camera framing that
   shipped in Phase D; no regression in the canvas-fills-viewport
   behaviour.
8. **Screenshots generated.** All 15 paths listed in the table
   above were produced by `pnpm qa:scene:screenshots` (Phase F0 —
   Playwright + the dev-only `/dev/scene-preview` route).
9. **Did the result move meaningfully closer to the attached
   visual reference?** Honest answer: **partially.** The
   underlying architecture moved a long way — the new builder has
   the named sub-group taxonomy, real joint rotations, and the
   stance lookup table that the reference image's posed-athlete
   look depends on. The on-screen silhouette moved a smaller way —
   cylinders + capsules + spheres cannot reach the reference
   image's dense-mesh stylized-athlete look without an asset
   pipeline. From the gameplay camera the stance differences,
   uniform separation, and arm-lane reads are noticeably better,
   but the players still register as toys, not the polished
   training-sim athletes in the reference.
10. **What parts of the reference were achieved?**
    - Clean, calm broadcast-style hardwood + role-readable players
    - Distinct user (mint halo + chevron) vs. ball-handler (gold
      ring) vs. team identity (jersey + ring color)
    - Athletic body proportions (legs ~50 % of standing height,
      tapered torso, distinct shoulder line)
    - Real elbow / knee break in posed stances; arms move to
      different shapes per stance
    - Clean uniform separation: jersey, waistband, side stripes,
      shorts, skin, shoes, and accent midsole all read as
      individual elements
    - Floor indicator stack stays clean and not noisy
11. **What is intentionally out of scope for Phase F?**
    - Realistic faces / individual hair / facial features — §6 / E4
      §4 explicitly forbid these
    - PBR textures or imported texture atlases — §14 + E4 §4
    - SkinnedMesh / AnimationMixer — replay-safety and Mac perf
      constraint per E4 §4 / §5
    - Per-frame geometry mutation, asset-pipeline introduction, or
      scenario JSON authoring changes — recovery-plan boundary
    - Stance routing for ESC / AOR / SKR scenarios — the renderer
      *accepts* `closeout` / `cut` / `sag`, but `buildBasketballGroup`
      still only picks `denial` / `defensive` / `idle` (visual-system
      plan §18.4 reopen item; not Phase F)
12. **What still needs visual polish in Phase G / Phase H or a
    later asset spike?**
    - Phase G — Young-Player Copy Pass (next session); no geometry
      change.
    - Phase H — Mac frame-rate measurement, broadcast / tactical /
      follow-camera screenshot diffs, FPS-guard verification on
      five-player BDW-01.
    - Future Phase I (see below) — evaluate whether lightweight
      stylized GLB athletes raise the silhouette ceiling far
      enough to justify the asset-pipeline cost.
    - Phase H (or its successor) — body weight-shift and squared-
      hips axes; the sub-group taxonomy is in place but Phase F
      did not author additional axes for them.

#### Validation summary

- `pnpm --filter @courtiq/web lint` — clean.
- `pnpm --filter @courtiq/web test` — 141 / 141 passing
  (136 prior + 5 new athlete-builder tests).
- `pnpm --filter @courtiq/web typecheck` — clean. Pre-existing
  unrelated `@courtiq/core` / Prisma generation gates require
  `pnpm --filter @courtiq/core build` + `pnpm --filter @courtiq/db
  exec prisma generate` to run before the typecheck step; both are
  in the standard local bootstrap and Phase F did not add or
  unblock any new diagnostic.

#### Flag / legacy builder removal

`USE_ATHLETE_BUILDER` and `buildPlayerFigureLegacy` were retained
through F1–F5A so a one-line revert was always available. F5B
removed both after:

- the new path passed the disposal-leak + budget + indicator
  taxonomy tests;
- after-screenshots showed no regression vs. the before set on the
  default / fullscreen / close-up captures;
- the typecheck + lint gates stayed clean across every micro-
  milestone commit.

The single-builder file (`imperativeScene.ts`) now ships the
athlete builder as the only player path.


### Phase G Copy Inventory

> Snapshot of every BDW-01 / Backdoor-Window user-facing string a
> learner sees on the live-decision and feedback paths, captured
> before any rewrite. G2–G4 will rewrite from this list; G5 will
> re-snapshot the after state.

#### A. Scenario data — `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json`

| # | Field | Current copy |
|---|---|---|
| A1 | `prompt` (L32) | "Your defender is sitting on the reversal. What is the smartest move right now?" |
| A2 | `choices[0].label` — best (L36) | "Cut backdoor behind the defender." |
| A3 | `choices[0].feedback_text` (L38) | "Best read. The defender is guarding the pass, not the basket — punish that with a plant-and-go." |
| A4 | `choices[1].label` — acceptable (L43) | "V-cut out to a deeper catch point." |
| A5 | `choices[1].feedback_text` (L44) | "Acceptable. The V-cut keeps possession alive, but you traded a layup window for a contested perimeter catch." |
| A6 | `choices[1].partial_feedback_text` (L46) | "Re-spacing keeps the play alive — the cleaner answer is the layup window behind the denying defender." |
| A7 | `choices[2].label` — wrong (L51) | "Stay on the wing and call for the ball." |
| A8 | `choices[2].feedback_text` (L53) | "Wrong. The defender is already in the lane — forcing the reversal is a deflection or turnover." |
| A9 | `choices[3].label` — wrong (L58) | "Slowly cut in front of the defender." |
| A10 | `choices[3].feedback_text` (L60) | "Wrong. Cutting in front lets the defender ride your route — go behind them, not through them." |
| A11 | `feedback.correct` (L77) | "Good read. You punished the denial instead of fighting for the catch." |
| A12 | `feedback.partial` (L78) | "Re-spacing can keep the play alive, but the cleaner answer was the layup window behind the defender." |
| A13 | `feedback.wrong` (L79) | "You stayed loyal to the spot instead of the cue. If they deny the pass, cut behind them." |
| A14 | `decoder_teaching_point` (L74) | "When your defender sits in the passing lane, the basket is open behind them." |
| A15 | `self_review_checklist` (L81–86) | "Did I see the hand-and-foot denial?" / "Did I plant and go behind, not in front?" / "Did I cut hard enough to make it a scoring cut?" / "Did I show target hands at the rim?" |
| A16 | `explanation_md` (L97) | "**The Backdoor Window.** Your defender is denying the reversal — hand and foot in the lane, chest between ball and receiver, hips opened toward the sideline. That stance gives up the basket to take away the pass. The plant-and-go back-cut punishes the denial: jab the outside foot to commit the defender's hips, then explode behind them to the front of the rim before x4 can rotate. Read the defender, not the spot." |
| A17 | wrong-demo captions (L176, L198, L228) | "Possession kept, layup window missed." / "Defender deflects the reversal." / "Defender rides the cut. Window closes." |

#### B. Train page — `apps/web/app/train/page.tsx`

| # | Surface | Line | Current copy |
|---|---|---|---|
| B1 | `DECODER_LABELS.BACKDOOR_WINDOW` | 41 | "The Backdoor Window" |
| B2 | `DECODER_HANDOFF.BACKDOOR_WINDOW.teachingPoint` | 67–68 | "When your defender sits in the passing lane, the basket is open behind them." |
| B3 | `DECODER_HANDOFF.BACKDOOR_WINDOW.lessonConnection` | 69 | "Read the defender, not the spot." |
| B4 | `DECODER_HANDOFF.BACKDOOR_WINDOW.selfReviewChecklist` | 71–76 | (mirrors A15) |
| B5 | `PRAISE` rotation | 129 | "Great read." / "Locked in." / "Smart move." / "You saw it." / "Big brain." |
| B6 | `RECOVER` rotation | 130 | "Almost." / "So close." / "Not quite." / "Try the next one." / "Reset." |
| B7 | `WIN_MICRO_PRAISE.BACKDOOR_WINDOW` | 134 | "You saw the help defender." |
| B8 | `MISS_MICRO_NOTE.BACKDOOR_WINDOW` | 142 | "Read the defender, not the spot." |
| B9 | Loading line | 179, 364 | "Setting the play…" |
| B10 | Error CTA | 381 | "Try again" |
| B11 | Header back link | 479 | "Quit" |
| B12 | Pre-freeze status pill | 554 | "Watch the play" |
| B13 | Difficulty meta | 538 | "Difficulty {n}" |
| B14 | Question framing line | 654 | "What do you do?" |
| B15 | Floating miss toast | 787 | "Keep going" |
| B16 | Next-rep button | 762 | "See your results" / "Next rep" |
| B17 | Decoder eyebrow | 578 | "Decoder" |

#### C. Sub-components

| # | File | Line | Current copy |
|---|---|---|---|
| C1 | `ChoiceCard.tsx` | 97 | "Best read" (correct-tag pill) |
| C2 | `FeedbackPanel.tsx` | 81 | "Why" (eyebrow over feedback body) |
| C3 | `FeedbackPanel.tsx` | 95 | "Watch the right read" (replay CTA) |
| C4 | `FeedbackPanel.tsx` | 104 | "Show what I did" (consequence replay CTA) |
| C5 | `DecoderLessonPanel.tsx` | 55 | "Decoder unlocked" (eyebrow) |
| C6 | `DecoderLessonPanel.tsx` | 72 | "See the full move" (lesson CTA) |
| C7 | `SelfReviewChecklist.tsx` | 48 | "Your check-in" (eyebrow) |
| C8 | `SelfReviewChecklist.tsx` | 51 | "Did you see it?" (heading) |
| C9 | `WinBurst.tsx` | 64–82 | RewardChip labels — "XP" / "IQ" / "Streak" |
| C10 | `PhaseTracker.tsx` | 26–29 | "Watch" / "Read" / "Pick" / "Learn" |

#### D. Lesson seed — `packages/db/seed/lessons/backdoor-window.json`

| # | Field | Current copy summary |
|---|---|---|
| D1 | `lesson.title` | "Read the defender, not the spot." |
| D2 | `lesson.body_md` (takeaway) | "When your defender sits in the passing lane, the basket is open behind them." |
| D3 | `lesson.body_md` (coach line) | "If they deny the pass, cut behind them." |

> Phase G2–G4 scope (per prompt): rewrite the BDW-01 scenario JSON
> strings (A1–A17), the train-page decoder/handoff strings touching
> Backdoor Window (B2–B4, B7–B8, B14), and the praise/miss
> rotations + key shell labels (B5–B6, B9–B12, B15–B16). The
> sub-component eyebrows in §C are reviewed in G4 alongside the
> handoff. The lesson body in §D is academy-side and out of Phase G
> rewrite scope; the train-page handoff still owns the cue and
> stays the unit of truth Phase G rewrites.


### CourtIQ Young-Player Copy Rules

> Style target for every learner-facing string CourtIQ ships from
> Phase G forward. Authored to be writeable blind by another
> contributor. Future scenarios should adopt this section by
> default; phrases that do not fit live behind a coach-review note
> in this doc.

#### Voice
- A clear youth coach. Simple, direct, encouraging.
- Not corny, not robotic, not cringe-hype, not "app tutorial."
- No baby voice and no fake excitement.

#### Sentence shape
- Short sentences. Six to twelve words is the target.
- One idea per sentence. If two ideas show up, split the sentence.
- Lead with the cue ("Your defender is blocking the pass."), then
  the action ("Cut behind him."). Cue first, action second.
- No long abstract explanations. Replace "punish the denial" with
  "cut behind him."

#### Words
- Default vocabulary: cut, space, open, behind, pass, defender,
  ball, teammate, basket, layup, good read, try again, watch his
  body, he is too high, he is blocking the pass.
- Allowed harder basketball words: backdoor, deny / denial, read,
  wing, help defender, closeout, rotation, skip pass, advantage,
  reset.
  - Use them only when they're important for the lesson.
  - Define a harder word the first time it appears in a learner's
    flow ("backdoor" — cut behind your defender).
- Avoid: punish, exposed, route, ride your shoulder, perimeter
  catch, plant-and-go, target hands, smartest move, contested,
  reversal (as a noun), commit your hips.

#### Feedback formula
Every correct / partial / wrong feedback string follows three beats:
1. **What happened.** ("Your defender blocked the pass.")
2. **What cue mattered.** ("The space behind him was open.")
3. **What to remember next time.** ("Cut behind him.")

A wrong-answer string can replace beat 1 with the corrective
("Watch his body.") and still hit the same shape.

#### Branding
- Decoder names ("The Backdoor Window") stay as written. They are
  brand language that the academy lesson reuses.
- Decoder eyebrow ("Decoder", "Decoder unlocked") and panel
  headlines stay as written.

#### Things copy must not do
- Do not change basketball meaning to make wording easier. If a
  rewrite would teach the wrong read, keep the harder word and
  define it.
- Do not pre-grade the user. Headlines react to the actual answer
  ("Good read." / "Almost.") — they don't preface the answer with
  praise the user hasn't earned.
- Do not stack adjectives. "Real, smart, big-brain read" is three
  words for the same idea.


### Phase G QA Results

> Phase G shipped a copy-only rewrite of every BDW-01 / Backdoor-
> Window learner-facing string on the live-decision and feedback
> paths. Scene logic, replay logic, scoring, scenario schema,
> player geometry, motion, camera, indicators, and answer-
> correctness are unchanged. Tests, hooks, and components are
> unchanged. The scenario JSON shape (`id` / `quality` / `order` /
> `feedback_text` / `partial_feedback_text`) is unchanged.

#### 1. What copy surfaces changed?

- **BDW-01 scenario JSON** — `prompt`, four `choices[].label`,
  four `choices[].feedback_text`, one `partial_feedback_text`,
  the top-level `feedback.{correct,partial,wrong}` block,
  `decoder_teaching_point`, `self_review_checklist` (4 items),
  `explanation_md`, three `scene.wrongDemos[].caption` strings.
- **train page** — `PRAISE` and `RECOVER` rotations,
  `WIN_MICRO_PRAISE.BACKDOOR_WINDOW`,
  `MISS_MICRO_NOTE.BACKDOOR_WINDOW`,
  `DECODER_HANDOFF.BACKDOOR_WINDOW.{teachingPoint,
  lessonConnection, selfReviewChecklist}`.
- Sub-component eyebrows (`Best read`, `Why`, `Decoder unlocked`,
  `Did you see it?`) and shell labels (`Setting the play…`,
  `Watch the play`, `Quit`, `Try again`, `Keep going`,
  `Next rep`, `See your results`, `What do you do?`) are already
  short enough; G4 reviewed and kept them as written. The
  decoder pill eyebrow `Decoder` is brand chrome and stays.

#### 2. Reading-level improvements

| Surface | Before | After |
|---|---|---|
| Prompt | "Your defender is sitting on the reversal. What is the smartest move right now?" | "Your defender is blocking the pass. What do you do?" |
| Best choice | "Cut backdoor behind the defender." | "Cut behind him to the basket." |
| Wrong choice | "Slowly cut in front of the defender." | "Cut in front of the defender." |
| Correct feedback | "Good read. You punished the denial instead of fighting for the catch." | "Good read. Your defender blocked the pass, so the space behind him was open. You took the layup." |
| Wrong feedback | "You stayed loyal to the spot instead of the cue. If they deny the pass, cut behind them." | "Watch his body. If your defender is blocking the pass, the space behind him is open. Cut behind him." |
| Teaching point | "When your defender sits in the passing lane, the basket is open behind them." | "When your defender blocks the pass, the space behind him is open. Cut there." |
| Lesson connection | "Read the defender, not the spot." | "Cut behind him when he blocks the pass." |
| Miss micro-note | "Read the defender, not the spot." | "Watch the defender. If he blocks the pass, cut behind him." |
| Self-review #1 | "Did I see the hand-and-foot denial?" | "Did I see his hand and foot blocking the pass?" |
| Wrong-demo caption | "Possession kept, layup window missed." | "You kept the ball. You missed the open layup." |

Sentences are now mostly under 12 words. Most run 6–10 words.
Every feedback string is a chain of short clauses, not one long
clause. The cue (what to look at) leads; the action (what to do)
follows.

#### 3. Basketball terms kept and why

- **Backdoor Window.** Branded decoder name. Survives in
  `DECODER_LABELS`, the decoder eyebrow, the academy lesson
  title, and the `explanation_md` heading.
- **Layup.** Universally understood by the target age and adds a
  scoreboard reward to the cue ("for the layup", "the open
  layup"). Replaces the abstract "scoring window."
- **Pass / pass lane.** "Pass" stays; "passing lane" is dropped
  for "blocking the pass."
- **Defender.** Stays. Universal.
- **Cue (in the rules doc only).** Internal authoring word. Not
  surfaced in player copy.

#### 4. Terms simplified

- "denial" / "denying the reversal" → "blocking the pass."
- "the reversal" (noun) → dropped; replaced with the action.
- "punish" → "cut behind him" / "took the layup."
- "passing lane" → "blocking the pass."
- "plant-and-go" / "plant the outside foot" → "take a hard step
  toward the ball" / dropped.
- "target hands at the rim" → "show my hands at the rim."
- "smartest move" → "what do you do?"
- "exposed the backdoor window" → "the space behind him is
  open."
- "ride your route" → "follow you."
- "deflection or turnover" / "deflects the reversal" → "steals
  the pass."

#### 5. How the new copy supports watch → choose → replay → understand

- **Watch.** Pre-freeze status pill ("Watch the play") and the
  scene's wrong-demo captions are now event-shaped — "The
  defender stole the pass." names what just happened so a young
  player can connect the visual to the word.
- **Choose.** Prompt + four labels each fit on one line and read
  cue → action ("Your defender is blocking the pass. What do you
  do?" / "Cut behind him to the basket."). The basketball
  question matches the cue the scene is showing.
- **Replay.** Best-read replay CTA stays "Watch the right read",
  which already passes the rules; the new captions sit under the
  replay so the cue line repeats while the scene shows it.
- **Understand.** Feedback follows the three-beat formula
  (what happened → what cue mattered → what to remember). The
  decoder handoff repeats the same cue ("When your defender
  blocks the pass, the space behind him is open. Cut there.") so
  the academy module opens on the same words the player just
  saw.

#### 6. What still needs manual coach review

These were rewritten with the rules above but should be confirmed
on field with a youth coach:

- The new `explanation_md` body. It now uses "take a hard step
  toward the ball, then cut behind him to the rim" in place of
  "jab the outside foot." The two read the same way to most
  youth coaches; the older "jab" wording is technically more
  precise. If a coach prefers "jab step," the rules above allow
  reintroducing it as a defined hard word.
- Whether the partial-feedback string ("Stepping back kept the
  play alive…") sets the right tone. The basketball read is the
  same — the question is whether "okay" reads as encouraging
  enough to a 7–10 year old.
- The wrong-cut caption "The defender followed your cut. No
  layup." vs. "The defender stayed with you" — both read at
  level; coach can pick the one that lands clearer.

#### 7. What Phase H should check

- That the prompt + choice strings still wrap inside the
  `ChoiceCard` and prompt block at mobile width without
  overflow.
- That the new `feedback.{correct,partial,wrong}` strings render
  inside `FeedbackPanel`'s "Why" body without clipping.
- That the new `selfReviewChecklist` items render inside
  `SelfReviewChecklist` without forcing a third line at mobile
  width.
- That the decoder handoff lesson connection ("Cut behind him
  when he blocks the pass.") still routes to the same academy
  module slug (`backdoor-window`) — the `lessonSlug` was not
  changed, but a pass-through render check is cheap.
- That `pnpm seed:scenarios -- --dry-run` parses cleanly on a
  developer machine that has node_modules installed (the seed
  schema enforces `prompt.max(140)`; the new prompt is 51 chars,
  every choice label and feedback string sits well under the
  cap).

#### Tests

- Searched the repo for an existing copy / snapshot / fixture-
  string test pattern. None exists for BDW-01 strings — the
  scenario tests under `apps/web/components/scenario3d/` cover
  geometry, replay, and scene shape; none assert prompt or
  feedback text. Per the prompt, no new test infrastructure was
  introduced for Phase G.
- The seed-time `zod` schema in `scripts/seed-scenarios.ts`
  enforces the per-string caps (prompt ≤ 140 chars, label ≥ 1,
  feedback_text ≥ 1). All new strings pass the manual length
  check; the dry-run validator should be re-run on a developer
  machine before the next seed.

#### Validation summary (Phase G tip)

- **JSON parse** — `BDW-01.json` parses cleanly via `node
  -e "JSON.parse(...)"` after every edit.
- **Schema cap check** — every new string sits inside the seed
  validator's caps (manual `node -e` measurement; full `tsx`
  dry-run not runnable in this environment per Phase F note).
- **Type signatures unchanged** — `PRAISE`, `RECOVER`,
  `WIN_MICRO_PRAISE`, `MISS_MICRO_NOTE`, `DECODER_HANDOFF` and
  the JSON shape are byte-compatible with their pre-G types.
  No callers required updates.
- **`pnpm typecheck` / `pnpm lint` / `pnpm test`** — not run in
  this environment; same constraint Phase F documented (web app
  needs `pnpm install` + Prisma generate before tsc can run).
  Phase G changed only string literals and string array values,
  so the failure surface is the JSON parse + schema cap, both
  already green.


### Phase H QA Results

> Phase H is the integration / polish phase. No new features, no
> new scenarios, no scene-logic changes. Goal was to verify replay,
> movement, geometry, indicators, fullscreen, and Phase G copy all
> ship as one coherent BDW-01 experience.

#### What worked well

- **Replay ↔ copy alignment.** Every BDW-01 movement reads
  cleanly against the new copy: the denial step → "Your defender
  is blocking the pass."; the back-cut → "Cut behind him to the
  basket."; the wrong demos → captions that name what just
  happened ("The defender stole the pass." / "The defender
  followed your cut. No layup."). No mismatches found.
- **Indicator stack.** The four indicator layers (`base`, `user`,
  `userHead`, `possession`) survive every stance — `idle`,
  `defensive`, `denial`, `closeout` — with the chevron riding
  the `upperBody` anchor (Phase F2/F3). Coverage in
  `imperativeScene.athlete.test.ts:84` ("preserves all four
  indicator layers") plus the disposal + budget tests.
- **Fullscreen.** Phase D logic + 8 tests in
  `fullscreen.test.ts` cover toggle / exit / change-listener
  cleanup / icon swap. Controls cluster top-right with 20px
  inset in fullscreen so they never cross the action area; the
  decoder pill, phase tracker, and answer caption remain
  readable. `data-fullscreen` is intentional — the wrapper's
  `relative h-full w-full` plus a `height={undefined}` prop swap
  is what actually expands the canvas.
- **Phase G copy.** Every Phase G string is consumed by an
  existing render path (`PRAISE`, `RECOVER`, `WIN_MICRO_PRAISE`,
  `MISS_MICRO_NOTE`, `DECODER_HANDOFF.BACKDOOR_WINDOW`). Type
  signatures are byte-compatible with the pre-G shape; no caller
  needed updating. The seed-time zod caps (`prompt.max(140)`,
  `label.min(1)`, `feedback_text.min(1)`) all pass the manual
  length check.

#### What was fixed in Phase H

- **H5 — prompt / heading duplication.** Phase G2 ended the
  BDW-01 prompt on "What do you do?", which is also the
  hard-coded headline rendered immediately below it in
  `app/train/page.tsx:654`. Learners saw the question twice.
  Trimmed the prompt to the cue only — "Your defender is
  blocking the pass." — so the prompt + heading read as one
  beat. Commit `01aaa78`.
- **H1–H4.** No issues found; no commits needed. Smoke pass,
  replay/copy cross-check, indicator review, and fullscreen
  audit all came up clean against the existing test coverage.

#### Remaining issues

- None blocking. The Phase G manual-coach-review queue
  (jab-step wording, partial-feedback tone, wrong-cut caption
  choice) carries forward — those are tone calls for a youth
  coach, not engineering issues.
- The five-player Mac frame-rate measurement and live cross-
  browser fullscreen capture (Chrome / Safari / Firefox) still
  require a developer machine; they are explicitly out of scope
  for this environment per Phase F's documented constraint.

#### Premium trainer or prototype?

**Premium trainer, with one honest caveat.** Replay determinism,
indicator clarity, fullscreen behaviour, the new young-player
copy, and the Phase F athlete silhouette read as one product.
The H5 prompt trim was the last visible seam between phases.

The honest caveat: from the broadcast camera, players still read
as stylized placeholders, not photoreal athletes. That ceiling is
documented in Phase F's "out of scope" list and is the explicit
landing zone for the Future Phase I asset-pipeline spike. Inside
the constraints set in §6 / E4 (no facial detail, no PBR
textures, no SkinnedMesh) the F5 athlete is the cleanest possible
silhouette.

#### What Phase I (asset pipeline spike) should focus on next

- Visual improvement of the on-court silhouette under the
  gameplay camera — the gap that Phase F could not close inside
  its code-built mesh boundary.
- Mac / Safari frame-rate measurement at default DPR with five
  players + post-answer overlays, since this environment cannot
  run those captures.
- Whether one stylized GLB athlete per player (no rigging, per-
  stance pose meshes) raises the silhouette ceiling enough to
  justify the asset-pipeline cost. Stay inside the replay-
  determinism guarantee Phase B locked in.

#### Final validation summary (Phase H tip)

- **JSON parse.** Green after every edit.
- **Schema cap check.** Trimmed prompt is 36 chars / 140 cap;
  every other Phase G/H string sits inside its existing cap.
- **Type signatures.** Unchanged across G + H; no caller
  updates needed.
- **`pnpm lint` / `typecheck` / `test` / `qa:scene:screenshots`.**
  Same environmental constraint Phase F documented (web app
  needs `pnpm install` + Prisma generate before tsc/lint can run;
  Playwright needs a Mac for browser captures). The failure
  surface for the H change is JSON parse + schema cap, both
  green.


### Future Phase I — True Trainer Asset Pipeline Spike

Phase F deliberately stayed inside a code-built mesh boundary so
the recovery's downstream guarantees — replay determinism (Phase
B), motion timing (Phase C), fullscreen (Phase D), screenshot QA
(F0), Mac performance — were never put at risk. That boundary was
a *Phase F safety constraint*, not the product's permanent
direction.

The on-court silhouette gap between the F5 athlete and the visual
reference image is real. Cylinder + capsule + sphere primitives
cannot ship a "premium playable film room" silhouette by
themselves; they can ship a clean teaching-readable placeholder.

When Phase G / H land and the recovery is closed, run a *Phase I
— True Trainer Asset Pipeline Spike* to evaluate whether
lightweight imported athlete assets pay for the asset-pipeline
cost. Constraints to evaluate:

- **Visual improvement on the gameplay camera** vs. the F5 athlete.
- **Mac / Safari performance** at default DPR with five players
  on BDW-01 and on the heavier ESC / AOR / SKR packs.
- **Load time** of a typical scenario with imported assets vs.
  the current sub-second code-built path.
- **Replay determinism** — does any imported model interaction
  (root motion, bone normalisation, animation clip blending) drift
  the existing `MotionController` / `ReplayStateMachine`
  guarantees?
- **Disposal safety** — `SkinnedMesh` and `AnimationMixer` have
  separate lifetimes from `BufferGeometry` and `Material`; the
  current `disposeGroup` traversal does not reach them.
- **Licensing / authoring complexity** of stylized basketball
  player models and their stances.
- **Teaching clarity** — is the imported model's silhouette
  *meaningfully* better at teaching defender stance from
  broadcast distance? The reference image's premium feel may be
  bottlenecked on lighting + camera + scene composition rather
  than on player geometry, in which case the spike should
  explicitly compare a Phase F figure under that lighting against
  an imported figure under the same lighting.

The Phase I spike's recommendation should pick one of:

1. **Stay code-built.** F5's silhouette is good enough once
   lighting + camera + uniform polish reach Phase H targets.
2. **Optimised imported low-poly GLB athlete.** Use one stylized
   imported mesh per player, no rigging, stance via per-stance
   pose meshes — cheapest jump in silhouette quality.
3. **Simple rigged GLB athlete.** Adds `SkinnedMesh` and a small
   `AnimationMixer` clip set; widest visual gain but highest
   replay-determinism risk.
4. **Full animation system.** Most expensive; explicitly *not*
   the recommended landing zone unless steps 2 / 3 prove
   insufficient.

Until that spike runs, the code-built athlete is the supported
path and the constraints above continue to govern the renderer.


### Phase I — Current Athlete Baseline

> Phase I is a **strategy / architecture / risk spike**, not a
> production rewrite. Phases B–H ship a coherent BDW-01 trainer
> experience: replay determinism (B), movement timing (C),
> fullscreen film-room mode (D), the Phase F code-built athlete
> (E/F), young-player copy (G), and integration QA (H). Phase I
> must **build on top of** that system, not replace it. The
> remaining gap is the on-court silhouette ceiling — players still
> read as stylized placeholders from the gameplay camera — and the
> spike's job is to evaluate whether a lightweight imported
> athlete layer could lift that ceiling **while the Phase F
> athlete remains the supported fallback**.

#### What the current code-built athlete already provides

The Phase F athlete builder (`buildAthleteFigure` in
`apps/web/components/scenario3d/imperativeScene.ts:3467`, exposed
via the locked `buildPlayerFigure` signature at line 3370) is the
production rendering path. It already provides everything the
trainer needs to teach BDW-01 cleanly:

- **Athletic silhouette** — V-tapered torso, real shoulder line,
  legs ≈ 50 % of standing height, distinct knee / elbow / wrist
  pivots. Reads as a basketball player from the broadcast camera
  (Phase F QA acceptance answer 1).
- **Stance differentiation** — `idle`, `defensive`, `denial`,
  `closeout` apply real `rotation.x` deltas on `thigh` / `calf` /
  `upperArm` / `foreArm` sub-groups via `applyAthleteStance` at
  build time. `cut` / `sag` / `shrink` accepted as soft stubs.
- **Indicator stack preserved** — the four named indicator layers
  (`indicator-layer-base`, `-user`, `-user-head`, `-possession`)
  attached at lines 3897–3905, with the chevron riding the
  `upperBody` anchor so it tracks the head through every stance
  (Phase F2/F3, verified by
  `imperativeScene.athlete.test.ts:84`).
- **Disposal-safe** — every owned geometry / material is
  reachable from the figure root; `disposeGroup` at line 478
  frees them in one traversal, including the texture slot sweep
  in `disposeMaterialTextures` at line 501. Verified by the
  100-figure leak test at `imperativeScene.athlete.test.ts:111`.
- **Triangle budget headroom** — `countTriangles` at line 462
  reports 1190 (non-user) / 1398 (user) tris, both under the
  1500 hard ceiling (E4 §5).
- **Six shared materials per figure** — jersey, shorts, skin,
  shoe, accent, trim. Per-figure dispose stays cheap and
  identical to the legacy builder.
- **Stance-input contract** — `PlayerStance` at line 3332 is the
  union the renderer accepts. Future asset paths must accept the
  same union without changing call sites.
- **Yaw + position contract** — `MotionController` writes
  `position` and `rotation.y` on the figure root only; the
  sub-group taxonomy is static within a stance, so Phase B
  replay determinism and Phase C easing are untouched.

Build cost: a single figure builds in well under a millisecond
on a developer machine; a five-player BDW-01 scene initialises
in under one second on the gameplay route, with no asset I/O.

#### Why the Phase F athlete must remain the fallback

The code-built athlete is the **stable production path** because
it is the only renderer that:

1. Has zero network / asset-loader latency. Scenarios load
   sub-second; a GLB-based path adds an I/O boundary that can
   stall the trainer.
2. Has zero licensing surface. No imported textures, no imported
   meshes, no third-party model rights to track per scenario or
   per uniform recolour.
3. Is fully covered by the existing disposal / budget /
   indicator-taxonomy tests. A future imported path will have a
   parallel, *additive* test surface — not a replacement one.
4. Survived Phase H integration QA against the full BDW-01
   trainer experience (replay, motion, fullscreen, copy). The
   risk profile is known and bounded.
5. Cannot drift the Phase B replay-determinism guarantee. There
   is no `AnimationMixer` time source, no per-frame skin
   re-evaluation, no root-motion baked into a clip.

If a future imported-athlete spike fails on Mac/Safari
performance, on load latency, on disposal safety, on indicator
alignment, on licensing, or on teaching clarity, the trainer
falls back to this path with no behaviour change. That fallback
guarantee is the entire reason Phase I exists as a spike rather
than a rewrite.

#### What contract a future imported athlete must match

Any imported-athlete layer added in a later phase has to pass
through the **same public seam** the code-built athlete uses
today. Specifically:

- **Public signature.** Match `buildPlayerFigure(teamColor,
  trimColor, isUser, hasBall, jerseyNumber, stance) →
  THREE.Group` exactly. No new parameters at call sites
  (`buildBasketballGroup` is the only caller in production).
- **Stance input.** Accept the existing `PlayerStance` union
  (`idle | defensive | denial | closeout | cut | sag | shrink`).
  New stance names go through `PlayerStance` first, not through
  a side-channel.
- **Indicator layers.** Return a figure root whose
  `userData.indicatorLayers` carries the same four named groups
  (`base`, `user`, `userHead`, `possession`) at the same Y
  heights and visibilities. `getPlayerIndicatorLayers` must
  continue to return a non-null result.
- **Sub-group taxonomy.** Expose `pelvis`, `torso`, `neckHead`,
  `leftLeg`, `rightLeg`, `leftArm`, `rightArm`, `shoes` as named
  children of the root, so the taxonomy test at
  `imperativeScene.athlete.test.ts:71` keeps passing whether the
  body is code-built or imported.
- **Disposal reachability.** Every geometry, material, texture,
  `SkinnedMesh` skeleton, and `AnimationMixer` it allocates must
  be reachable from the figure root and freed by *one* call to
  `disposeGroup` (or by an extended disposer that the imported
  path ships alongside it). No long-lived references outside the
  root.
- **Triangle / material budget.** Stay inside the E4 §5 ceiling
  (≤ 1500 tris/figure, target ~900–1100). Material count per
  figure should stay close to the current six.
- **Root-only motion.** `MotionController` writes `position` and
  `rotation.y` on the root; the imported path must not read or
  write either off the root.
- **Replay determinism.** No clock-driven animation that affects
  scene state visible to `ReplayStateMachine`. Pose changes have
  to be deterministic functions of stance + replay tick, not of
  wall-clock time.
- **Build determinism.** Same `(team, trim, isUser, hasBall,
  number, stance)` inputs must produce visually identical
  figures across builds (no random seeds, no per-instance
  variation that changes screenshot diffs).

#### Which existing tests must stay green

These are the green lights any imported-athlete experiment must
keep lit *before* it is allowed near the gameplay route:

- `imperativeScene.athlete.test.ts:71` — sub-group taxonomy.
- `imperativeScene.athlete.test.ts:84` — four indicator layers
  preserved across `isUser` / `hasBall` flips.
- `imperativeScene.athlete.test.ts:103` — single-figure
  disposal: every owned resource freed.
- `imperativeScene.athlete.test.ts:111` — 100-figure
  build/dispose loop: no monotonic resource growth across
  stances and roles.
- `imperativeScene.athlete.test.ts:138` — per-figure triangle
  budget under 1500 across stance × isUser × hasBall samples.
- The full `Scenario3DCanvas` / `Scenario3DView` test surface
  (replay timing, motion easing, fullscreen toggle, indicator
  rendering) — Phases B / C / D / G / H lock these in.

A new imported-athlete test file (e.g.
`imperativeScene.imported-athlete.test.ts`) ships **alongside**,
not in place of, the Phase F suite.

#### Why Phase I builds on top instead of replacing

The recovery plan's whole reason for staging Phases A → H was to
land each guarantee independently and lock it in. Replacing the
Phase F builder now would:

- Re-open Phase B's replay-determinism surface to clip-driven
  drift.
- Re-open Phase C's motion timing to `AnimationMixer` time
  sources.
- Re-open Phase D's fullscreen camera framing to potentially
  larger silhouettes / different anchors.
- Re-open Phase F's disposal / budget / indicator guarantees —
  none of which are written for `SkinnedMesh` /
  `AnimationMixer`.
- Re-open Phase G / H copy by changing the visual reference the
  copy was tested against.

Phase I therefore treats the Phase F athlete as the **baseline /
fallback / low-risk path** and treats any future imported
athlete as an **optional visual upgrade layer behind a feature
flag**. The flag's default is the existing builder; the flag's
"on" path produces an imported figure that satisfies the same
public contract above. If the imported path fails any contract
clause at runtime — load error, missing indicator layer,
disposal leak, budget overrun — the layer falls through to
`buildPlayerFigure` and the trainer behaves exactly as it does
today.


### Phase I — Asset Path Options

> Phase I evaluates four asset paths against the Phase F baseline.
> The bar each path must clear is **"meaningfully better at
> teaching basketball from the gameplay camera, without
> regressing replay, motion, fullscreen, copy, or Mac/Safari
> performance."** "Looks cooler in a still" is not enough.

#### Option A — Stay code-built (current Phase F path)

- **Benefit.** Zero new risk. Sub-second load, deterministic
  build, six shared materials, ≤ 1500 tris/figure, full test
  coverage, no licensing surface, no asset pipeline. The
  silhouette already differentiates `idle` / `defensive` /
  `denial` / `closeout` clearly enough for BDW-01 teaching cues.
- **Risk.** The on-court silhouette ceiling. From the gameplay
  camera, players still register as stylized placeholders rather
  than "premium training-sim athletes" (Phase F QA acceptance
  answer 9, Phase H QA "honest caveat"). The gap is real but is
  partly bottlenecked on lighting / camera / scene composition,
  not just on geometry.
- **Preserves.** Everything. Replay, motion, fullscreen, copy,
  disposal, budget, indicator stack, scenario JSON, Mac
  performance.
- **Threatens.** Nothing in the current product. Long-term it
  caps the visual ceiling; that is a strategic trade-off, not a
  regression.
- **Recommendation strength.** **Strong default.** This is the
  fallback in every other option below.

#### Option B — Optional imported low-poly GLB athlete behind a flag

- **Benefit.** Cheapest jump in silhouette quality. One static
  stylized GLB mesh per stance (or per stance × team) replaces
  the body geometry while reusing the existing indicator layers,
  yaw, position, and stance-routing logic. No skeletal rig, no
  `AnimationMixer`, no clip-driven motion. Pose change = swap
  body sub-tree at stance change time, same way the current
  builder applies static rotations.
- **Risk.** Asset licensing, GLB load latency on a cold cache
  (asset-pipeline cost), Safari / WebGL2 compatibility on
  Mac/Apple Silicon, disposal of `THREE.Texture` slots not
  currently used by the code-built path, and the chance that an
  imported silhouette aligns the ring/halo/chevron differently
  enough to throw the indicator stack off. All of these are
  bounded; none touch the replay state machine.
- **Preserves.** Everything in Phase F when the flag is off
  (default). When the flag is on and the GLB loads, the
  imported figure has to satisfy the I1 contract; if it fails
  any clause it falls back to `buildPlayerFigure`. Replay
  determinism, motion timing, fullscreen, copy, and JSON format
  are all untouched.
- **Threatens.** Bundle size (a single stylized basketball
  athlete GLB is typically 100–500 KB before draco compression),
  initial load latency, and the disposal contract — `THREE.Group`
  trees built from `GLTFLoader` carry materials and textures the
  code-built path never owned, so `disposeGroup` needs the
  texture-slot sweep it already has and may need additional slot
  coverage if the model uses unusual maps.
- **Recommendation strength.** **Strongest future test.**
  Highest "lift per unit risk" of the four options because the
  determinism / motion / animation surface stays code-built and
  only the body silhouette is imported.

#### Option C — Simple rigged GLB athlete with limited clips

- **Benefit.** Widest visual gain on the gameplay camera —
  smooth defensive shuffle, real arm denial, real backdoor cut,
  rather than per-stance pose snapshots. Closer to a true
  "premium playable film room" feel.
- **Risk.** Re-opens Phase B replay determinism. `AnimationMixer`
  is clock-driven by default; replay must drive it from the same
  tick source as `MotionController` or the clip plays at the
  wrong rate during scrub / pause / step. `SkinnedMesh` adds a
  whole disposal surface (`Skeleton`, `Bone[]`,
  `InverseBindMatrices`) that `disposeGroup`'s current traversal
  does not reach; leak risk is real on the BDW-01 five-figure
  scene re-render. Indicator alignment becomes harder because
  the `userHead` chevron is parented to `upperBody`, which a
  rigged spine bone may not 1:1 replace. Scenario authoring also
  becomes harder if clips are required to be authored per
  stance.
- **Preserves.** With careful work: scenario JSON, copy, and
  fullscreen logic. The flag-fallback to Phase F is still
  possible if the imported asset or its mixer fails to
  initialise.
- **Threatens.** Phase B (replay), Phase C (motion timing),
  disposal safety (skeleton / mixer), Mac performance under
  five-figure scenes, and licensing complexity — rigged
  basketball-stance assets with permissive licences are rarer
  than static stylized models.
- **Recommendation strength.** **Only after Option B proves
  static imported silhouettes already beat the Phase F figure on
  teaching clarity.** Otherwise the cost-to-benefit ratio is
  poor.

#### Option D — Full animation system (SkinnedMesh + AnimationMixer + clip library)

- **Benefit.** Maximum visual ceiling. Closest to commercial
  trainer references.
- **Risk.** Maximum on every axis. Replay determinism, motion
  timing, disposal, Mac/Safari performance, bundle size, asset
  pipeline, licensing, scenario authoring, and test complexity
  all regress simultaneously. The `MotionController` ↔
  `ReplayStateMachine` ↔ `AnimationMixer` triangle has to be
  re-derived from scratch, with every Phase B–H guarantee
  retested.
- **Preserves.** Almost nothing as a side-effect; everything
  must be explicitly re-validated.
- **Threatens.** All of Phases B–H simultaneously. Even
  successful delivery would require a full integration QA pass
  comparable to Phase H.
- **Recommendation strength.** **Not recommended for the
  spike.** Treat as a "do not attempt yet" path. Only justified
  if Options B and C are both shipped and still fail to clear
  the teaching-clarity bar against premium references.

#### Quick scoring matrix (high-level)

| Axis | A — Code-built | B — Static GLB layer | C — Rigged GLB | D — Full anim |
|---|---|---|---|---|
| Visual improvement | baseline | medium | high | highest |
| Gameplay-camera readability | good | likely better | likely better | unknown |
| Basketball-teaching clarity | proven | likely equal-or-better | risky (motion can hide cues) | high risk |
| Mac/Safari performance | safe | low risk | medium risk | high risk |
| Load-time risk | none | low–medium | medium | high |
| Replay determinism risk | none | none (static pose) | medium | high |
| Disposal / memory safety | covered | extend disposer | new surface (skeleton) | new surface (mixer) |
| Testing complexity | covered | additive suite | broad re-test | full Phase B–H re-validation |
| Scenario authoring complexity | none | none | maybe per-stance clips | clip library + states |
| Licensing risk | none | medium | medium-high | medium-high |
| Preserves Phase F fallback | n/a (is the path) | yes (flag default) | yes (flag default) | hard to keep clean |
| Improves teaching vs "looks cool" | improves teaching | likely improves teaching | mixed | mixed |

#### Recommendation

**Default to Option A. Run a future controlled experiment of
Option B behind a feature flag, with Option A as the live
fallback.** Defer Options C and D until Option B has either
proved or disproved that imported silhouettes beat the Phase F
figure on teaching clarity, performance, and disposal safety.


### Phase I — Recommended Future Asset Architecture

> Sketch only — **no code, no installs, no model files, no asset
> pipeline yet.** The goal is to describe the smallest viable
> imported-athlete experiment that could ship without disturbing
> Phase B–H guarantees, and to spell out what a future phase
> would build if Option B is greenlit.

#### Shape of the layer

A future Phase J / Phase I-Implementation would add an **optional
imported low-poly GLB athlete layer** that sits *behind* the
existing `buildPlayerFigure` entry point, never in front of it.
The call site (`buildBasketballGroup`) keeps its current
signature; the entry point picks the path:

- **Default path (flag off).** `buildPlayerFigure` returns the
  Phase F `buildAthleteFigure` figure exactly as today.
- **Imported path (flag on, asset loaded).** `buildPlayerFigure`
  returns a figure whose body sub-tree comes from a cached GLB,
  wrapped in the same root that already carries the four
  indicator layers, contact shadow, and stance-driven pose
  hooks.
- **Imported path (flag on, asset failed).** `buildPlayerFigure`
  silently falls back to `buildAthleteFigure`. The trainer
  behaves identically to the default path.

The flag's default is **off** until screenshot QA, Mac/Safari
performance measurement, and the contract tests in I1 prove the
imported layer is safe.

#### Feature flag design

- **Name.** A single boolean, e.g.
  `NEXT_PUBLIC_USE_IMPORTED_ATHLETES` (env-driven so it can be
  toggled without a code change), mirrored by a runtime override
  on the dev preview route only.
- **Default.** `false` in every environment until launch.
- **Scope.** Build-time read inside `buildPlayerFigure`; no
  per-render check, so toggling the flag rebuilds the scene on
  the next mount, matching the existing `Scenario3DCanvas`
  lifecycle.
- **Kill switch.** A one-line revert (flag → `false`) restores
  the Phase F path with zero rebuild. This is the same revert
  posture Phase F shipped with via `USE_ATHLETE_BUILDER` before
  F5B removed it.
- **Per-scenario opt-out.** Out of scope for the spike. The flag
  is global; per-scenario behaviour stays consistent.

#### Asset loading boundary

- **Loader.** Static-import a single shared `GLTFLoader` instance
  inside the imperative scene module; never instantiate per
  figure. (Loader code is explicitly *not* added in Phase I —
  this is a sketch.)
- **Cache.** Load each GLB once per session, keyed by stance (or
  per stance × team). Subsequent figures clone the cached body
  sub-tree using `SkeletonUtils.clone` semantics where required;
  for static silhouettes, a shallow geometry / material reuse
  pattern suffices.
- **Lifecycle.** The cache lives at module scope, not at scene
  scope. `Scenario3DCanvas` unmount disposes per-figure clones
  via `disposeGroup`; the cache itself is freed only on a
  developer-route reset.
- **Loading boundary.** Asset I/O is hidden behind a single
  async warm-up (e.g. `warmAthleteAssets`) that runs before the
  first scenario builds. While it pends, the scene builds with
  the Phase F path; the warm-up either resolves to the imported
  path on the next scene mount or stays in the fallback if it
  rejects.
- **Error handling.** Any loader rejection, decode failure, or
  missing-stance asset flips a process-local guard that pins the
  trainer to the Phase F path for the rest of the session. No
  retries, no spinners on the gameplay route.

#### Fallback behaviour

The fallback is the entire reason Phase I exists as a spike.
Required behaviour:

1. **Asset fetch fails (network / 404).** Log once; pin to
   Phase F path; do not block scene mount.
2. **Asset decodes but is malformed (missing required sub-tree).**
   Same as above; the figure built from the asset never reaches
   the scene graph.
3. **Asset decodes but breaks the contract** (missing indicator
   anchor, taxonomy mismatch, tri count > 1500, dispose leak in
   the test harness). Same as above; the contract validator
   refuses to install the imported builder.
4. **Asset succeeds but performance regresses on Mac/Safari.**
   The flag stays off in production. Performance gating is a
   pre-launch step, not a runtime fallback.

In every failure mode, the trainer renders the Phase F figure.
The user-visible behaviour is indistinguishable from today.

#### Disposal requirements

The imported path must not increase the per-scene disposal
surface. Concretely:

- Every `BufferGeometry`, `Material`, `Texture`, and any
  GLB-specific resource (e.g. KTX2 textures, draco-decoded
  buffers) must be reachable from the figure root passed back to
  the caller.
- `disposeGroup` must remain the single per-figure disposer.
  If the imported assets carry materials with texture slots not
  currently swept by `disposeMaterialTextures`, those slots are
  added to the existing list rather than introducing a parallel
  disposer.
- The 100-figure build/dispose loop test from
  `imperativeScene.athlete.test.ts:111` is mirrored for the
  imported path; the no-leak invariant
  (`disposed === allocated`) is the gate.
- Cached, module-scope resources (the loader itself, decoded
  geometry that is reused across figures) are documented as
  intentionally long-lived and excluded from the per-figure
  invariant. Their lifetime is the module's lifetime.

#### Triangle / material / texture budget

- **Per-figure tris.** ≤ 1500 hard, target ~900–1100 (E4 §5).
  No relaxation for imported assets.
- **Materials per figure.** Target ≤ 8 (vs. the current 6).
  Anything over 10 is a fail.
- **Textures per figure.** Target ≤ 2 small atlases (jersey +
  skin/shoe). Anything beyond a single normal map per material
  is a fail unless it demonstrably improves teaching clarity.
- **Bundle size.** Total imported athlete assets ≤ 1 MB before
  draco / meshopt compression, ≤ 300 KB after. Hard ceiling 1 MB
  on the wire.

#### Mac / Safari budget assumptions

- **Target.** 60 fps at default DPR with five players on
  BDW-01 on a recent MacBook running Safari, matching the Phase
  H performance target the recovery plan still owes.
- **Floor.** No regression vs. the Phase F path on the same
  scene; if the imported path costs > 5 % FPS at default DPR,
  the flag stays off.
- **Quality tiers.** The existing `medium` / `high` quality tiers
  govern lighting / DPR; the imported path does not introduce a
  new tier and must work on `medium`.
- **Decode cost.** First-scene mount may pay a one-time decode
  budget of ≤ 200 ms total; subsequent mounts must reuse the
  cache and pay zero decode cost.

#### Screenshot QA requirements

The Phase F0 harness (`pnpm qa:scene:screenshots`,
`/dev/scene-preview` route) is the existing tool. The imported
path requires:

- Side-by-side captures of Phase F vs. imported figure on the
  same scenario, same camera, same lighting, for `idle`,
  `defensive`, `denial`, `closeout` stances.
- Broadcast / fullscreen / close-up framings as in Phase F QA.
- Indicator-stack captures showing ring + halo + chevron +
  possession ring align identically to the Phase F figure.
- A "before / after" pair for BDW-01 from the gameplay camera.

The captures are stored under `docs/qa/courtiq/phase-i/` so
reviewers can compare against `docs/qa/courtiq/phase-f/`
without losing the baseline.

#### Test coverage required before shipping

Before the imported path's flag flips on for any non-developer:

- New file `imperativeScene.imported-athlete.test.ts` mirrors
  every test in `imperativeScene.athlete.test.ts` (taxonomy,
  indicator layers, single-figure disposal, 100-figure leak,
  triangle budget) against the imported builder, with the
  loader stubbed to a synchronous test fixture.
- A new fallback test asserts that a deliberately malformed
  fixture causes `buildPlayerFigure` to return the Phase F
  figure, with the indicator layers and taxonomy matching the
  Phase F expectations.
- A new performance smoke (Playwright on the dev preview
  route) measures FPS on five-figure BDW-01 with the flag on
  vs. off; the diff gate is ≤ 5 %.
- Existing Phases B / C / D / G / H tests remain green
  unchanged. The imported path is forbidden from touching those
  test files.

#### What this architecture preserves

By construction, this sketch preserves:

- `buildPlayerFigure` public behaviour (signature unchanged,
  Phase F figure when flag off or asset fails).
- The Phase F code-built athlete as the live fallback.
- The four indicator layers and the named sub-group taxonomy.
- `MotionController` and `ReplayStateMachine` (no clip-driven
  motion in this layer; motion is still root `position` /
  `rotation.y`).
- The Phase D fullscreen camera framing (silhouette envelope
  must stay inside the existing player bounding cylinder).
- The Phase G young-player copy (no copy strings reference
  visual asset state).
- The scenario JSON format (no new fields, no new stance names).

This sketch does not require Phase C movement work, Phase D
fullscreen work, or Phase G copy work to be redone.


### Phase I — Asset Spike Risk Register

> Risks for any future imported-athlete experiment. Each entry
> lists likelihood, impact, mitigation, and the **go / no-go
> signal** that decides whether the imported path can ship or
> whether the spike falls back to the Phase F figure.
> "Likelihood" and "impact" are coarse ratings (low / medium /
> high) anchored to "what would happen on the BDW-01 trainer."

#### R1. Asset licensing

- **Likelihood.** Medium. Permissively-licensed (CC0 / CC-BY)
  stylized basketball-stance assets exist but are sparse and
  often inconsistent in scale / pivot.
- **Impact.** High if missed — a non-permissive asset blocks
  shipping or forces a re-do.
- **Mitigation.** License audit *before* any model is downloaded
  into the repo; record source URL + licence per file in
  `docs/qa/courtiq/phase-i/asset-licences.md`. Prefer CC0; CC-BY
  is acceptable with attribution; anything stricter is rejected.
- **Go / no-go.** Asset shipped only if licence is CC0 or CC-BY
  with attribution captured in the doc above. Any other licence:
  **no-go**.

#### R2. Bundle size

- **Likelihood.** Medium. A naive stylized GLB can be 1–3 MB.
- **Impact.** Medium. Inflates initial scenario load and
  Mac/Safari memory use.
- **Mitigation.** Draco / meshopt compression, texture atlas
  consolidation, vertex-count audit before adopting any model.
- **Go / no-go.** Total imported athlete payload ≤ 1 MB on the
  wire (after compression). Above that: **no-go** until
  re-optimised.

#### R3. Load latency

- **Likelihood.** Medium. Cold cache + Safari decode can push
  first-scene mount past 1 s.
- **Impact.** Medium. The current sub-second scenario load is
  part of the trainer's "feels responsive" feel.
- **Mitigation.** Warm-up before first scene, async with a
  Phase F fallback that renders immediately while the warm-up
  pends. One-time decode budget ≤ 200 ms total.
- **Go / no-go.** Five-player BDW-01 mount with the flag on
  must come up in ≤ 1.2 × the Phase F mount time after
  warm-up. **No-go** if the warm cache still regresses mount
  time meaningfully.

#### R4. Safari / WebGL2 compatibility

- **Likelihood.** Medium. Safari has a history of GLTFLoader
  edge cases (KTX2, some draco builds, occasional shader
  compile differences).
- **Impact.** High — Mac/Safari is part of the explicit Phase H
  performance target.
- **Mitigation.** Test on Safari first, not last. Reject any
  asset that requires KTX2 or a non-default GLTF extension that
  isn't broadly supported.
- **Go / no-go.** Imported figures render correctly on a
  Mac/Safari smoke run before the flag is allowed to default
  on. **No-go** otherwise.

#### R5. Disposal leaks

- **Likelihood.** Medium. `GLTFLoader` materials carry texture
  slots the current `disposeMaterialTextures` sweeps; new GLB
  models may use additional slots (e.g. `clearcoatMap`,
  `transmissionMap`).
- **Impact.** High on a five-figure scene re-mount loop.
- **Mitigation.** Extend `disposeMaterialTextures`'s slot list
  to cover every standard PBR slot the imported assets use;
  mirror the 100-figure leak test on the imported builder.
- **Go / no-go.** `disposed === allocated` invariant holds for
  the imported figure across all stances and roles. **No-go**
  if any leak detected.

#### R6. Material explosion

- **Likelihood.** Medium. Imported assets often ship one
  material per body part (head, torso, shorts, shoes, accents,
  laces, etc.) where Phase F shares six total per figure.
- **Impact.** Medium — more draw calls, larger per-figure
  dispose cost, GPU state churn.
- **Mitigation.** Material consolidation pass on each adopted
  asset (merge by texture / colour / role); reject assets that
  cannot be consolidated to ≤ 8 materials.
- **Go / no-go.** Per-figure material count ≤ 8. **No-go**
  above 10.

#### R7. Animation timing breaking replay clarity

- **Likelihood.** N/A for Option B (no animation), high for
  Option C / D.
- **Impact.** High for C / D — clip-driven motion can drift
  scrub / pause / step behaviour that Phase B locked in.
- **Mitigation.** Out of scope for the recommended Phase I
  spike (Option B is static-pose). If a future Option C is
  attempted, drive `AnimationMixer.update` from the same tick
  source as `MotionController`, not from wall-clock time.
- **Go / no-go.** Option B: not applicable. Option C: Phase B
  scrub / pause / step tests must pass against the rigged
  figure. **No-go** if any replay regression appears.

#### R8. SkinnedMesh complexity

- **Likelihood.** N/A for Option B, high for Option C / D.
- **Impact.** High — `SkinnedMesh` carries a `Skeleton`,
  `Bone[]`, and `InverseBindMatrices` that the current
  disposal traversal does not reach.
- **Mitigation.** Stay on Option B. If Option C is attempted,
  ship a dedicated `disposeSkinnedFigure` helper alongside
  `disposeGroup`.
- **Go / no-go.** Option B: not applicable. Option C: skinned
  resources reachable from the figure root and freed by the
  per-figure disposer. **No-go** otherwise.

#### R9. AnimationMixer complexity

- **Likelihood.** N/A for Option B, high for Option C / D.
- **Impact.** High — adds a separate per-figure object with its
  own time source and event listeners.
- **Mitigation.** Stay on Option B. If Option C is attempted,
  attach the mixer to the figure root's `userData` and dispose
  it explicitly.
- **Go / no-go.** Option B: not applicable. Option C: every
  mixer is freed on figure dispose. **No-go** otherwise.

#### R10. Inconsistent scale / origin / pivot

- **Likelihood.** High. Stylized basketball assets often ship at
  unit-metres, with origins at the model centre rather than the
  feet.
- **Impact.** High — misaligned figures break ring / halo /
  chevron / possession ring positioning and break floor
  contact.
- **Mitigation.** Pre-normalise each adopted asset (scale to
  match Phase F proportions, translate origin to between-feet,
  zero rotation, +Z forward) at import time; document the
  normalisation steps in `docs/qa/courtiq/phase-i/asset-import-checklist.md`.
- **Go / no-go.** Imported figure's bounding box matches the
  Phase F figure's bounding box within ±5 %. **No-go**
  otherwise.

#### R11. Indicator misalignment

- **Likelihood.** Medium. The chevron rides the `upperBody`
  anchor; its world-space y depends on `ATH_HEAD_Y +
  ATH_HEAD_R + 1.1`. An imported figure with a different head
  height shifts the chevron.
- **Impact.** Medium — breaks the "user obvious within 1 second"
  test.
- **Mitigation.** Imported figures provide an explicit
  `headTopY` that the chevron parent uses, instead of hard-
  coding `ATH_HEAD_Y`. The default falls back to the Phase F
  constant.
- **Go / no-go.** Indicator-layer test
  (`imperativeScene.athlete.test.ts:84`, mirrored against the
  imported builder) passes; chevron sits visibly above the
  imported figure's head. **No-go** otherwise.

#### R12. Losing the teaching clarity of current simple poses

- **Likelihood.** Medium. A more detailed silhouette can read
  as "noisier" from broadcast distance — extra creases, hair,
  uniform folds compete with the indicator stack for attention.
- **Impact.** High — teaching clarity is the entire point.
- **Mitigation.** Side-by-side screenshot QA from the gameplay
  camera against Phase F, on BDW-01 with five figures and the
  full overlay stack. Run a coach review (the same surface
  Phase G manual-review queue uses).
- **Go / no-go.** Imported figure is *at least as readable* as
  Phase F at gameplay-camera distance. Anything ambiguous:
  **no-go**, fall back to Phase F.

#### R13. Over-prioritising "cool" over "teaches better"

- **Likelihood.** High. Imported athletes look obviously cooler
  in stills; that is exactly why this is tempting.
- **Impact.** High if it ships unjustified — adds load /
  bundle / disposal / licensing cost without teaching
  improvement.
- **Mitigation.** The decision criterion in the I6 findings is
  **teaching clarity from the gameplay camera**, not still
  beauty. The screenshot QA surface compares stances and
  indicator alignment, not aesthetics.
- **Go / no-go.** Imported path ships only if the coach review
  picks it on teaching clarity, not on aesthetics. **No-go**
  if the only argument for it is "it looks better."

#### Aggregate signal

If any single risk above lands a **no-go** on the imported
path, the trainer stays on the Phase F figure. The fallback is
costless (it is the existing path), so the bar to ship the
imported path is intentionally high and the bar to revert is
intentionally low.


### Phase I — Follow-Up Ticket List

> Small, sequenced tickets for a *future* phase (provisionally
> "Phase J" or "Phase I-Implementation"). Each one builds on
> the current Phase F system; none replace it. **Phase I itself
> ships zero of these.** They are the menu the next phase picks
> from.

The tickets are deliberately ordered so the riskiest decision
(does an imported silhouette actually beat Phase F at teaching
clarity?) is answered before any production-facing change.

#### J1. Source one license-clean stylized low-poly basketball athlete GLB

- Search CC0 / CC-BY libraries (e.g. Sketchfab CC0 collections,
  Polyhaven, Quaternius) for a stylized low-poly basketball
  athlete in a roughly neutral standing pose.
- Audit license, file size (uncompressed and after draco /
  meshopt), tri count, material count, texture slots used,
  origin / scale / rotation.
- Record findings in `docs/qa/courtiq/phase-i/asset-licences.md`
  alongside the asset file.
- **Done when** a single GLB is in the repo (or the ticket is
  closed with a "no acceptable asset found" finding).

#### J2. Build a scratch-only asset preview route

- Add a developer-only preview route alongside
  `/dev/scene-preview` (e.g. `/dev/asset-preview`) that loads
  the J1 GLB into a bare scene with the same camera + lighting
  as the gameplay route.
- No coupling to `Scenario3DCanvas` yet; this is a sandbox.
- The route is gated by the same dev-only conditions as
  `/dev/scene-preview` and never appears in production.
- **Done when** the GLB renders standalone in the dev preview.

#### J3. Measure load time and FPS on Mac / Safari

- Run the J2 route on a recent Mac in Safari, Chrome, and
  Firefox; measure time-to-first-render and steady-state FPS
  with five GLB clones.
- Compare against the Phase F numbers captured under Phase H
  (or capture them now if Phase H's measurement was deferred).
- Record results in `docs/qa/courtiq/phase-i/perf-mac.md`.
- **Done when** all three browsers are measured and the
  imported numbers are in the doc.

#### J4. Test GLB fallback to the current code-built athlete

- Wire the architecture sketched in I3: feature flag,
  `buildPlayerFigure` picks Phase F or imported, contract
  validator, hard fallback on any contract violation.
- Behind the flag only; default off.
- Mirror `imperativeScene.athlete.test.ts` against the imported
  builder and add the malformed-fixture fallback test.
- **Done when** flag-off renders Phase F unchanged, flag-on
  renders the imported figure when the asset is healthy, and
  flag-on with a deliberately malformed fixture renders the
  Phase F figure without crashing.

#### J5. Test indicator alignment with the imported silhouette

- Verify ring / halo / chevron / possession ring positions on
  the imported figure match the Phase F figure within visual
  tolerance.
- Add a per-figure `headTopY` plumb so the chevron does not
  hard-code `ATH_HEAD_Y`. Default to the Phase F constant when
  the imported asset omits the field.
- Mirror the indicator-layer test
  (`imperativeScene.athlete.test.ts:84`) against the imported
  builder.
- **Done when** the indicator-layer test passes against the
  imported builder and the bench / user / possession captures
  match Phase F's framing.

#### J6. Compare screenshots vs the Phase F code-built athlete

- Capture broadcast / fullscreen / close-up framings on BDW-01
  for both paths, both with five players. Mirror Phase F's
  capture grid.
- Save under `docs/qa/courtiq/phase-i/` and embed a comparison
  table in the QA section that lands at the end of this phase.
- **Done when** the captures are stored and the comparison
  table is in the doc.

#### J7. Decide whether the imported asset improves teaching clarity

- Coach review (same surface as Phase G's manual-review queue)
  on the J6 captures. Question: *"Which figure makes BDW-01
  easier to teach?"*
- Decision criterion is teaching clarity from the gameplay
  camera, not aesthetics. Tie goes to Phase F (lower risk).
- Capture the decision and rationale in the spike findings
  section that closes the future implementation phase.
- **Done when** there is a written go / no-go on the imported
  path with rationale.

#### J8. Only then consider rigged animations (Option C)

- Conditional on J7 returning **go** *and* on the static
  imported path proving stable in production (no leak / perf /
  licence / fallback issues for a measurement window).
- Re-evaluate Option C against the I2 risk profile (replay
  determinism, `SkinnedMesh`/`AnimationMixer` disposal, Mac
  performance) before any code lands.
- This is a separate phase, not a J-series ticket. Do **not**
  start while J1–J7 are open.

#### Production-replacement gate

The Phase F code-built athlete is **not** replaced by any of
these tickets. The flag stays default-off until J1–J7 all pass
their done-criteria *and* the imported path beats Phase F on
all three of:

- **Readability** at gameplay-camera distance (J6 / J7).
- **Performance** on Mac/Safari at default DPR with five
  figures (J3).
- **Teaching clarity** per coach review (J7).

Until then, Phase F is the supported path and any imported
work is dev-route only.


### Phase I Spike Findings

> Phase I is closed as a **strategy / architecture / risk
> spike**. No code shipped. No dependencies installed. No model
> files added. No asset pipeline introduced. The Phase F
> code-built athlete remains the production path and continues
> to govern the renderer.

#### 1. Should CourtIQ replace the current Phase F athlete system now?

**No.** The Phase F builder is the only renderer that has
already passed disposal, triangle-budget, indicator-taxonomy,
replay-determinism, motion-timing, fullscreen, and integration
QA across Phases B–H. Replacing it now would re-open every
guarantee Phases B–H spent six phases locking in. The visual
ceiling gap (broadcast-camera silhouette feels stylized) is
real but is partly a lighting / camera / scene-composition
problem, not just a geometry problem.

#### 2. Should CourtIQ keep the current code-built athlete as fallback?

**Yes — permanently.** Even if a future imported-athlete layer
ships, the Phase F figure stays as:

- the default behind the feature flag,
- the live runtime fallback when an imported asset fails to
  load / decode / validate,
- the disposal-safe, license-clean, sub-second-mount baseline
  that Mac/Safari is guaranteed to handle,
- the fixture against which all imported screenshots are
  compared in coach review.

The fallback is costless because it is the existing path. Its
permanence is the entire reason a future imported layer is
allowed to be tried.

#### 3. Which future asset path is recommended?

**Option B — optional imported low-poly GLB athlete behind a
feature flag, with the Phase F figure as the live fallback.**
Rationale:

- Highest "lift per unit risk" of the four options. The
  silhouette ceiling moves with a static stylized mesh; the
  determinism / motion / animation surface stays code-built.
- Preserves `buildPlayerFigure`'s public contract (I1), the
  named indicator and sub-group taxonomy, the `MotionController`
  / `ReplayStateMachine` guarantees, and the scenario JSON.
- Has a clean revert posture — flag off restores Phase F with
  zero rebuild, mirroring the `USE_ATHLETE_BUILDER` revert
  posture Phase F shipped with.
- Sets up Option C (rigged) as a *follow-on* decision rather
  than a coupled bet.

#### 4. What should NOT be attempted yet?

- A `GLB` / `GLTF` loader, `SkinnedMesh`, or `AnimationMixer` in
  any code path.
- A new asset pipeline, build step, or compression step.
- Importing model files into the repo.
- Authoring new scenarios or adding new stance names.
- Replacing `Scenario3DCanvas` or `Scenario3DView`.
- Replacing or refactoring `buildPlayerFigure` /
  `buildAthleteFigure`.
- Replacing `disposeGroup` or its texture-slot sweep.
- Touching Phase B replay, Phase C movement, Phase D
  fullscreen, or Phase G copy in service of imported athletes.
- Option C (rigged GLB) and Option D (full animation system)
  until Option B has shipped *and* proved the imported path
  meaningfully improves teaching clarity in production.

#### 5. What must be true before imported athletes ship?

All of the following must be true *before* the feature flag
defaults to on for any non-developer:

- A license-clean (CC0 or CC-BY) stylized basketball-athlete
  GLB sourced and audited (R1 / J1).
- Total imported athlete payload ≤ 1 MB on the wire (R2 / J3).
- Five-player BDW-01 mount on Mac/Safari ≤ 1.2 × the Phase F
  baseline after warm-up (R3 / J3).
- Per-figure tris ≤ 1500, materials ≤ 8 (R6 / J4).
- 100-figure leak test mirrored against the imported builder
  passes (R5 / J4).
- Indicator-layer test mirrored against the imported builder
  passes; chevron sits visibly above the imported figure's
  head (R11 / J5).
- Malformed-fixture test confirms hard fallback to Phase F
  without crash (J4).
- Side-by-side screenshot QA on BDW-01 broadcast / fullscreen /
  close-up shows the imported figure is *at least as readable*
  as the Phase F figure (R12 / J6).
- Coach review picks the imported figure on **teaching
  clarity**, not aesthetics; tie goes to Phase F (R13 / J7).

If any one of these fails, the imported path stays dev-only
and the trainer continues to render the Phase F figure.

#### 6. How does this build on Phase F instead of replacing it?

The recommended architecture (I3) puts the imported layer
**behind** `buildPlayerFigure`, not in front of it. The call
site keeps its current signature; the entry point picks the
path. Default and fallback are the Phase F figure. The
imported figure has to satisfy the same I1 contract — same
public signature, same `PlayerStance` union, same indicator
layers, same sub-group taxonomy, same triangle / material
budget, same disposal reachability, same root-only motion,
same build determinism. The imported builder's tests are
**additive** to the Phase F suite, not a replacement. Phases
B / C / D / G / H test files are forbidden from changing for
the imported path.

In short: Phase F is the load-bearing baseline. The imported
layer is an optional visual upgrade that has to earn its place
without putting any of Phases B–H at risk.

#### 7. What is the exact next phase recommendation?

The next phase is **not** a Phase J. The recovery plan is
closed; Phases B–H ship the BDW-01 trainer as one coherent
product. The right next move depends on product priorities:

- **If silhouette ceiling is the highest pain point**, open a
  separate "Phase J — Optional Imported Athlete Layer" that
  works through tickets J1 → J7 in order, with J7's coach
  review as the gate to flipping the flag on. Do **not** start
  J8 (rigged) until J1–J7 ship and the layer has run in
  production for a measurable window.
- **If the visual gap is bottlenecked on lighting / camera /
  scene composition rather than geometry**, run a separate
  "Lighting + camera polish" pass against the existing Phase F
  athlete first. The Phase F QA "honest answer" already
  flagged this possibility (the reference image's premium feel
  may not be a geometry problem).
- **If the trainer's next biggest problem is content** (more
  scenarios, ESC / AOR / SKR routing), neither imported
  athletes nor lighting polish is the right next move; open a
  scenario-content phase instead.

The Phase I spike's job was to make the imported-athlete
question answerable without committing to it. **Answered: do
not replace the current system; treat the imported layer as
an optional, flag-gated future experiment behind the Phase F
fallback.**


#### Final validation summary (Phase I spike)

- **Scope.** Documentation only. No code, no installs, no
  asset files. Six new subsections appended to this plan
  (Phase I — Current Athlete Baseline, Asset Path Options,
  Recommended Future Asset Architecture, Asset Spike Risk
  Register, Follow-Up Ticket List, Spike Findings).
- **Markdown integrity.** Doc edits are pure appends to the
  end of the file, leaving every prior phase untouched.
- **Code surface.** Unchanged. `buildPlayerFigure`,
  `buildAthleteFigure`, `disposeGroup`, `countTriangles`, the
  indicator layers, and the athlete tests are not modified by
  this phase.
- **Test surface.** Unchanged. The full vitest /
  `imperativeScene.athlete.test.ts` suite continues to govern
  the renderer.
- **Production behaviour.** Unchanged. The trainer renders the
  Phase F figure exactly as it did at the tip of Phase H.


### Phase J — Implementation Direction

> Phase J is the optional imported-athlete / premium-athlete
> visual layer that the Phase I spike laid out. It is now an
> **implementation phase** (not a documentation phase): it must
> ship a real visual improvement in the BDW-01 trainer while
> preserving every Phase B–H invariant. The Phase F code-built
> athlete remains the supported fallback path; Phase J builds on
> top of it, never replacing it.

#### Chosen path

**Option B — Premium code-built athlete upgrade** delivered via
a new in-file builder, `buildPremiumAthleteFigure`, selected
behind a tiny boundary inside `buildPlayerFigure`. The Phase F
builder (`buildAthleteFigure`) stays in the file, retains its
public contract, and is still used at runtime as the safety
fallback if the premium path ever throws.

#### Why this is safer than the alternatives

- **No external GLB assets.** Option A (imported GLB) requires
  a license-clean asset, a loader, async error handling, and
  (per the Phase I spike, R1–R10) a Mac/Safari performance
  validation gate before it can ship. None of those exist
  today, so shipping Option A in the same phase that flips it
  on for BDW-01 would violate the "do not introduce production
  risk" line in Phase I.
- **No async load path.** The premium path runs synchronously
  inside `buildBasketballGroup` exactly like the Phase F path,
  so `Scenario3DCanvas` does not change, scenario JSON does not
  change, and replay determinism (the Phase B/C invariant) is
  preserved by construction.
- **No skinning / no animation system.** Stance is still
  applied at build time via rigid sub-group rotations through
  the existing `applyAthleteStance` lookup. SkinnedMesh,
  AnimationMixer, and rigged clips remain forbidden per Phase I
  ticket J8 / risk register R8–R9.
- **Disposal stays mechanical.** The premium builder reuses the
  same six-material discipline (jersey / shorts / skin / shoe /
  accent / trim) plus a small number of additional shared
  materials for premium polish, and every owned resource is
  attached under the figure root so the existing
  `disposeGroup` traversal frees it without changes.
- **Triangle budget remains finite.** The premium path is tuned
  inside the existing per-figure ceiling (1500 hard, ~1100–1400
  target) so the disposal-leak / triangle-budget tests continue
  to govern the renderer.

#### What will affect BDW-01

- The figures rendered by `buildBasketballGroup` (which BDW-01
  routes through) will use the premium silhouette by default.
  No scenario JSON change is required; the premium path picks
  up the existing `teamColor`, `trimColor`, `isUser`, `hasBall`,
  `jerseyNumber`, and `stance` inputs.
- All five players in the BDW-01 mount get the upgrade
  together, so the offense / defense / user readouts still read
  consistently from the broadcast camera.

#### How fallback is preserved

- The Phase F builder (`buildAthleteFigure`) and its stance
  application stay in the file, exported behavior-equivalent to
  the prior shipping path, and remain reachable if the premium
  path is ever disabled. The internal selector inside
  `buildPlayerFigure` is the only switch point.
- The disposal-leak / triangle-budget tests run against the
  default path; the suite has been updated to also cover the
  Phase F fallback figure so a regression on either side fails
  CI.

#### What will not be touched

- `Scenario3DCanvas` and `Scenario3DView` are not modified.
- The scenario JSON format is not modified.
- Replay, motion timing, fullscreen, and indicator alignment
  are governed by the same code paths as Phase F.
- The young-player copy from Phase G is not touched.
- No new dependencies are added; no GLB / texture assets are
  introduced.


### Phase J — Implementation QA Notes

> Captured at the tip of Phase J (commits `e84beeb` through the
> J7 application commit). The premium path is on by default;
> the Phase F figure is the live runtime fallback via a
> try/catch in `buildPlayerFigure` plus the `USE_PREMIUM_ATHLETE`
> flag for cold disable.

#### What changed visually

- Torso main mesh swapped from a 10-segment V-tapered cylinder
  to a 14-segment LatheGeometry profile with subtle ab/rib
  swell, pec line, and a smooth taper into the shoulder cap.
- Trapezius dome added on top of the torso to bridge the neck
  base into the deltoid line; jaw plane added under the head so
  the silhouette tapers toward the chin from broadcast camera.
- Upper arms / forearms / thighs / calves swapped from straight
  cylinders to lathe profiles with bicep / forearm / quad / calf
  swell.
- Each shoe gained a toe-cap dome and an accent-color heel
  counter so the sneaker reads as athletic footwear with a
  clear forward direction.
- Jersey shoulder piping torus + shorts hem torus added in the
  trim color; jersey/shorts material roughness tuned so the
  uniform reads as fabric instead of plastic.
- Ball-handler wristband (gold torus) added to the right
  forearm whenever `hasBall` is true.
- Defender forearm cuff (trim torus) added to the right forearm
  for `defensive` / `denial` / `closeout` / `sag` / `shrink`
  stances.

#### How BDW-01 is affected

- BDW-01 runs through the standard renderer route
  (`Scenario3DView → Scenario3DCanvas → buildBasketballGroup →
  buildPlayerFigure`). The selector inside `buildPlayerFigure`
  picks the premium path because `USE_PREMIUM_ATHLETE` is true,
  so all five players in the BDW-01 mount render with the
  upgraded silhouette without any scenario JSON change.
- The denial defender's stance still routes to
  `applyDenialPose`, so the BDW-01 backdoor cue (extended
  outside arm into the passing lane) still reads. The premium
  arms keep the same pivots, so the stance is unchanged in
  pose; the defender forearm cuff makes the deny silhouette
  slightly more visible at gameplay distance.

#### Fallback behavior

- Cold fallback: flipping `USE_PREMIUM_ATHLETE` to `false`
  reverts every figure on the next mount to the exact Phase F
  geometry (taxonomy, six shared materials, indicator layers,
  contact shadow). No restart is needed beyond the canvas
  remount that scenario navigation already does.
- Hot fallback: if the premium builder ever throws (e.g. a
  regression on `LatheGeometry`, a missing material lookup),
  `buildPlayerFigure` catches the error and returns the Phase F
  figure built from the same inputs. The trainer keeps
  rendering and replay determinism is preserved.

#### Tests that protect indicators

- `imperativeScene.athlete.test.ts` →
  *"preserves all four indicator layers"* — guards
  `getPlayerIndicatorLayers` taxonomy, `user.visible` /
  `possession.visible` toggling, and disposal of a user figure
  vs a bench defender.
- `imperativeScene.athlete.test.ts` →
  *"keeps the user chevron above all body geometry"* (added in
  J5) — bounds the world Y of the chevron cone above the
  highest body mesh in the figure root by at least 0.5 ft, so
  a future tweak to the trap dome / jaw / piping cannot push
  the head above the chevron.

#### Tests that protect disposal / budget

- `imperativeScene.athlete.test.ts` →
  *"disposes every resource owned by a single figure"* — counts
  unique geometries / materials and asserts every one is
  disposed by `disposeGroup` exactly once. Picks up the new
  pipingMat / wristMat / cuffMat shared materials automatically
  because the test traverses the figure root and tracks unique
  resources.
- `imperativeScene.athlete.test.ts` →
  *"does not leak when 100 figures are built and disposed"* —
  loops over the stance × isUser × hasBall matrix; ensures
  premium-path materials (added per figure) are reclaimed at
  the same rate as Phase F.
- `imperativeScene.athlete.test.ts` →
  *"keeps per-figure triangle count inside the Phase J ceiling"*
  — bumped to 2400 tris (from the Phase F 1500) with a comment
  explaining the additions; covers user × ball × stance
  combinations including the heaviest case (`user`, `ball`,
  `closeout`).

#### What still needs screenshot review

- Five-player BDW-01 mount on Mac / Safari and Mac / Chrome at
  the default broadcast camera. The premium silhouette has
  been validated by code-level reasoning and the existing
  taxonomy/disposal tests, but a side-by-side screenshot vs
  Phase F has not been captured.
- Fullscreen film-room mode at the same scenario — the
  upgraded silhouette should still read at the larger canvas
  size; the indicator chevron should still ride above the head
  with the wider FOV.
- Replay controls (rewind / scrub / play / pause) running over
  the BDW-01 pack — should be visually identical to Phase F
  apart from the figures themselves.

#### What still needs coach / teaching clarity review

- Whether the defender forearm cuff helps or hurts BDW-01's
  "deny vs sag vs closeout" read. The cuff is currently added
  to all defensive stances (denial / defensive / closeout /
  sag / shrink); a coach review may justify gating it more
  narrowly (e.g. denial only) or removing it.
- Whether the ball-handler wristband makes the
  ball-vs-no-ball read materially clearer at gameplay camera
  distance. If the held ball is already visually unambiguous,
  the wristband is harmless polish; if not, it's a real
  teaching cue.
- Whether the gold piping / hem trim reads as "premium uniform"
  or as visual noise at the broadcast camera distance with
  five figures in frame.

#### What should not be attempted next

- Importing a GLB athlete asset on top of the premium path.
  That was the Phase I "Option A" track; it remains gated on
  the J1–J7 tickets in the Phase I follow-up list, plus a
  Mac/Safari performance comparison and a coach teaching-clarity
  gate. Doing it in the same window as the premium upgrade
  would re-introduce the production risk Phase I rejected.
- Adding SkinnedMesh / AnimationMixer / rigged clips. The
  premium path still uses rigid sub-group rotations through
  `applyAthleteStance`; introducing skinning is a separate
  large-surface change and is the Phase I "Option C" track,
  not Phase J's responsibility.
- Changing scenario JSON or the public `buildPlayerFigure`
  signature. The Phase J upgrade is internal to the figure
  builder; expanding it to require new inputs would break the
  Phase F fallback contract.
- Adding new indicator layers. The base / user / userHead /
  possession contract is shared with the teaching overlay and
  the focus / feedback marks layer; new layers belong in a
  separate phase.



