# Founder-v0 Scenario Content Plan

This document is the **content design plan** for expanding the founder-v0 pack
from the current 4 seed scenarios to a full 20 (5 per decoder family). It is
written **before any implementation** so authors, coaches, and engineers can
agree on what the player will actually read and how each scenario plugs into
the existing engine.

## Architectural premise

CourtIQ already ships:

- A **shared GLB athlete** rig with reusable motion clips (`idle_ready`,
  `cut_sprint`, `defense_slide`, `defensive_deny`, `closeout`, `back_cut`,
  `receive_ready`, `closeout_read`).
- An **`AnimationIntent` vocabulary** (12 intents: `IDLE_READY`,
  `RECEIVE_READY`, `JAB_OR_RIP`, `BACK_CUT`, `EMPTY_SPACE_CUT`,
  `DEFENSIVE_DENY`, `DEFENSIVE_HELP_TURN`, `CLOSEOUT`, `SLIDE_RECOVER`,
  `PASS_FOLLOWTHROUGH`, `SHOT_READY`, `RESET_HOLD`).
- A decoder/role → intent mapping (`getDecoderAnimationIntent`) and a
  movement-kind → intent mapping (`getMovementKindIntent`).
- An intent → clip resolver (`resolveGlbClipForIntent`) with a graceful
  fallback ladder when an imported clip is unavailable.
- Scenario JSON seeds in `packages/db/seed/scenarios/packs/founder-v0/`
  with a `scene` block consumed by the 3D renderer.
- A 2D fallback renderer driven by the same scene JSON.

Therefore the **mental model for this expansion** is:

> Shared GLB athlete + shared motion clips + scenario JSON = many scenarios.

A scenario is fundamentally a **data record** — court positions, decoder tag,
movement kinds, choices, freeze marker, overlays. It references reusable
animation intents; it does **not** ship its own GLB asset.

**No new GLB files** are required for any of the 20 scenarios in this plan.
If a future intent (e.g. a "rip-through" cinematic) is desired, that should be
added once to the intent → clip resolver and reused, not embedded into one
scenario.

## Format used for every scenario

Each entry below carries the 16 fields the team agreed to plan against:

1. Scenario ID
2. Scenario title
3. Decoder tag
4. Difficulty (1–5)
5. Main basketball cue
6. Game context
7. Player setup (offense, defense, rough court positions, ball location)
8. GLB / animation intent plan
   - Per-player reusable `AnimationIntent`
   - Whether procedural fallback is acceptable if GLB fails
9. Freeze moment
10. Decision prompt
11. Four answer choices (best / acceptable / wrong / wrong)
12. Feedback for every choice
13. Best-read explanation
14. Decoder teaching point
15. Self-review checklist
16. 3D notes (visible scene, must-read motion, future overlays)

Coordinates use the existing scene-frame: feet, origin at rim center,
`+x = right sideline`, `+z = toward half-court`.

---

# Family 1 — BACKDOOR_WINDOW (5 scenarios)

The decoder cue across this family is identical: a defender's hand or foot
visibly in the passing lane (chest between ball and receiver). The decision is
always: **cut behind, not in front, the moment the denial is shown.**

The animation intents below are reused throughout: `BACK_CUT` for the cutter,
`DEFENSIVE_DENY` for the deny defender, `PASS_FOLLOWTHROUGH` for the passer,
`IDLE_READY` for off-ball spacers, `RECEIVE_READY` if a teammate becomes a
receiver after a kick.

## BDW-01 — Denied Wing Backdoor

3. Decoder tag: `BACKDOOR_WINDOW`
4. Difficulty: 1
5. Main cue: x2 has hand and foot in the passing lane on a wing reversal.
6. Game context: 4-on-4 half-court shell, ball reversal from the left slot,
   14 on the shot clock.
7. Player setup
   - Offense: PG ball at left slot (-9, 14); user on right wing (18, 8);
     weak wing (-18, 9); strong corner (22, 1).
   - Defense: x1 on PG (-9, 16); x2 denying user wing (15, 10) — hand and
     foot in lane; x3 weak wing (-15, 10); x4 low man (19, 3).
   - Ball at the left slot.
8. GLB / intent plan
   - User (cutter) → `BACK_CUT`
   - x2 (deny defender) → `DEFENSIVE_DENY`
   - PG (passer) → `PASS_FOLLOWTHROUGH`
   - Other defenders → `IDLE_READY` / `DEFENSIVE_DENY` static
   - Procedural fallback: yes — `cut_sprint` covers `BACK_CUT` if the
     imported clip is gated off.
9. Freeze moment: 1.5s after possession start, x2's hand and foot fully in
   the passing lane, PG squared to make the entry pass.
10. Decision prompt: "Your defender is blocking the pass."
11. Choices
    - c1 (best) — Cut behind him to the basket.
    - c2 (acceptable) — Step back out and ask for the ball.
    - c3 (wrong) — Stay still and call for the ball.
    - c4 (wrong) — Cut in front of the defender.
12. Feedback
    - c1: "Good read. He blocked the pass, so the basket was open."
    - c2: "Stepping back kept the play alive. Better read: cut behind for
      the layup."
    - c3: "Standing still is a steal. He was in the lane."
    - c4: "Cutting in front lets him follow you. Cut behind."
13. Best-read explanation: The denial removes the wing catch but opens the
    layup window behind. The back-cut punishes the very stance that denied
    the reversal.
14. Decoder teaching point: "When your defender blocks the pass, the space
    behind him is open. Cut there."
15. Self-review checklist
    - Did I see his hand and foot in the lane?
    - Did I cut behind him, not in front?
    - Did I cut hard, like I wanted the layup?
    - Did I show my hands at the rim?
16. 3D notes
    - Visible: x2's denial pose, the user's plant-foot, the open lane to
      the rim, x4 not yet in help.
    - Must read: x2 stays denying, the user disappears behind the
      defender's back into the rim space.
    - Future overlays: passing-lane-blocked badge on x2, paint-region
      glow once the back-cut window opens.

## BDW-02 — Denied Reversal at the Top

3. Decoder tag: `BACKDOOR_WINDOW`
4. Difficulty: 2
5. Main cue: top defender presses up on the slot reversal — chest between
   ball and receiver, foot stabbed forward.
