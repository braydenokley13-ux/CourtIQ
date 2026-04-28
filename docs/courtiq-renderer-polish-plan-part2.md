# CourtIQ Renderer Polish Plan — Screenshot-Driven Rebuild

This plan replaces the old packet roadmap. It is grounded in real screenshots
of the live `/train` renderer, not assumptions. Every packet exists to push
the renderer from "technically working" toward a beautiful, realistic
basketball training simulator that **makes users smarter players**.

---

## 1. Current Visual Problems

Observed directly from the live screenshot (`/train`, difficulty 4,
`CUTTING_RELOCATION`, replay panel visible):

**Exposure / brightness**
- The canvas is dominated by near-black. ~80% of the frame is dead black
  space with no visible geometry, lights, or atmosphere.
- No visible ambient bounce. The scene reads as "lights off" rather than
  "indoor gym."

**Camera framing**
- Only a thin orange sliver of the floor sits at the very bottom of the
  frame. The court is not the subject — black space is.
- Camera is aimed too high and/or pitched too flat. Coaching-film framing
  would put the half-court roughly centered with players in the middle
  third of the frame.
- No headroom logic. The play area is cropped off-screen.

**Court / scale**
- Court appears tiny relative to the viewport. The hoop, key, three-point
  arc, and sidelines are not visible.
- No painted lines, logos, or hardwood texture readable in this shot.

**Player readability**
- No players visible in this frame at all. Either they are below the crop,
  too small, too dim, or culled.
- Cannot tell offense from defense, ball-handler from cutter, or who the
  user is controlling.

**Realism / environment**
- No gym walls, bleachers, ceiling, banners, scoreboard, or crowd shadow.
  Background is flat black, breaking the "indoor arena" illusion.
- No floor reflection, no rim light, no shadow grounding under players.

**UI overlays**
- The replay chip, paths toggle, and playback bar (`0.5x / 1x / 2x`) sit
  on top of the only visible piece of court, fighting for the same pixels
  as the play.
- "PATHS ON" pill floats with no contextual anchor.

