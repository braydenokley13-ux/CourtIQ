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

---

## 4. Film-Room Design Principles

These are the rules every visual decision in the film room is measured
against. If a fix fails one of these, it does not ship.

1. **Clarity beats realism.** The frame's job is to make the read obvious,
   not to render perfectly. A stylized athlete in a clean composition beats
   a photoreal athlete in a cluttered frame every time.
2. **Coach the eye, not just the answer.** Every frame should give the
   player one place to look first, one second, one third — in that order.
   Three is the cap.
3. **Beginner reps can be obvious; advanced reps must remove hints.** The
   same scenario can render with full overlays in a *Learn the Cue* mode and
   strip them entirely in a *Boss Challenge*. The renderer respects the
   mode; it does not impose it.
4. **GLB quality matters only if it supports the read.** A premium athlete
   that does not communicate hip turn, vision direction, hand-in-lane is
   worse than a procedural figure that does.
5. **The user, key defender, ball, and open space must always be readable.**
   At any freeze frame, the player must be able to identify all four within
   1.5 seconds. This is the **minimum readable frame** rule (see §7).
6. **Camera should be decoder-aware.** The "right" framing for a Backdoor
   Window is not the same as the right framing for a Skip the Rotation. The
   camera asks "what is the cue?" before it asks "what is the bounding
   box?".
7. **Fallback should be graceful, not confusing.** When the GLB is not
   available, the scene should look intentionally simpler — not
   inconsistent with itself, never magenta, never half-rendered. The
   procedural figure must look like the "lite version" of the same player,
   not a different player.
8. **No silent broken visual states.** If something fell through the
   fallback ladder, that is a debug breadcrumb. Production users do not
   need to see it; developers always do.
9. **Every visual effect must teach something.** Slow-mo at the freeze is
   not for drama; it is to tell the player *the read is right here*. A
   camera nudge is not for cinematography; it is to draw the eye to the
   defender that matters. If an effect cannot answer "what is this teaching
   the player?", we cut it.
10. **Mobile is the canonical surface.** A frame that does not read on a
    393-px-wide phone in landscape does not read at all. The desktop view is
    a beneficiary, not the target.
11. **Determinism is non-negotiable.** Replays must be byte-identical across
    runs of the same scenario; QA depends on it.
    `replayDeterminism.test.ts` is the contract; new effects must extend it
    rather than break it.
12. **Performance is part of clarity.** A dropped frame at the freeze is a
    broken teaching beat. The in-loop FPS guard exists for a reason; we
    keep using it.

---

## 5. GLB and Athlete Asset Strategy

This is the largest open question in the film-room system, and the answer
matters across every scenario. The plan below resolves the strategy
explicitly.

### 5.1 Where we are today

- One bundled GLB (`apps/web/public/athlete/mannequin.glb`, Quaternius UAL2,
  CC0).
- Hand-authored `idle_ready` / `cut_sprint` / `defense_slide` /
  `defensive_deny` clips retargeted onto the UAL2 skeleton via
  `GLB_BONE_MAP`.
- Two imported clips (`closeout`, `back_cut`) gated behind
  `NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP` /
  `NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP`.
- A `skinnedAthlete.ts` procedural-skinned prototype.
- A fully procedural fallback figure.
- A magenta diagnostic proxy used only with `forceGlb` debug.

