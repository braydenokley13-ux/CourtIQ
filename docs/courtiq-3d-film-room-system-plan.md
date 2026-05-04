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

---

## 10. Replay Teaching Mode

The replay state machine is correct. The replay *experience* needs work.
This section describes how the answer leg should *teach*, not just
animate.

### 10.1 What the replay must accomplish

When the user picks an answer, the replay leg must:

1. **Return to the cue moment.** The player needs to see the same frame
   they decided on, not the start of the possession.
2. **Pause or slow briefly.** The cue moment lands one more time, so the
   player can compare what they saw to what was actually there.
3. **Show the cue.** Pre-answer overlays repaint, often with a label that
   was hidden during the rep.
4. **Show the correct action path.** The answer leg plays from the freeze
   snapshot, using `samplePositionsAt` so defenders do not snap back.
5. **Show why it worked.** Post-answer overlays paint the open space, the
   passing lane, the drive-cut preview *as the action happens*, not after.
6. **End with a short teaching label.** A single chip — "Read the
   denial." / "Punish the help." — lands as the rep ends. This is also
   the bridge to the Pathways summary.

### 10.2 Replay timing

| Beat | Time | What happens |
| --- | --- | --- |
| Wrong choice locked in | 0 ms | Choice tile flashes red; haptic |
| Consequence leg starts | 80 ms | Camera dims 6%, slow-mo to 0.6× |
| Consequence plays | 80–1500 ms | Wrong-demo movements run from snapshot |
| Snap to freeze snapshot | 1500 ms | Camera lerps back to teaching angle |
| Cue overlays repaint | 1500–1700 ms | Pre-answer cluster fades in again |
| Decoder pill animates | 1700 ms | "Backdoor Window" chip lifts in |
| Answer leg starts | 1900 ms | Best-read movements run from snapshot |
| Post-answer overlays | 1900 ms onward | Open-space + lane + drive-cut paint as action unfolds |
| Teaching label lands | At leg end | One-line chip, fades over 500 ms |
| Done | +700 ms | CTA: "Next" or "Why?" |

| Beat | Time (best-read) | What happens |
| --- | --- | --- |
| Correct choice locked in | 0 ms | Tile flashes green; haptic |
| Quick reset to snapshot | 80 ms | No consequence — straight to teaching |
| Cue overlays repaint | 200 ms | Pre-answer cluster fades in |
| Decoder pill animates | 400 ms | Chip lifts in |
| Answer leg starts | 600 ms | Best-read movements run from snapshot |
| Post-answer overlays | 600 ms onward | Same as wrong path |
| Teaching label lands | At leg end | Same chip |
| Done | +700 ms | CTA: "Next" |

Total wrong-path replay: ~2.5–4 s. Total best-read replay: ~2 s.

### 10.3 Overlay phasing in replay

- The pre-answer cluster paints again at the start of the replay so the
  cue is reinforced.
- Post-answer overlays paint *as the action happens*, not all at once.
  - For BDW: the back-cut path arrow paints behind the user as they cut.
  - For ESC: the open-space patch lights up at the moment the helper's
    head turns.
  - For AOR: the drive-cut preview paints as the user takes the first
    dribble; the timing pulse on the shooting pocket fires at the catch.
  - For SKR: the passing-lane line paints as the ball leaves the
    passer's hand; the open-space patch lights up at the catch.
- Both clusters fade together when the leg ends.

### 10.4 When to show wrong-read comparison

- Default for wrong choices: consequence leg only. Don't make the player
  watch the right read *plus* a side-by-side.
- *Optional* in Film Room Review mode: show wrong-then-right as a split
  replay, with overlays on both. This is a Pathways concern.
- Never on a correct rep. We do not need to remind the player of the
  alternative they *didn't* take.

### 10.5 Connecting replay to feedback text

- Today: feedback text mounts in the tray after the replay completes.
- Improvement: the *one-line* feedback (the `feedback_text` on the
  picked choice) lands on the freeze snapshot frame as a label, *during*
  the replay. Player reads it as a label first; full text waits in the
  tray.
