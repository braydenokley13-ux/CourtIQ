# Phase P — Film-Room Animation Architecture

> Architectural planning document. Scope: defining what animation IS and what it IS NOT in the CourtIQ 3D film-room loop, how scenario determinism is preserved, and how imported animation clips can be introduced safely.
>
> **Status:** draft.
> **Branch:** `claude/test-glb-local-auth-2XTCO`.
> **Predecessors:** Phase F (procedural figure), Phase J (premium athlete), Phase M (skinned preview), Phase O-ASSET / O-ANIM (GLB mannequin path).
> **Successor of:** Phase O-POLISH (in-flight readability fixes for the GLB path).
> **Goal:** ensure the next animation work — including any imported third-party clips — makes the *basketball read* easier to see, without compromising deterministic scenario timing, replay parity, or the freeze/best-read/wrong-read teaching loop.

---

## Table of Contents

1. What animation is responsible for in CourtIQ
2. What animation must NOT control
3. How scenario movement stays deterministic
4. How imported animation clips should be used safely
5. Minimal v1 animation vocabulary
6. Decoder mapping (BDW / ESC / SKR / AOR)
7. Freeze-frame teaching cues
8. Wrong-read consequence animation
9. Best-read replay highlighting
10. Rollout plan (P0 → P4)
11. First Implementation Packet After This Doc

---

## Section 1 — What animation is responsible for in CourtIQ

CourtIQ animation exists to make the **basketball read** legible. It is a body-language and emphasis layer on top of a scenario timeline that already encodes truth (positions, routes, decision moment, consequence). Animation never invents information that is not in scenario data; it only *exposes* the information that is.

Animation is responsible for:

| Responsibility | What that means in the film-room loop |
|---|---|
| **Body language** | Defender hips, head turn, hand position, weight on heels vs. toes. Offensive jab, rip, receive-ready posture, shot dip. |
| **Cue readability** | The frame the user freezes on must telegraph the cue. The defender's denied-vision posture must be obvious; the help defender's turn must be obvious. |
| **Teaching emphasis** | At freeze and during best-read replay, animation may exaggerate (slightly) the cue — clearer head turn, slightly wider stance, slower follow-through — so a middle-school player can see what to look at. |
| **Helping the player understand the read** | Pose communicates what the defender is *committed to* (denying, helping, recovering, contesting). Pose communicates what the offensive player is *prepared to do* (cut, catch-and-shoot, rip-through). |
| **Supporting the freeze/replay loop** | Animation must hold a usable freeze pose, replay deterministically, and re-pose into the best-read explanation without flicker or drift. |

### Acceptance criteria for Section 1

- [ ] Every decoder freeze frame in `BDW-01`, `ESC-01`, `SKR-01`, `AOR-01` has at least one body-language cue that is identifiable from a still image without text.
- [ ] An adult coach unfamiliar with CourtIQ can describe the cue from a single freeze screenshot in one sentence.
- [ ] No freeze frame relies solely on a label or arrow to communicate the cue.

---

## Section 2 — What animation must NOT control

The hard line: **animation is a visual layer, not a simulation layer.** A scenario's truth is its timeline of authored positions and the named decision moment. Animation may not move that truth.

### Do Not

| Animation must NOT | Why |
|---|---|
| Own the world route | Player x/z position is owned by the scenario timeline (`court_state` + scene timeline). If animation moves the player, replays diverge. |
| Change deterministic scenario timing | The decision moment, freeze tick, and consequence window are scenario-data-driven. Animation duration must adapt to scenario timing — never the reverse. |
| Drag players off their authored x/z path | Imported clips often contain root motion. Root motion must be stripped or locked before the clip can play in a CourtIQ scene. |
| Turn CourtIQ into a sports video game | No spin-cycle highlight animations, no signature moves, no broadcast flair. The mannequin's job is to be *readable*, not impressive. |
| Make the scene harder to read | If a more "realistic" idle introduces head-bob that obscures the defender's vision cue, the realistic idle is wrong for CourtIQ. |
| Author scenario meaning | Whether a defender is "denying" is encoded in scenario data. Animation reflects that intent — it does not invent it. |

### Acceptance criteria for Section 2

- [ ] No animation system has write access to `figure.position.x` or `figure.position.z` once the figure is parented into the scene. (Only the scenario timeline writes those.)
- [ ] All imported clips ship with a root-motion strip step in their loader, with a test that asserts the root bone's translation channel is zeroed.
- [ ] No animation clip plays for a duration not bounded by the scenario timeline's segment for that player.

---

## Section 3 — How scenario movement stays deterministic

CourtIQ's contract with the player is: **the same scenario, replayed, produces the same possession.** That is what makes the film-room loop trustworthy. Determinism is owned by scenario data, not by animation.

### Layers of authority (top wins)

1. **Scenario data** — `court_state` initial positions, scene timeline keyframes, decision moment, consequence branch. *Source of truth for x / z / t.*
2. **Camera mode** — FOLLOW / REPLAY / BROADCAST / AUTO. Affects what the user sees, never where the players are.
3. **Animation layer** — bone/body pose only. Reads the scenario clock; does not advance it.
4. **Indicator/overlay layer** — rings, labels, pulses. Reads scenario data; does not modify it.

### Determinism rules

- **One clock.** The scenario timeline drives a single deterministic `t` value. Animation mixers receive `dt` derived from that clock — they do not run on wall-clock time independently.
- **No physics.** No springs, no IK solvers, no collision-driven pose. If a wrist needs to track the ball, the scenario data places the ball; the pose follows from that.
- **Pure-function pose.** For a given `(scenario, t, animation_intent)`, pose is reproducible. Replays must produce identical bone transforms within a tight epsilon.
- **Idempotent freeze.** Freezing at tick `T` and resuming, vs. running through tick `T`, must produce the same on-screen pose at `T`.

### Acceptance criteria for Section 3

- [ ] A replay-determinism test exists that runs the same scenario twice and asserts identical bone-quaternion snapshots at the freeze tick.
- [ ] Disabling the GLB animation path (flag off) does not change scenario routes, decision timing, or consequence.
- [ ] Pause → resume at the same tick produces the same pose to within float epsilon.

## Section 4 — How imported animation clips should be used safely

The current GLB path uses bespoke quaternion-keyframe clips (`buildGlbIdleReadyClip`, `buildGlbCutSprintClip`, `buildGlbDefenseSlideClip`). They are stiff. Imported clips (Mixamo, Quaternius UAL2, custom-authored, or in-house Blender exports) can raise quality dramatically — but only if they are gated by the rules below.

### Rules for imported clips