6. Game context: 5-out shell, dribble hand-off refused, possession
   re-attacking. 18 on the shot clock.
7. Player setup
   - Offense: ball-handler on right wing (18, 9); user at top slot (3, 19);
     weak wing (-18, 9); both corners filled.
   - Defense: on-ball (16, 11); x_top denying user (3, 16) — hand in lane;
     weak-wing defender (-15, 10); both corner defenders tight.
   - Ball at right wing.
8. GLB / intent plan
   - User → `BACK_CUT`
   - x_top → `DEFENSIVE_DENY`
   - Right-wing ball-handler → `PASS_FOLLOWTHROUGH`
   - Spacers → `IDLE_READY`
   - Procedural fallback: yes.
9. Freeze moment: x_top's hand has crossed the imaginary line between ball
   and user; user is settled at the top, eyes on the ball.
10. Decision prompt: "He stepped up on you. What do you do?"
11. Choices
    - c1 (best) — Back-cut down the middle to the rim.
    - c2 (acceptable) — Slide to the slot away from him to clear the catch.
    - c3 (wrong) — Hold the slot and call for the ball.
    - c4 (wrong) — Cut up-the-floor toward the ball-handler.
12. Feedback
    - c1: "Right read. He gave up the basket to deny the pass."
    - c2: "You kept spacing. Next time the basket was open behind him."
    - c3: "Holding still gives him the steal."
    - c4: "Cutting toward the ball runs you into him."
13. Best-read explanation: A top-side denial vacates the middle of the
    floor; the ball-handler has a straight-line lead pass to the rim.
14. Decoder teaching point: "Top-side hand in the lane means rim-side is
    open."
15. Self-review checklist
    - Did I see his hand cross the lane?
    - Did I plant the outside foot?
    - Did I cut to the rim, not to the ball?
    - Did I show my hands at the rim?
16. 3D notes
    - Visible: x_top's chest line and forward foot; clean middle lane.
    - Must read: the middle of the floor opening as user disappears.
    - Future overlays: chest-line overlay, rim-attack arrow.

## BDW-03 — Corner Denial Backdoor

3. Decoder tag: `BACKDOOR_WINDOW`
4. Difficulty: 2
5. Main cue: corner defender top-locks (chest above the cutter, hand high)
   to deny the kick-out.
6. Game context: dribble penetration sucked help; ball is coming back to
   the strong corner. 12 on the shot clock.
7. Player setup
   - Offense: driver collected at right elbow (5, 14); user in right
     corner (22, 1); PG (0, 19); weak wing (-18, 9).
   - Defense: corner defender top-locking user at (20, 4); driver's man
     trailing; help recovering.
   - Ball at right elbow.
8. GLB / intent plan
   - User → `BACK_CUT` (baseline backdoor under the rim)
   - Corner defender → `DEFENSIVE_DENY`
   - Driver → `PASS_FOLLOWTHROUGH` (lead pass to baseline)
   - Procedural fallback: yes.
9. Freeze moment: top-lock pose set, driver's eyes lift from the ground.
10. Decision prompt: "He top-locked you. Where's the open space?"
11. Choices
    - c1 (best) — Backdoor along the baseline behind him.
    - c2 (acceptable) — Lift to the wing to clear and catch higher.
    - c3 (wrong) — Stay in the corner and ask for it.
    - c4 (wrong) — Run up to set a flare screen.
12. Feedback
    - c1: "Yes — he gave you the baseline by top-locking."
    - c2: "Clean reset. The layup was there if you cut behind."
    - c3: "He wins that pass every time."
    - c4: "Screen takes too long. Cut now."
13. Best-read explanation: A top-lock in the corner sells the basket. The
    baseline is the cutter's free space.
14. Decoder teaching point: "Top-lock high → baseline low."
15. Self-review checklist
    - Did I see his chest above me?
    - Did I plant the high-side foot?
    - Did I cut hard along the baseline?
    - Did I finish on the rim, not under it?
16. 3D notes
    - Visible: corner defender's top-lock pose; clean baseline.
    - Must read: cutter passes behind defender's blind side.
    - Future overlays: baseline cut-lane arrow, top-lock badge.

## BDW-04 — Flare Denial → Backdoor

3. Decoder tag: `BACKDOOR_WINDOW`
4. Difficulty: 3
5. Main cue: defender jumps the flare screen high, hand and foot in the
   lane, expecting a pop.
6. Game context: side ball-screen action; user is the screener's man's
   nearest off-ball threat. 16 on shot clock.
7. Player setup
   - Offense: ball-handler at right wing (18, 9); screener stepping out
     (5, 14); user on weak-side wing (-18, 9); strong corner (22, 1).
   - Defense: weak-wing defender (x_user) jumped the flare passing lane
     (-12, 11); on-ball; trailing screener defender; corner defender.
   - Ball at right wing.
8. GLB / intent plan
   - User → `BACK_CUT`
   - x_user → `DEFENSIVE_DENY`
   - Ball-handler → `PASS_FOLLOWTHROUGH`
   - Other defenders → `IDLE_READY`
   - Procedural fallback: yes.
9. Freeze moment: defender's hand fully in the flare lane; user's
   shoulders square to the ball.
10. Decision prompt: "He's chasing your flare. What's open?"
11. Choices
    - c1 (best) — Reject the flare and back-cut to the rim.
    - c2 (acceptable) — Continue the flare and re-space.
    - c3 (wrong) — Stand and call for the ball.
    - c4 (wrong) — Set a second screen.
12. Feedback
    - c1: "Yes. He cheated the flare; the basket was open."
    - c2: "Kept spacing — but the layup was there."
    - c3: "He picks that pass off."
    - c4: "Too slow. Punish the cheat now."
13. Best-read explanation: When a defender pre-jumps a screen, the
    counter-cut into vacated space is automatic.
14. Decoder teaching point: "Cheat the screen → cut behind the cheat."
15. Self-review checklist
    - Did I see him jump the screen?
    - Did I plant and reverse?
    - Did I keep the cut tight to the rim?
    - Did I finish without picking up the dribble?
16. 3D notes
    - Visible: defender chasing flare, vacated middle.
    - Must read: user reverses direction and disappears toward the rim.
    - Future overlays: "cheat path" red arrow on defender, green
      counter-cut arrow on user.

## BDW-05 — Help-Side Lift Trap → Backdoor