- The deeper "Why?" stays collapsible. We keep the fast loop fast.

### 10.6 Per-decoder replay character

Each decoder has its own teaching beat:

- **BACKDOOR_WINDOW.** The replay is about *space behind a defender*. The
  back-cut should feel decisive — slow-mo for the plant, normal speed
  for the cut.
- **EMPTY_SPACE_CUT.** The replay is about *timing*. The replay
  highlights the head-turn moment with a brief overlay flash, then runs
  the cut at normal speed.
- **ADVANTAGE_OR_RESET.** The replay is about *reading feet*. Camera
  drops low at freeze; replay highlights the lead foot before the drive
  starts.
- **SKIP_THE_ROTATION.** The replay is about *vision across the floor*.
  Top-down camera in replay traces the skip arc; the open shooter
  pulses as the ball arrives.

### 10.7 Film Room Review mode (later)

Pathways introduces a Film Room Review mode that revisits missed
scenarios with full assist. The renderer support for this is:

- Camera assist = full.
- Overlay level = max.
- Slow-mo at 0.4× through the cue moment.
- Decoder pill stays visible for the whole rep.
- Wrong-then-right split replay enabled.

We do not implement this in FR-1. We design for it now so the
`overlayLevel` and `cameraAssist` config seams exist.

---

## 11. Scenario-by-Scenario QA System

This is the **most important section in the document for shipping speed.**
We cannot iterate on visual quality without a tool that lets us see all 20
scenarios in 60 seconds.

### 11.1 The route

- Path: `/dev/scenario-preview`
- Gating:
  - In `NODE_ENV !== 'production'` always.
  - In production, only when an explicit env flag is set
    (`NEXT_PUBLIC_ENABLE_DEV_ROUTES=1`) **and** the user is an admin.
  - Never linked from the marketing or app navigation.

### 11.2 Layout

A two-column layout:

- **Left column (320 px on desktop, full width on mobile):** scenario
  selector, metadata panel, render panel, manual QA checklist.
- **Right column (rest of the viewport):** the `Scenario3DCanvas` running
  the selected scenario.

### 11.3 Scenario selector

- A dropdown or list of all 20 founder-v0 scenarios, grouped by decoder
  family (BDW / ESC / AOR / SKR), sorted by difficulty.
- Each item shows: ID, title, difficulty chip, cue label.
- Selecting an item swaps the canvas to render that scenario in `intro`
  mode with autoplay.
- Keyboard shortcuts: `J` / `K` for next/previous; `R` to reset the
  scene; `F` to skip to freeze.

### 11.4 Scenario metadata panel

For the selected scenario, surface:

- ID (`BDW-02`, etc.)
- Title (`Denied Reversal at the Top`)
- Decoder tag
- Difficulty (1–5)
- Prompt text
- Visible cue (free-form)
- Best-read explanation
- Decoder teaching point (one-liner)

Source: directly from the seed JSON files in
`packages/db/seed/scenarios/packs/founder-v0/`.

### 11.5 Render metadata panel

For the live canvas, surface:

- Player render path per player (`glb` / `procedural` / `2d` / `proxy`)
- Per-player `pick:reason` from the decision log
- Animation intent per player
- Selected clip per player (or `-` if static)
- Fallback reason (cumulative count)
- Camera preset (decoder + phase)
- Overlay preset name + count
- Overlay level (beginner/intermediate/advanced)
- Replay phase (`idle | setup | playing | frozen | consequence | replaying | done`)
- `freezeAtMs` value
- Active label

This is a superset of `GlbDebugBadge`. Most of the data is already
exposed through `_getPlayerFigureDecisionLog`,
`isGlbAthletePreviewActive`, `isImportedCloseoutClipActive`,
`isImportedBackCutClipActive`. The QA route just renders it.

### 11.6 Manual QA checklist

A persistent checklist next to the canvas. The checklist state is
**not** stored — it is a coach-the-eye tool, not a database.

