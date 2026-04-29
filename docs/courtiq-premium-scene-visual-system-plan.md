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

## 7. Player Role UI / Indicator System Plan

The indicator system is what turns a 3D scene into a **playable film
room**. It is the layer that says, in one glance: *"that's you, that
person has the ball, those are defenders, watch the helper."*

> **Offense, defense, ball, and focus states must be readable in one glance.**

### States that must be expressible

- **User-controlled player** — always the most distinct mark.
- **Ball-handler** — clear at any moment of the play.
- **Offense** — non-ball-handler offensive players.
- **Defense** — every defender, base team identity.
- **Selected / focus state** — the player the lesson wants the user to
  read right now (e.g., "watch the wing defender").
- **Matchup state** — pairs a defender with the player they are
  guarding when the lesson needs that link explicit.
- **Teaching cue state** — the pre-decision "look here" mark.
- **Help defender state** — the helper that should pull the user's eye
  on shrink / skip / drive scenarios.
- **Incorrect-choice consequence state** — what lights up when a wrong
  read is made (e.g., the defender that recovered, the lane that
  closed).

### Layered state model

To keep states stackable without becoming visually noisy, indicators
are split into five additive layers. Each player can have at most one
mark from each layer active at a time.

1. **Base team identity layer.** Sets offense vs defense at all times.
   Lowest visual weight. Lives on the player's foot ring or jersey
   tint. Always on. Never animated.
2. **User identity layer.** Marks the user-controlled player. Highest
   priority of all layers. Stronger ring + a unique secondary mark
   (e.g., a subtle underglow) so the user is identifiable even when
   another layer is active. Always on for the user. Never on for
   anyone else.
3. **Possession layer.** Marks the ball-handler. A small, broadcast-
   style pip near the player or a clean ring accent. Switches cleanly
   on a pass. Never confused with the user identity mark.
4. **Focus / cue layer.** Marks who the lesson wants the user to read.
   This layer is **animated** (slow pulse), used sparingly, and is
   what carries the pre-decision teaching cue. Off by default, on
   only when the lesson calls it.
5. **Feedback / replay layer.** Used post-decision and during replay.
   Marks the helper that recovered, the lane that closed, the cutter
   the user missed. Stronger color, often paired with overlays. Off
   during the live decision moment.

The layers stack additively: **base** is always there; **user** is
always there for the user; **possession** is always there for the
ball-handler; **focus** is added when the cue fires; **feedback** is
added after the choice. Because each layer occupies a different
visual channel (ring band, underglow, pip, pulse, color sweep), they
read clearly without fighting each other.

### Specific ideas per primitive

- **Foot rings.** The base team identity carrier. Two flat,
  broadcast-style ring tones — one for offense, one for defense.
  Subtle, low-contrast, always on. Designed to live under everything
  else without competing.
- **Halos.** Reserved for the user player. A clean, single accent
  halo at chest height, slightly tilted toward the camera, that reads
  even when the player is occluded by another body. This is the
  primary "that's you" cue.
- **Underglows.** Used as the **secondary** user identity mark and as
  the focus / cue glow. Soft, contained, never bleeding past the
  player's footprint. Different hues for "you" vs "watch this."
- **Outlines.** Reserved for replay / feedback moments — e.g., a
  defender outlined briefly when explaining "that helper recovered."
  Off during live decisions to keep the frame quiet.
- **Pulsing states.** Only the focus / cue layer and the
  incorrect-choice consequence layer pulse. Pulse is precious. If
  everything pulses, nothing teaches.
- **Ball possession marker.** A small, broadcast-style pip floating
  above or next to the ball-handler. Switches instantly on pass.
  Never large enough to obscure the player's body or stance.
- **Focus glow.** The pre-decision "read this player" mark. A soft,
  warm pulse on the focus layer. Used to **open the read**, not to
  point at the answer. Fades cleanly when the user starts to choose.
- **Wrong-read consequence visuals.** When the user picks the wrong
  read, the defender who would have recovered briefly outlines and
  the closed lane briefly fills, paired with the post-decision
  overlay. This is the moment the scene **teaches the answer** —
  short, clean, then back to neutral so the next attempt feels fresh.

### Anti-patterns

- No "everything pulses" frames. Pulse is reserved.
- No simultaneous loud halos on multiple players. The user halo wins.
- No team-color halos that compete with the user identity halo.
- No floor decals that compete with court lines.

---

## 8. Court / Hoop / Environment Upgrade Plan

> **The court is a teaching stage.**