**Learning clarity**
- With no players and no court visible, the question ("After you pass from
  slot to wing...") cannot be visualized. The user must answer from text
  alone, which defeats the simulator's purpose.
- No spacing markers, no defender indicator, no read cue tied to the
  visible scene.

---

## 2. Product North Star

CourtIQ's renderer is a **basketball IQ teaching tool first**, a pretty
3D scene second.

Target qualities:
- **Premium simulator feel** — readable hardwood, real gym, real lighting.
- **Coaching-film framing** — the camera frames plays the way a coach
  would on film: half-court visible, players centered, floor dominant.
- **Visually impressive yet performant** — looks great, still hits target
  FPS on mid-tier devices.
- **Instantly understandable** — within one second a user knows where the
  ball is, who is on offense, who is defending them, and what space the
  play is asking them to read.

**Most important:** every visual decision must answer
*"does this help the user become a smarter basketball player?"*

That means each camera angle, light, overlay, and animation should clarify:
- spacing
- timing
- reads
- decisions
- off-ball movement
- defensive reactions
- *why* the correct play is correct

---

## 3. New Packet Rules

Each packet is sized for **one Claude session**.

- Complete only ONE packet per session.
- Commit, push, then **stop**. Do not start the next packet.
- Give brief progress updates while working.
- No broad refactors unless the packet explicitly authorizes them.
- **Screenshots are the source of truth**, not assumptions or prior plans.
- **Visible improvements > hidden engineering.** If a packet ships clean
  internals but the screenshot looks identical, the packet is incomplete.
- Preserve the imperative-only architecture from the original renderer
  plan (`docs/courtiq-realistic-renderer-plan.md`). No JSX scene children,
  no `useFrame`.
- If a packet is blocked, stop and report the blocker rather than
  improvising scope.

---

## 4. Screenshot-Driven Packet Roadmap

10 packets, ordered by biggest visible win first.

### Packet A — Screenshot Audit + Measurement Baseline

- **Goal:** Establish reproducible "before" evidence and a measurement
  harness so every later packet can prove a visible delta.
- **Symptoms addressed:** No baseline exists; we cannot tell if changes
  actually improve the render.
- **Learning impact:** Indirect. Forces every later packet to verify
  the user's *visual* experience improved, not just code.
- **Files likely touched:** `docs/` (new `renderer-baseline.md`),
  `apps/web/app/train/` (read-only inspection), screenshots committed
  under `docs/screenshots/baseline/`.
- **Acceptance criteria:**
  - Baseline screenshots captured at 1440x900 and mobile 390x844 for at
    least 3 scenarios (incl. `CUTTING_RELOCATION`).
  - Documented current FPS, load time, canvas dimensions, camera mode.
  - Defined a fixed "evaluation scenario + camera + viewport" used by
    every later packet for before/after comparison.
- **Commit message:** `docs/renderer: capture polish baseline screenshots`
- **Stop point:** Baseline doc + screenshots committed and pushed.

### Packet B — Camera Framing + Court Scale

- **Goal:** Fix the headline problem — black space dominates the frame.
  Reframe so the half-court fills the working area like coaching film.
- **Symptoms addressed:** Court is a sliver at the bottom; ~80% of the
  canvas is empty black; players invisible because they are below the
  crop.
- **Learning impact:** Critical. A user cannot read spacing, defenders,
  or paths if they cannot see the floor and the players.
- **Files likely touched:**
  `apps/web/components/scenario3d/Scenario3DCanvas.tsx`,
  `apps/web/components/scenario3d/AutoFitCamera.tsx`,
  `apps/web/lib/scenario3d/scene.ts` (camera presets, FOV, padding).
- **Acceptance criteria:**
  - Half-court (3pt arc, key, both elbows, free-throw line) fully visible
    in the default camera at desktop and mobile aspect ratios.
  - All five players + ball in frame with ~10% margin headroom.
  - Camera height/pitch matches a coach's film angle (elevated, ~25-35°
    pitch, slight offset from baseline).
  - Side-by-side baseline vs new screenshot shows clear improvement.
- **Commit message:** `renderer: reframe camera for coaching-film court scale`
- **Stop point:** Camera change committed, screenshots updated, push.

### Packet C — Exposure / Lighting / Brightness

- **Goal:** Eliminate the "lights off" feeling. Tune renderer exposure,
  tone mapping, and gym lighting so the hardwood reads as a lit indoor
  arena.
- **Symptoms addressed:** Frame reads near-black; no ambient bounce; no
  rim light; floor color crushed.
- **Learning impact:** Players, ball, and lines must be visible to teach
  anything. Brightness directly drives readability.
- **Files likely touched:**
  `apps/web/components/scenario3d/imperativeScene.ts`,
  `apps/web/components/scenario3d/Scenario3DCanvas.tsx` (renderer
  output color space, tone mapping, exposure).
- **Acceptance criteria:**
  - Renderer uses ACES or neutral tone mapping with tuned exposure.
  - Hemisphere + key + fill lighting present; hardwood reads as warm
    wood, not muddy brown.
  - No blown highlights on jerseys; no crushed shadows on floor.
  - Brightness verified on both OLED and SDR displays via screenshot.
- **Commit message:** `renderer: tune exposure and gym lighting for readability`
- **Stop point:** Lighting committed, before/after screenshots, push.

### Packet D — Player Readability + Contrast

- **Goal:** Make every player instantly identifiable: offense vs defense,
  user vs teammate, ball-handler vs off-ball.
- **Symptoms addressed:** Players invisible or indistinguishable; no
  clear "you" indicator; jerseys blend into floor.
- **Learning impact:** Direct. The user must know who they are and who
  is guarding them in <1 second to learn the read.
- **Files likely touched:**
  `apps/web/components/scenario3d/PlayerMarker3D.tsx`,
  `apps/web/components/scenario3d/imperativeScene.ts`
  (player figure builder), `apps/web/components/scenario3d/LabelSprite.tsx`.