3. Decoder tag: `BACKDOOR_WINDOW`
4. Difficulty: 3
5. Main cue: user lifts to the wing, defender top-locks the lift instead
   of trailing.
6. Game context: zone-press release into half-court; offense is lifting
   from the corner.
7. Player setup
   - Offense: ball at top slot; user lifting from weak corner (-22, 1) →
     toward (-18, 9); strong-side filled; rim runner short corner (5, 4).
   - Defense: x_user pressing the lift lane (-15, 6); on-ball; help low.
   - Ball at top slot.
8. GLB / intent plan
   - User → `BACK_CUT` (reverse the lift into the rim)
   - x_user → `DEFENSIVE_DENY`
   - Top-slot ball-handler → `PASS_FOLLOWTHROUGH`
   - Procedural fallback: yes.
9. Freeze moment: defender's body cuts off the wing catch; user's outside
   foot is still planted toward the wing.
10. Decision prompt: "He's beating you to the wing. Now what?"
11. Choices
    - c1 (best) — Reverse-cut to the rim along the baseline.
    - c2 (acceptable) — Re-space deep to the corner and re-lift later.
    - c3 (wrong) — Sprint past him to the wing.
    - c4 (wrong) — Pop out to half-court for the ball.
12. Feedback
    - c1: "Smart. He beat you to one spot — you took the other."
    - c2: "Reset works, but the rim was open."
    - c3: "Now he's between you and the ball — you're stuck."
    - c4: "You pulled help, but threw the play away."
13. Best-read explanation: When a defender beats you to your destination,
    your free space is the spot they just left.
14. Decoder teaching point: "If he beats you to the spot, take the spot
    he left."
15. Self-review checklist
    - Did I see him win the wing?
    - Did I reverse without hesitating?
    - Did I cut to the rim, not the corner?
    - Did I keep my hands ready?
16. 3D notes
    - Visible: lift defender's chase angle; vacated baseline.
    - Must read: user reverses direction along the baseline.
    - Future overlays: vacated-zone glow on defender's old spot, reversal
      arrow on user.

---

# Family 2 — EMPTY_SPACE_CUT (5 scenarios)

The decoder cue is identical: defender's eyes leave the off-ball player +
nearby empty floor. The decision is always: **move when the eyes leave.**

Reused intents: `EMPTY_SPACE_CUT` for the cutter, `DEFENSIVE_HELP_TURN` for
the help defender whose head turns, `RECEIVE_READY` for the eventual
catcher, `PASS_FOLLOWTHROUGH` for the passer.

## ESC-01 — Empty Corner Baseline Sneak

3. Decoder tag: `EMPTY_SPACE_CUT`
4. Difficulty: 2
5. Main cue: weak-side defender's head fully turns to the ball; weak-side
   corner is empty.
6. Game context: 4-out 1-in; ball just swung to strong-side wing.
7. Player setup
   - Offense: PG (-3, 20); ball at strong wing (18, 8); strong corner
     (22, 1); user on weak wing (-18, 8); post on strong block (4, 4).
   - Defense: D4 in the gap (-12, 9), head turned to ball; D2 on-ball;
     D5 fronting post; D3 tight corner.
   - Weak-side corner empty.
8. GLB / intent plan
   - User → `EMPTY_SPACE_CUT`
   - D4 → `DEFENSIVE_HELP_TURN`
   - Strong-wing passer → `PASS_FOLLOWTHROUGH`
   - Other spacers / defenders → `IDLE_READY`
   - Procedural fallback: yes.
9. Freeze moment: D4's head reaches peak rotation toward the ball, body
   still pointed at user.
10. Decision prompt: "Your defender just looked away. What do you do?"
11. Choices
    - c1 (best) — Sneak baseline into the empty corner.
    - c2 (acceptable) — Slow drift to the empty corner.
    - c3 (wrong) — Hold the wing.
    - c4 (wrong) — Cut up to the top of the key.
12. Feedback
    - c1: "Smart move. His eyes left, your feet moved."
    - c2: "Right idea. Push off harder next time."
    - c3: "You watched the ball, not the defender."
    - c4: "You cut into his eyes."
13. Best-read explanation: Defenders react to what they see. A head turn
    buys the cutter ~0.5s of free motion into empty space.
14. Decoder teaching point: "When the eyes leave, the feet move."
15. Self-review checklist
    - Did I see his head turn?
    - Did I move on the turn, not after?
    - Did I cut into empty space, not traffic?
    - Did I show my hands on arrival?
16. 3D notes
    - Visible: D4's vision cone, empty corner patch, baseline lane.
    - Must read: head turn precedes the cut by one beat.
    - Future overlays: vision cone, empty-corner floor patch, baseline
      cut-lane arrow.

## ESC-02 — Slot-to-Slot Drift

3. Decoder tag: `EMPTY_SPACE_CUT`
4. Difficulty: 2
5. Main cue: user's defender drops to tag the roll; the slot above is
   empty.
6. Game context: middle ball-screen at the top; user is the spaced shooter
   at the strong-side slot.
7. Player setup
   - Offense: ball-handler attacking middle (0, 14); roller diving from
     (5, 14) → (2, 4); user at strong slot (10, 19); spacers in corners.
   - Defense: user's defender tagging roller (8, 9); on-ball trailing.
   - Ball mid-paint.
8. GLB / intent plan
   - User → `EMPTY_SPACE_CUT` (lift to slot top)
   - User's defender → `DEFENSIVE_HELP_TURN`
   - Ball-handler → `PASS_FOLLOWTHROUGH`
   - Procedural fallback: yes.
9. Freeze moment: tagger's hips fully oriented to the rim; user still on
   the slot.
10. Decision prompt: "Your guy just tagged the roll. What's open?"
11. Choices
    - c1 (best) — Lift to the empty slot for the kick-out three.
    - c2 (acceptable) — Slide one step toward the wing.
    - c3 (wrong) — Stand and shoot from the original slot.
    - c4 (wrong) — Cut to the rim.
12. Feedback
    - c1: "Right. He tagged — you punished."
    - c2: "Half-step better than nothing — full lift is the read."
    - c3: "He recovers in time to contest."
    - c4: "You ran into the roller's lane."
13. Best-read explanation: A tagger's body fully turning rim-ward is the
    same cue as a head turn — relocate to the empty space.
