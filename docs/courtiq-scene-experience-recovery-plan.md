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