| Rule | Detail |
|---|---|
| **Bones only.** | Imported clips may drive bone-local TRS only. They may not write to the figure root or any ancestor of the skeleton. |
| **Root motion stripped or locked.** | Translation channels on the root/hip bone must be zeroed (or replaced with a y-only channel for jump animations). A loader-level utility must enforce this — not a per-clip caller responsibility. |
| **Flag-gated entry.** | Every imported clip lands behind a feature flag (`USE_IMPORTED_CLIP_<INTENT>`) wired into the same pattern as `USE_GLB_ATHLETE_PREVIEW`. Default off. |
| **One intent first.** | The first imported clip is **CLOSEOUT** (drives AOR's freeze-frame cue). It is the highest-leverage single animation in the product because AOR is the most frequently triggered decoder and closeout posture is the hardest to author by hand. |
| **Tested behind a flag in `/dev/scene-preview`.** | No imported clip ships to a protected route (e.g. `/train`) until it has run clean in `/dev/scene-preview` across all four camera modes (FOLLOW, REPLAY, BROADCAST, AUTO) and in fullscreen. |
| **Rollback is one boolean.** | Reverting must be `flag = false`. If reverting requires reverting scenario data, route changes, or camera tuning, the integration was wrong. |
| **Bone-map adapter, not bone-name assumption.** | Imported clips author bones in the source rig's naming. A retarget map (extending `GLB_BONE_MAP`) translates intent-bones to the runtime skeleton. The clip file is never edited to "fit"; the adapter is. |
| **Memory bounded.** | Any imported clip is loaded once per asset bundle, cached, and shared across `cloneSkinned`d instances. Per-figure clip allocation is a regression. |

### Imported-clip integration checklist (per clip)

- [ ] Source license is CC0 / permissive and noted in `apps/web/public/athlete/ATTRIBUTION.md`.
- [ ] Root translation channels stripped via loader utility; assertion test exists.
- [ ] Bone-map entries added for any bone the clip drives that is not already mapped.
- [ ] Flag added (default off).
- [ ] `/dev/scene-preview` capture taken in all four camera modes, plus fullscreen.
- [ ] Replay-determinism test passes with flag on.
- [ ] Dispose-leak test passes with flag on (no per-figure clip clones leaked).
- [ ] Toggle-off restores byte-for-byte previous behavior.

### Acceptance criteria for Section 4

- [ ] One imported CLOSEOUT clip ships behind `USE_IMPORTED_CLOSEOUT_CLIP`, applied to a single dev-preview defender on `AOR-01`.
- [ ] Flag-off path is unchanged from current behavior.
- [ ] No production scenario uses imported clips until P2.

---

## Section 5 — Minimal v1 animation vocabulary

The vocabulary is deliberately small. Each intent corresponds to a *teachable basketball state*, not to a generic locomotion state. If an intent does not map to a decoder cue or consequence, it is not in v1.

| Intent | What it shows | When it plays | Notes |
|---|---|---|---|
| `idle_ready` | Athletic stance, knees soft, eyes up | Default for any offensive player not in a more specific state | Currently authored bespoke; the baseline |
| `receive_ready` | Hands up, palms toward the passer, weight on inside foot | Offensive player about to catch | Triggers the AOR cue moment |
| `jab_or_rip` | Short jab step or rip-through after the catch | Offensive player attacking the closeout | Plays only on AOR "attack" branch |
| `back_cut` | Shoulder turn, push off top foot, drop step toward rim | Offensive player on a BDW read | Bone-only; x/z still owned by scenario route |
| `empty_space_cut` | Sharper plant-and-go into open space | Offensive player on an ESC read | Same constraint; pose only, route owned by data |
| `defensive_deny` | Hand in passing lane, head turned away from the ball, hips on top side | Defender on the BDW victim | Hardest single cue to read — must be unmistakable in freeze |
| `defensive_help_turn` | Head/hips rotate toward ball, weight shifts off original assignment | Help defender on ESC and SKR cues | The "vision lost" moment is the cue |
| `closeout` | Short choppy steps, high hand, decelerating | Defender approaching a catch on AOR | The first imported-clip target (Section 4) |
| `slide_recover` | Wide low stance, lateral steps | Defender after closeout, mirroring drive | Used in AOR consequence branches |
| `pass_followthrough` | Arm extension toward target, weight transfer | Passer in SKR, also AOR's first pass | Subtle; mostly serves cue for "where did the ball go" |
| `shot_ready` | Dip, hands set, elbow under | Open shooter in AOR / SKR | Held into freeze when AOR read = shoot |
| `reset_dribble` (or `reset_hold`) | Live dribble retreat or held ball at hip | Offensive player in AOR "reset" branch | Communicates "no advantage, restart" |

### Vocabulary rules

- **Intents are teaching states, not locomotion states.** "Run forward" is not an intent; "back_cut" is.
- **Each intent has a default fallback.** If a specific clip is missing, the system falls back to `idle_ready` (offense) or a static defensive stance (defense). The scenario must not break.
- **Stance arg drives default selection.** The `stance: PlayerStance` arg already passed into `buildPlayerFigure` selects the baseline intent at figure-build time. Per-tick changes (catch → shoot, deny → help) come from the scenario timeline.

### Acceptance criteria for Section 5

- [ ] All 12 intents have an entry in a single `AnimationIntent` union type.
- [ ] Every intent has a fallback rule documented.
- [ ] No intent in v1 is "generic locomotion" — each maps to a cue or consequence.

---

## Section 6 — Decoder mapping (BDW / ESC / SKR / AOR)

This is the table the renderer reads when a scenario's decision moment fires. Each decoder names the *cue role* and the *action role*; animation maps each role to an intent.

### BDW — Backdoor Window

| Role | Intent | Freeze emphasis |
|---|---|---|
| Offensive player (cutter) | `back_cut` | Shoulder/hip turn behind the defender |
| Defender (denier) | `defensive_deny` | Head turned away from ball, hand in lane, hips on top side |
| Passer | `pass_followthrough` (on best read) | Arm to back-cut target |

**Key cue:** the defender is overplaying the passing lane and has lost vision of the cutter. **Freeze should make the defender's head/hips/position obvious** — middle-school player should see "his eyes are not on his man."

### ESC — Empty-Space Cut

| Role | Intent | Freeze emphasis |
|---|---|---|
| Offensive player (cutter) | `empty_space_cut` | Plant foot pointed into the gap |
| Help defender | `defensive_help_turn` | Hips/head rotated to ball, original man unattended |
| Receiver of the cut | `receive_ready` | Hands ready in the vacated zone |

**Key cue:** help defender has left a space open. **Freeze should highlight the vacated space** — overlay a soft floor highlight on the empty zone, and let the help defender's pose tell the rest.

### SKR — Skip the Rotation

| Role | Intent | Freeze emphasis |
|---|---|---|
| Passer | `pass_followthrough` or `receive_ready` (depending on cue moment) | Eyes/shoulders to skip target |
| Rotating defender | `defensive_help_turn` → `closeout` | Mid-rotation, off-balance |
| Open player (skip target) | `receive_ready` or `shot_ready` | Hands up, weight set |

**Key cue:** the defense over-rotated and one more pass is open. The freeze should show **two defenders pulled to one side**, leaving the skip target visibly alone.

### AOR — Advantage or Reset

| Role | Intent | Freeze emphasis |
|---|---|---|
| Receiver | `receive_ready` → branches to `shot_ready` / `jab_or_rip` / `reset_hold` | Pose at first touch communicates each branch |
| Defender (closing out) | `closeout` | Speed, angle, and cushion all visible |

**Key cue:** the closeout's quality (fast/short, slow/long, off-line) determines the read. **Freeze should help the player decide shoot, attack, or reset** — the defender's posture is the read.

### Mapping rules

- A scenario JSON declares a `decoder_tag` (already present in `scene-preview`'s `ScenarioJson`). The renderer uses it to select the decoder mapping above.
- Roles in the mapping correspond to player slot tags already present in scene data (e.g. `WING`, `CORNER`, `TOP`).
- A scenario may override an intent per tick via the scene timeline (e.g. for a multi-cue possession).

### Acceptance criteria for Section 6

- [ ] A `getDecoderAnimationMap(decoderTag, role)` lookup returns the v1 intent for every (decoder, role) pair listed above.
- [ ] Missing intents fall back to `idle_ready` / static defensive stance without error.
- [ ] BDW-01 freeze frame has `defensive_deny` on the denier and `back_cut` on the cutter.

## Section 7 — Freeze-frame teaching cues

The freeze frame is the single most important rendering moment in CourtIQ. Animation's job at freeze is to make the cue obvious without making the scene look cartoonish.

### Do

- **Slightly clearer body angles.** At freeze, the cue figure (e.g. the denying defender) may pose with a 5–10° exaggeration over baseline — enough to read at a glance, not enough to read as caricature.
- **Simple player spotlight.** A soft circular halo on the cue figure's floor ring (already supported via the user-halo indicator). No volumetric beams, no lens flares.
- **Clear defender orientation.** Head and hips of the cue defender are the most-read cue. Their rotation must be visually distinct from a generic stance.
- **Court-space highlight when needed.** ESC and SKR benefit from a translucent floor patch on the vacated zone. BDW and AOR generally do not.
- **1–3 overlays max.** Above 3 overlays, the read becomes a label-reading exercise, not a film-reading exercise.
- **Middle-school-friendly labels.** "Eyes off his man." "Help left him alone." "Closeout is short." Plain English. No "weak-side rotation timing window."

### Do Not

- Do not blur the rest of the scene. The other 9 players are part of the read.
- Do not zoom in on the cue figure. Camera framing belongs to the camera-mode system; freeze does not change camera intent.
- Do not animate the freeze pose. Freeze is a held pose, not a slow-motion loop. Subtle breathing is acceptable; head bob is not.
- Do not stack overlays. If the read needs four overlays, the scenario is too complex for v1.

### Freeze pose authoring

- The freeze pose is **not a separate clip.** It is the pose the active intent's clip is at when `t = freeze_tick`. This preserves determinism (same scenario clock → same pose).
- For exaggeration, the renderer may apply a per-bone additive rotation at freeze only, scaled by a `freezeEmphasis: 0..1` config. Emphasis returns to 0 when the freeze releases.

### Acceptance criteria for Section 7

- [ ] No freeze frame uses more than 3 overlays.
- [ ] The cue figure's pose is visually distinct from the same figure's `idle_ready` pose at the same tick.
- [ ] Freeze does not modify camera framing beyond what the active camera mode already produces.
- [ ] Releasing freeze returns all freeze-emphasis adjustments to 0 within one tick.

---

## Section 8 — Wrong-read consequence animation

When the user picks a wrong read, the consequence playback must visually answer the question *"why was that wrong?"* without a long text explanation. The animation should show the failure mode.

### Failure modes per decoder

| Decoder | Wrong-read intent on the offensive player | What it shows |
|---|---|---|
| BDW (wrong) | `idle_ready` held, then `receive_ready` toward the top | Player comes higher into pressure instead of cutting behind. Defender's deny posture wins; the pass never arrives. |
| ESC (wrong) | `idle_ready` (player stands still) OR `empty_space_cut` *into* a defender's space | Cutter goes into traffic, or freezes while the gap closes. |
| SKR (wrong) | `pass_followthrough` toward the loaded side, or `jab_or_rip` into help | Pass into traffic, or drive into the wall of help defenders. |
| AOR (wrong) | `shot_ready` against a recovered closeout, OR `jab_or_rip` into a balanced defender, OR `reset_hold` when advantage existed | Each branch shows the specific kind of wrong: contested shot, drive into a set defender, or advantage thrown away. |

### Authoring rules

- The wrong-read consequence is **scenario-authored**, not animation-authored. Scenario data tells the timeline "if user chose X, play branch B"; the animation layer reflects that branch.
- Wrong-read clips should resolve in **2–4 seconds** of consequence playback. Longer feels like punishment.
- The defender's response (deflection, recovery, contest) should be authored with the same intent vocabulary — `closeout`, `slide_recover`, `defensive_deny` — so the renderer does not need a separate "punishment" clip set.
- After consequence playback, the loop transitions into best-read replay (Section 9). The wrong-read animation should *land* on a final pose that motivates the cut to replay (e.g. defender holding the deflected ball; offensive player stuck above the FT line).

### Acceptance criteria for Section 8

- [ ] Each decoder has at least one authored wrong-read consequence on its v1 scenario.
- [ ] A user who answers wrong can see *why* in under 4 seconds without reading a label.
- [ ] No wrong-read consequence requires a clip outside the v1 vocabulary.

---

## Section 9 — Best-read replay highlighting

The replay is the moment CourtIQ teaches. It should feel like a coach pausing film and pointing — *"Look at his hips. Look at the defender's head. Look at the empty space."* — not like a sports highlight reel.

### Replay structure (three beats)

1. **Show the cue.** Camera holds on the cue figure. The cue intent (e.g. `defensive_deny`) plays in place. Optional overlay: defender vision cone or head/hips arrow.
2. **Show the correct action.** The offensive player's correct intent plays (`back_cut`, `empty_space_cut`, etc.). Optional overlay: pass lane, cut path.
3. **Show the advantage created.** The receiver poses in `receive_ready` / `shot_ready`. Optional overlay: open space ring, closeout cushion.

### Overlay vocabulary

| Overlay | Used for |
|---|---|
| Defender head/hips marker | BDW cue, ESC cue |
| Open space floor patch | ESC, SKR |
| Pass lane line | BDW best-read, SKR best-read |
| Closeout cushion ring | AOR best-read |
| "Look here" pulse | Any decoder, single-use, attached to the cue role |

### Replay rules

- Replay is **deterministic.** It uses the same scenario clock; only camera and overlays differ from the original possession.
- Replay is **not slowed-down by default.** Mid-school users handle 1× fine. A 0.5× toggle exists in the playback controls; the system does not force slow-mo.
- Replay overlays appear **on cue, not on a fixed schedule.** Cue overlay enters at the cue tick; action overlay enters at the action tick; advantage overlay enters at the advantage tick. (These ticks already exist in scenario data.)
- No replay loops more than twice without user action. The film-room metaphor breaks if the replay auto-loops infinitely.

### Acceptance criteria for Section 9

- [ ] Best-read replay always shows cue → action → advantage, in that order, on every v1 decoder scenario.
- [ ] Overlays are tied to scenario ticks, not to wall-clock offsets.
- [ ] The replay never feels like a highlight reel — no replay-specific clip flair beyond the v1 vocabulary.

---

## Section 10 — Rollout plan (P0 → P4)

Phased rollout. Each phase has explicit acceptance criteria; do not enter the next phase until the current one passes them.

### P0 — Deterministic base (current)

**Goal:** lock the determinism baseline before introducing any imported animation.

- Existing bespoke clips (`buildGlbIdleReadyClip` etc.) remain as the default.
- Scenario movement owns x/z routes. Animation does not write to figure root TRS.
- Camera and replay timing remain deterministic across FOLLOW / REPLAY / BROADCAST / AUTO.

**Acceptance criteria:**
- [ ] Replay-determinism test exists and passes with `USE_GLB_ATHLETE_PREVIEW=true` and `=false`.
- [ ] Fullscreen rendering bug observed in current dev preview is fixed (carry-over from O-POLISH-1).
- [ ] Bespoke clip mixer is verified to advance per frame (audit per O-POLISH-1, OP1.2).

### P1 — One imported animation spike

**Goal:** prove imported clips can be integrated safely on a single intent.

- Target intent: `closeout` (drives AOR cue clarity).
- Apply to one dev-preview defender on `AOR-01` only.
- Behind `USE_IMPORTED_CLOSEOUT_CLIP` flag (default off).
- Loader strips root motion; bone-map adapter handles bone naming.

**Acceptance criteria:**
- [ ] Closeout clip plays without root drift in `/dev/scene-preview?scenario=AOR-01`.
- [ ] No twisted limbs, no flicker, no NaN bone transforms.
- [ ] Replay determinism test passes with flag on.
- [ ] Toggle off restores byte-identical previous behavior.
- [ ] All four camera modes verified, plus fullscreen.

### P2 — Decoder-specific animation states

**Goal:** wire each decoder's role table (Section 6) into the renderer's per-tick intent selector.

- Implement `getDecoderAnimationMap(decoderTag, role)`.
- Map BDW, ESC, SKR, AOR moments to the v1 intent vocabulary.
- Use fallbacks (`idle_ready` / static defensive stance) when a specific clip is missing.
- Wrong-read consequence intents authored per Section 8.

**Acceptance criteria:**
- [ ] BDW-01, ESC-01, SKR-01, AOR-01 each play their decoder-specific intents at the right ticks.
- [ ] Missing intent never crashes the scene; falls back gracefully.
- [ ] Wrong-read branch animations land cleanly into best-read replay.

### P3 — Overlay/camera synchronization

**Goal:** make the freeze and replay feel like a coach's film session.

- Freeze camera favors the cue (per camera-mode rules; not a freeze-only camera).
- Replay camera favors the correct read path.
- Overlays appear at the right teaching moment per Section 9.

**Acceptance criteria:**
- [ ] Cue, action, and advantage overlays appear at scenario-authored ticks, not wall-clock offsets.
- [ ] No replay frame has more than 3 overlays.
- [ ] Camera does not jump between freeze and replay; transitions are smooth.

### P4 — Performance and QA

**Goal:** prove the full path is shippable.

- Test GLB on/off.
- Test normal/fullscreen.
- Test desktop/mobile.
- Test FOLLOW / REPLAY / BROADCAST / AUTO.
- Confirm dispose/memory behavior with all imported clips loaded.

**Acceptance criteria:**
- [ ] No regression in dispose-leak test with all P1–P3 changes enabled.
- [ ] Mobile frame rate within Phase F budget.
- [ ] No memory growth across 50 scenario plays.
- [ ] All four decoder v1 scenarios pass end-to-end QA on desktop and mobile.

---

## Section 11 — First Implementation Packet After This Doc

The doc itself is non-implementing. The first concrete implementation packet that should follow is intentionally narrow — it locks the determinism baseline (P0) before any imported-clip work begins.

### Packet name: **P0-LOCK** — Determinism baseline + GLB readability fixes

This packet is a prerequisite for P1 (imported-clip spike). It does not introduce new animation content. It fixes the issues observed in the current GLB dev-preview screenshots and establishes the test scaffolding the rest of the rollout depends on.

### Scope (must)

1. **Fullscreen regression fix.** Resolve the bottom-half-black canvas observed when `USE_GLB_ATHLETE_PREVIEW=true` is rendered in fullscreen on `/dev/scene-preview`. Suspect interaction between the GLB figure's `GLB_M_TO_FT_SCALE` group and the auto-fit camera bounds; verify the `Scenario3DCanvas.tsx:384–429` resize hook fires after GLB cache load.
2. **Bone-map audit.** `GLB_BONE_MAP.head: 'Head'` is the only PascalCase entry in an otherwise lowercase Unreal/Quaternius skeleton. Log actual skeleton bone names from `cache.skinnedMesh.skeleton.bones` once on load and reconcile the map. Confirm that `idle_ready`, `cut_sprint`, and `defense_slide` clips actually move bones at runtime.
3. **Mixer-tick assertion.** Add a one-shot assertion in `updateGlbAthletePose` that `mixer.time > 0` after the second tick. Failing the assertion is a P0 bug.
4. **Replay-determinism test.** Add a test that runs a scenario twice and snapshots bone quaternions at the freeze tick; assert equality within float epsilon. This is the gate every later phase must pass.
5. **Foot-to-floor offset.** One-time y-offset measured from the rest-pose foot bone bounding box, applied to the figure root group. Eliminates the floating-feet artifact visible in current screenshots.

### Scope (must not)

- No imported clips.
- No new intents beyond the existing `idle_ready` / `cut_sprint` / `defense_slide`.
- No scenario-data changes.
- No camera-mode changes.
- No material/jersey work — that belongs to a separate O-POLISH-2 packet.

### Acceptance criteria

- [ ] `/dev/scene-preview?scenario=BDW-01` renders correctly in fullscreen with GLB on.
- [ ] All three bespoke clips visibly move bones at runtime (verified by ad-hoc visual check + automated mixer-tick assertion).
- [ ] Replay-determinism test passes with GLB on and GLB off.
- [ ] Feet sit on the floor ring, not above it.
- [ ] Toggling `USE_GLB_ATHLETE_PREVIEW=false` restores byte-identical pre-Phase-O behavior (carry-over from existing Phase O-ASSET contract).

### Why this packet first

Two reasons. First, every later phase (P1 imported clips, P2 decoder mapping, P3 overlay/camera sync) assumes the determinism baseline holds; without the replay-determinism test as a gate, every later change risks silently breaking the film-room loop. Second, the bone-map and fullscreen issues are the most visible regressions in the current dev preview — fixing them validates that the existing path actually works before we add imported assets on top of it.

### Estimated size

Small. One sitting if the bone-map fix is the right diagnosis; two sittings if the fullscreen issue requires a deeper layout audit.

### Follow-on packets (not part of P0-LOCK)

- **O-POLISH-2** — material/jersey/numbers (separate from animation; deferred).
- **P1 spike** — imported `closeout` clip on AOR-01 dev preview (depends on P0-LOCK passing).
- **P2** — decoder mapping and per-tick intent selector. **(LANDED — see § P2 below.)**

---

## P2 — Typed Animation Intent Layer (LANDED)

**Status:** Implemented. Flag-gating unchanged; AOR-01 still NEEDS-COACH-REVIEW; no production routes touched.

### What this packet adds

A typed semantic layer that maps **scenario meaning → AnimationIntent → GLB clip**. The intent is the stable handle; clip availability changes as assets land, but the intent vocabulary does not. Lives in `apps/web/lib/scenario3d/animationIntent.ts` with no THREE.js dependency, so it's safe to import from both renderers and seed-validation tooling.

### V1 intent vocabulary (12 intents)

| Intent | Film-room cue |
|---|---|
| `IDLE_READY` | Stationary but alert — default rest |
| `RECEIVE_READY` | Catch position, weight loaded |
| `JAB_OR_RIP` | Quick footwork — jab / rip-through |
| `BACK_CUT` | Read denial, accelerate behind defender |
| `EMPTY_SPACE_CUT` | Fill vacated paint |
| `DEFENSIVE_DENY` | Press passing lane, active hands |
| `DEFENSIVE_HELP_TURN` | Help defender pivots/turns to recover |
| `CLOSEOUT` | Sprint at shooter to contest |
| `SLIDE_RECOVER` | Lateral slide after closeout commitment |
| `PASS_FOLLOWTHROUGH` | Passer's follow-through |
| `SHOT_READY` | Open catch position, ready to shoot |
| `RESET_HOLD` | Hold ball, no advantage — reset action |

### Decoder mapping table

| Decoder | Role | Intent |
|---|---|---|
| `ADVANTAGE_OR_RESET` | `receiver` | `RECEIVE_READY` (default) / `SHOT_READY` (branch=shot) / `JAB_OR_RIP` (branch=jab_or_rip) / `RESET_HOLD` (branch=reset) |
| `ADVANTAGE_OR_RESET` | `closeout_defender` | `CLOSEOUT` |
| `ADVANTAGE_OR_RESET` | `helper_defender` | `SLIDE_RECOVER` |
| `BACKDOOR_WINDOW` | `cutter` | `BACK_CUT` |
| `BACKDOOR_WINDOW` | `deny_defender` | `DEFENSIVE_DENY` |
| `BACKDOOR_WINDOW` | `passer` | `PASS_FOLLOWTHROUGH` |
| `EMPTY_SPACE_CUT` | `cutter` | `EMPTY_SPACE_CUT` |
| `EMPTY_SPACE_CUT` | `receiver` | `RECEIVE_READY` |
| `EMPTY_SPACE_CUT` | `helper_defender` | `DEFENSIVE_HELP_TURN` |
| `SKIP_THE_ROTATION` | `passer` | `PASS_FOLLOWTHROUGH` |
| `SKIP_THE_ROTATION` | `open_player` | `SHOT_READY` |
| `SKIP_THE_ROTATION` | `helper_defender` | `DEFENSIVE_HELP_TURN` |
| `SKIP_THE_ROTATION` | `closeout_defender` | `CLOSEOUT` |

Off-axis combinations (decoder × role pairs not central to that decoder) all return safe defaults — the layer never throws, never returns `undefined`. Exhaustive matrix tested in `animationIntent.test.ts`.

### Movement-kind fallback

When decoder/role context is unavailable, `getMovementKindIntent(kind, team)` maps the schema's `SceneMovementKind` to an intent:

| Movement kind | Intent (offense) | Intent (defense) |
|---|---|---|
| `closeout` | `CLOSEOUT` | `CLOSEOUT` |
| `back_cut` | `BACK_CUT` | `BACK_CUT` |
| `cut`, `baseline_sneak` | `EMPTY_SPACE_CUT` | `DEFENSIVE_HELP_TURN` |
| `drive` | `EMPTY_SPACE_CUT` | `DEFENSIVE_HELP_TURN` |
| `pass`, `skip_pass` | `PASS_FOLLOWTHROUGH` | `PASS_FOLLOWTHROUGH` |
| `rip`, `jab` | `JAB_OR_RIP` | `JAB_OR_RIP` |
| `rotation` | `IDLE_READY` | `DEFENSIVE_HELP_TURN` |
| `stop_ball` | `DEFENSIVE_DENY` | `DEFENSIVE_DENY` |
| `lift`, `drift` | `RECEIVE_READY` | `RECEIVE_READY` |

### Intent → clip resolution rules

`resolveGlbClipForIntent(intent, flags)` picks the best available GLB clip:

- **`CLOSEOUT`** → `closeout` clip when `flags.importedCloseoutActive === true`; otherwise `defense_slide`.
- **Defensive intents** (`DEFENSIVE_DENY`, `DEFENSIVE_HELP_TURN`, `SLIDE_RECOVER`) → `defense_slide`.
- **Offensive moving intents** (`BACK_CUT`, `EMPTY_SPACE_CUT`, `JAB_OR_RIP`, `RECEIVE_READY`, `SHOT_READY`, `PASS_FOLLOWTHROUGH`, `RESET_HOLD`) → `cut_sprint` until dedicated clips land.
- **`IDLE_READY`** → `idle_ready`.

This is the only place that encodes clip availability. New imported clips land by adding a flag to `IntentClipFlags` and a branch in `resolveGlbClipForIntent` — the call sites in `imperativeScene.ts` do not change.

### What is wired vs. what is still placeholder

**Wired:**
- `pickGlbClipForState` in `imperativeScene.ts` routes its CLOSEOUT path through `resolveGlbClipForIntent`. The imported-closeout flag gate is now owned by `animationIntent.ts` rather than encoded inline.
- Dev-only `_logIntentSelection` breadcrumb prints `{ team, kind, isMoving, intent, clip }` to the browser console once per unique tuple per session, dedupe-guarded so the console stays readable. Production builds short-circuit on `NODE_ENV === 'production'`.
- AOR-01: defender's `closeout` movement → `CLOSEOUT` intent → `closeout` clip (when flag on) or `defense_slide` (default).

**Still placeholder (deliberately deferred):**
- ~~Decoder + role context is **not** plumbed into `pickGlbClipForState` yet.~~ **Landed in P2.1 — see § P2.1 below.**
- Most intents (`SHOT_READY`, `RESET_HOLD`, `JAB_OR_RIP`, `RECEIVE_READY`, etc.) share the same fallback clips. Dedicated clips land via P3+ as imported assets become available.
- BDW/ESC/SKR scenarios still render with the existing decoder path; their visual overhaul is out of scope here.

### Acceptance lock (P2)

- [x] Typed `AnimationIntent` exists with all 12 v1 intents.
- [x] Mappings exist for AOR / BDW / ESC / SKR × all roles.
- [x] AOR-01 defender closeout resolves to `CLOSEOUT`.
- [x] `CLOSEOUT` selects imported clip only when `isImportedCloseoutClipActive()` returns `true`.
- [x] Missing/unknown role/intent paths fall back safely (never throw, always return a defined value).
- [x] Determinism tests remain green (`glbAthleteEndToEndDeterminism`, `replayDeterminism`).
- [x] `USE_GLB_ATHLETE_PREVIEW` and `USE_IMPORTED_CLOSEOUT_CLIP` remain `false` by default.
- [x] No production routes promoted; AOR-01 remains in NEEDS-COACH-REVIEW.

---

## P2.1 — Decoder + Role Context Plumbed Through Renderer (LANDED)

**Status:** Implemented. No flag changes; AOR-01 still NEEDS-COACH-REVIEW; no production route rollout.

### What this packet adds

Plumbs `scenario.decoder_tag` and per-player role into the GLB clip selector so different decoders produce different intents for the same movement kind. Before P2.1: a `'cut'` movement always picked `cut_sprint` regardless of context. After P2.1: a `'cut'` in BDW context resolves through `BACK_CUT`, in ESC context through `EMPTY_SPACE_CUT`, etc. — the clip output is still `cut_sprint` for both today (until dedicated clips land), but the intent layer now sees the correct semantic value, which is the prerequisite for any future per-decoder visual differentiation.

### Files changed

| File | Change |
|---|---|
| `apps/web/lib/scenario3d/scene.ts` | `Scene3D.decoderTag?: DecoderTag` (in-memory only); `_coerceDecoderTag` narrows scenario `decoder_tag` to the closed union; `buildScene` propagates onto authored / preset / synth output. Zod scene schema unchanged. |
| `apps/web/lib/scenario3d/animationIntent.ts` | New `deriveDecoderRole(ctx)` helper — best-effort mapping from scenario role strings (`'wing_defender_helping'`, `'denying_wing_defender'`, `'wing_shooter'`, …) to the closed `DecoderRole` vocabulary. Movement kind dominates; role-string substring matching second; `hasBall`/`isUser` tie-breakers last. Returns `undefined` when context is too thin. |
| `apps/web/components/scenario3d/imperativeScene.ts` | `pickGlbClipForState` upgraded to options-object signature `{ team, kind, isMoving, decoderTag?, role? }`. When both `decoderTag` and `role` are present, intent is selected via `getDecoderAnimationIntent`; otherwise the legacy movement-kind dispatch runs byte-for-byte. `applyGlbAnimation` reads `scene.decoderTag` once per tick and derives each player's role inline. Debug breadcrumb expanded to `{ team, kind, isMoving, decoderTag, role, intent, clip }`. |

### Updated function signature

```ts
pickGlbClipForState({
  team: SceneTeam,
  kind: SceneMovementKind | undefined,
  isMoving: boolean,
  decoderTag?: DecoderTag,
  role?: DecoderRole,
}): GlbAthleteAnimationName
```

### Example mappings

| Decoder | Role | Movement | Result |
|---|---|---|---|
| AOR | closeout_defender | closeout (moving) | `CLOSEOUT` → `closeout` (flag on) / `defense_slide` (off) |
| AOR | helper_defender | rotation (moving) | `SLIDE_RECOVER` → `defense_slide` |
| AOR | receiver | lift (moving) | `RECEIVE_READY` → `cut_sprint` |
| BDW | cutter | cut (moving) | `BACK_CUT` → `cut_sprint` |
| BDW | deny_defender | (moving) | `DEFENSIVE_DENY` → `defense_slide` |
| BDW | passer | pass (moving) | `PASS_FOLLOWTHROUGH` → `cut_sprint` |
| ESC | cutter | cut (moving) | `EMPTY_SPACE_CUT` → `cut_sprint` |
| ESC | helper_defender | (moving) | `DEFENSIVE_HELP_TURN` → `defense_slide` |
| SKR | open_player | lift (moving) | `SHOT_READY` → `cut_sprint` |
| SKR | helper_defender | rotation (moving) | `DEFENSIVE_HELP_TURN` → `defense_slide` |

### Tests added

- `animationIntent.test.ts` — 16 new tests for `deriveDecoderRole` (105 total in file).
- `pickGlbClip.test.ts` — 20 new integration tests covering AOR/BDW/ESC/SKR × roles, fallback when role missing, stationary semantics, and determinism.

### Acceptance lock (P2.1)

- [x] Renderer uses decoder + role when both available.
- [x] Different decoders produce different animation intents (BDW cutter → BACK_CUT vs. ESC cutter → EMPTY_SPACE_CUT).
- [x] AOR-01 closeout still resolves to `CLOSEOUT` and gates on imported flag.
- [x] Determinism tests remain green (`glbAthleteEndToEndDeterminism`, `replayDeterminism`, `closeoutAssetIntegration`).
- [x] Fallback path identical to pre-P2.1 when `decoderTag` or `role` is missing.
- [x] Flags remain `false` by default.

---

## P2.2 — Imported BACK_CUT clip behind a flag (LANDED)

**Status:** Implemented. Asset bundled, all flags still default `false`, BDW-01 visual QA still pending (`NEEDS-COACH-REVIEW`), no production route rollout.

### Goal

P2.1 threaded `decoder + role` into the GLB clip selector so the BDW cutter resolves to the `BACK_CUT` intent. Visually, however, that intent still mapped to the bespoke `cut_sprint` clip — the same body language an `EMPTY_SPACE_CUT` cutter rendered. P2.2 adds **one** new imported clip behind a default-off flag so the BDW cutter is *visually* differentiable from generic offensive locomotion.

### Asset chosen

| | |
|---|---|
| **File** | `apps/web/public/athlete/clips/back_cut.glb` |
| **Source** | Quaternius Universal Animation Library 2 — Standard, `Unreal-Godot/UAL2_Standard.glb` (animation `NinjaJump_Start`) |
| **Why this clip** | UAL2 ships no basketball-specific clips. Of the 43 animations in the pack, `NinjaJump_Start` is the closest sub-1.0 s explosive change-of-direction read — semantically maps to "offensive cutter reads denial and accelerates behind the defender" (Phase P §5 Vocabulary, §6 BDW mapping). Body language differs visibly from `cut_sprint` (the bespoke even-tempo run cycle) and from `closeout` (`Shield_Dash_RM`'s shielded forward approach). |
| **License** | CC0 1.0 Universal — Public Domain Dedication. Verbatim license text: `apps/web/public/athlete/LICENSE.txt` (shared with `mannequin.glb` and `closeout.glb`). |
| **Provenance** | `apps/web/public/athlete/ATTRIBUTION.md` → "Back cut (`clips/back_cut.glb`)" |
| **Size** | ~57 KB (vs. 8.06 MB for the full `UAL2_Standard.glb`). Same 23-bone subset as `closeout.glb`. |
| **Rig** | Quaternius UAL2 (Unreal/Godot rig), same as `mannequin.glb` and `closeout.glb`. No name adapter needed. |
| **Root motion** | YES in source. The loader strip at `DEFAULT_ROOT_MOTION_BONE_NAMES` (already includes `root` AND `pelvis`) removes it. The scenario timeline retains sole ownership of (x, z). |

### Feature flag

```ts
// apps/web/components/scenario3d/imperativeScene.ts
export const USE_IMPORTED_BACK_CUT_CLIP = false
export const IMPORTED_BACK_CUT_DEV_OVERRIDE_KEY =
  '__COURTIQ_IMPORTED_BACK_CUT_DEV_OVERRIDE__'
export function isImportedBackCutClipActive(): boolean { /* … */ }
```

Layered identically to the closeout flag (P1.7):

- Defaults to `false` at module scope.
- Helper returns `true` when the const is `true` OR the dev-only window-global override key is set in a non-production build.
- `NODE_ENV === 'production'` short-circuits the override; production traffic is byte-identical to pre-P2.2.

Dev override URL: `?backcut=1` on `/dev/scene-preview`. The dev-preview client wires `IMPORTED_BACK_CUT_DEV_OVERRIDE_KEY` and `preloadImportedBackCutClip()` before the canvas mounts, layered on top of `?glb=1` (the back-cut path only runs inside the GLB athlete builder).

### Resolver behaviour

```ts
// apps/web/lib/scenario3d/animationIntent.ts
export interface IntentClipFlags {
  importedCloseoutActive: boolean
  importedBackCutActive: boolean
}

resolveGlbClipForIntent('BACK_CUT', { …, importedBackCutActive: true })
  // → 'back_cut'

resolveGlbClipForIntent('BACK_CUT', { …, importedBackCutActive: false })
  // → 'cut_sprint'    (byte-identical to pre-P2.2)
```

The flag does not leak into other offensive intents: `EMPTY_SPACE_CUT`, `JAB_OR_RIP`, `RECEIVE_READY`, `SHOT_READY`, `PASS_FOLLOWTHROUGH`, and `RESET_HOLD` all continue to fall through to `cut_sprint` regardless of `importedBackCutActive`. Only `BACK_CUT` is gated.

### Files changed

| File | Change |
|---|---|
| `apps/web/public/athlete/clips/back_cut.glb` | New — 57 KB extracted GLB. |
| `apps/web/public/athlete/ATTRIBUTION.md` | Added "Back cut" provenance entry. |
| `apps/web/public/athlete/clips/README.md` | Added "Back cut (`back_cut.glb`)" section + P2.2 status checklist. |
| `apps/web/components/scenario3d/imperativeScene.ts` | New `USE_IMPORTED_BACK_CUT_CLIP`, `IMPORTED_BACK_CUT_DEV_OVERRIDE_KEY`, and `isImportedBackCutClipActive()`. `pickGlbClipForState` populates `importedBackCutActive` in `IntentClipFlags`. `buildGlbAthleteFigure` threads `attachImportedBackCutClip` through the GLB builder. |
| `apps/web/components/scenario3d/glbAthlete.ts` | New `GLB_IMPORTED_BACK_CUT_CLIP_URL`, `attachImportedBackCutClip` build option, `_getCachedImportedBackCutClipOrNull`, `_kickOffImportedBackCutClipLoad`, and the public `preloadImportedBackCutClip`. `GlbAthleteAnimationName` grows `'back_cut'`. Cold cache aliases the `back_cut` action slot to `cut_sprint` so the resolver-chosen action name is always present on the handle. |
| `apps/web/lib/scenario3d/animationIntent.ts` | `IntentClipFlags` grows `importedBackCutActive`; `GlbClipName` grows `'back_cut'`; `resolveGlbClipForIntent` switches `BACK_CUT` through the flag. |
| `apps/web/app/dev/scene-preview/page.tsx` + `ScenePreviewClient.tsx` | New `?backcut=1` query param wires the dev override and the preload promise so the canvas mounts with the back-cut clip already cached. |

### Tests added

- `animationIntent.test.ts` — new `BACK_CUT intent` block (flag on/off, no-leak across intents/closeout, BDW cutter end-to-end chain).
- `runtimeFlagOverride.test.ts` — locks `USE_IMPORTED_BACK_CUT_CLIP === false`, default helper behaviour, dev-override flip, prod short-circuit, plus `preloadImportedBackCutClip` cache-hit + Promise contracts.
- `backCutAssetIntegration.test.ts` — new file mirroring `closeoutAssetIntegration.test.ts`. Locks: bundled file parses to one clip named `back_cut`; carries pre-strip `<root>.position` + `<pelvis>.position`; `stripRootMotionTracks` removes those tracks while leaving rotation tracks intact; binding the stripped clip to a tiny rig and ticking the mixer past the duration leaves bound `root` + `pelvis` bones at their bind-pose translation (route invariance); stripping is deterministic; the stripped clip drives the Quaternius `pelvis` quaternion (catches a silent rename regression).
- Existing `pickGlbClip.test.ts` BDW cutter test still passes — flag default `false` keeps BDW cutter → `cut_sprint`.
- Existing `closeoutAssetIntegration.test.ts`, `glbAthleteEndToEndDeterminism.test.ts`, `replayDeterminism.test.ts` are unaffected (BACK_CUT path is independent of the closeout path).

### Manual QA target

`/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1`

Checklist (matches `apps/web/public/athlete/clips/README.md` §"Back cut" status):

- [ ] BDW-01 loads.
- [ ] Cutter visually performs a back-cut style burst (different body language from the flag-off `cut_sprint`).
- [ ] Defender deny posture still visible.
- [ ] Imported back-cut does not move the cutter off the authored BDW route (loader strip is doing its job).
- [ ] Feet/legs are not broken at broadcast camera distance.
- [ ] FOLLOW / REPLAY / BROADCAST / AUTO still work.
- [ ] Fullscreen still works.
- [ ] `?backcut=0` (default) returns to byte-identical pre-P2.2 visual behaviour.

### Visual status

**`NEEDS-COACH-REVIEW`** — same status as the closeout under P1.6. The asset, flag, resolver, loader strip, and route-invariance contracts are all unit-tested and green; visual acceptance against a real broadcast-camera capture is the next gate. The flag stays `false` by default so production traffic is unaffected.

### Acceptance lock (P2.2)

- [x] `back_cut.glb` exists on disk under `apps/web/public/athlete/clips/`.
- [x] Attribution / license documented in `ATTRIBUTION.md` and `clips/README.md` (CC0, Quaternius UAL2 `NinjaJump_Start`).
- [x] `USE_IMPORTED_BACK_CUT_CLIP` defaults to `false`.
- [x] `BACK_CUT` intent resolves to the imported clip when the flag is active and to `cut_sprint` when off.
- [x] Flag-off behaviour is byte-identical to pre-P2.2 (BDW cutter → `cut_sprint`).
- [x] Loader-level root-motion strip is enforced; route invariance is locked by `backCutAssetIntegration.test.ts`.
- [x] Determinism gates remain green (no test removed; one new file added).
- [x] BDW cutter path is ready for visual QA at `/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1`.

---

## P2.3 — Back-cut visual readability shim (LANDED)

**Status:** Implemented behind the existing default-off `?glb=1&backcut=1` dev path. Production and flag-off behaviour remain unchanged.

### Goal

P2.2 proved the imported `back_cut.glb` could be loaded safely, but the raw clip did not clearly teach the BDW read. It looked like generic asset motion: arms could read wide/T-pose-like, the lower body felt jump-like, and the cutter did not plainly communicate "my defender denied me, so I cut behind."

P2.3 keeps the same flag and asset path, but inserts a readable CourtIQ-authored shim before the clip reaches the GLB mixer.

### Visual behaviour

When `?backcut=1` is active:

- The cutter checks the denial with head/shoulder direction.
- The hips and torso load, turn, then burst into the authored route.
- Arms stay compact and pump naturally instead of spreading wide.
- Lower-body tracks are bind-relative and conservative to avoid inversion/folding.
- No root, pelvis, position, or scale track controls the route.

The visual priority is teaching clarity, not asset fidelity.

### Architecture lock

- Scenario data still owns x/z/t movement.
- `BACK_CUT` still resolves to `cut_sprint` when the back-cut flag is off.
- The imported back-cut flag remains default `false`.
- `EMPTY_SPACE_CUT`, `JAB_OR_RIP`, `RECEIVE_READY`, `SHOT_READY`, `PASS_FOLLOWTHROUGH`, `RESET_HOLD`, and `CLOSEOUT` are unaffected by the back-cut shim.
- No new external assets, physics, randomness, or root-motion route control were added.

### Files changed

| File | Change |
|---|---|
| `apps/web/components/scenario3d/glbAthlete.ts` | Added `buildReadableBackCutClip`, `stripReadableBackCutSourceTracks`, and a cached readable back-cut action path. The raw imported clip remains loader-stripped, then the shim replaces unsafe/core posture tracks with deterministic pose-only teaching tracks. |
| `apps/web/app/dev/scene-preview/ScenePreviewClient.tsx` | Uses `replayMode="answer"` when `?backcut=1` is active so the required QA URL exercises BDW's authored back-cut answer demo rather than stopping at the denial-only intro freeze. |
| `apps/web/components/scenario3d/backCutAssetIntegration.test.ts` | Added readable-shim tests for pose-only tracks, no root/pelvis translation leakage, deterministic stripping, and route invariance. |
| `apps/web/components/scenario3d/glbAthlete.test.ts` | Added GLB builder coverage proving the `back_cut` action attaches the readable clip rather than raw imported posture. |
| `apps/web/components/scenario3d/pickGlbClip.test.ts` | Added flag-on/flag-off BDW cutter resolver coverage and determinism across toggles. |
| `apps/web/lib/scenario3d/animationIntent.test.ts` | Expanded no-leak coverage for all non-BACK_CUT offensive intents. |

### Manual QA target

`/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1`

Check FOLLOW, REPLAY, BROADCAST, and AUTO. The beginner-level read should be: "he is denying, so I cut backdoor." Arms should stay compact, legs should not fold, and the cutter should stay on the authored scenario route.

---

## P2.4 — Defender denial + idle-ready posture readability (LANDED)

**Status:** Implemented in the GLB preview pose layer. No movement ownership changed.

### Goal

P2.3 made the back-cut action read more clearly, but BDW-01 still needed the cue before the cut to look like basketball teaching rather than mannequin movement. The defender should plainly show "I am denying the passing lane," and non-active players should hold a compact ready stance instead of broad asset-rest arms.

### Visual behaviour

For `DEFENSIVE_DENY`:

- A dedicated `defensive_deny` clip angles hips and torso into the passing lane.
- One arm is authored into the lane while the off arm stays bent near the body.
- Head/chest orientation suggests the defender is checking both ball and cutter.
- Knees stay slightly bent in a conservative athletic base.
- Arm and leg tracks are bind-relative to the Quaternius rig so the pose does not snap toward a mannequin/T-pose rest shape.
- The clip contains pose-only quaternion tracks; no position or scale tracks can move the route.

For `idle_ready`:

- Upper arms and forearms are pulled closer to the body.
- Knees/shins are softened into a mild ready stance.
- The pose stays subtle and deterministic, with no randomness or route motion.

### Architecture lock

- Scenario data still owns player position and timing.
- `BACK_CUT` flag-off behaviour still resolves to `cut_sprint`.
- `BACK_CUT` flag-on behaviour still uses the P2.3 readable back-cut shim.
- `CLOSEOUT`, `EMPTY_SPACE_CUT`, `JAB_OR_RIP`, `RECEIVE_READY`, `SHOT_READY`, `PASS_FOLLOWTHROUGH`, and `RESET_HOLD` keep their existing resolver paths.
- Stationary BDW deny defenders keep `defensive_deny` so the freeze/read moment teaches the denial cue.
- No new external assets, physics, randomness, root motion, or animation-driven route control were added.

### Files changed

| File | Change |
|---|---|
| `apps/web/components/scenario3d/glbAthlete.ts` | Added `buildGlbDefensiveDenyClip`; tightened `buildGlbIdleReadyClip`; attached `defensive_deny` to GLB mixer handles and test clip factories. |
| `apps/web/lib/scenario3d/animationIntent.ts` | Added `defensive_deny` to `GlbClipName`; routes `DEFENSIVE_DENY` to the dedicated readable posture. |
| `apps/web/components/scenario3d/imperativeScene.ts` | Keeps stationary `DEFENSIVE_DENY` on the readable posture so the BDW freeze cue stays visible. |
| Tests | Updated resolver, pick-clip, replay determinism, GLB posture, and end-to-end action attachment coverage. |

### Manual QA target

`/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1`

Check freeze, answer replay, AUTO, FOLLOW, REPLAY, and BROADCAST. The beginner-level read should now be: "the defender is denying, so the cutter goes backdoor."

---

## P2.5 — Ball + pass timing readability (LANDED)

**Status:** Implemented in the imperative scene's ball-arc path and BDW-01 answer-demo authoring. No movement ownership changed.

### Goal

P2.3 fixed the back-cut body language and P2.4 fixed the defender denial / idle-ready posture, but the BDW-01 ball still felt slightly disconnected from the action. The pass left the same instant the cutter started the back-cut (so the passer looked like he was anticipating, not reading), and the ball arrived at the rim ~250 ms before the cutter did. The teaching beat we want — "defender denies, cutter goes backdoor, passer hits the open space" — needs the pass to clearly **react** to the cut and **arrive** when the cutter does.

### Visual behaviour

For the BDW-01 answer demo:

- The cutter plants and starts the back-cut at t=350 ms (unchanged).
- The passer releases at t=500 ms — a readable 150 ms after the cut becomes visible, so the read looks like a reaction to the open space, not a pre-loaded throw.
- The ball arrives at the rim at t=1100 ms, the same instant the cutter does. Catch / arrival alignment is tight without a lead-pass kludge.
- The cutter's `user_finish` step picks up 50 ms after the catch instead of 100 ms, so the layup motion feels continuous with the pass arrival.
- The ball still travels on a deterministic eased parabolic arc — no physics, no randomness, no collision.

For every scenario:

- `samplePassArc` is now the single source of truth for `(x, height, z)` along an in-flight pass. BDW-01, AOR-01, ESC-01, SKR-01, and any future drive-and-kick / relocation pass all render through the same primitive.
- The arc is finite-safe: degenerate inputs (zero-length pass, NaN coord, negative `u`) collapse to a sensible default rather than leaking NaN into the renderer.
- `resolvePassReleaseAnchor` and `resolvePassCatchAnchor` expose the holder / catcher position lookups as pure helpers so future scenarios can author lead-pass anchors without re-implementing the closest-player math.

### Determinism preserved

- `samplePassArc` is a pure function of `(from, to, u, kind)`. Same inputs → same `(x, height, z)`. No randomness, no clocks, no scene reads.
- The apex constants (`BALL_PEAK_MULT_PASS=0.25`, `BALL_PEAK_MULT_SKIP=0.10`, floor 0.7 ft, ceiling 7 ft) are unchanged from Phase C / C5; the math was extracted, not retuned.
- The freeze-inside-flight clamp test (`replayStateMachine.test.ts > Phase C / C5`) still passes byte-identical, confirming the controller's behaviour is unchanged for any pass that previously rendered.
- Scenario data is never mutated by the arc helpers (asserted in `passArc.test.ts > P2.5 — BDW-01`).

### What was tuned for BDW-01

`packages/db/seed/scenarios/packs/founder-v0/BDW-01.json` — `answerDemo`:

| Movement | Field | Before | After | Reason |
|---|---|---|---|---|
| `pg_lead_pass` | `delayMs` | 350 | 500 | Passer releases 150 ms after the cutter commits. Reads as reaction. |
| `pg_lead_pass` | `durationMs` | 500 | 600 | Pass arrival at t=1100 lines up with cutter arrival at the rim. |
| `user_finish` | `delayMs` | 100 | 50 | Layup picks up fluidly off the catch. |

Total answer-demo length is 1.5 s — comfortably under the 3.0 s budget.

### Architecture lock

- Scenario data still owns x / z / t for every player **and** for every pass.
- `samplePassArc` is a teaching primitive, not a physics simulation. No collision, no gravity, no randomness.
- The pass arc reads the timeline; it does not write to it. The ball never drives a player's route.
- Animation never controls ball timing — pass `startMs` / `endMs` come from the authored `delayMs` / `durationMs`, not from clip duration.
- Existing GLB body-language paths (P2.1 → P2.4) are untouched.
- AOR closeout, ESC empty-space cut, and SKR skip-pass paths render unchanged because they were already going through the same `applyBall` code, which now goes through `samplePassArc` with byte-identical math.

### Reusable infrastructure added

`apps/web/lib/scenario3d/passArc.ts`:

| Export | Purpose | Future use |
|---|---|---|
| `samplePassArc({from, to, u, kind})` | Pure (x, height, z) sampler along a deterministic eased arc. | Every scenario. Future pass-arc preview overlays. |
| `computeReadablePassArcPeak(distFt, kind)` | Apex height with floor/ceiling clamp. | Pass-trajectory teaching overlays, pass-arc thumbnails. |
| `resolvePassReleaseAnchor(scene, timeline, holderId, releaseMs, overrides?)` | Holder's live court position at release time. | Authoring guard for scenarios where the holder steps before passing. |
| `resolvePassCatchAnchor(scene, timeline, target, arrivalMs, overrides?)` | Closest-player + position at arrival. | Lead-pass anchor authoring, future drive-and-kick scenarios. |
| `BALL_PEAK_*` constants | Apex tuning | Re-exported from `imperativeScene.ts` for back-compat. |
| `easeInOutCubic(u)` | Symmetric S-curve | Reused in arc tests; available for future pass UI. |

### Files changed

| File | Change |
|---|---|
| `apps/web/lib/scenario3d/passArc.ts` | NEW. Pure deterministic pass-arc primitives plus release / catch anchor resolvers. |
| `apps/web/lib/scenario3d/passArc.test.ts` | NEW. 23 tests covering determinism, apex alignment, finite-safety, anchor lookups, and the BDW-01 timing alignment lock. |
| `apps/web/components/scenario3d/imperativeScene.ts` | `applyBall` now delegates to `samplePassArc`. Inline arc constants and the local `clamp01` / `easeInOutCubic` helpers (no longer used) are removed; constants are re-exported from `passArc.ts` for back-compat. |
| `apps/web/components/scenario3d/replayStateMachine.test.ts` | BDW-01 mirror block updated to the tuned `pg_lead_pass` and `user_finish` timings. |
| `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json` | `pg_lead_pass` `delayMs 350→500`, `durationMs 500→600`. `user_finish` `delayMs 100→50`. |

### Tests run

- `pnpm --filter @courtiq/web typecheck` → passes.
- `pnpm --filter @courtiq/web lint` → passes (max-warnings 0).
- `pnpm --filter @courtiq/web test` → 411 passed (22 files), including 23 new `passArc` tests and the existing Phase C / C5 ball-arc + freeze accuracy block, the Phase H consequence + replay budget block, and all P2.1 → P2.4 GLB / animation tests.

### Manual QA target

`/dev/scene-preview?scenario=BDW-01&glb=1&backcut=1`

Cycle FOLLOW, REPLAY, BROADCAST, and AUTO and confirm:

- Ball does not visibly teleport at any phase boundary.
- Passer is visibly **reading** the cut before releasing.
- Ball arrives in the open backdoor space at the same instant the cutter does.
- Defender denial cue (P2.4) and back-cut body language (P2.3) still read clearly.
- Route remains scenario-controlled — no animation-driven movement.

Optional comparison routes (no behaviour change expected, but kept on the QA loop):

- `/dev/scene-preview?scenario=AOR-01&glb=1&closeout=1`
- `/dev/scene-preview?scenario=ESC-01&glb=1`
- `/dev/scene-preview?scenario=SKR-01&glb=1`

### Remaining risks

- The 100 ms gap between `user_jab` end (t=250) and `user_plant_and_go` start (t=350) is unchanged. If QA finds the cutter's transition feels hitchy, that gap can be tightened in a follow-up; it is intentionally left alone here so the back-cut start point matches the existing P2.3 readable-back-cut tuning.
- `resolvePassReleaseAnchor` / `resolvePassCatchAnchor` are not yet wired into the renderer's `from` / `to` overrides — the renderer still trusts the timeline's authored `from` / `to`. The helpers are in place for the next scenario that needs a lead-pass anchor (BDW slot reversal, AOR swing-after-step, future drive-and-kick); wiring them in before that demand exists would be premature abstraction.

### Acceptance lock (P2.5)

- BDW-01 answer demo: passer release > cutter back-cut start (locked in `passArc.test.ts`).
- BDW-01 answer demo: pass arrival = cutter back-cut arrival (locked in `passArc.test.ts`).
- Pass arc is deterministic byte-identically given `(from, to, u, kind)`.
- Pass arc is finite for every input across the BDW-01 timeline.
- No mutation of scenario data during arc sampling.

---

## Appendix A — Do / Do Not summary

### Do

- Treat animation as a body-language and emphasis layer.
- Let scenario data own x / z / t.
- Strip root motion from imported clips at the loader.
- Flag-gate every imported clip.
- Author freeze poses as natural pauses in the active intent's clip.
- Map decoders to intents via a single lookup table.
- Keep the v1 vocabulary at 12 intents.
- Use 1–3 overlays max at freeze.
- Make wrong-read consequences visible in under 4 seconds.
- Keep replays deterministic.

### Do Not

- Do not give animation write access to figure root position.
- Do not import clips with un-stripped root motion.
- Do not introduce intents that are generic locomotion.
- Do not stack overlays.
- Do not slow-mo by default.
- Do not auto-loop replay more than twice.
- Do not let animation invent scenario meaning.
- Do not optimize for realism at the cost of readability.
- Do not ship imported clips on a protected route before they pass `/dev/scene-preview` QA.
- Do not couple animation duration to scenario timing — the reverse only.