14. Decoder teaching point: "Help on the roll = lift on the kick."
15. Self-review checklist
    - Did I see his hips turn?
    - Did I lift, not stand?
    - Did I keep the corner spaced behind me?
    - Did I catch on balance?
16. 3D notes
    - Visible: tagger's hip rotation; empty slot.
    - Must read: user steps up into vacated air.
    - Future overlays: hip-arrow on tagger, lift-line for user.

## ESC-03 — Skip-Reaction Lift

3. Decoder tag: `EMPTY_SPACE_CUT`
4. Difficulty: 3
5. Main cue: user's defender helped one pass away; ball is skipping back
   over their head.
6. Game context: drive-and-kick to opposite wing in transition.
7. Player setup
   - Offense: weak-wing receiver catching the skip (-18, 9); user one
     pass over at weak corner (-22, 1); driver at right elbow (5, 14).
   - Defense: user's defender (-15, 6) — turned to help on driver; weak
     wing defender out of position.
   - Ball mid-flight from right elbow → weak wing.
8. GLB / intent plan
   - User → `EMPTY_SPACE_CUT` (lift from corner to slot)
   - User's defender → `DEFENSIVE_HELP_TURN` (recovering late)
   - Weak-wing receiver → `RECEIVE_READY`
   - Driver → `PASS_FOLLOWTHROUGH`
   - Procedural fallback: yes.
9. Freeze moment: skip pass at apex; user's defender mid-recovery, head
   tracking the ball.
10. Decision prompt: "Skip's coming over your defender. What now?"
11. Choices
    - c1 (best) — Lift from the corner to the slot for a swing-swing
      catch.
    - c2 (acceptable) — Hold the corner for a second-side kick.
    - c3 (wrong) — Cut into the lane.
    - c4 (wrong) — Drift further to the baseline.
12. Feedback
    - c1: "Yes. Defender's flat-footed, you're moving."
    - c2: "Spacing's fine — you missed the swing."
    - c3: "You cut into traffic the skip just left."
    - c4: "You went out of bounds for no reason."
13. Best-read explanation: A defender caught between two assignments has
    no recovery angle. Move toward the easier catch.
14. Decoder teaching point: "Skip behind = swing in front."
15. Self-review checklist
    - Did I see the skip leave the passer's hand?
    - Did I lift before the catch?
    - Did I keep my distance from the receiver?
    - Did I show my hands?
16. 3D notes
    - Visible: skip pass arc; user's defender flat-footed.
    - Must read: user lifts as ball travels.
    - Future overlays: pass-arc highlight, recovering-defender vector.

## ESC-04 — Drift to the Empty Wing

3. Decoder tag: `EMPTY_SPACE_CUT`
4. Difficulty: 2
5. Main cue: weak-wing defender stunts at a paint touch; user's wing is
   empty.
6. Game context: post catch on the strong block; weak side helped.
7. Player setup
   - Offense: post with ball at strong block (4, 4); user on weak wing
     (-18, 8); strong wing (18, 8); strong corner (22, 1); PG top.
   - Defense: weak-wing defender stunts to (-10, 6); post defender
     fronting; strong wing defender tight.
   - Ball at strong block.
8. GLB / intent plan
   - User → `EMPTY_SPACE_CUT` (drift to deeper wing/slot)
   - Stunting defender → `DEFENSIVE_HELP_TURN`
   - Post → `PASS_FOLLOWTHROUGH`
   - Procedural fallback: yes.
9. Freeze moment: stunting defender's lead foot fully inside the lane.
10. Decision prompt: "He stunted off you. What's the play?"
11. Choices
    - c1 (best) — Drift to the empty wing for the kick-out three.
    - c2 (acceptable) — Hold and call for it on the spot.
    - c3 (wrong) — Cut to the rim.
    - c4 (wrong) — Slide to the slot.
12. Feedback
    - c1: "That's the read. He gave up your spot."
    - c2: "Clean catch — but a half-step over makes it open."
    - c3: "You collided with the post catch."
    - c4: "You moved into a defender."
13. Best-read explanation: A stunt is a temporary commitment — relocating
    one full step makes the recovery impossible.
14. Decoder teaching point: "Stunt away → step away."
15. Self-review checklist
    - Did I see his foot inside the lane?
    - Did I drift one full step?
    - Did I keep my feet ready to shoot?
    - Did I read the help before the catch?
16. 3D notes
    - Visible: stunt foot in lane, empty wing patch.
    - Must read: user drifts before the post turns to pass.
    - Future overlays: stunt-foot marker, drift-line.

## ESC-05 — Empty Side Backdoor Replace

3. Decoder tag: `EMPTY_SPACE_CUT`
4. Difficulty: 3
5. Main cue: a teammate just back-cut from the wing — that wing is now
   empty; user's defender is ball-watching.
6. Game context: secondary action after a backdoor; ball returned to top.
7. Player setup
   - Offense: PG with ball top (0, 19); teammate just finished backdoor
     to rim (4, 2); user on weak slot (-10, 17); other shooters
     spacing.
   - Defense: user's defender ball-watching at (-7, 19); other defenders
     reacting to the backdoor.
   - Ball at top.
8. GLB / intent plan
   - User → `EMPTY_SPACE_CUT` (replace to the vacated wing)
   - User's defender → `DEFENSIVE_HELP_TURN`
   - PG → `PASS_FOLLOWTHROUGH`
   - Backdoor cutter → `IDLE_READY` (already settled)
   - Procedural fallback: yes.
9. Freeze moment: vacated wing visible; user's defender body fully turned
   to the help action.
10. Decision prompt: "Your wing is empty and he's ball-watching. Now?"
11. Choices
    - c1 (best) — Replace into the empty wing for a catch-and-shoot.
    - c2 (acceptable) — Lift to the slot for the swing.
    - c3 (wrong) — Cut to the rim.
    - c4 (wrong) — Stand and call for it.
12. Feedback
    - c1: "Yes. Empty space + ball-watcher = free wing."
    - c2: "Reads the pass, but the wing was the open shot."
    - c3: "Two cutters in the lane is one too many."
    - c4: "You watched the ball, just like he did."
13. Best-read explanation: Replacement keeps spacing, exploits a
    ball-watcher, and gives the offense a second cut on the same
    possession.
