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

---

## 7. Player Readability and Visual Language

This section defines the rules a frame must obey to be teachable. It applies
to GLB and procedural figures equally — fallback is only graceful if the
visual language is consistent.

### 7.1 Color system

Five colors carry meaning. Anything else is decoration.

| Element | Color | Token |
| --- | --- | --- |
| User (offense) | Electric brand green | `--brand` `#3BE383` |
| Other offense | Soft warm white | `--text` (90% alpha) |
| Defense (key — the cue defender) | Heat red ring + warm body | `--heat` `#FF4D6D` (ring), warm body |
| Defense (other) | Cool slate, desaturated | derived from `--text-mute` |
| Ball | Orange — never the user color | `--xp` `#FF8A3D` |

The "key defender" is determined by the decoder preset (`deny_defender`,
`closeout_defender`, `helper_defender`, `helper_defender` for SKR
overhelp). When the preset cannot resolve, key defender = the closest
defender to the user.

### 7.2 User-player highlight

- A subtle ground-level glow ring (~0.6 ft radius) under the user.
- Slightly lifted on freeze (ring brightens 20%).
- Never bright enough to fight the cue overlay.

### 7.3 Active defender highlight

- A heat-red rim around the key defender, applied via the
  `defender_*_arrow` overlay primitives we already have.
- Pulsing — but only during pre-answer. Post-answer reveals replace the
  pulse with a static path.

### 7.4 Ball-handler marker

- Already shipping (`hasBall` ring on the player marker).
- On freeze: ball-handler ring intensifies; passer cue (the
  `PASS_FOLLOWTHROUGH` intent) fires at the start of the answer leg.

### 7.5 Open-player marker

- Used in SKR primarily. The `open_player` role gets a thin white
  indicator that flares up *post-answer* to show "this is who got the
  pass."
- Pre-answer, the open player is *not* highlighted — the player has to
  read the cue, not be told the answer.

### 7.6 Team tinting for GLB and procedural

- GLB: a per-team tint applied via material override on the cloned mesh.
  The tint must not bleach skin tones; we apply it to a "jersey" submesh
  if the rig supports it, otherwise to the whole body at low intensity
  (~12%).
- Procedural: the existing tint stays. The goal is parity, not perfection.

### 7.7 Rings and grounding shadows

- Every figure renders a soft circular shadow under its feet (radius scales
  with figure size). The shadow grounds the figure on the court, which is
  the single biggest "is this a video game" tell.
- The user ring sits on top of the shadow; the key-defender pulse sits
  above the user ring.
- Z-order: court → shadow → ring → figure → ball → overlays.

### 7.8 Figure scale consistency

- GLB rig stands at ~5.93 ft (post-`GLB_M_TO_FT_SCALE`).
- Procedural figure stands at `ATH_TOTAL_HEIGHT = 5.95 ft`.
- Acceptable delta: ±0.05 ft. Any drift larger than that is a bug.

### 7.9 Silhouette readability

- At 200 px tall on a phone, the figure must read as a basketball player.
  Test: convert the figure to pure black on white, can a coach name the
  pose?
- The current mannequin fails this test. The procedural figure passes it
  weakly. The "basketball ready" delta in §5.6 is what fixes it for the
  GLB.

### 7.10 Why current GLBs may look stiff / small / unclear

- Bind pose sits in a rest position, not a basketball stance.
- Hand-authored deltas are small to avoid bone-chain pop, which means a
  "denial" pose looks like a slight arm raise instead of a real denial.
- No premium per-clip motion library yet — fallback to `cut_sprint` or
  `idle_ready` makes everyone look the same.
- Single rig with no jersey detail flattens silhouette.

### 7.11 Visual contrast without childishness

- We do not add comic outlines, exaggerated colors, or cartoon shading.
  CourtIQ is "premium, modern, fast, elite" (see PRODUCT_SPEC §2.3).
- Contrast comes from: lighting, color temperature (warm offense / cool
  defense), tint intensity, and grounding shadow.
- Avoid emojis, stickers, "GREAT JOB!" overlays, particle bursts. Win
  bursts and badges are reserved for badge earn moments only (see
  PRODUCT_SPEC §10).

### 7.12 The minimum readable frame rule

