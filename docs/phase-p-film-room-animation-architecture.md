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

*To be filled in a later checkpoint.*

## Section 5 — Minimal v1 animation vocabulary

*To be filled in a later checkpoint.*

## Section 6 — Decoder mapping (BDW / ESC / SKR / AOR)

*To be filled in a later checkpoint.*

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