14. Decoder teaching point: "When a teammate empties a spot, fill it."
15. Self-review checklist
    - Did I see the wing go empty?
    - Did I replace, not crowd?
    - Did I read my defender's eyes?
    - Was I shot-ready on the catch?
16. 3D notes
    - Visible: vacated wing patch, defender's turned shoulders.
    - Must read: user fills the wing as the cut finishes.
    - Future overlays: replacement arrow, ball-watcher badge.

---

# Family 3 — SKIP_THE_ROTATION (5 scenarios)

The decoder cue is identical: two defenders committed to the paint plus a
weak-side defender stunting/helping in. The decision is always: **skip the
ball over the rotation, opposite the help.**

Reused intents: `PASS_FOLLOWTHROUGH` for the driver/passer, `SHOT_READY`
for the open shooter, `DEFENSIVE_HELP_TURN` for the over-helper, `CLOSEOUT`
for the late-recovering defender, `IDLE_READY` for spacers.

## SKR-01 — Paint Touch Opposite Corner

3. Decoder tag: `SKIP_THE_ROTATION`
4. Difficulty: 4
5. Main cue: 2 in the paint + weak-side corner defender stunting.
6. Game context: 4th quarter, tied; right-wing drive to elbow.
7. Player setup
   - Offense: PG top (0, 19); strong corner (22, 1); weak wing (-18, 8);
     user driver at right elbow (5, 14); weak-corner shooter (-22, 1).
   - Defense: D2 strong corner (21, 3); D3 weak wing (-15, 9); D4
     trailing user (7, 13); D5 stunting from weak corner (-12, 6); D1
     drop coverage (0, 17).
   - Ball with user at elbow.
8. GLB / intent plan
   - User → `PASS_FOLLOWTHROUGH` (skip pass)
   - Weak-corner shooter → `SHOT_READY`
   - D5 → `DEFENSIVE_HELP_TURN`
   - D5 recovery → `CLOSEOUT`
   - Procedural fallback: yes.
9. Freeze moment: both D5 feet inside the paint, D4 right behind user,
   weak corner unmistakably empty.
10. Decision prompt: "Two defenders just collapsed on you. Where's the
    open shooter?"
11. Choices
    - c1 (best) — Skip pass to the weak-side corner.
    - c2 (acceptable) — Pass to the weak-side wing.
    - c3 (wrong) — Force a layup.
    - c4 (wrong) — Kick to the strong-side corner.
12. Feedback
    - c1: "Big read. Behind the rotation = wide open."
    - c2: "Open teammate — corner was even more open."
    - c3: "Two bodies, one shooter."
    - c4: "That defender never helped."
13. Best-read explanation: Defenses collapse by leaving someone — never
    the closest player. The opposite corner is the recovery cost.
14. Decoder teaching point: "Look opposite the help."
15. Self-review checklist
    - Did I see two defenders in the paint?
    - Did I see the weak-side stunt?
    - Did I keep my eyes up before the second dribble?
    - Did I throw the skip on rhythm?
16. 3D notes
    - Visible: paint shading, empty corner patch, recovery distance line.
    - Must read: skip arc clears the help.
    - Future overlays: paint heat, recovery-distance label.

## SKR-02 — Drag Screen Skip

3. Decoder tag: `SKIP_THE_ROTATION`
4. Difficulty: 3
5. Main cue: tagger pulls in to cover the roll; weak-side wing defender
   sinks; opposite corner is the only true help.
6. Game context: transition drag screen on the right wing.
7. Player setup
   - Offense: ball-handler at right slot (10, 17); roller diving (5, 4);
     user on weak corner (-22, 1); strong corner filled; weak wing
     filled.
   - Defense: roller's defender drop; tagger pulled to roller; weak-wing
     defender helping; user's corner defender stunting.
   - Ball at right slot.
8. GLB / intent plan
   - User → `SHOT_READY`
   - Ball-handler → `PASS_FOLLOWTHROUGH`
   - Tagger → `DEFENSIVE_HELP_TURN`
   - Recovering corner defender → `CLOSEOUT`
   - Procedural fallback: yes.
9. Freeze moment: tagger committed to roller; ball-handler ready to pass.
10. Decision prompt: "They tagged the roll. Where's the open man?"
11. Choices
    - c1 (best) — Skip to the weak-side corner shooter (user).
    - c2 (acceptable) — Hit the strong-side wing for a swing.
    - c3 (wrong) — Throw to the roller into the help.
    - c4 (wrong) — Reset to the trailer.
12. Feedback
    - c1: "Yes. Tagger left the corner — corner punishes."
    - c2: "Good ball move. Skip beats it by a step."
    - c3: "You threw into traffic."
    - c4: "Advantage thrown away."
13. Best-read explanation: When help comes from a shooter, that shooter
    is the answer.
14. Decoder teaching point: "Help from a shooter = pass to that shooter."
15. Self-review checklist
    - Did I see who tagged the roll?
    - Did I see who that left open?
    - Did I throw the skip in rhythm?
    - Did I shoot on the catch?
16. 3D notes
    - Visible: tagger's body line, vacated corner.
    - Must read: skip arc to the abandoned corner.
    - Future overlays: tagger glow, vacated-zone patch.

## SKR-03 — Post Touch Skip

3. Decoder tag: `SKIP_THE_ROTATION`
4. Difficulty: 4
5. Main cue: post catch draws double; weak-side corner defender slides
   to bracket.
6. Game context: half-court shell, post entry on strong block.
7. Player setup
   - Offense: post (4, 4) with ball; PG top; user on weak corner
     (-22, 1); strong wing (18, 8); strong corner (22, 1).
   - Defense: post defender fronting; double-team coming from strong
     wing; weak-corner defender slid to (-12, 4); weak-wing defender
     helping in.
   - Ball at strong block.
8. GLB / intent plan
   - Post → `PASS_FOLLOWTHROUGH`
   - User → `SHOT_READY`
   - Bracketing defender → `DEFENSIVE_HELP_TURN`
   - Recovery → `CLOSEOUT`
   - Procedural fallback: yes.
9. Freeze moment: double's hands up on the post; bracket defender both
   feet inside the lane.