- [ ] Cue is visible at freeze
- [ ] User is visible
- [ ] Key defender is visible
- [ ] Ball is visible
- [ ] Open space is visible at replay
- [ ] Best answer is visually supported
- [ ] Player sizes are readable
- [ ] Camera angle is acceptable
- [ ] Overlays are not cluttered
- [ ] Cue overlay points to the right defender
- [ ] Replay shows the correct read clearly
- [ ] On phone landscape, all of the above hold

Each item has a "fail" button that copies the scenario ID + the failed
item to clipboard so an issue can be filed in seconds.

### 11.7 Why this is essential before scaling content

- Visual fixes without a way to see them are guessing.
- A scenario QA pass that takes 5 minutes per scenario × 20 scenarios =
  100 minutes. With this tool: 20 minutes.
- When we add the next 20 scenarios, the same tool covers them with no
  additional engineering.
- Visual regressions land *during* development instead of in production.

### 11.8 Design tradeoffs we explicitly accept

- This is **not** a full admin CMS. It is a preview tool.
- It does **not** edit scenarios. Editing remains JSON-first.
- It does **not** persist QA state. Every page load is a fresh checklist.
- It does **not** capture screenshots automatically. That's a v2.

### 11.9 Optional future additions

- Side-by-side comparison of two scenarios.
- A "fail" button that opens a pre-filled GitHub issue.
- Auto-screenshot on freeze for a visual regression baseline.
- Timeline scrubber for any phase.

These are nice-to-haves and explicitly out of FR-1 scope.

---

## 12. Debug and Observability Plan

The renderer should be observable from outside (developers + QA) without
leaking anything in production.

### 12.1 Debug modes

- `?glbDebug=1` — existing badge; keep.
- `?forceGlb=1` — already a runtime flag (`_isForceGlbAthletePreview`);
  exposed as URL flag.
- `?debugFilmRoom=1` — **new**. Surfaces the teaching state, not the
  asset state.
- `?scenario=BDW-02` — already supported in some paths; unify so it works
  on `/train`, `/dev/scenario-preview`, and any film-room demo route.
- `/dev/scenario-preview` — see §11.

### 12.2 What `debugFilmRoom=1` shows

A small badge (or the right column of the QA route) showing:

- Selected scenario ID + title
- Camera preset (current phase)
- Overlay preset name
- Overlay level (beginner/intermediate/advanced)
- Render path summary (`glb ×8 · procedural ×2`)
- GLB model loader status
- Animation clip status per intent
- Fallback reasons (cumulative)
- Scene bounds (Box3 size)
- Replay phase
- Freeze time elapsed
- Decoder family
- Visible cue summary

### 12.3 What normal users see

- None of the debug badges.
- All the polish (camera, overlays, replay).
- A graceful fallback if anything fails.

### 12.4 What developers see

- The full debug stack with the URL flag.
- All pick decisions, all fallback reasons.
- The decoder + camera + overlay state for the active phase.

### 12.5 Avoiding answer-key leakage in production

- Pre-answer overlays must never include the answer.
- The decoder pill is fine to show before answer (it tells you the family,
  not the answer).
- The `feedback_text`, `is_correct`, `explanation_md` are fetched
  *after* attempt submission (per `ARCHITECTURE.md` §5.4). This stays.
- The QA route is gated to dev / admin. The route itself never appears
  in production navigation.
- `debugFilmRoom=1` may surface the best-read explanation only when
  `NODE_ENV !== 'production'`.

### 12.6 What should be logged to console

- One structured `console.info` line per fallback transition.
- One `console.warn` when an overlay preset references a missing role.
- One `console.warn` when an overlay primitive references a missing
  player ID.
- One `console.warn` when a cue is occluded by the camera (best-effort
  ray-cast).
- All other logs gated behind the dev flag.

### 12.7 What should be shown in the UI

- Nothing in production unless the dev flag is on.
- In QA route + debug modes: render-path summary, decision log,
  scenario metadata.