- **Acceptance criteria:**
  - Offense and defense use distinct, high-contrast jerseys.
  - The user's player has a persistent visual identifier (ring, glow,
    "YOU" label, or arrow) visible from default camera.
  - Player scale tuned so heads/torsos are clearly readable, not ant-sized.
  - Drop shadow or contact shadow under each player to ground them.
- **Commit message:** `renderer: improve player readability and user indicator`
- **Stop point:** Player visuals committed, screenshots updated, push.

### Packet E — Learning Overlay Clarity

- **Goal:** Turn the "PATHS ON" overlay into a real teaching layer:
  movement paths, passing lanes, defender pressure, spacing cues.
- **Symptoms addressed:** Paths toggle exists but does not clearly
  communicate what the play is teaching; no defender denial cue tied
  to the question text.
- **Learning impact:** Highest. This packet is where the renderer
  actively teaches IQ.
- **Files likely touched:**
  `apps/web/components/scenario3d/MovementPath3D.tsx`,
  `apps/web/components/scenario3d/PolyLine3D.tsx`,
  `apps/web/components/scenario3d/LinePrimitive3D.tsx`,
  `apps/web/lib/scenario3d/timeline.ts`.
- **Acceptance criteria:**
  - Offensive movement paths render with clear direction (animated
    dash, arrowhead, color-coded by phase).
  - Defender denial / pressure shown as a distinct visual (red cone,
    hatched line, or pulse) so the question's premise is *visible*.
  - Spacing cues (e.g., faded zones for slot/wing/corner) appear on
    demand without cluttering the floor.
  - Toggling "Paths" cleanly enables/disables all teaching layers.
- **Commit message:** `renderer: clarify learning overlays for paths and reads`
- **Stop point:** Overlay improvements committed, screenshots, push.

### Packet F — Gym Background Composition

- **Goal:** Replace the flat black void with a believable gym backdrop:
  walls, ceiling falloff, soft bleacher silhouette, banner band.
- **Symptoms addressed:** Pure black background breaks immersion and
  fails the "premium simulator" north star.
- **Learning impact:** Indirect but meaningful — context anchors the
  player in a real environment, reducing cognitive load on the play.
- **Files likely touched:**
  `apps/web/components/scenario3d/imperativeScene.ts` (gym builder),
  `apps/web/lib/scenario3d/atmosphere.ts`.
- **Acceptance criteria:**
  - Background reads as a gym, not space — walls, soft ceiling vignette,
    distant bleacher tone.
  - Background never out-competes the court for attention (kept low
    contrast / soft focus).
  - Performance budget respected (no full-resolution HDRI on mobile).
- **Commit message:** `renderer: composite gym background environment`
- **Stop point:** Gym backdrop committed, screenshots, push.

### Packet G — UI Controls Polish

- **Goal:** Stop the in-canvas controls (replay, paths, playback,
  difficulty chip, IQ counter) from competing with the play.
- **Symptoms addressed:** Replay/paths/speed pills float on top of the
  only visible court, with no anchoring or hierarchy.
- **Learning impact:** Reduces distraction. A cleaner overlay lets the
  user focus on the play, not the chrome.
- **Files likely touched:**
  `apps/web/components/scenario3d/PremiumOverlay.tsx`,
  `apps/web/components/scenario3d/ScenarioReplayController.tsx`.
- **Acceptance criteria:**
  - Controls anchored to consistent zones (top-left = state, top-right =
    score/IQ, bottom-center = playback).
  - Reduced visual weight when playing; full visibility on hover/focus.
  - No control overlaps the central play area in the default frame.
  - Mobile layout verified.
- **Commit message:** `renderer: polish in-canvas overlay controls`
- **Stop point:** UI commit, screenshots, push.

### Packet H — Realism Details

- **Goal:** Add the small props that sell "real gym": scoreboard,
  hanging banners, painted center logo, sideline benches silhouette,
  rim net detail.
