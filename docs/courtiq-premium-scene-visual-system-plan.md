# CourtIQ Premium Scene Visual System Plan

> Planning document only. No scene code, player geometry, or UI components
> are changed by this file. Implementation happens in later phases driven
> by the prompt sequence at the end of this document.

---

## 1. Purpose of This Plan

This document plans the next-level visual upgrade for the CourtIQ 3D
basketball scene and the immediate scenario module UI that surrounds it.

The goal is **not** generic visual polish. The goal is to make the product
**better at teaching basketball IQ**. CourtIQ is a basketball IQ training
app for young players. It should feel like a **playable film room**, not
a trivia app and not an arcade basketball game. Every pixel on the floor
should help a 12-year-old read a defender, see a window, and understand a
decision.

> **The scene is the lesson.**

This plan defines:

- The product visual identity (premium sports-broadcast + training sim).
- The non-negotiable design principles that govern every visual choice.
- The shared visual vocabulary the team will use when reviewing work.
- A layered role/state model for players, ball, focus, and feedback.
- A phased implementation sequence with clean commit boundaries.
- A QA checklist that ties visual quality back to teaching outcomes.

If a future visual change is beautiful but does not help a young player
read the floor, this plan says no. **Beauty supports readability.**

---

## 2. Current Visual Problem

The latest live screenshot shows that the scene is **structurally
working** — court, players, hoop, indicators, overlays, scenario shell —
but it still reads as a prototype rather than a product. This section
frames the gap as a **prototype-to-product upgrade**, not as criticism of
prior work. The structure is the launchpad; the visual identity is what
must catch up.

Specific gaps observed:

- **Players look placeholder / peg-like.** Proportions, stance, and
  silhouette do not yet communicate "athlete in a defensive crouch" or
  "ball-handler attacking a closeout." Body angle is the most important
  basketball cue and it is not yet readable from the high 3/4 camera.
- **The court is functional but not premium.** The hardwood, lines,
  paint, key, and arc render correctly but do not feel like a teaching
  stage. The court reads as a placeholder surface, not as a diagram.
- **Hoop and stanchion feel basic.** The rim, net, backboard, and
  stanchion are recognizable but not productized. They feel like
  primitives, not part of a signature CourtIQ look.
- **Rings and indicators are useful but under-designed.** They convey
  state, but not in a way that feels intentional, layered, or branded.
  The ball-handler, user, offense, defense, and focus states are not yet
  visually separated cleanly.
- **Offense / defense / focus states could be cleaner.** Today, role and
  state both fight for the same visual channel. A young user has to
  *think* to identify themselves and the ball-handler. That is too slow.
- **The user player needs stronger distinction.** From the default
  camera, the user-controlled player should be unmistakable in under one
  second. Today it is identifiable but not signature.
- **Surrounding UI has good structure but feels detached.** The decoder
  pill, step row, scene controls, playback bar, and answer cards are
  functional, but they do not yet feel like one product with the court.
- **No signature visual identity yet.** Nothing in the current frame
  would be recognizable as "CourtIQ" if the logo were removed. This is
  the biggest gap.

The structure is good. The product identity is the next leap.

---

## 3. Product North Star

> **CourtIQ should feel like a premium sports-broadcast training sim
> built for decision-making.**

To set that target, it helps to contrast it with adjacent styles
CourtIQ is **not** trying to be:

- **Arcade basketball.** Flashy, exaggerated, power-up energy, glow for
  glow's sake. CourtIQ is not a game where the floor screams; it is a
  film room where the floor teaches.
- **Generic 3D prototype.** Untextured primitives, default lighting, no
  identity. CourtIQ has shipped past this; the plan is to leave it
  behind for good.
- **Realistic simulation (NBA 2K-style).** Photoreal skin, jersey
  wrinkles, sweat, crowd. Beautiful, but heavy and noisy for a teaching
  tool aimed at young players. Realism would bury the read.
- **CourtIQ's intended style.** Stylized, clean, readable, premium, and
  teaching-first. Broadcast-grade clarity over photoreal detail.
  Stylized players over realistic ones, so body angle and stance read
  instantly. Polished hardwood and crisp lines over noisy textures.