- Never an "error toast" for a fallback. Fallback is design, not error.

### 12.8 How this supports production QA

- A coach-author can be sent a link with `?glbDebug=1&debugFilmRoom=1`
  and report what they saw with the badge values attached.
- Sentry / PostHog can ingest the structured fallback breadcrumbs to
  measure how often each fallback fires in the wild.
- The QA route gives a single screen to validate any scenario change.

### 12.9 Observability invariants

- Production users never see debug UI without an explicit flag.
- Debug UI never blocks the canvas — it overlays.
- Debug logs do not include PII.
- Debug flags are URL-based, not cookie-based, so a session is not
  contaminated.

---

## 13. Connection to CourtIQ Pathways

The film room exists in service of Pathways. A great rep with no
direction is a quiz; a great rep inside a Pathway chapter is an actual
training session. This section names the seams.

### 13.1 Pathway-aware overlay intensity

Pathways exposes an `overlayLevel` per chapter (`Learn the Cue` →
beginner, `Boss Challenge` → none). The renderer reads this and adjusts
the overlay cluster per §9.2. No new schema; the chapter config is a
runtime input to the canvas.

### 13.2 Pathway-aware camera assist

Same shape: `cameraAssist: 'full' | 'partial' | 'none'`. The renderer's
camera preset machinery respects it. Boss challenges run with auto-fit
broadcast only.

### 13.3 Beginner pathway reps = more help

- Camera lerps deeper into the cue.
- Overlay cluster paints in full.
- Decoder pill shows pre-freeze.
- Slow-mo on freeze entry is more pronounced.
- Replay overlays are maxed.

### 13.4 Later pathway reps = less hinting

- Camera holds Broadcast through the freeze.
- Overlay cluster is the cue only.
- Decoder pill animates in *after* the answer.
- Slow-mo entry is subtle (~150 ms).
- Replay overlays are minimal.

### 13.5 Boss challenges = no overlays, no decoder label

- `overlayLevel: none`. Overlay controller mounts but does not paint.
- `cameraAssist: none`. Auto-fit only.
- Decoder pill never appears.
- Player has to read everything raw.
- This is the entire point of a boss challenge.

### 13.6 Missed reps trigger Film Room Review

- A wrong answer flagged at end-of-session triggers a Film Room Review
  rep on the *next* visit.
- Film Room Review uses overlay level = max, camera assist = full,
  slow-mo = strong, wrong-then-right replay enabled.
- This is the surface that turns a missed read into a learned read.

### 13.7 Chapter difficulty maps to overlay level

| Chapter type | Overlay level | Camera assist | Decoder pill |
| --- | --- | --- | --- |
| Decoder Lesson | Beginner | Full | Yes (pre-freeze) |
| Skill Node (early) | Beginner | Partial | Yes (pre-freeze) |
| Skill Node (mid) | Intermediate | Partial | Yes (post-freeze) |
| Boss Challenge | None | None | No |
| Mixed-Read Final | Intermediate | None | No |
| Film Room Review | Advanced (max) | Full | Yes (full rep) |

This table is a *contract* between Pathways and the film room. Either
side can refer to it.

### 13.8 Pathways-driven mastery → film room reflections

- Per-decoder mastery (BDW / ESC / AOR / SKR) is tracked via existing
  `Mastery` rows. The film room can surface "you've now mastered this
  cue" on the rep that crosses the threshold.
- A mastered decoder can render with a subtle "mastered" frame chrome
  (a thin gold hairline) — but only on the chapter that's about that
  decoder. Never gimmicky.

### 13.9 Player archetype influences training mode

- An "Off-Ball Weapon" archetype emphasizes ESC + BDW reps.
- A "Closeout Killer" emphasizes AOR.
- A "Help Defense Punisher" emphasizes SKR.
- The film room does not need to know the archetype — but it can read
  the per-decoder camera/overlay defaults from the Pathway chapter
  config the player is currently on.

### 13.10 Pathway progress reports use film-room patterns