- **Symptoms addressed:** Scene feels empty even after lighting and
  background passes.
- **Learning impact:** Mostly atmosphere, but a real-feeling court raises
  user investment and retention, which compounds learning.
- **Files likely touched:**
  `apps/web/components/scenario3d/imperativeScene.ts` (props builders),
  `apps/web/components/scenario3d/Court3D.tsx`.
- **Acceptance criteria:**
  - At least 3 of: scoreboard, banners, center-court logo, bench
    silhouettes, improved net.
  - All props imperative, disposed on unmount.
  - No measurable FPS regression on mid-tier device profile.
- **Commit message:** `renderer: add gym realism props`
- **Stop point:** Props commit, screenshots, push.

### Packet I — Performance + Fallback Verification

- **Goal:** Confirm the cumulative visual upgrades have not broken the
  performance budget or the 2D fallback path.
- **Symptoms addressed:** Risk of regression after several visual
  packets.
- **Learning impact:** A renderer that stutters on a student's laptop
  cannot teach. Stability is a learning prerequisite.
- **Files likely touched:**
  `apps/web/lib/scenario3d/quality.ts`,
  `apps/web/lib/scenario3d/feature.ts`,
  `apps/web/components/scenario3d/Scenario3DErrorBoundary.tsx`,
  `apps/web/components/court/*` (2D fallback).
- **Acceptance criteria:**
  - 60fps on desktop reference, ≥30fps on mid-tier mobile reference.
  - 2D fallback still renders with the new content metadata.
  - No new console errors / warnings on mount or unmount.
  - No memory growth across 5 scenario reloads.
- **Commit message:** `renderer: verify performance and fallback after polish`
- **Stop point:** Perf report + fixes committed, push.

### Packet J — Final Visual QA + Basketball IQ Review

- **Goal:** End-to-end review across multiple scenarios and difficulties
  to confirm the renderer now teaches, not just renders.
- **Symptoms addressed:** Per-packet wins must add up to a coherent
  product.
- **Learning impact:** Final gate that the renderer demonstrably helps
  users read spacing, timing, defenders, and decisions.
- **Files likely touched:** mostly docs; targeted fixes only if a QA
  finding is small.
- **Acceptance criteria:**
  - Side-by-side before/after across ≥5 scenarios.
  - A coach-style walk-through doc that explains, scenario by scenario,
    what the renderer now teaches.
  - All Section 6 checklist items pass on the evaluation scenario.
- **Commit message:** `docs/renderer: final polish QA and IQ review`
- **Stop point:** QA doc committed, push.

---

## 5. Future Session Prompt Template

Use this exact prompt to run any packet in a future Claude session:

> Read `docs/courtiq-renderer-polish-plan-part2.md`.
> Use the attached screenshots as the source of truth.
> Execute ONLY Packet __.
> Do not start the next packet.
> Give brief progress updates.
> Commit and push when complete.
> Stop after reporting changed files, test results, commit hash, push
> status, and visual assessment.

---

## 6. Screenshot Review Checklist

Run this checklist on every packet's before/after screenshots before
considering the packet done.

**Visual**
- [ ] Is the court larger and clearer than before?
- [ ] Are players readable (offense vs defense, user identifiable)?
- [ ] Is the scene bright enough to read at a glance?
- [ ] Does the frame feel less empty?
- [ ] Does it feel more premium / less prototype?
- [ ] Is realism improving without distracting from the play?

**Learning**
- [ ] Can a user understand the play faster than before?
- [ ] Are movement paths clearer?
- [ ] Is spacing easier to read?
- [ ] Is the correct decision easier to learn from the visual alone?
- [ ] Does the camera angle help teaching, not fight it?
- [ ] Does the UI support learning instead of distracting?

**Performance**
- [ ] Is FPS still acceptable on the reference devices?
- [ ] Did load time stay reasonable?
- [ ] Any regressions in other scenarios or in the 2D fallback?