Said differently: CourtIQ is a **premium training sim, not an arcade
game** and not a simulation. It is the basketball equivalent of a
beautifully designed film-study tool — the kind a college assistant
coach would respect.

---

## 4. Non-Negotiable Design Principles

Every visual choice must pass these ten checks. If a change fails any
one of them, it does not ship — no matter how pretty it is.

1. **Readability beats realism.** The user is 12 years old and is
   reading a basketball decision in seconds. Stylized, high-contrast
   silhouettes will always beat photoreal detail. Realism that hides
   the read is a regression. **Visual polish cannot hide basketball
   information.**

2. **Every visual element needs a teaching job.** No decorative glow,
   no decorative line, no decorative camera move. If a highlight, ring,
   or overlay cannot answer the question "what is this teaching?", it
   is removed. **Every highlight has a teaching job.**

3. **The user player must be unmistakable.** From the default high 3/4
   camera, a brand-new user must identify their own player in under one
   second, every time, in every scenario. **The user player should
   feel unmistakable.**

4. **Ball-handler status must be obvious but not noisy.** Whoever has
   the ball should be visually clear without dominating the frame. The
   ball-handler indicator should feel like broadcast graphics, not like
   a video-game power-up.

5. **Defender body angle must be readable.** Hips, shoulders, and feet
   are the primary cue in most CourtIQ reads. The defender's stance
   must communicate "denying," "sagging," "closing out," or "helping"
   from the default camera, before any overlay turns on.
   **Read the defender, not the spot.**

6. **Overlays must reveal basketball logic, not give away answers too
   early.** Pre-decision overlays clarify the cue. Post-decision
   overlays explain the answer. **The cue comes before the answer.**
   **A cut lane is not decoration; it is the lesson.**

7. **The scene must perform well on Mac.** Geometry can grow, but only
   under a budget. Fancy postprocessing, expensive shadows, and
   per-frame allocations are off the table unless they are essential.
   **Performance-safe polish.**

8. **The visual system must work across all founder scenarios.**
   BDW-01, ESC-01, AOR-01, and SKR-01 must all read cleanly with the
   same player, indicator, court, and overlay system. Future scenarios
   like SKR-02 and AOR-03 must inherit it without rework.

9. **The cue comes before the answer.** Before the user chooses, the
   scene should *open the read* — show the denial, the empty corner,
   the closeout, the helper. After the user chooses, the scene should
   *explain* — show the cut lane, the skip lane, the consequence.
   **The scene should teach spacing before text explains it.**
   **The user should see why the window opened.**

10. **CourtIQ needs a signature on-court language.** The way users,
    ball-handlers, defenders, and focus states are drawn should be
    recognizable as CourtIQ. If a screenshot is shared without a logo,
    a coach should still be able to say "that's CourtIQ." This is the
    **signature CourtIQ on-court language**, and it is what makes the
    product feel **coach-respectable**.

---

## 5. Visual Vocabulary / Phrase Bank

Shared language saves time and keeps reviews honest. When debating a
visual choice, anyone on the team should be able to point at one of
these phrases and end the argument.

### Overall Feel

- premium film room
- sports-broadcast clarity
- training sim polish
- clean competitive energy
- coach-respectable
- serious but still fun
- playable film room (not arcade, not sim)
- premium training sim, not arcade game
- the scene is the lesson
- beauty supports readability

### Player Design

- readable silhouette
- athletic but simplified
- stance-first design (the stance is the cue)
- directionally clear (where are they facing?)
- not toy-like
- not overly realistic
- body angle tells the story
- defender hips and feet do the teaching
- the user player should feel unmistakable

### Court Design

- polished hardwood
- crisp teaching lines
- premium half-court stage
- quiet background
- high-contrast decision space
- court as diagram, not decoration
- the court should explain the decision
- the court is a teaching stage

### Indicator Design

- role-state clarity
- user-first highlight
- elegant possession signal
- focus without clutter
- matchup readability
- teaching glow, not video-game power-up
- offense, defense, ball, and focus states must be readable in one glance
- signature CourtIQ on-court language

### Overlay Design

- cue-first overlays
- reveal the window
- show why the lane opened
- sparse before decision, richer after answer
- every highlight has a teaching job
- do not solve the question too early
- a cut lane is not decoration; it is the lesson
- the cue comes before the answer
- the scene should teach spacing before text explains it
- the user should see why the window opened