- Mistake patterns ("missed every BDW rep where the denial was on the
  ball-handler's strong side") feed Pathway progress summaries.
- The renderer is the source of truth for what was actually shown; the
  attempt log is the source of truth for what was answered. Pathways
  joins them at the report layer.

### 13.11 What we do NOT couple

- Scenario JSON does not reference Pathways. Scenarios are reusable.
- The renderer does not import Pathways modules. It accepts
  `overlayLevel` + `cameraAssist` as props.
- Mastery / archetype calculation lives in `packages/core` and Pathways
  services. The film room reads outputs.

This keeps the film room self-contained — it works in `/train` (no
Pathway), works inside a Pathway chapter, works in Film Room Review.
Same code path, three calling configurations.

---

## 14. Founder-v0 Film-Room QA Matrix

A scenario-by-scenario checklist to drive FR-1 QA and to give
implementers a per-scenario contract. Field meanings:

- **Decoder** — family tag.
- **Primary visual cue** — the body part that, by itself, sells the
  read.
- **Required camera frame** — what must be in the freeze frame.
- **Required player highlight** — beyond the standard user/ball, who
  must be visually emphasized.
- **Required overlay** — minimum pre-answer overlay set per §9.1.
- **Known risk** — the most likely failure mode for this scenario.
- **QA priority** — `high` (front of FR-1 QA), `medium`, `low`.

### 14.1 BDW family — Backdoor Window

| ID | Decoder | Primary cue | Required camera frame | Required highlight | Required overlay | Known risk | QA priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **BDW-01** | BDW | x2 hand-in-lane (wing denial) | User, x2, PG, rim corridor visible | x2 (key defender) | hand-in-lane + vision-cone + passing-lane-blocked | x2 hand may not render visibly on procedural fallback | **high** |
| **BDW-02** | BDW | x_top chest above user (top-lock) | User at slot, x_top denying, middle lane visible | x_top | chest-line + hand-in-lane + vision-cone | Camera may hide the middle lane behind the user | **high** |
| **BDW-03** | BDW | x3 top-locks corner | User in corner, x3, baseline lane visible | x3 | hand-in-lane + chest-line + passing-lane-blocked | Baseline corridor may clip out of frame on phone | **high** |
| **BDW-04** | BDW | x_user jumps flare | User on weak wing, x_user mid-jump, screener space | x_user | hip-arrow + chest-line + vision-cone | The "cheat" pose is hard to read without a clip | medium |
| **BDW-05** | BDW | Lift defender beats user to wing | User mid-lift, defender ahead, baseline open | x_user | foot-arrow + hip-arrow + chest-line | Reverse-cut path may not paint cleanly post-answer | medium |

### 14.2 ESC family — Empty-Space Cut

| ID | Decoder | Primary cue | Required camera frame | Required highlight | Required overlay | Known risk | QA priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **ESC-01** | ESC | D4 head turn to ball | User on weak wing, D4 turned, empty corner | D4 | vision-cone + hip-arrow + help-pulse(tag) | "Eyes turn" cue may not be visible without a clip; vision cone has to do the work | **high** |
| **ESC-02** | ESC | D4 hips turn to roller | User at slot, D4 mid-tag, empty slot | D4 | hip-arrow + help-pulse(tag) + vision-cone | Multiple cues stack; risk of clutter | **high** |
| **ESC-03** | ESC | D3 head turned to ball, skip in air | User in weak corner, ball mid-skip, D3 flat-footed | D3 + ball | vision-cone + hip-arrow + help-pulse(tag) | Pass arc must not block the cue | medium |
| **ESC-04** | ESC | x_weak stunt foot in lane | User on weak wing, post on block, stunt foot visible | x_weak | foot-arrow + help-pulse(tag) + vision-cone | Stunt foot is small at broadcast distance | medium |
| **ESC-05** | ESC | User's defender ball-watching | User at weak slot, vacated wing, defender turned | x_user | hip-arrow + vision-cone + help-pulse(tag) | "Ball-watcher" is the most subtle cue in the family | medium |

### 14.3 AOR family — Advantage or Reset

| ID | Decoder | Primary cue | Required camera frame | Required highlight | Required overlay | Known risk | QA priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **AOR-01** | AOR | D4 parallel feet, momentum forward | User catching wing, D4 closeout pose, lane clear | D4 (feet) | foot-arrow + hip-arrow + chest-line | Feet are tiny at broadcast distance; need low camera | **high** |
| **AOR-02** | AOR | D4 set, balanced, hand high | User catching, D4 stable, no driving lane | D4 | foot-arrow + chest-line + hip-arrow | Easy to confuse with AOR-01 if camera doesn't show the difference | **high** |
| **AOR-03** | AOR | D4 still 4 ft away on catch | User catching wing, D4 mid-stride, shooting pocket open | D4 + user shooting pocket | distance label + foot-arrow + open-space(pocket) | Shooting pocket overlay must paint pre-answer; today no kind exists for "distance label" | medium |
| **AOR-04** | AOR | D4 chest tilted, weight back | User in corner, D4 high closeout, baseline open | D4 chest | chest-line + foot-arrow + hip-arrow | Chest-tilt reads as "lean," not "high closeout" without practice | medium |
| **AOR-05** | AOR | D_user sideways, lead foot at ball | User on weak wing, D_user recovering sideways | D_user (hip) | hip-arrow + foot-arrow + chest-line | Branched read (drive/reset) requires correct intent dispatch | **high** |

### 14.4 SKR family — Skip the Rotation

| ID | Decoder | Primary cue | Required camera frame | Required highlight | Required overlay | Known risk | QA priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **SKR-01** | SKR | D5 stunt + paint collapse | Driver, paint shading, weak corner empty | D5 | help-pulse(overhelp) + hip-arrow + chest-line | Diagonal of the floor must be visible — Help Defense Angle required | **high** |
| **SKR-02** | SKR | Tagger pulled to roller | Ball-handler, tagger committed, weak corner open | Tagger | help-pulse(overhelp) + hip-arrow + chest-line | Roller and tagger may overlap in frame | medium |
| **SKR-03** | SKR | Double-team on post | Post + double, weak corner empty | Bracketing defender | help-pulse(overhelp) + chest-line + hip-arrow | Double-team is two figures; may clutter | medium |
| **SKR-04** | SKR | Help defender steps in on dribble-at | Ball-handler, helper step, weak corner open | Helper | help-pulse(overhelp) + hip-arrow + chest-line | Dribble-at angle is unfamiliar to most viewers | medium |
| **SKR-05** | SKR | X-out below, slot exposed | Driver baseline, X-out arrows, weak slot | X-out defender | help-pulse(overhelp) + chest-line + hip-arrow | Multiple defenders in motion — camera must isolate the cue | **high** |

### 14.5 Cross-family invariants the matrix enforces

- Every scenario has 3 required pre-answer overlay primitives. ≤ 3 = the
  beginner cap from `decoderOverlayPresets.ts`.
- Every scenario names a single key defender for the heat-red highlight.
- Every scenario specifies what must be in the freeze frame for the
  camera ray-cast cue check.
- Known risks become FR-1 QA failure cases.

### 14.6 Using the matrix

- The QA route in §11 should *display* this matrix per scenario, so a
  reviewer compares the live render to the contract in real time.
- A scenario is **shippable** when every checkbox in §11.6 passes
  against the criteria in §14.1–14.4.

---

## 15. Implementation Phases

Phased roadmap. Each phase has a hard scope. Phase boundaries are
release boundaries.

### FR-1 — Film-Room QA Route + Debug Observability

- **Goal.** See every scenario in 60 seconds. Make every fallback,
  camera, overlay decision visible to the dev/QA team.
- **Scope.**
  - Build `/dev/scenario-preview` with selector, metadata panel, render
    panel, manual checklist.
  - Wire `?debugFilmRoom=1` to surface teaching state.
  - Surface render-path summary, decoder, camera preset, overlay level
    in a dev-only badge.
  - Keep the existing `GlbDebugBadge` intact.
- **Files likely touched.**
  - `apps/web/app/(dev)/dev/scenario-preview/page.tsx` (new, dev only)
  - `apps/web/lib/scenario3d/feature.ts` (add `isDebugFilmRoom`,
    `getScenarioParam`)
  - `apps/web/components/scenario3d/FilmRoomDebugBadge.tsx` (new)
  - `apps/web/lib/scenario3d/qaMatrix.ts` (new — embed the §14 data)
  - No renderer files modified.
- **Tests needed.**
  - Render-path summary unit tests (already partially exist via
    `summarisePlayerFigureDecisions`).
  - Snapshot test for the dev page (renders with each scenario).
  - QA-matrix data integrity test (every founder-v0 ID appears once).
- **Risks.**
  - Dev route accidentally shipped to production. Mitigation: env-flag
    gate + admin check + no nav link.
  - Performance regression from the debug badge. Mitigation: badge is
    only mounted when the flag is on.
- **Success criteria.**
  - A reviewer can pick any of the 20 scenarios in < 5 s.
  - The render-path summary correctly reports `glb` vs. `procedural`
    per scenario.
  - The QA matrix renders alongside each scenario.

### FR-2 — GLB / Fallback Reliability

- **Goal.** Every user sees the GLB, every time, or a clean fallback —
  never a half-render.
- **Scope.**
  - Warm `loadGlbAthleteAsset()` before canvas mount.
  - Add an "GLB-pose-only" middle path between `glb-with-clip` and
    `procedural`.
  - Consolidate the four fallback reasons into a clean visible
    breadcrumb in dev.
  - Tests for the silent-failure paths.
- **Files likely touched.**
  - `apps/web/components/scenario3d/glbAthlete.ts`
  - `apps/web/components/scenario3d/imperativeScene.ts` (the figure
    decision log)
  - `apps/web/components/scenario3d/Scenario3DCanvas.tsx` (cache warm)
- **Tests.**
  - `productionGlbAssetGate.test.ts` extended.
  - New test: cold-cache scenario does not render procedural.
- **Risks.**
  - Cache warm adds latency. Mitigation: do it parallel to scene mount.
  - Pose-only fallback may look frozen. Mitigation: it should — that's
    intentional.
- **Success criteria.**
  - 100% GLB render rate across the founder-v0 pack on a warm cache.
  - Cold-cache first frame is a static GLB pose, not procedural.

### FR-3 — Player Readability and Visual Language

- **Goal.** Every figure passes the §7 minimum readable frame rule.
- **Scope.**
  - Refine team tinting parity between GLB and procedural.
  - Add per-team subtle color temperature.
  - Improve grounding shadows.
  - Author a "basketball ready" bind-pose delta for the GLB.
- **Files likely touched.**
  - `apps/web/components/scenario3d/glbAthlete.ts` (bind-relative
    deltas, materials)
  - `apps/web/components/scenario3d/imperativeScene.ts` (procedural
    figure tint parity)
- **Tests.**
  - Snapshot rendering at 393 px wide.
  - Silhouette-readability spot test (manual, in the QA route).
- **Risks.**
  - Tint may fight court palette.
  - Bind-pose changes may break existing clips (the existing audit
    catches this).
- **Success criteria.**
  - Offense / defense readable in 0.5 s without label.
  - User identifiable in 0.5 s.

### FR-4 — Decoder-Aware Camera Presets

- **Goal.** The freeze frame teaches the read.
- **Scope.**
  - Implement the four named presets (`Teaching`, `Player Read`,
    `Help Defense`, `Top-Down Coach Board`).
  - Wire decoder + phase → preset.
  - Honor `cameraAssist: 'full' | 'partial' | 'none'`.
- **Files likely touched.**
  - `apps/web/components/scenario3d/AutoFitCamera.tsx` (wrapped, not
    replaced)
  - New: `apps/web/lib/scenario3d/cameraPresets.ts`
  - `apps/web/components/scenario3d/Scenario3DCanvas.tsx` (preset
    dispatch)
- **Tests.**
  - Cue-visibility ray-cast test per scenario.
  - Snapshot freeze frame per (decoder × camera assist).
- **Risks.**
  - Camera transitions can feel jumpy. Mitigation: lerp 250–400 ms.
  - Mobile aspect breaks Help Defense Angle. Mitigation: per-aspect
    overrides.
- **Success criteria.**
  - The cue is visible in the freeze frame on all 20 scenarios at
    393 px landscape.

### FR-5 — Adaptive Cue Overlays

- **Goal.** Same scenario reads differently across Pathways modes.
- **Scope.**
  - `getOverlayLevel(mode)` helper.
  - Stage-in choreography per §9.7.
  - Pre-answer label fade-in / post-answer label sequence.
- **Files likely touched.**
  - `apps/web/components/scenario3d/imperativeTeachingOverlay.ts`
  - `apps/web/lib/scenario3d/decoderOverlayPresets.ts` (read-only data,
    consumer-side change)
- **Tests.**
  - Beginner / advanced overlay count assertions.
  - Choreography timing assertions.
- **Risks.**
  - Adding choreography may regress determinism. Mitigation: extend
    `replayDeterminism.test.ts`.
- **Success criteria.**
  - Boss challenge mode renders zero overlays.
  - Beginner mode renders three.

### FR-6 — Replay Teaching Polish

- **Goal.** The replay leg teaches the read with cadence.
- **Scope.**
  - Slow-mo entry to freeze.
  - World dim + cue overlay choreography on freeze.
  - Per-decoder replay character (BDW slow-mo on plant, AOR low camera,
    SKR top-down skip arc).
  - End-of-rep teaching label.
- **Files likely touched.**
  - `apps/web/components/scenario3d/ScenarioReplayController.tsx` and
    its imperative twin in `imperativeScene.ts`
- **Tests.**
  - Replay determinism (existing).
  - Phase-transition timing tolerance.
- **Risks.**
  - Slow-mo at the freeze can feel sluggish. Mitigation: 250 ms cap.
- **Success criteria.**
  - Wrong-path replay lands a clear consequence + best-read in < 4 s.
  - Best-read replay lands in < 2 s.

### FR-7 — Pathways Integration

- **Goal.** The film room respects `overlayLevel` and `cameraAssist`
  passed by Pathways.
- **Scope.**
  - Accept the two props at `Scenario3DView`.
  - Plumb to overlay controller and camera dispatcher.
- **Files likely touched.**
  - `apps/web/components/scenario3d/Scenario3DView.tsx`
  - `apps/web/components/scenario3d/Scenario3DCanvas.tsx`
  - Possibly a new `lib/scenario3d/filmRoomMode.ts`.
- **Tests.**
  - Mode → overlay/camera contract tests.
- **Risks.**
  - Modes may proliferate. Mitigation: keep §13.7 table as the contract.
- **Success criteria.**
  - Boss challenge mode renders the canvas with zero camera/overlay
    assistance.

### FR-8 — Premium Athlete Asset Pipeline

- **Goal.** The athlete looks like a basketball player.
- **Scope.**
  - Replace the placeholder GLB with a premium athlete (custom or
    licensed).
  - Author premium clips for the priority intents in §5.7.
  - Migrate the bind-pose delta authored in FR-3 to the new rig.
- **Files likely touched.**
  - `apps/web/public/athlete/*`
  - `apps/web/components/scenario3d/glbAthlete.ts`
  - Attribution + license docs.
- **Tests.**
  - Visual regression suite extended.
  - Bone-map audit re-runs against the new rig.
- **Risks.**
  - Cost (asset creation / licensing).
  - Schedule (custom rig is multi-week).
- **Success criteria.**
  - The 13-year-old quality bar in §2 passes.
  - Silhouette-readability test passes for the new rig.