The court should feel premium without becoming distracting. The user's
attention belongs on the players and the read; the court's job is to
**hold** that attention, not to **steal** it.

### Hardwood material

- Soft, slightly warm wood tone — close to broadcast hardwood, not
  glossy and not matte.
- Subtle plank direction so the floor reads as wood, but no high-
  frequency grain that competes with painted lines.
- Minimal specular response. A faint sheen, not a mirror.

### Court lines

- Crisp, high-contrast paint lines: sidelines, baseline, free-throw
  line, lane lines, three-point arc, restricted area, half-court.
- Slightly thicker than "real" lines for readability from the default
  camera.
- Color: a clean off-white that holds up under the scene lighting and
  never glares.

### Paint and key

- A muted, branded paint color — saturated enough to anchor the half-
  court visually, desaturated enough to never out-shout the players.
- The paint is the diagram's center of gravity. It should pull the eye
  to the action.

### Three-point arc

- The arc must be unambiguously readable. Many CourtIQ reads
  (skip, paint touch, closeout) live around the arc.
- Slightly emphasized line weight is allowed if needed for
  readability. **Readability beats realism.**

### Rim area / restricted area

- Visible enough to anchor "paint touch" and "baseline cut"
  scenarios.
- Quiet by default, ready to be highlighted by overlays in Section 10.

### Hoop

- Cleaner stanchion geometry: padded base, a real arm, a backboard
  that reads as glass-on-frame, not as a flat plate.
- Stanchion presence should signal "real gym hoop" without crowding
  the half-court visually.

### Backboard

- Frame, glass, and shooter's square readable from the high 3/4 angle.
- Slight transparency on the glass, but not so much that overlays
  behind the rim become noisy.

### Rim

- Round tube geometry, broadcast-orange tone, slightly brighter than
  the paint so it always reads.
- Net attachment loops visible enough to feel real, not modeled in
  high detail.

### Net

- Stylized net — a few segments, soft motion only when the ball goes
  through. No expensive cloth simulation.
- Net visibility should never compete with player silhouettes.

### Stanchion

- Base, arm, padding. Branded color treatment is allowed but should
  stay quiet.
- Lives in the background of the frame, not in the read.

### Background environment

- A quiet, low-contrast volume around the half-court — implied gym,
  not modeled gym. No bleachers, no crowd, no ceiling truss.
- A soft vignette / falloff away from the court keeps the eye where
  the lesson is. **Quiet background, high-contrast decision space.**

### Anti-patterns

- No glossy mirror floor.
- No noisy wood texture that fights court lines.
- No realistic crowd, banners, or scoreboard at this phase.
- No environmental detail that costs frames on Mac for zero teaching
  value.

---

## 9. Lighting / Camera / Composition Plan

Lighting and camera are the difference between "3D scene" and
"sports-broadcast clarity." This section keeps both honest: every
choice serves readability of the read.

### Default camera — high 3/4 film-room angle

- Position: elevated, behind and slightly off-axis from the user
  player, looking down toward the rim. Close enough to the classic
  coach's-film angle that any coach feels at home.
- Pitch: steep enough to read **spacing on the floor** (distances
  between players, lanes, paint, arc), shallow enough to still read
  **defender body angle** (hips, shoulders, feet).
- This is the default for every scenario. Variations (Section 10 +
  scenario-specific) tilt this baseline, they do not abandon it.

### Readability of spacing

- The high 3/4 angle is chosen specifically so the eye reads the
  **distances** between players. A user must be able to see "the
  corner is empty" or "the closeout is short" without an overlay.
- Camera should never collapse the floor into a line. Top-down is too
  abstract; side-on hides spacing. Stick to the high 3/4 baseline.

### Readability of defender stance

- The angle must preserve readable hips and feet on defenders. If a
  camera move flattens defenders into silhouettes facing the camera,
  the read dies.
- When the lesson is about a specific defender (denial, closeout,
  helper), the framing should keep that defender's body angle on
  camera, even if the user player is briefly off-center.

### Avoiding muddy lighting

- Lighting target: clean, neutral key light from above-front, soft
  fill, modest rim light to separate players from the floor.
- No deep shadows that swallow defender stances. No blown highlights
  that erase jersey edges. **Beauty supports readability.**

### Contrast between players and floor

- Players should always sit visually **above** the floor, never blend
  into it. A subtle contact shadow under each player is fine and
  helps grounding; long, dramatic shadows are not.
- Jersey tones and paint tone should be tuned so offense and defense
  contrast against the hardwood and against each other.

### Subtle broadcast feel