At any freeze frame, the player must be able to identify, within 1.5 s, all
of the following:

1. The **ball** (orange, plus possession ring on the holder).
2. The **user** (green ring, brand glow).
3. The **key defender** (heat red, with at least one body cue overlay).
4. The **relevant space or lane** (open-space patch, passing-lane line, or
   drive-cut preview — pre or post depending on phase).
5. The **best-read target** (post-answer only — never pre-answer; that
   would give away the read).

A scenario that fails this rule on freeze is a **content bug.** The QA
route in §11 makes this checkable.

### 7.13 Composition checklist (per scene)

A frame should be checked against this list before content goes LIVE:

- [ ] User is in the frame and visible.
- [ ] Key defender is in the frame and the cue is on-camera (not behind).
- [ ] Ball is visible.
- [ ] Open space is visible (or will be on best-read replay).
- [ ] No two players overlap silhouette at freeze.
- [ ] Camera does not occlude any cue overlay.
- [ ] On phone, all of the above hold at 393 × 700 px.

---

## 8. Decoder-Specific Camera System

`AutoFitCamera` is good for ensuring nothing leaves frame. It is not a
film-room camera. This section describes what one looks like.

### 8.1 Camera is decoder-aware AND phase-aware

The same scene gets a different framing in different replay phases.
Phases: `setup → playing → frozen → consequence → replaying → done`.

- **Watch (intro / playing):** broadcast-style framing. Bounding-box
  auto-fit is acceptable here (it is what we ship).
- **Freeze:** *teaching angle* — composed by the decoder preset around
  the cue defender, the user, and the open space. This is the only phase
  where camera is fully on-rails.
- **Answer (consequence / replaying):** action-following. The camera
  tracks the read as it happens, with a slight lag so the read feels
  earned.
- **Done:** holds the final frame for ~700 ms, then releases to whatever
  framing the next scenario needs.

### 8.2 Camera concepts

We define five named presets. The dropdown in `PremiumOverlay` already
exposes a subset (`auto`, `broadcast`, `tactical`, `follow`, `replay`).
We extend the same union — we do not invent a new mechanism.

1. **Teaching Angle.** *Default freeze framing.* Built per decoder. Frames
   the user, key defender, ball, and open-space patch in the lower 2/3 of
   the screen. Pitch ~24°, slightly lower than auto-fit, so body-cue
   overlays sit above the heads.
2. **Broadcast.** Auto-fit, ~32° pitch. Used in watch phase by default.
3. **Player Read Angle.** Over-the-shoulder of the user, looking past
   them at the key defender. Used for ESC and BDW where the user's read
   is what matters.
4. **Help Defense Angle.** Side-on, weak-side-toward-camera. Used for SKR
   to make the over-help and the abandoned shooter visible in the same
   frame.
5. **Top-Down Coach Board.** Pure top-down (90° pitch). Used in replay
   teaching mode and in *Film Room Review* (a Pathways concern).

### 8.3 Default camera per decoder + phase