---

## 6. Player Model Upgrade Plan

The player model is the single biggest lever in this entire plan. If
the players read as athletes in a stance, the rest of the visuals can
be modest and the product will already feel premium. If the players
read as pegs, no amount of court polish can save it.

### What should change from the current version

- **Proportions.** Move from peg-like cylinders toward stylized
  athletic proportions: clear shoulders, a distinct torso, defined
  arms, shorts, legs, and shoes. Heads stay simple — no facial
  detail — to keep the silhouette and stance dominant.
- **Torso / shoulders.** Shoulders should be the widest part of the
  upper body. A clear shoulder line is what makes "facing direction"
  readable from the high 3/4 camera.
- **Arms.** Arms should be visible as separate volumes, not fused to
  the torso. Defenders must be able to show "active hands" implicitly
  through arm position. Ball-handlers must show a triple-threat-ish
  posture.
- **Shorts and legs.** A short/leg break gives the eye a clear "lower
  body" shape. This is what sells the **stance**.
- **Shoes.** Small, simple shoes that ground the player to the floor.
  Foot direction is a primary defender cue, so feet must read.
- **Stance clarity.** The default offensive pose, the default defensive
  stance, and the closeout pose must each look distinct from above.
  Offensive players stand tall; defenders sit lower, wider, hands out.
- **Body facing.** Every player must have an unambiguous facing
  direction. From the default camera, you must be able to tell who is
  looking at whom without overlays.
- **Defender hip/foot readability.** Denial stance, sag stance, and
  closeout stance must each show distinct hip angle and foot stagger.
  This is what the user is supposed to read in most scenarios.
- **Modest variation.** Allow small differences — height, build,
  skin tone, jersey number — so the team doesn't feel like five clones.
  Variation is a feature, not a goal: it must never reduce readability.
- **Avoid unnecessary facial detail.** No eyes, no mouths, no hair
  systems. Faces are an attention sink and a perf cost for zero
  teaching value at this camera distance.
- **Performance-safe geometry.** Each player should stay well under a
  modest tri budget. Geometry growth comes from better topology in the
  torso/legs, not from per-finger detail.

### Why it matters for CourtIQ

- The whole product thesis is **read the defender, not the spot.** If
  the defender's body does not communicate denial, sag, or closeout,
  the user is forced to read the overlay, and the overlay becomes a
  crutch. The scene should teach spacing **before** text explains it.
- Stance-first players make every scenario more honest: the user is
  rewarded for reading hips and feet, not for memorizing prompts.
- A premium silhouette is the fastest path to **coach-respectable**.

### Likely files / components / functions to inspect

The Phase 1 audit will confirm exact paths. Best current guesses based
on the existing renderer plans:

- The imperative scene builder used by the `/train` route (referenced
  in `docs/courtiq-realistic-renderer-plan.md` and
  `docs/courtiq-renderer-polish-plan-part2.md`).
- Whatever module currently builds the cylinder/peg player meshes
  (likely a `buildPlayer` / `createPlayer` style helper inside the
  imperative renderer).
- The team / role assignment layer that decides offense vs defense and
  marks the user player.
- Any pose / stance setter that positions arms and legs per state.
- Material/texture helpers used by the current player primitives.

### What to avoid

- No facial detail, no hair, no per-finger hands.
- No high-frequency textures that compete with court lines.
- No per-player skinned animation rigs in this phase — stance is set
  by pose, not by skeletal animation.
- No team-specific jerseys yet; one neutral offense look and one
  neutral defense look is enough until the indicator system lands.
- No "cool" details that would survive a screenshot but die under the
  performance budget on Mac.

### How to keep geometry reusable across scenarios

- One player builder, parameterized by role (offense / defense / user),
  stance (idle / defensive / closeout / cut), and small variation knobs
  (height, build, jersey number, skin tone).
- All role and state visuals come from the **indicator layer**, not
  from the player mesh itself. The player model is a stable base; the
  rings, halos, and glows ride on top. This keeps BDW-01, ESC-01,
  AOR-01, and SKR-01 sharing one player system.
- Disposal hygiene matches the existing imperative renderer rules:
  every geometry, material, and texture created by the player builder
  must be tracked and disposed on unmount.

---