10. Decision prompt: "They doubled the post. Who's open?"
11. Choices
    - c1 (best) — Skip from post to the weak-side corner.
    - c2 (acceptable) — Out to the weak-side wing.
    - c3 (wrong) — Force the post move into the double.
    - c4 (wrong) — Kick to the strong-side wing.
12. Feedback
    - c1: "Yes. Bracket leaves the corner — open three."
    - c2: "Open shot — corner was the better one."
    - c3: "Turnover risk."
    - c4: "That defender already came down — closeout's late but the
      shot's lower value."
13. Best-read explanation: Doubles always leave the weak side; the
    bracket defender has the longest recovery.
14. Decoder teaching point: "Double comes → ball goes opposite."
15. Self-review checklist
    - Did I see the double commit?
    - Did I see who came to bracket?
    - Did I skip with the right pass type?
    - Did the corner shoot on the catch?
16. 3D notes
    - Visible: double-team posture, bracket position, empty corner.
    - Must read: skip arc over the double.
    - Future overlays: double-team highlight, bracket arrow.

## SKR-04 — Dribble-At Skip

3. Decoder tag: `SKIP_THE_ROTATION`
4. Difficulty: 3
5. Main cue: ball-handler dribbles at a teammate; that teammate's
   defender slides to help; the opposite corner is empty.
6. Game context: re-organize after a stalled possession.
7. Player setup
   - Offense: ball-handler dribbling at strong wing teammate (toward
     18, 8); user weak corner (-22, 1); other spacers.
   - Defense: strong wing defender steps in to help on the dribble-at;
     weak corner defender drifts middle; on-ball defender trails.
   - Ball mid-floor.
8. GLB / intent plan
   - Ball-handler → `PASS_FOLLOWTHROUGH`
   - User → `SHOT_READY`
   - Helping defender → `DEFENSIVE_HELP_TURN`
   - Procedural fallback: yes.
9. Freeze moment: ball-handler shoulder turn signaling the dribble-at;
   help defender steps in; weak corner defender drifts.
10. Decision prompt: "He's dribbling at you. What's open across the
    floor?"
11. Choices
    - c1 (best) — Skip to the weak-side corner.
    - c2 (acceptable) — Take the hand-off and reject it middle.
    - c3 (wrong) — Take the hand-off and shoot a pull-up.
    - c4 (wrong) — Refuse and stand.
12. Feedback
    - c1: "Smart. Their help left the weak side."
    - c2: "Live read — keeps the advantage moving."
    - c3: "Defender is right there. Tough shot."
    - c4: "Possession dies."
13. Best-read explanation: A dribble-at action stretches the defense —
    the abandoned weak side is the highest-value answer.
14. Decoder teaching point: "Dribble-at draws help → skip across."
15. Self-review checklist
    - Did I see the help defender step in?
    - Did I keep my eyes opposite?
    - Did I throw the skip in rhythm?
    - Did the corner shoot in rhythm?
16. 3D notes
    - Visible: dribble-at angle, help step, abandoned corner.
    - Must read: skip arc across the floor.
    - Future overlays: dribble-at vector, abandonment glow.

## SKR-05 — Baseline Drive Skip

3. Decoder tag: `SKIP_THE_ROTATION`
4. Difficulty: 4
5. Main cue: baseline drive draws low-man and tag-up; weak-side wing
   defender slides to "X-out"; opposite slot is empty.
6. Game context: closeout attack baseline from the right wing.
7. Player setup
   - Offense: driver attacking baseline (toward 22, 0); user spotted up
     at weak slot (-10, 17); strong corner (22, 1); weak wing (-18, 8);
     PG top.
   - Defense: low-man rotates to driver; corner defender tags low; weak
     wing X-outs to corner; weak slot defender drifts.
   - Ball baseline mid-drive.
8. GLB / intent plan
   - Driver → `PASS_FOLLOWTHROUGH`
   - User → `SHOT_READY`
   - X-outing defender → `DEFENSIVE_HELP_TURN`
   - Recovery → `CLOSEOUT`
   - Procedural fallback: yes.
9. Freeze moment: low-man cutting off the rim, X-out defender mid-flight
   to corner, weak slot defender drifted middle.
10. Decision prompt: "Baseline drive — defense is X-ing out. Who's open?"
11. Choices
    - c1 (best) — Skip to the weak-side slot (user).
    - c2 (acceptable) — Kick to the corner (X-out is recovering).
    - c3 (wrong) — Force the layup into the help.
    - c4 (wrong) — Pass behind the back to the strong corner.
12. Feedback
    - c1: "Yes. The slot is the unguarded slot in the X-out."
    - c2: "Defender is closing — slot was earlier."
    - c3: "Wall of bodies."
    - c4: "That defender never moved."
13. Best-read explanation: An X-out leaves the slot exposed because two
    defenders are mid-rotation laterally; the slot has the longest
    recovery.
14. Decoder teaching point: "X-out below = slot above is the answer."
15. Self-review checklist
    - Did I see the low-man rotate?
    - Did I see the X-out start?
    - Did I find the slot, not the corner?
    - Did the slot shoot on the catch?
16. 3D notes
    - Visible: baseline drive line, X-out arrows, empty slot.
    - Must read: skip pass over the X-out.
    - Future overlays: X-out trace, slot patch.

---

# Family 4 — ADVANTAGE_OR_RESET (5 scenarios)

The decoder cue is identical: a defender's feet/balance describe whether the
catch is a real advantage or not (parallel/forward = go now; squared/balanced
= reset). Decision: **read the feet, then attack or reset.**

Reused intents: `RECEIVE_READY` at catch; one of {`JAB_OR_RIP`, `SHOT_READY`,
`RESET_HOLD`} per branch; `CLOSEOUT` for the closeout defender; `SLIDE_RECOVER`
for the helper.

## AOR-01 — No Gap, Go Now

3. Decoder tag: `ADVANTAGE_OR_RESET`
4. Difficulty: 3
5. Main cue: closeout defender's feet parallel + forward momentum.
6. Game context: 3rd quarter, down 4, swing pass to right wing.
7. Player setup
   - Offense: PG top; left wing (-18, 8); left corner (-22, 1); user
     right wing (18, 8); right corner (22, 1).
   - Defense: D4 closing out (16, 9), parallel feet; D1 drop on PG; D2
     trailing previous handler; D3, D5 tight.
   - Ball arriving at user.
