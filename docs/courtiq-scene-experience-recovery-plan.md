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

#### Files likely involved
- `apps/web/components/scenario3d/imperativeScene.ts` —
  `buildPlayerFigure` (~L3193), the per-player loop in
  `buildBasketballGroup` (~L341–L376), palette constants (L25–L103),
  ring/halo stack (~L3198–L3289), `disposeGroup` (~L407) +
  `disposeMaterialTextures` (~L430).
- Possibly a new file for an external mesh loader (only if E
  chose option C or D).
- `apps/web/lib/scenario3d/quality.ts` — perf tier integration if
  geometry cost varies by tier.

#### Risks / boundaries
- Do not break existing indicator layers (base ring, user halo,
  possession ring, focus marks).
- Do not change palette constants without updating the
  visual-system plan.
- Do not exceed the per-player tri budget called out in
  `courtiq-premium-scene-visual-system-plan.md` Section 14.
- Do not ship a player that hides the user's identity halo.
- Do not break the dispose traversal (every new mesh/material
  must be reachable by `disposeGroup`).

#### Acceptance criteria
- The new player silhouette reads as an athlete from broadcast
  distance.
- Stance differences (idle, defensive, denial, plus any new
  stances introduced) are visually distinct without indicator
  help.
- Offense, defense, and user identity remain unmistakable.
- Mac frame rate stays in budget; FPS guard never auto-degrades
  on `medium` or `high` tier on BDW-01.
- All existing tests still pass; no leaks reported on scene
  rebuild.

#### Suggested model
**Opus 4.7 Max.** Visual + perf + integration risk; max thinking is
warranted.

#### Suggested commit style
- 4–5 implementation commits.
- 1 perf tuning commit.
- 1 QA commit.

#### Micro-milestones

> Note: the exact micro-milestone list will be refined by Phase E4
> based on the chosen path. The shape below assumes Option B
> (better reusable code mesh) — the most likely default. If E
> picks A, C, or D, F1 changes accordingly.

**F1 — Player silhouette rebuild**
- Objective: rebuild the body silhouette so it reads as an
  athlete (shoulders, taper to waist, leg articulation, head
  proportion) within the chosen approach.
- Likely files: `imperativeScene.ts` (`buildPlayerFigure`).
- What changes: replace primitive stack with the chosen mesh
  approach; preserve the function signature.
- Exit criteria: silhouette test screenshot shows clear athlete
  read at broadcast distance.
- Suggested commit message: `feat(scene): rebuild player silhouette`

**F2 — Stance readability pass**
- Objective: ensure idle / defensive / denial stances are
  visually distinct in the new mesh; add any new stances
  identified in Phase C (e.g., `closeout`, `cut`).
- Likely files: `imperativeScene.ts` (`buildPlayerFigure`,
  per-stance pose).
- What changes: per-stance pose adjustments mapped to the new
  geometry.
- Exit criteria: stances differentiable from the default camera
  without indicators.
- Suggested commit message: `feat(scene): tune stance readability on new mesh`

**F3 — Color/trim/identity integration**
- Objective: re-apply offense/defense/user palette and trim to
  the new mesh; verify the user halo still reads.
- Likely files: `imperativeScene.ts` (palette constants, per-player
  loop).
- What changes: material assignment for body, jersey, trim, and
  number band; user-identity halo verification.
- Exit criteria: user is unmistakable; offense vs. defense reads
  in one glance.
- Suggested commit message: `feat(scene): integrate identity palette on new mesh`

**F4 — Performance tuning**
- Objective: keep tri counts and material counts within budget;
  verify FPS guard doesn't auto-degrade.
- Likely files: `imperativeScene.ts`,
  `lib/scenario3d/quality.ts`.
- What changes: lower-detail variant on `low` tier if needed;
  shared materials; minimal new draw calls.
- Exit criteria: Mac frame rate stable on BDW-01; tri-count
  baseline recorded in this doc.
- Suggested commit message: `perf(scene): tune new player geometry budget`

**F5 — Player visual QA**
- Objective: validate new geometry against the Section 15 QA
  checklist on BDW-01 and against the static-readiness flags
  for ESC/AOR/SKR.
- Likely files: tests + docs.
- What changes: append a "Geometry QA Results" subsection.
- Exit criteria: every QA item in Section 15 still passes; no
  regression vs. Phase 7 record.
- Suggested commit message: `test(scene): verify new player geometry QA`