- Slight cinematic warmth, gentle vignette toward the edges, subtle
  film grain at most. Broadcast graphics, not movie grading.
- No lens flares, no chromatic aberration, no aggressive bloom.
  **Premium training sim, not arcade game.**

### Not overdoing cinematic drama

- Camera moves are small and purposeful: a gentle settle on scene
  start, a tiny pull-in at the cue moment, a slightly wider hold for
  feedback. No swoops, no orbits during the live decision.
- The user is reading, not watching a highlight reel. The camera
  must stay still when the user is choosing.

### Camera framing by scenario type

The default high 3/4 camera is the **base**. Each scenario type may
nudge it to keep the right cue on screen.

- **Backdoor scenarios (BDW-01).** Frame favors the wing and the
  defender's denial side. The cutter's approach to the rim must be
  visible end-to-end after reveal.
- **Empty-space cut scenarios (ESC-01).** Frame must show **both**
  the empty corner and the weak-side helper at the same time. The
  baseline cut lane must be readable end-to-end.
- **Skip-pass scenarios (SKR-01, future SKR-02).** Frame must reveal
  the **opposite corner** clearly. A camera that hides the skip target
  defeats the lesson.
- **Closeout decision scenarios (AOR-01, future AOR-03).** Frame must
  preserve the closeout defender's momentum vector — the user has to
  read whether the defender is under control or flying.

---

## 10. Overlay Compatibility Plan

Overlays are the thinnest visual layer in CourtIQ — and the most
dangerous. Done well, they teach the read. Done poorly, they hand the
user the answer.

> **Before the choice, overlays should clarify the cue. After the
> choice, overlays should explain the answer.**

The pre-choice overlay is allowed to **open the read** (e.g., dim the
denied lane, soften the empty corner, mark the helper). It is not
allowed to **announce the answer** (e.g., a flashing arrow into the
backdoor lane before the user has chosen). **The cue comes before the
answer.**

### Overlay types the visual system must support

- **Open / closed passing lanes.** A quiet line or beam from passer
  toward target, color-coded for "open" vs "closed." Subtle pre-
  decision; brighter and labeled post-decision.
- **Defender vision cones.** A soft cone from the defender's chest /
  eyes showing where they are checking. Used to teach denial vs ball-
  watching. Must never look sci-fi; broadcast-graphic feel only.
- **Help-defender pulse.** A slow pulse on the focus / cue layer for
  the help defender — used to ask the user *"see this guy?"* without
  saying *"pass here."*
- **Hips / feet arrows.** Small, broadcast-style indicators at the
  defender's hip and foot showing stance direction. Reserved for
  teaching moments; off by default to avoid clutter.
- **Open-space highlights.** A soft fill on the floor where there is
  exploitable space (empty corner, baseline lane, paint). Pre-
  decision: low intensity. Post-decision: brighter, fully labeled.
- **Drive / cut path reveal.** A clean path line drawn after the
  user's choice, animating from start to finish to **show** what the
  decision looked like on the floor. **A cut lane is not decoration;
  it is the lesson.**
- **Sparse decision-state overlays.** During the live read, fewer
  overlays, lower intensity, room for the user to think.
- **Richer feedback-state overlays.** After the choice, the scene is
  allowed to be much more explicit: lane fills, defender outlines,
  path animations, labels.

### State machine in plain terms

- **Idle / setup:** base + team identity + user identity + possession.
  No overlays.
- **Pre-decision (cue):** add focus / cue layer, plus minimal
  open-space hint and minimal defender stance hint. **The user
  should see why the window opened**, but the answer stays implicit.
- **Live decision:** all overlays at their lowest intensity. The
  scene should feel quiet and readable. The scene should **teach
  spacing before text explains it**.
- **Feedback / replay:** feedback layer + full overlays + path
  reveal + outcome labels. The court should explain the decision.

### Anti-patterns

- No pre-decision arrow that points to the correct pass.
- No "correct lane" highlight before the user has chosen.
- No simultaneous overlays competing for the same pixels.
- No overlay so bright that the player silhouettes disappear.

> **Visual polish cannot hide basketball information.**
> **Every highlight has a teaching job.**

---

## 11. Module Shell UI Plan

The scenario module shell is the immediate UI around the 3D scene:
the top decoder pill, the step progress row, the scene control chips,
the playback controls, and the answer cards. Today they are
functional, but they do not yet feel like one product with the court.

This section is **scoped to the scenario module**. It is not an app-
wide redesign.

### Top decoder pill

- Quiet, broadcast-style chip at the top of the scene that names the
  scenario family (e.g., "Denied Wing Backdoor"). Reads as a TV
  graphic, not as a UI label.
