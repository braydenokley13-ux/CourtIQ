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

*To be filled in a later checkpoint.*

## Section 8 — Wrong-read consequence animation

*To be filled in a later checkpoint.*

## Section 9 — Best-read replay highlighting

*To be filled in a later checkpoint.*

## Section 10 — Rollout plan (P0 → P4)

*To be filled in a later checkpoint.*

## Section 11 — First Implementation Packet After This Doc

*To be filled in the final checkpoint.*