| Decoder | Setup | Watch | Freeze | Replay |
| --- | --- | --- | --- | --- |
| `BACKDOOR_WINDOW` | Broadcast | Broadcast | Teaching Angle (over user, looking through deny defender to rim) | Player Read Angle, then Top-Down for the cut path |
| `EMPTY_SPACE_CUT` | Broadcast | Broadcast | Teaching Angle (showing helper's vision direction) | Player Read Angle, then Help Defense Angle for the empty patch |
| `ADVANTAGE_OR_RESET` | Broadcast | Broadcast | Teaching Angle (low, frames the closeout's feet) | Player Read Angle, then Top-Down for the drive |
| `SKIP_THE_ROTATION` | Broadcast | Broadcast | Help Defense Angle (the frame of a film room) | Top-Down for the skip pass arc |

### 8.4 Cue-locked framing

For each decoder, the freeze framing must include:

- **BACKDOOR_WINDOW** — frame: user, denying defender, passer, rim lane.
- **EMPTY_SPACE_CUT** — frame: user, helper defender (whose head turned),
  the empty floor patch they just left.
- **ADVANTAGE_OR_RESET** — frame: receiver (user), closeout defender's
  feet, the driving lane behind them.
- **SKIP_THE_ROTATION** — frame: ball-handler, helper (the over-helper),
  weak-side target.

These are explicit invariants the camera preset must satisfy. The QA route
should *fail* a scenario whose freeze frame is missing any of these.

### 8.5 Default camera logic

- On scene mount: pick the decoder + phase preset.
- On phase transition: lerp camera position over 250–400 ms (longer for
  freeze entry to feel like a coach pause).
- On user override (camera dropdown in `PremiumOverlay`): user's choice
  wins. We do not interrupt manual control.
- On URL `?camera=` param: same as user override. Persists for the
  session.

### 8.6 User camera override

- Manual camera control is allowed; the system never *forces* a frame.
- When the user manually pans, decoder presets stop running for that
  scene. They resume on the next scenario.

### 8.7 Mobile camera constraints

- Phone aspect ratio (≈ 9:19.5 portrait, 19.5:9 landscape) makes the
  Help Defense Angle hard — too much vertical sky. On phones, we tighten
  the pitch by ~5° and dolly in 10%.
- The Top-Down Coach Board is naturally phone-friendly because aspect
  ratio is ignorable from above.
- Test every preset at 393 px × 700 px landscape and at 393 px × 852 px
  portrait. If a cue is occluded by the user's thumb, we redesign the
  preset.

### 8.8 Preventing the camera from hiding the cue

- The freeze framing must keep the cue defender's relevant body part
  (hand, hip, foot, chest, vision) visible.
- The QA route renders a "cue visibility" check: ray-cast from the camera
  to the cue defender's relevant joint; if obstructed, fail.
- This is the single most common failure mode of "looks fine" cameras.

### 8.9 How Pathways difficulty changes camera support

- **Beginner (Learn the Cue).** Camera lerps deeper into the cue,
  generously. The freeze framing might even move the camera to a
  slow-zoom on the defender's hand for a beat.
- **Intermediate (Mixed Reads).** Camera holds Broadcast through the
  freeze; teaching angle is reserved for replay.
- **Advanced (Boss Challenge).** No camera assist. Broadcast through the
  whole rep.
- **Film Room Review (post-miss).** Full assist — cameras switch like a
  highlight package.

The renderer respects `cameraAssist: 'full' | 'partial' | 'none'`. The
Pathways layer chooses; the renderer does not impose.

---

## 9. Cue Overlay and Coach Annotation System

`decoderOverlayPresets.ts` already names the right primitives. What is
missing is **adaptive behavior** — the same scenario should layer overlays
differently depending on Pathways mode, and overlay timing should feel
like a coach annotating, not a HUD.

### 9.1 The four families

For each decoder, the canonical overlay clusters are:

#### BACKDOOR_WINDOW
- **Pre-answer:**
  - `defender_hand_in_lane` on the denying defender
  - `defender_vision_cone` from denying defender to passer (proves they're
    ball-watching)
  - `passing_lane_blocked` from passer to user (the lane he's denying)
- **Post-answer:**
  - `open_space_region` anchored on the rim corridor
  - `drive_cut_preview` along the user's back-cut path
  - `label` on the cue: "Defender is denying"

#### EMPTY_SPACE_CUT
- **Pre-answer:**
  - `defender_vision_cone` on helper, target = ball
  - `defender_hip_arrow` on helper (showing hips turned to ball)
  - `help_pulse` on helper, role = `tag` (or `nail` / `stunter` per
    scenario)
- **Post-answer:**
  - `open_space_region` anchored on the vacated paint or empty corner
  - `passing_lane_open` from passer to user
  - `drive_cut_preview` along user's cut path
  - `label` on the cue: "Eyes left — move now"

#### ADVANTAGE_OR_RESET
- **Pre-answer:**
  - `defender_foot_arrow` on closeout defender (parallel feet vs.
    staggered)
  - `defender_hip_arrow` on closeout defender (momentum)
  - `defender_chest_line` on closeout defender (tilt forward = high
    closeout)
- **Post-answer (branch-specific):**
  - **Late closeout:** `open_space_region` anchored on shooting pocket +
    `timing_pulse` + label "Late closeout — shoot"
  - **Flying closeout:** `drive_cut_preview` baseline + label "Flying
    closeout — drive"
  - **Set defender:** label "Set defender — reset" + ball-flow arrow

#### SKIP_THE_ROTATION
- **Pre-answer:**
  - `help_pulse` on over-helper, role = `overhelp`
  - `defender_chest_line` on over-helper
  - `defender_hip_arrow` on over-helper
- **Post-answer:**
  - `passing_lane_open` from passer to weak-side open player
  - `open_space_region` anchored weak-side
  - `drive_cut_preview` arrow showing "catch → shoot" or "catch → swing"
  - `label` on cue: "Help came from here"

### 9.2 Beginner vs. advanced overlay behavior

| Mode | Pre-answer overlays | Post-answer overlays | Decoder pill |
| --- | --- | --- | --- |
| Learn the Cue (beginner) | All 3 cluster overlays | All 3 reveal overlays + label | Visible on freeze |
| Freeze-Frame Read | All 3 cluster overlays | 2/3 reveal overlays | Visible on freeze |
| No-Hint Rep | 1 overlay (cue only) | 2 reveal overlays | Hidden on freeze |
| Mixed Reads | 1 overlay (cue only) | 1 reveal overlay | Hidden on freeze |
| Boss Challenge | 0 overlays | 0 overlays | Hidden entirely |
| Film Room Review | All overlays + extras | All overlays + extras | Visible the whole rep |

This is data, not policy — it lives in a `getOverlayLevel(mode)` helper
that the imperative overlay controller already has the seam for.

### 9.3 Overlay clutter rules

The clutter caps from `decoderOverlayPresets.ts` stay:

- Beginner: 3 pre / 3 post.
- Intermediate: 4 max.
- Advanced: 5 max.

Overlays are never stacked on top of each other in screen space. If two
primitives would occupy the same pixel band, drop the lower-priority one.

### 9.4 Label style

- Mono/sans-serif (JetBrains Mono for chip-style labels, Inter for body).
- Size: ~12 px on phone.
- Anchor: above the cue, with a 4-px gap to the figure silhouette.
- Color: warm white on a 60% black blur background.
- Animation: fade in over 80 ms, never bouncy.
- Maximum 5 words.

### 9.5 Pre-answer vs. post-answer differences

- **Pre-answer overlays describe the cue.** They never name the answer.
  "Defender is denying" is allowed; "cut backdoor" is not.
- **Post-answer overlays describe the read.** They name the action and
  the space. "Cut behind" + open-space patch + lane arrow.
- The label voice changes: pre-answer is *observation*, post-answer is
  *teaching*.

### 9.6 Pathways connection

- Early pathway reps run in Learn the Cue / Freeze-Frame Read modes →
  full overlays.
- Mid pathway reps run in No-Hint Rep / Mixed Reads → minimal overlays.
- Boss challenges → no overlays, no decoder pill.
- Film Room Review (post-miss) → maximum overlays + label sequencing.
- The `chapter.cameraAssist` and `chapter.overlayLevel` config that
  Pathways exposes are the levers; the renderer just reads them.

### 9.7 Cluster overlay choreography

Even with three primitives, *order matters*. The freeze should feel like a
coach pointing.

- t = 0 ms (freeze): scene clamps, world dims 6%.
- t = 40 ms: first cluster overlay (the body cue — usually the hip or
  hand arrow) fades in.
- t = 120 ms: second overlay (the disambiguator — vision cone or
  chest-line) fades in.
- t = 220 ms: third overlay (the lane line or label) fades in.
- t = 320 ms: decoder pill animates in.
- t = 350 ms: question is fully interactive.

Total stage-in: ~350 ms. Below the 500 ms attention threshold; never
"slow."

### 9.8 Overlay invariants the QA route should enforce

1. Pre-answer cluster contains only kinds in `PRE_ANSWER_OVERLAY_KINDS`.
2. Cluster size ≤ clutter cap for the difficulty tier.
3. Every overlay references a player or anchor that exists in the scene.
4. The cue overlay points to the *key defender* the decoder identifies.
5. No two overlays occupy the same pixel band at freeze.
6. Post-answer reveal includes at least one of: open-space region,
   passing lane, drive-cut preview.