- Color and weight tuned to the upgraded court palette — never
  fighting the floor for attention.

### Step progress row

- Compact row showing the user's place in the scenario flow. Subtle,
  consistent across scenarios.
- Small enough to live above or below the scene without taking
  pixels from the read.

### Scene control chips

- Group of small chips for scene controls (paths on/off, cue on/off,
  reset). Glass / panel treatment that matches the upgraded scene
  feel.
- Default state: **chips are quiet during live decision**, slightly
  more present during feedback / replay. The shell should breathe
  with the overlay state machine.

### Playback controls

- Clean playback bar (e.g., 0.5x / 1x / 2x, scrub, play/pause). Lives
  off the live action area, anchored to a predictable corner so it
  never drifts.
- Visible only when meaningful — during replay, during feedback —
  faded during the pre-decision moment so the user is not tempted to
  scrub the cue away.

### Answer cards

- Cards must visually defer to the court. They are choices, not
  spectacle. Typography clean, hierarchy obvious, hover/active states
  consistent.
- Card content order follows the on-court read: the option being
  taught is never first, never visually highlighted before the user
  chooses.

### Spacing and hierarchy

- Generous padding around the canvas. The court should never feel
  pinched.
- Consistent vertical rhythm between decoder pill, scene, controls,
  and answer cards.
- The eye path: scene first, cue second, answer cards third. The
  shell must enforce that order with size and contrast.

### Glass / panel treatment

- A consistent glass / panel material for chips, pills, and the
  playback bar. Same blur, same border, same corner radius.
- Tuned so panels feel **above** the court but not on top of it.
  Subtle, not fighting the scene.

### Consistency with the upgraded court

- Shell colors derived from the court palette (paint tone, line
  tone, hardwood warmth). Shell should look like it belongs on the
  same broadcast graphics package as the floor.
- Shell motion (chips appearing, panels sliding) should match the
  scene's quiet personality. No bouncy easing, no aggressive slides.

### Anti-patterns

- No app-wide nav redesign in this scope.
- No new dashboard / home / settings work as part of this plan.
- No shell elements that block the read area on smaller windows.

---

## 12. Phase Plan

The implementation work is broken into seven sequential phases. Each
phase is small enough to ship as one or two commits, leaves the
renderer in a working state, and has a clear acceptance criterion.

### Phase 1 — Audit Current Scene Architecture

- **Goal.** Find the files controlling player geometry, court
  geometry, indicators, overlays, lighting, camera, and module shell.
- **What changes.** Nothing in the renderer. This phase is read-only
  research.
- **Why it matters for CourtIQ.** Future phases must edit precisely.
  An accurate file map prevents drive-by refactors and protects the
  imperative renderer rules already established in
  `docs/courtiq-realistic-renderer-plan.md`.
- **Files likely involved.** Imperative scene builder for `/train`,
  player builder helper, court builder, hoop / stanchion builder,
  indicator helpers, overlay helpers, lighting setup, camera setup,
  module shell components around the canvas.
- **Risks.** Missing a hidden state owner; assuming JSX scene
  composition where the renderer is actually imperative.
- **Acceptance criteria.** A written file map plus risk notes,
  enough that any later phase can locate its targets without
  re-exploring the codebase.
- **Suggested commit name.**
  `docs: audit current CourtIQ scene architecture for visual upgrade`
- **Deliverable.** A file map and risk notes.

### Phase 2 — Player Visual Foundation

- **Goal.** Improve player model quality, silhouette, stance, and
  readability per Section 6.
- **What changes.** The player builder, its parameters, and its
  default stances. No indicator changes, no court changes.
- **Why it matters for CourtIQ.** Stance-first players are the
  single biggest lever for **read the defender, not the spot.**
- **Files likely involved.** The player builder helper identified in
  Phase 1, any pose / stance setter, materials used by player
  primitives.
- **Risks.** Geometry growth that hurts Mac performance; new pose
  states that break existing scenario playback.
- **Acceptance criteria.** Players no longer look like placeholders;
  offense / defense / closeout stances are visibly distinct from the
  default camera; tri count stays within budget.
- **Suggested commit name.**
  `feat(scene): upgrade CourtIQ player silhouette and stances`
- **Deliverable.** Players no longer look like placeholders.

### Phase 3 — Player Role UI / Indicator System

- **Goal.** Build the layered state system from Section 7 — base,
  user, possession, focus, feedback.
- **What changes.** Indicator helpers; introduction of the five
  layers; wiring lessons / overlays into the focus and feedback
  layers.