8. GLB / intent plan
   - User → `RECEIVE_READY` at catch → `JAB_OR_RIP` on attack
   - D4 → `CLOSEOUT`
   - Helping defender → `SLIDE_RECOVER`
   - Procedural fallback: yes.
9. Freeze moment: ball lands in user's hands; D4 two feet away with
   parallel feet, momentum forward.
10. Decision prompt: "He flew at you. No gap to shoot. What do you do?"
11. Choices
    - c1 (best) — Rip and drive past the lead foot.
    - c2 (acceptable) — Sweep dribble baseline.
    - c3 (wrong) — Shoot a contested three.
    - c4 (wrong) — Reset to the top.
12. Feedback
    - c1: "His feet were flat — one dribble and you're past."
    - c2: "Good attack. Rip-through is half a beat faster."
    - c3: "Hand in your face."
    - c4: "Wasted advantage."
13. Best-read explanation: Parallel-feet closeouts cannot reverse
    direction; one explosive dribble beats them.
14. Decoder teaching point: "Flat feet = go."
15. Self-review checklist
    - Did I see his feet?
    - Did I rip the ball low?
    - Did I attack the lead foot?
    - Did I keep my eyes up for help?
16. 3D notes
    - Visible: defender's parallel feet, empty lane.
    - Must read: defender stuck, user already past.
    - Future overlays: foot markers, momentum arrow.

## AOR-02 — Square Stance, Reset

3. Decoder tag: `ADVANTAGE_OR_RESET`
4. Difficulty: 2
5. Main cue: defender squared up, balanced stance, hand high — no
   advantage.
6. Game context: same swing-pass setup as AOR-01, but the closeout was
   under control.
7. Player setup
   - Offense: as AOR-01.
   - Defense: D4 in a balanced stance at (16, 10), feet staggered, hand
     up.
   - Ball arriving at user.
8. GLB / intent plan
   - User → `RECEIVE_READY` → `RESET_HOLD` on choice
   - D4 → `CLOSEOUT` decelerated → `IDLE_READY`
   - Procedural fallback: yes.
9. Freeze moment: catch frame; D4 set, balanced.
10. Decision prompt: "His feet are set. What now?"
11. Choices
    - c1 (best) — Reset and re-screen / swing the ball.
    - c2 (acceptable) — Rip-through and probe.
    - c3 (wrong) — Force a contested three.
    - c4 (wrong) — Drive into a balanced defender.
12. Feedback
    - c1: "Right read. No advantage — keep the action alive."
    - c2: "Probe is okay; advantage isn't there."
    - c3: "Hand in your face for nothing."
    - c4: "He slides with you."
13. Best-read explanation: Reset is part of the decoder; not every catch
    is a green light.
14. Decoder teaching point: "Set feet = swing the ball."
15. Self-review checklist
    - Did I look at his feet?
    - Did I keep the ball moving?
    - Did I avoid the contested attack?
    - Did I keep team spacing?
16. 3D notes
    - Visible: balanced stance, no driving lane.
    - Must read: ball returns to flow, action restarts.
    - Future overlays: balanced-stance badge, ball-flow arrow.

## AOR-03 — Late Closeout — Catch and Shoot

3. Decoder tag: `ADVANTAGE_OR_RESET`
4. Difficulty: 2
5. Main cue: closeout is late and short, defender outside arms-length on
   catch.
6. Game context: kick from baseline drive to right wing.
7. Player setup
   - Offense: driver at baseline; user catching on right wing (18, 8);
     spacers filled.
   - Defense: D4 closing late — at (15, 11), still 4 feet away at catch.
   - Ball arriving at user.
8. GLB / intent plan
   - User → `RECEIVE_READY` → `SHOT_READY`
   - D4 → `CLOSEOUT`
   - Procedural fallback: yes.
9. Freeze moment: ball hits hands; D4 still mid-stride, ~4ft away.
10. Decision prompt: "He's late. What do you do?"
11. Choices
    - c1 (best) — Catch and shoot in rhythm.
    - c2 (acceptable) — Shot fake and one-dribble pull-up.
    - c3 (wrong) — Hold and reset.
    - c4 (wrong) — Drive into a recovering defender.
12. Feedback
    - c1: "Yes. Open shot is the advantage."
    - c2: "You took the air. Open three was simpler."
    - c3: "Wasted look."
    - c4: "He recovers into the drive."
13. Best-read explanation: Late closeouts give space — the highest-value
    answer is the rhythm three, not a fancier counter.
14. Decoder teaching point: "Late and short = let it fly."
15. Self-review checklist
    - Did I see how far away he was?
    - Was I shot-ready before the catch?
    - Did I rise on rhythm?
    - Did I hold my follow-through?
16. 3D notes
    - Visible: 4-foot gap, defender's late stride.
    - Must read: shot leaves before defender arrives.
    - Future overlays: distance label, shot arc.

## AOR-04 — Hard Closeout, Pump → Drive

3. Decoder tag: `ADVANTAGE_OR_RESET`
4. Difficulty: 3
5. Main cue: closeout defender high — chest tilted, hand up, weight on
   the back foot.
6. Game context: kick to corner from a paint touch.
7. Player setup
   - Offense: user in right corner (22, 1); driver kicking out from the
     paint (5, 4); spacers in slots.
   - Defense: D4 closing out high (20, 3), chest tilted, weight back.
   - Ball arriving at user.
8. GLB / intent plan
   - User → `RECEIVE_READY` → `JAB_OR_RIP` (pump-and-go)
   - D4 → `CLOSEOUT`
   - Helper → `SLIDE_RECOVER`
   - Procedural fallback: yes.
9. Freeze moment: defender's chest tilted forward, weight on the back
   foot, eyes high on the ball.
10. Decision prompt: "He's high and tilted. What now?"
11. Choices
    - c1 (best) — Pump fake, then one-dribble drive baseline.
    - c2 (acceptable) — Sweep middle and attack.
    - c3 (wrong) — Force the contested corner three.
    - c4 (wrong) — Reset to the wing.
12. Feedback
    - c1: "Yes. He bit the fake."
    - c2: "Live attack works — baseline was cleaner."
    - c3: "Hand right at the ball."
    - c4: "You had a lane."
13. Best-read explanation: A high closeout invites a fake — the
    follow-through is a clean one-dribble pull or layup.
