# CourtIQ 3D Film-Room System Plan

> **Status:** Planning document. No implementation in this PR.
> **Scope:** What the 3D film-room *should be*, how it should look, how it
> should teach, and how to ship it without rewriting the renderer.
> **Guardrails for the implementation that follows this doc:**
> - No renderer rewrite.
> - No new founder-v0 scenarios.
> - No edits to scenario seed JSON.
> - No schema migrations.
> - No Pathways implementation.
> - All work staged behind dev gates until each phase is QA-validated.

---

## 1. Product Thesis

CourtIQ's 3D scene should not just **show** a possession. It should
**teach the player what to see**.

Today the renderer animates a scenario, freezes on a cue, asks a question,
and replays the best read. Mechanically, that's a film room. Experientially,
it isn't yet — because the visual language doesn't direct the eye, the camera
doesn't frame the cue, the athlete doesn't always render, and when it does it
doesn't always look the part. The 3D scene reads as a 3D *demo*, not as a
**coach pause** with a 13-year-old next to you on the bench.

A film room earns the name when it can answer, on every rep, without text:

- **Which defender matters?** (whose feet, hips, eyes, hand, chest line drove
  the read)
- **What cue matters?** (the body part, the angle, the moment the cue fires)
- **Where is the open space?** (the patch of floor the cue created)
- **What action is the best read?** (the path the answer takes through that
  space)
- **Why did that read work?** (what the defender lost when they committed)
- **How does this rep connect to the player's pathway?** (what archetype
  they're building, what chapter they just advanced)

Every architectural decision in this document — GLB pipeline, camera presets,
overlay presets, replay teaching mode, debug observability — is downstream of
those six questions.

If a fix doesn't make one of those answers more legible at freeze, we don't
ship it.

---

## 2. Current State Assessment

This is the honest read on what CourtIQ ships today.

### What works

- **End-to-end loop.** `/train` plays a possession, hits `freezeAtMs`, takes a
  choice, runs a wrong-demo or short-circuits to best-read, lands on
  feedback. The state machine in `ScenarioReplayController` (`idle → setup
  → playing → frozen → consequence → replaying → done`) is correct and
  tested (`replayDeterminism.test.ts`, `replayStateMachine.test.ts`).
- **20 founder-v0 scenarios.** BDW / ESC / AOR / SKR, 5 each, all LIVE,
  schema-validated, decoder-validated, animation-intent dispatched.
- **Court rendering.** `Court3D` + `BasketballScene3D` produce a coherent
  half-court visual with consistent color/scale.
- **Animation intents.** `animationIntent.ts` is a clean abstraction:
  scenario meaning → 12 intents → clip resolver → fallback ladder.
- **Authored overlays.** `imperativeTeachingOverlay.ts` and
  `AuthoredOverlayBridge` paint pre/post primitives and respect clutter caps
  (3/3 for beginner). Decoder presets exist as data
  (`decoderOverlayPresets.ts`).
- **Error containment.** `Scenario3DErrorBoundary` keeps a 3D crash from
  taking down `/train`; the question still works in fallback.
- **Debug surface.** `GlbDebugBadge` already reports the gate, the loader,
  HEAD probes, and the per-figure decision log behind `?glbDebug=1`.
- **Replay snapshot.** `samplePositionsAt` captures freeze positions so the
  consequence and answer legs do not snap defenders back to their authored
  starts. This is a quietly excellent decision and the foundation for future
  film-room polish.

### What is visually promising

- The single shared GLB rig + retargeted bone map is the **right** long-term
  shape. Adding new clips becomes a one-line addition to
  `resolveGlbClipForIntent`, not a per-scenario asset.
- The decoder overlay preset map is already aligned to the four families and
  uses only schema-allowed kinds. We do not need new overlay primitives to
  hit a premium look — we need the existing primitives staged better.
- The replay state machine cleanly separates intro / consequence / replay
  legs; this is the natural seam for the "coach pause" upgrade.
- The imperative scene path keeps per-frame work off React state, so adding
  camera choreography or slow-mo will not regress framerate.

### What is broken or inconsistent

- **GLB load roulette.** `computeGlbDebugPick` already enumerates the failure
  modes: `env-flag-off`, `loader-cold-cache`, `asset-missing-or-no-skin`,
  `loader-threw`. Any one silently degrades the figure to procedural. Users
  see *different* athletes across loads, sometimes mid-session.
- **GLB itself is not premium.** The bundled mannequin is a CC0 placeholder
  (Quaternius UAL2 — Female Mannequin). It is grey, slightly undersized,
  unbranded, and runs only the hand-authored idle / cut / closeout / etc.
  clips that were retargeted on top of the original UAL2 skeleton. The
  silhouette doesn't read as a basketball player at broadcast distance.
- **Procedural fallback drifts.** When the GLB doesn't render, the
  procedural figure has different proportions, different shading, no team
  tint parity, and no grounding shadow consistency. Two players in the same
  frame can render in two different visual languages.
- **Cue clarity is per-author.** Decoder presets exist; the renderer does not
  enforce them. Two scenarios in the same family can have visibly different
  cue clusters. There is no "did the freeze actually show the cue" check.
- **Camera does not teach.** `AutoFitCamera` runs once per scene and frames
  the bounding box of all players + ball at a fixed 32° pitch. The cue can
  end up on the **back side** of the action. The freeze frame and the answer
  frame use the same camera. There is no decoder awareness, no
  cue-distance-aware framing, no per-phase cinematography.