The scenario JSON does **not** ship asset references — every scenario uses
the shared rig + the existing clip set. The architectural premise from
`docs/founder-v0-scenario-content-plan.md` ("Shared GLB athlete + shared
motion clips + scenario JSON = many scenarios") is correct and stays.

### 5.2 Why inconsistent GLB loading is a product problem

The `GlbDebugBadge` already enumerates the failure modes:

| `pick` | `reason` | What user sees |
| --- | --- | --- |
| `procedural` | `env-flag-off` | Procedural figure, intentional |
| `procedural` | `loader-cold-cache` | Procedural figure on first frame, GLB on later loads — **inconsistent across sessions** |
| `procedural` | `asset-missing-or-no-skin` | Procedural figure permanently — **silent failure** |
| `procedural` | `loader-threw` | Procedural figure permanently — **silent failure** |
| `glb` | `gate-on-cache-warm` | GLB figure |

Two of these (`asset-missing-or-no-skin`, `loader-threw`) are silent in
production. One (`loader-cold-cache`) means the *same user, same scenario*
gets a different visual the first time vs. later. That is not a renderer
problem — it is a product trust problem.

### 5.3 Why current GLBs may not look good enough

- Source asset is a generic mannequin, not a basketball player. Limbs read
  as "asset," not "athlete."
- Bind pose is far from a basketball-ready stance. Hand-authored deltas
  ride on top of bind, which limits how expressive a "denial" or "closeout"
  pose can be.
- No team tinting. No jersey detail. No sneakers. No grounding shadow that
  matches the stylized court look.
- Single rig means the offensive and defensive players have the same
  silhouette; the only differentiator is color, which has to do all the
  work.
- Animation library was authored for a generic mannequin, not for the 12
  basketball intents.

### 5.4 What "good enough" athlete rendering means for CourtIQ

A CourtIQ athlete is **good enough** when, at broadcast distance on a phone:

1. The silhouette reads as a basketball player (athletic stance, slight
   knee bend, ready arms).
2. Offense and defense are visually distinguishable in 0.5 s without
   reading the label.
3. The user is identifiable at a glance (highlight ring, glow, or color).
4. Body cues — hip turn, vision direction, hand-in-lane, foot direction —
   are readable as cues, not as accidents of the rig.
5. The figure does not pop, T-pose, or freeze on first load.

That is a *much* lower bar than "photoreal." It is a much *higher* bar than
"the current mannequin."

### 5.5 Asset categories

We separate concerns explicitly. Each category has a different lifecycle.

| Category | What it is | Lifecycle |
| --- | --- | --- |
| **Base athlete model** | The single shared rig (currently CC0 mannequin). All scenarios reference it. | One per launch tier (v1 mannequin, v2 stylized athlete, v4 premium pack). |
| **Animation clips** | The motion library mapped to the 12 `AnimationIntent` values. | Shared. Adding a clip is a one-line addition to `resolveGlbClipForIntent`. |
| **Procedural fallback** | Code-built figure used when GLB fails. | Stays. Visual parity with GLB is the goal. |
| **Diagnostic proxy** | The magenta box used in `forceGlb` debug. | Dev only, never in production. |
| **Future premium athlete pack** | A custom-rigged or licensed basketball athlete (or two — male/female) replacing the mannequin. | Phase FR-8. |

### 5.6 GLB policy by phase

We commit to one rig per phase. We do not ship two rigs in parallel.

- **v1 (current — stabilize what we have).**
  - Keep the existing mannequin GLB.
  - Fix the silent fallback paths (`asset-missing-or-no-skin`,
    `loader-threw`) by adding an in-debug-mode visible breadcrumb.
  - Make the cold-cache path *not* render a procedural figure for one
    frame: warm the cache before the canvas mounts, or render a static GLB
    pose first.
- **v2 (improve what we have).**
  - Better materials. Slight color tint per team that doesn't fight the
    court palette. A tighter grounding shadow that matches the floor.
  - Scale audit (the rig is currently ~5.93 ft; that is fine for a 13-yr
    old, but the scale gap between the rig and procedural figure should be
    inside ±0.05 ft).
  - Fix the bind-pose problem: author a "basketball ready" rest delta so
    every clip starts from a stance that reads as a player, not a
    mannequin.
- **v3 (more clips).**
  - Add motion library clips for the intents that today fall through to
    `cut_sprint` or `defense_slide`. See §5.7 below.
  - Improve `closeout` and `back_cut` clip quality; gate them on by
    default.
- **v4 (premium athlete pack).**
  - Replace the placeholder rig with either a licensed or custom-rigged
    basketball athlete (or two — offense/defense or male/female silhouette
    differentiation).
  - Move the existing mannequin to a "lite" preset for low-end devices.

We do **not** ship per-scenario GLBs. Ever. If a future intent (e.g. a
"rip-through" cinematic) is desired, it is added once to
`resolveGlbClipForIntent` and reused across the library.

### 5.7 Reusable motion clip targets

By the end of FR-8, the clip library should cover the 12 intents with
dedicated motion. The list below is the priority order based on how often
each intent is used by the founder-v0 pack.

| Priority | Intent | Asset name (target) | Used by |
| --- | --- | --- | --- |
| 1 | `IDLE_READY` | `idle_ready` (premium pass) | every scenario |
| 1 | `RECEIVE_READY` | `receive_ready` (premium pass) | AOR family |
| 2 | `CLOSEOUT` | `closeout_premium` | AOR, SKR |
| 2 | `BACK_CUT` | `back_cut_premium` | BDW family |
| 2 | `EMPTY_SPACE_CUT` | `empty_space_cut` | ESC family |
| 3 | `DEFENSIVE_DENY` | `defensive_deny_premium` | BDW family |
| 3 | `DEFENSIVE_HELP_TURN` | `help_turn` | ESC, SKR |
| 4 | `JAB_OR_RIP` | `jab_rip` | AOR (drive branch) |
| 4 | `SHOT_READY` | `shot_ready` | AOR, SKR |
| 4 | `RESET_HOLD` | `reset_hold` | AOR (reset branch) |
| 5 | `PASS_FOLLOWTHROUGH` | `pass_followthrough` | every family |
| 5 | `SLIDE_RECOVER` | `slide_recover` | AOR (helper) |

Implicit follow-ons that should also have premium clips:

- top-lock defender (BDW-02 / BDW-03 variants)
- backdoor cut against denial
- empty-space cut from corner
- help rotation / x-out recovery
- skip-pass follow-through (passer side)
- rip / drive (offense)
- catch-and-shoot
- reset / hold
- defensive slide / recover
- tag-and-recover

### 5.8 Licensing & sourcing

- v1: CC0 placeholder is fine. We are already there.
- v2-v3: prefer CC0 / Mixamo-style sourced clips that we can retarget. Keep
  attribution in `apps/web/public/athlete/ATTRIBUTION.md` (already exists).
- v4: budget either (a) a custom rig from a freelance character artist
  (~2-4 weeks of work) or (b) licensing a basketball-specific rig and
  motion pack. The decision is product/finance, not engineering — the rig
  contract is the same.

We do **not** ship NBA-likeness assets. We do **not** use team logos. The
brand is CourtIQ; the athlete is a CourtIQ athlete.

---

## 6. Fallback and Rendering Reliability

The product rule is: **the user never knows the GLB failed.** What they see
might be slightly less premium, but it is intentional, consistent, and
teaches the same read.

### 6.1 The fallback hierarchy

In strict order, the renderer should attempt:

1. **Real GLB athlete + correct animation clip.**
   - This is the default success path.
   - Requires: env flag on, asset cached, skin found, clip resolves.
2. **Real GLB athlete + idle/static pose if the clip fails.**
   - Requires: GLB loaded, but the resolved clip is missing or threw.
   - Behavior: render the GLB, hold an idle pose. Better a still athlete
     than a procedural figure.
3. **Procedural player.**
   - Requires: GLB load failed entirely.
   - Behavior: full procedural figure, with team tint and grounding shadow
     that matches the GLB visual language as closely as possible.
4. **2D fallback if WebGL fails.**
   - Requires: `hasWebGL()` returns false.
   - Behavior: 2D court via the same scenario JSON. Already wired through
     `feature.ts`; we just need to make sure it does not regress.
5. **Magenta / proxy figure — only in `forceGlb` debug mode.**
   - Behavior: renders an obvious placeholder so a developer knows the
     forced path is active.

### 6.2 Behavior in normal mode

- Production users see only paths 1–4. Path 5 is impossible without an
  explicit URL flag.
- Path transitions are *visual* — no toast, no notification. We do not
  apologize to the user for serving the lite render.
- All transitions emit a console breadcrumb so Sentry / PostHog can see how
  often each path fires in the wild.

### 6.3 Behavior with `forceGlb=1`

- Renderer skips the env gate and forces the GLB path.
- If the asset is not loaded yet, the canvas waits (with a one-frame loader
  spinner) instead of falling through.
- If the asset truly cannot load, render the magenta proxy so the
  developer sees that the path is broken.

### 6.4 Behavior with `debugGlb=1` (existing `?glbDebug=1`)

- Renders the existing `GlbDebugBadge`.
- Surfaces env flags, gates, HEAD probes, loader status, per-figure
  decision log.
- Available in production with the URL flag, plus
  `window.__COURTIQ_GLB_DEBUG__=true` for in-tab toggling.

### 6.5 Avoiding silent fallback

- Every fallback transition writes a single structured `console.info` line
  with `{ scenarioId, playerId, pickedPath, reason }`.
- The dev-only film-room badge (see §12) shows *cumulative* fallback
  counts for the active scenario. If 8 of 8 figures fell through with the
  same reason, that is a flag.
- Tests in `productionGlbAssetGate.test.ts` cover the gate booleans.
  Extend that suite when a new fallback reason is added.

### 6.6 Avoiding GLB inconsistencies breaking training

- The `Scenario3DErrorBoundary` already isolates a render crash to the
  canvas. Keep this — every new effect ships inside the boundary.
- The choice tiles, the question, and the feedback panel must work even if
  the canvas is fully fallback. This is already true; do not regress it.
- A scenario that *requires* a premium asset is a content bug, not a
  renderer bug. The scenario JSON should never assume an asset is loaded.

### 6.7 Cold-cache mitigation

- Today, the first frame of the first scenario in a session can render
  procedural while the GLB warms up.
- Mitigation: warm `loadGlbAthleteAsset()` on the `/train` server-rendered
  page so the asset is in cache by the time the canvas mounts.
- Alternative: render a static GLB pose for the first ~120 ms instead of
  the procedural figure.
- Either approach is FR-2 scope.