- **Why it matters for CourtIQ.** Without this, premium players are
  wasted: the user still cannot see themselves at a glance.
- **Files likely involved.** Indicator helpers, lesson / scenario
  state hooks that set focus and feedback marks.
- **Risks.** Layer collisions that produce noisy frames; over-
  pulsing; user identity getting lost when focus is active.
- **Acceptance criteria.** A user can identify themselves, the ball-
  handler, offense vs defense, and the focus player in under one
  second on every founder scenario.
- **Suggested commit name.**
  `feat(scene): introduce CourtIQ layered role and state indicator system`
- **Deliverable.** CourtIQ has a more productized visual language.

### Phase 4 — Court / Hoop / Material Polish

- **Goal.** Upgrade the court, hoop, rim, net, stanchion, and
  material quality per Section 8.
- **What changes.** Hardwood material, court line crispness, paint
  tone, arc weight, hoop / backboard / rim / net / stanchion
  geometry and materials.
- **Why it matters for CourtIQ.** This is the **teaching stage**.
  Premium hardwood + crisp lines is what makes the product feel
  **coach-respectable** in screenshots.
- **Files likely involved.** Court builder, hoop / stanchion
  builder, shared materials.
- **Risks.** Texture noise that competes with court lines; specular
  highlights that erase player silhouettes; geometry creep on the
  hoop.
- **Acceptance criteria.** Court reads as polished hardwood; lines,
  paint, and arc are crisp; hoop / rim / net / stanchion feel
  premium without distracting.
- **Suggested commit name.**
  `feat(scene): polish CourtIQ court hoop and materials`
- **Deliverable.** The court feels like a premium teaching stage.

### Phase 5 — Lighting / Camera / Scene Polish

- **Goal.** Improve contrast, clarity, camera framing, and overall
  scene presentation per Section 9.
- **What changes.** Lighting setup, camera defaults, optional minor
  per-scenario framing nudges, minimal post-processing.
- **Why it matters for CourtIQ.** Lighting and camera are the final
  10% that turns "nice scene" into **sports-broadcast clarity**.
- **Files likely involved.** Lighting setup, camera setup, scenario-
  to-camera mapping, any vignette / post helper.
- **Risks.** Muddy shadows hiding defender stance; cinematic moves
  that distract during live decisions.
- **Acceptance criteria.** Spacing and stance are readable from the
  default camera; lighting is clean; no camera move competes with
  the user's read.
- **Suggested commit name.**
  `feat(scene): tune CourtIQ lighting and broadcast camera framing`
- **Deliverable.** The scene feels premium but still readable.

### Phase 6 — Module Shell UI Polish

- **Goal.** Make the surrounding scenario module UI feel integrated
  with the upgraded scene per Section 11.
- **What changes.** Decoder pill, step row, scene control chips,
  playback bar, answer cards, spacing, glass treatment.
- **Why it matters for CourtIQ.** The product is a **whole
  scenario screen**, not just a canvas. Shell polish closes the gap
  between scene and product.
- **Files likely involved.** The scenario module shell components
  immediately surrounding the canvas.
- **Risks.** Scope creep into app-wide redesign; shell elements
  blocking the read area on small windows.
- **Acceptance criteria.** Shell colors / motion / glass match the
  upgraded scene; eye path goes scene → cue → answer cards on every
  founder scenario; shell defers to the court at all times.
- **Suggested commit name.**
  `feat(ui): align CourtIQ scenario module shell with upgraded scene`
- **Deliverable.** The whole scenario screen feels cohesive.

### Phase 7 — QA / Performance / Tuning

- **Goal.** Check Mac performance, overlay readability, scenario
  compatibility, and code cleanliness across BDW-01, ESC-01, AOR-01,
  and SKR-01.
- **What changes.** Targeted tuning only — no new features. Possibly
  geometry budget tweaks, material tone tweaks, indicator intensity
  tweaks.
- **Why it matters for CourtIQ.** **Performance-safe polish.** The
  product must run smoothly on Mac and read cleanly on every founder
  scenario before this plan is considered complete.
- **Files likely involved.** Any file touched in Phases 2–6, plus
  any perf instrumentation.
- **Risks.** Late regressions; tuning that helps one scenario at the
  cost of another.
- **Acceptance criteria.** All QA checklist items in Section 15
  pass; Mac frame rate stable; no scenario regresses.
- **Suggested commit name.**
  `chore(scene): final QA and performance tuning for visual system`
- **Deliverable.** Ready-to-implement final polish list.

---