- **Freeze moment feels mechanical.** `freezeAtMs` clamps `t` and emits
  `'frozen'`. Visually the canvas just stops. There is no slow-mo entry, no
  audio sting, no camera nudge, no light dimming, no overlay choreography.
  The user does not feel "coach paused the tape."
- **Scenario QA is hard.** The only way to compare scenario A to scenario B
  today is to seed the DB, log in, run `/train`, get bundled scenarios, and
  click through. There is no scenario picker, no metadata panel, no
  side-by-side view, no "render this exact ID" affordance for QA.
- **Silent fallback.** Outside `?glbDebug=1`, we render a procedural figure
  with no visual indication that we lost the GLB. Production users will
  never notice they're getting the cheaper render.
- **No film-room-specific debug.** `?glbDebug=1` reports asset state, not
  *teaching* state. There is nothing surface-level that tells a developer
  "this freeze landed on the wrong cue" or "this camera hides the help."

### Why the current experience still feels like a 3D demo

The renderer is technically correct. It animates, it freezes, it answers, it
replays. But three premium-experience pillars are not yet in place:

1. **The athlete does not look like a basketball player.** A single grey
   placeholder with retargeted idle/cut clips — even if it loads
   consistently — would not pass a 13-year-old's silent quality bar against
   2K, NBA Live, and YouTube highlights they watch every day.
2. **The frame does not direct the eye.** A static auto-fit bounding-box
   camera is the wrong tool for a film room. Film rooms zoom, cut, replay
   the same beat from a coaching angle, and pause where the read lives.
3. **The teaching beat is mechanical.** Freeze is an instant clamp.
   Best-read replay starts immediately. There is no pacing, no breathing,
   no coach-cadence. The player gets information, not a lesson.

### Why GLB quality matters

- A great athlete model is not vanity; it is the **single most readable
  signal** in the frame. Stance, hip turn, vision direction, hand position —
  these are *the cues* the decoders teach. A mannequin with stiff arms
  cannot communicate "hand in the lane" the way a true athlete rig can.
- Because every scenario shares one rig, fixing the rig fixes the entire
  20-scenario pack at once. There is no per-scenario asset cost.
- The procedural fallback is allowed to look different — but only if it
  also reads "basketball player." Today it does not.

### Why GLB alone does not solve film-room clarity

- A premium athlete model in a static bounding-box camera with no overlay
  enforcement and no coach-pause cadence will still feel like a demo. A
  great rig is **necessary**, not sufficient.
- Camera, overlay choreography, freeze cadence, and replay teaching mode
  carry just as much weight. They have to ship together to feel premium.
- This is also why FR-1 (QA tooling + observability) comes before any
  asset-pipeline investment — we need to *see* what every scenario looks
  like in 60 seconds before deciding what to spend rig-engineering time on.

---

## 3. North Star Film-Room Experience

This is what a single rep should feel like end-to-end at v1.

1. **Scenario starts with a purposeful camera.**
   The first frame is *not* the bounding-box auto-fit. It is a decoder-aware
   "Teaching Angle" — for a Backdoor Window rep, that means user, denying
   defender, passer, and the empty rim corridor are already in the same
   frame, with the camera slightly behind and over the user's shoulder.
2. **Player watches the possession.**
   Movement is legible. Athletes look like athletes. Defender body cues
   (hip turn, vision cone, hand-in-lane) are subtly highlighted *before* the
   freeze, but never to the point of giving away the answer.
3. **Camera subtly frames the important relationship.**
   As the cue is about to fire, the camera tightens by ~10% and lowers ~5°
   toward the cue defender. This is not a cut — it is a coach leaning in.
4. **Freeze moment lands like a coach pause.**
   The clock dips into slow-mo for ~250 ms before the freeze, then halts.
   Audio plays a single soft "tap." The world dims by ~6%. Everyone except
   user, key defender, ball, and the open-space patch desaturates by ~30%.
   The decoder pill animates in — not as a label but as a coach handing you
   the read.
5. **Cue overlay points attention without clutter.**
   The pre-answer cue cluster from `decoderOverlayPresets.ts` paints in:
   defender hip arrow, vision cone, hand-in-lane. Three primitives. No more.
   Each fades in over 80 ms with a brief "lift" so the eye sees the order
   the coach wants you to read in.
6. **User answers.**
   The choice tiles are already mounted (today's behavior — keep this).
   Tap → haptic on native, choice flashes correct/heat, the canvas does not
   move yet.
7. **Replay shows why the best read worked.**
   On wrong: consequence leg plays first — ball goes where the user said,
   defense catches it, the world dims further to indicate "this is not the
   read." Then snap to the freeze snapshot, decoder pill animates again,
   answer leg plays from there. On correct: skip directly to the answer
   leg. Either way, the post-answer overlay paints the open space, the
   passing lane, and the action arrow as the play unfolds.
8. **Summary connects the rep to pathway progress.**
   On done, an end-of-rep card connects this scenario to the active
   Pathway chapter ("Read the Denial — 4/5"), the decoder mastery ring
   ticks, and the recommended next action is named ("Punish the Help —
   Chapter 4"). This is a Pathways concern, but the film room is the
   surface that earns it.

This flow is not aspirational — it can be reached without a renderer
rewrite. Every step listed above is implementable as **layered additions**
on top of the existing imperative scene + replay state machine.