14. Decoder teaching point: "High closeout = fake first."
15. Self-review checklist
    - Did I see his chest tilt?
    - Did I sell the fake?
    - Did I drive baseline, not into help?
    - Did I gather on balance?
16. 3D notes
    - Visible: chest tilt, weight on back foot, baseline lane.
    - Must read: fake → drive sequence in one motion.
    - Future overlays: tilt-arrow, baseline cut-lane.

## AOR-05 — Tag Recovery — Drive or Reset

3. Decoder tag: `ADVANTAGE_OR_RESET`
4. Difficulty: 3
5. Main cue: defender recovering from a tag — body sideways, lead foot
   pointed at the ball, momentum lateral.
6. Game context: skip pass to weak side after a paint touch; closeout
   comes from a recovering tagger.
7. Player setup
   - Offense: user catching on weak wing (-18, 8); driver who pulled
     help; weak corner shooter (-22, 1).
   - Defense: D_user recovering from tag (-13, 7), turned sideways,
     momentum still lateral.
   - Ball arriving at user.
8. GLB / intent plan
   - User → `RECEIVE_READY` → `JAB_OR_RIP` (drive middle)
     OR `RESET_HOLD` if the recovery is clean (branch on cue)
   - D_user → `CLOSEOUT` (sideways recovery)
   - Procedural fallback: yes.
9. Freeze moment: defender's sideways body, lead foot pointed at the
   ball.
10. Decision prompt: "His body is turned. What's the read?"
11. Choices
    - c1 (best) — Rip middle past the open hip.
    - c2 (acceptable) — Swing once more to the corner.
    - c3 (wrong) — Force a step-back three over a sideways defender.
    - c4 (wrong) — Hold and stare — let him recover.
12. Feedback
    - c1: "Yes. Open hip = drive that side."
    - c2: "Smart ball move. Drive was cleaner."
    - c3: "He could still contest from the side."
    - c4: "You let him reset."
13. Best-read explanation: A sideways defender has one open hip; that
    hip is the drive direction.
14. Decoder teaching point: "Sideways body → attack the open hip."
15. Self-review checklist
    - Did I see his hips?
    - Did I rip toward the open side?
    - Did I keep the dribble alive?
    - Did I read help one pass away?
16. 3D notes
    - Visible: sideways body, open hip, paint partially open.
    - Must read: user explodes past the open side.
    - Future overlays: hip-arrow, open-side highlight.

---

# Implementation Notes for Later

This section is **only** a forward-looking map for engineers. Do not
implement during the planning pass.

## How these scenarios should land in code

1. **Seed JSON files**
   - Each scenario above becomes one JSON file in
     `packages/db/seed/scenarios/packs/founder-v0/<ID>.json` matching the
     existing schema used by `BDW-01.json`, `ESC-01.json`, `SKR-01.json`,
     `AOR-01.json`.
   - The pack manifest at
     `packages/db/seed/scenarios/packs/founder-v0/pack.json` should list
     all 20 IDs in difficulty-ascending order per family.
   - No new schema fields are needed.

2. **Scenario.scene JSON**
   - The `scene` block per scenario is authored in the same shape used
     today: `players[]`, `ball`, `movements[]`, `freezeMarker`,
     `answerDemo`, `wrongDemos`, `preAnswerOverlays`,
     `postAnswerOverlays`.
   - Each `players[]` entry uses `team`, `role`, `start`, `isUser`,
     `hasBall`. Roles should match strings the existing
     `deriveDecoderRole()` already understands (see
     `apps/web/lib/scenario3d/animationIntent.ts`). Net-new role strings
     should only be added when an existing one cannot describe the
     player; if added, extend `deriveDecoderRole` once and reuse
     across the pack.
   - Movement `kind` values are restricted to the set the engine knows
     (`cut`, `back_cut`, `baseline_sneak`, `pass`, `skip_pass`, `drive`,
     `closeout`, `rotation`, `lift`, `drift`, `jab`, `rip`, `stop_ball`).
     Do **not** invent new kinds for these scenarios.

3. **ScenarioChoice rows**
   - Four `choices` per scenario, each with `id`, `label`, `quality`
     (`best | acceptable | wrong`), `feedback_text`,
     `partial_feedback_text` (for `acceptable`), and `order`.
   - `is_correct` (or its v2 equivalent) is true only for the `best`
     row; `acceptable` and both `wrong` rows are false.

4. **GLB / animationIntent integration**
   - Each scenario above lists per-player intents drawn **only from the
     12 already-defined `AnimationIntent` values**. No new intent
     constant is required.
   - The renderer continues to derive intents via
     `getDecoderAnimationIntent` (decoder + role) or
     `getMovementKindIntent` (movement + team); scenario JSON does not
     need to store intents directly. Authors should pick role strings
     and movement kinds that resolve to the intended intent through the
     existing tables — that is the data-driven contract.
   - Clip resolution stays inside `resolveGlbClipForIntent` and respects
     the `importedCloseoutActive` / `importedBackCutActive` flags. None
     of the 20 scenarios depend on a new clip; they all degrade
     gracefully through the existing fallback ladder.
   - **No per-scenario GLB asset is added.** All 20 scenarios share the
     athlete rig and the existing motion clip set.

5. **2D fallback parity**
   - Because everything funnels through scenario JSON + scene JSON, the
     2D renderer needs no per-scenario code. It will pick up each new
     scenario as soon as the seed file lands, using the same player
     positions and movements.

6. **Authoring & QA cadence**
   - Recommend authoring all 5 scenarios in a family in one PR so the
     decoder cue stays consistent across the family.
   - For each scenario, re-run the existing `scenario-qa-checklist.md`
     and `scenario-readability-checklist.md` passes before flipping
     `status` from `DRAFT` to `LIVE`.
   - Render-tier should stay at `1` for the founder-v0 pack; any
     "premium" overlays sit in `postAnswerOverlays` only.

7. **Out of scope for this plan**
   - The current GLB production rendering bug.
   - Any new animation clip imports.
   - Any new decoder family beyond the four listed.
   - Schema migrations.

The intent is that an engineer picking up implementation can take any of
the 20 entries above and produce a seed file mechanically — no new
engine work, no new assets, no new abstractions. Shared GLB athlete +
shared motion clips + scenario JSON = 20 scenarios.
