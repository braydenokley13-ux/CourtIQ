# CourtIQ Decoder Scenarios

Design specs for the 3D film-room decision scenarios.

---

## ESC-01

**Title:** Empty Corner Baseline Sneak

**Decoder / Principle:** The Empty-Space Cut — when a defender's eyes leave you, cut into the open space behind them.

**Difficulty:** 2 / 5 (early intermediate)

**Player Role:** Weak-side wing (off-ball cutter)

**Game Context:** 2nd quarter, score is even. Half-court offense, your team just swung the ball to the strong-side wing. Shot clock is not a factor. You don't have the ball — but the play is about to come to you if you make the right move.

**Possession Setup:**
- Formation: 4-out, 1-in.
- Ball is on the strong-side wing after a swing pass.
- Strong-side corner is filled by a teammate.
- The post player is on the strong-side block.
- You (the user) are on the weak-side wing.
- The weak-side corner is **empty** — no teammate there, no defender camped there.
- Your defender is the weak-side wing defender, "in the gap" between you and the ball, eyes drifting toward the ball-handler.

**Decision Moment:** The play freezes the instant your defender's head fully turns toward the ball. Their chest is still pointed at you, but their eyes are gone. The baseline path between you and the empty corner is wide open.

**Visible Cue:**
- Defender's head has rotated ~90° toward the ball.
- Defender's lead foot is "pointed" at the ball, not at you.
- The weak-side corner is empty — no body, no shadow.
- The baseline lane (you → empty corner) is clean.

**Question Prompt:** "Your defender just looked away. What do you do?"

**Best Read:** Sneak baseline into the empty corner. Stay low, move fast, and call for the ball as you arrive.

**Acceptable Reads:**
- Slow baseline drift to the empty corner (gets there late but still gets a clean catch).
- A quick "shake" toward the wing first, then baseline cut (sells it harder, same destination).

**Bad Reads:**
- Stand still and hold your spot (kills the empty space).
- Cut up to the top of the key (cuts toward your defender's eyes, not behind them).
- Run all the way under the rim (drags the help defender into the corner you wanted).

**Common Miss Reason:** Players watch the ball instead of the defender. They wait to be passed to instead of moving when the defender's eyes leave them. The empty corner closes in 1 second.

**Why the Best Read Works:** Defenders can only react to what they're looking at. The instant their head turns, you have a free half-second of motion before they can recover. The empty corner means there's no second defender close enough to switch onto you — the space stays open all the way to the catch.

**Lesson Connection:** Decoder 1 — *The Empty-Space Cut*. The cue here is **head turn + empty space**. Same cue, every time, in every scenario.

**One-Sentence Teaching Point:** "When the eyes leave, the feet move."

### 3D Court Setup

Coordinates in feet, origin at rim center, +x = right sideline, +z = toward half-court. Strong side = right.

| ID | Role | x | z | Notes |
| --- | --- | --- | --- | --- |
| O1 | Point guard (just passed) | -3 | 20 | Above the key, drifting left |
| O2 | Strong-side wing — **has ball** | 18 | 8 | Just caught the swing |
| O3 | Strong-side corner | 22 | 1 | Spaced, ready to shoot |
| **O4** | **You — weak-side wing** | -18 | 8 | The user marker |
| O5 | Post | 4 | 4 | Strong-side block |
| — | (weak-side corner) | -22 | 1 | **EMPTY** — no offensive player |
| D1 | On O1 | -3 | 17 | Slight drop, ball-watching |
| D2 | On O2 (ball) | 17 | 9 | On-ball, hand high |
| D3 | On O3 | 22 | 3 | Tight on the corner shooter |
| **D4** | **On you (O4)** | -12 | 9 | "In the gap" — head turned to ball |
| D5 | On O5 | 4 | 6 | High-side fronting the post |

### Camera Angle

**Primary cam:** Behind-the-user, slightly elevated.
- Position: ~ (-22, 14, 6) — looking from the weak-side baseline corner up toward the basket and the ball.
- The user sees their own back-left shoulder, their defender D4 in front-left, and the empty corner is in the lower-right of the frame.
- This angle is critical: it puts the **empty space and D4's head turn in the same shot**, so the read is visible without rotating the camera.

**Secondary cam (replay only):** Overhead 3/4 from above the strong-side wing — used only during the post-decision review so the player can see the full court geometry.

### Freeze-Frame Moment

The play runs for ~2.0 seconds:
1. PG passes from top to strong-side wing (O1 → O2). Ball flight ~0.6s.
2. O2 catches and squares up (~0.4s).
3. D4's head rotates toward the catch (~0.5s).
4. **FREEZE** at 1.5s — the exact frame where D4's head reaches its peak rotation toward the ball, before D4 can re-find you.

The empty corner, the head turn, and the open baseline lane must all be inside the frame at the freeze.

### Timeline A — Best Read (Baseline Sneak)

| t | What you do | What the defense does | Result |
| --- | --- | --- | --- |
| 0.0s | Plant outside foot, push off toward baseline | D4 still has head on the ball | You gain a half-step |
| 0.4s | Sprint along the baseline at ~3-foot depth | D4's head snaps back, body tries to chase | You're past D4's hip |
| 0.8s | Arrive at empty corner (-22, 1), low and ready | D4 trailing by 4 feet; D5 still glued to post | You are wide open |
| 1.0s | O2 fires the skip pass | D3 closes out late from strong corner | Catch is clean |
| 1.4s | Catch and rise / shot-ready | D4 still recovering | Open corner three or one-dribble closeout attack |

**Outcome:** Catch-and-shoot 3 or a clean drive against a hard closeout. High-quality possession.

### Timeline B — Wrong Read (Stand Still / Wait For Pass)

| t | What you do | What the defense does | Result |
| --- | --- | --- | --- |
| 0.0s | Stay on the weak-side wing, hands ready | D4's head is still on the ball | Empty corner is still open — but you didn't move |
| 0.5s | Call for the ball, feet still planted | D4 re-finds you, shifts back into stance | Window starts closing |
| 1.0s | O2 hesitates — no obvious pass | D2 pressures O2; D4 fully recovered | Empty space gone |
| 1.5s | O2 forces a swing back to the top | Whole defense resets | Possession restarts at 0 advantage |
| 2.0s+ | Late shot-clock heave or turnover risk | Defense in shape | Bad possession |

**Outcome:** Wasted opportunity. The cue was there for ~0.5 seconds and you didn't move. The "right play" expired.

### Overlays (toggle in the freeze view)

| Overlay | Show | Color / style |
| --- | --- | --- |
| Vision cone — D4 | Cone from D4's head, ~60° wide, pointed at the ball | Translucent yellow |
| Defender hips/feet — D4 | Arrow from D4's pelvis showing hip orientation | Cyan arrow |
| Open space highlight | The empty weak-side corner zone (-22 ± 3, 1 ± 3) | Soft green floor patch |
| Cut lane (best) | Curved arrow from O4 along the baseline to the empty corner | Bright green dashed |
| Passing lane | Skip pass arc from O2 to the empty corner landing spot | White arc, animated |
| Help-defender highlight (none) | — | Not used here; D5 is locked on the post |
| Bad-cut lane | Straight line from O4 up to the top of the key | Red dashed (only shown after a wrong answer) |

All overlays must clear after 1.2s into Timeline A so the player can see the clean catch.

### Feedback Text

**Correct (best read — baseline sneak):**
> "Smart move. His eyes left, your feet moved. That's the whole decoder."

**Partial (acceptable read — slow drift / shake-then-go):**
> "Right idea — you used the empty corner. Next time push off harder the moment his head turns; you'll get there a half-second sooner."

**Wrong (stand still / cut up / cut under rim):**
> "Watch his head, not the ball. The second his eyes left you, the corner was free. You either stayed put or cut into traffic — both close the window. Try it again, and look for the head turn."

---

## AOR-01

**Title:** No Gap Go Now

**Decoder / Principle:** Advantage or Reset — every catch is a decision. A hard closeout with no shooting gap **is** the advantage. Drive it now or you lose it.

**Difficulty:** 3 / 5 (intermediate — requires reading feet, not just space)

**Player Role:** Wing scorer (on-ball, just caught a swing pass)

**Game Context:** 3rd quarter, your team is down 4. The ball just swung from one wing to the other. You're catching the pass on the right wing with your defender flying at you. You have to make a decision the instant the ball hits your hands.

**Possession Setup:**
- Formation: 5-out (no post — keeps the lane wide open).
- Top of the key: PG who just made the swing pass.
- Strong-side (left) corner: a teammate spaced and ready.
- Weak-side wing & weak-side corner: two more teammates, spaced.
- You (the user) are on the **right wing**, just catching the pass.
- Your defender was helping one pass away and is now sprinting at you to closeout.
- The lane is empty — no rim protector, no help defender low.

**Decision Moment:** The play freezes the instant the ball lands in your hands. Your defender is two feet away, chest-to-chest, **feet parallel and close together**, hips squared, momentum still moving forward. There is **no gap to shoot** — but there is no way they can change direction either.

**Visible Cue:**
- Defender's feet: parallel, narrow stance, both heels on the ground.
- Defender's hips: square to you (not turned, not staggered).
- Defender's head: high, eyes on the ball.
- Their forward momentum is still carrying into the catch.
- The lane behind them is empty.

**Question Prompt:** "He flew at you. No gap to shoot. What do you do?"

**Best Read:** Rip and drive — one hard dribble past their lead foot, attack the empty lane immediately. Their parallel feet can't change direction in time.

**Acceptable Reads:**
- Sweep dribble across the body to attack baseline (slightly slower but same idea — uses their forward momentum).
- Shot fake then drive (only if you're certain — the fake adds a beat that lets feet recover).

**Bad Reads:**
- Shoot a contested 3 (no gap, hand in face — low percentage).
- Hold and reset to swing (advantage was *real*; you wasted it).
- Pump fake and stand (their feet are flat, they're not jumping; you just hand the advantage back).

**Common Miss Reason:** Players think "no gap to shoot = no advantage." They reset the ball. But a closeout with parallel feet is one of the biggest advantages in basketball — the defender literally can't slide. The window is ~0.4 seconds.

**Why the Best Read Works:** A defender flying forward with parallel feet is **stuck in their momentum**. To stop you, they need to drop a foot back and turn their hips — that takes a half-second. One hard dribble past their lead foot beats them every time, and the lane behind them is empty.

**Lesson Connection:** Decoder 2 — *Advantage or Reset*. The cue here is **parallel feet + forward momentum**. Same cue, every closeout, every time.

**One-Sentence Teaching Point:** "If his feet are flat and square, you go — right now."

### 3D Court Setup

Coordinates in feet, origin at rim, +x = right sideline, +z = toward half-court. Ball is on the **right wing**.

| ID | Role | x | z | Notes |
| --- | --- | --- | --- | --- |
| O1 | PG | 0 | 19 | Top of the key |
| O2 | Left wing — just made the swing pass | -18 | 8 | Pass complete, ball-watching |
| O3 | Left corner | -22 | 1 | Spaced |
| **O4** | **You — right wing, catching ball** | 18 | 8 | The user marker |
| O5 | Right corner | 22 | 1 | Spaced behind you |
| D1 | On O1 | 0 | 17 | Drop coverage |
| D2 | On O2 | -17 | 9 | Tight on the previous ball-handler |
| D3 | On O3 | -21 | 3 | Tight on left corner |
| **D4** | **On you — closing out** | 16 | 9 | **Parallel feet, forward momentum, ~2ft from O4** |
| D5 | On O5 | 21 | 3 | Tight on right corner |

### Camera Angle

**Primary cam:** Over-the-shoulder of the user, slight downward tilt toward the defender's feet.
- Position: ~ (24, 6, 12) — looking from behind/right of O4 toward D4 and the rim.
- The user sees the **defender's feet, hips, and the empty lane** in the same shot.
- Critical because the cue is **feet** — the camera must show the floor.

**Secondary cam (replay only):** Side-on from half-court — used to show D4's parallel-feet stance and forward lean clearly.

### Freeze-Frame Moment

The play runs for ~1.6 seconds:
1. O2 catches a swing on the left wing (~0.3s).
2. O2 immediately swings to PG → PG to O4 (right wing). Ball flight ~0.7s total.
3. D4 reads the pass and sprints to closeout (~0.5s of motion).
4. **FREEZE** at 1.5s — the ball just hit O4's hands; D4 is two feet away with parallel feet, momentum still forward.

Defender's feet, your hands, and the empty lane behind D4 must all be visible at the freeze.

### Timeline A — Best Read (Rip and Drive)

| t | What you do | What the defense does | Result |
| --- | --- | --- | --- |
| 0.0s | Catch, rip ball low across body, push off back foot | D4 still flying forward, parallel feet | You're already moving |
| 0.3s | First dribble past D4's lead foot, attacking middle | D4 tries to drop a foot back — too late, you're past their hip | Blow-by |
| 0.6s | Second dribble into the paint | D1 has to leave PG to help; D5 stays on right corner | Lane is open |
| 1.0s | Gather at the elbow, rim attack | D1 contesting late | Layup or kick to weak-side corner |

**Outcome:** Layup or a 2-on-1 advantage with the help defender pulling off another shooter. Best-case basketball.

### Timeline B — Wrong Read (Force the Shot)

| t | What you do | What the defense does | Result |
| --- | --- | --- | --- |
| 0.0s | Catch, rise into the shot | D4 right on top of you, parallel feet but high hand | Hand in your face |
| 0.3s | Release | D4 contests at the rim of the ball | Bad mechanics, off-balance |
| 0.6s | Ball flight | D4 lands and crashes the board | Likely miss |
| 0.8s | Long rebound | Defense secures the ball | Possession lost |

**Outcome:** Contested 3 → miss → fast break the other way. The advantage was real; you wasted it on a low-percentage shot.

### Overlays (toggle in the freeze view)

| Overlay | Show | Color / style |
| --- | --- | --- |
| Defender hips/feet — D4 | Two foot-shaped markers under D4 with a line showing the parallel stance | Bright cyan |
| Momentum arrow — D4 | Arrow from D4's chest pointing forward (the direction they can't reverse) | Yellow arrow |
| Vision cone — D4 | Cone from D4's head pointed at the ball/your hands | Translucent yellow |
| Open space highlight | The lane behind D4 (right elbow → rim) | Soft green floor patch |
| Drive lane (best) | Curved arrow from O4 around D4's lead foot to the rim | Bright green dashed |
| Closeout vector | Arrow showing D4's path *into* the closeout (history) | White, fading |
| Bad shot indicator | Red "X" hovering above the ball when the shoot option is hovered | Red (only on hover) |

Floor markers under D4's feet are the signature visual: they make the parallel-feet cue impossible to miss.

### Feedback Text

**Correct (best read — rip and drive):**
> "That's it. His feet were flat — there was nowhere for him to go. One dribble and you're past."

**Partial (acceptable read — sweep baseline / shot fake then drive):**
> "Good attack. You read his momentum and used it. Next time, the rip-through to the middle gets you there a beat faster — but this works."

**Wrong (shot / reset / pump fake):**
> "His hand was in your face — that's not your shot. The closeout *was* the advantage: parallel feet, forward momentum. Next rep, look at his feet the second you catch — if they're flat, you go."

---

## SKR-01

**Title:** Paint Touch Opposite Corner

**Decoder / Principle:** Skip the Rotation — when two defenders are committed in the paint, someone is open behind the rotation. Skip the pass instead of kicking to the nearest player.

**Difficulty:** 4 / 5 (advanced — requires reading two defenders at once and trusting the skip)

**Player Role:** Driver (you have the ball, attacking the paint off a wing)

**Game Context:** 4th quarter, score is tied. You drove past your defender on the right wing and you're at the elbow with momentum. The defense is collapsing on you.

**Possession Setup:**
- Formation: 4-out, 1-in (post starts on the strong-side block, then lifts).
- You (the user) just blew by your wing defender on the right.
- Your original defender is trailing behind your right hip.
- The post defender has stepped up to cut off your drive at the elbow — that's the **second** body in the paint.
- Strong-side (right) corner: a teammate, defender still tight on them.
- Weak-side (left) wing: a teammate at -18, 8.
- **Weak-side (left) corner: a shooter, and their defender has stepped one big step toward the paint to "stunt"** — they are now too far away to contest a corner shot.
- Top of the key: a teammate (the original passer).

**Decision Moment:** The play freezes the instant your second dribble lands at the elbow. Two defenders are clearly committed in the paint (original defender behind, big help in front). The weak-side corner shooter's defender is mid-stunt — both feet inside the lane line, body leaning toward you.

**Visible Cue:**
- **Two defenders in the paint** between you and the rim.
- **Weak-side corner defender stunting** — both feet inside the paint, eyes on you, body angled away from their own player.
- The weak-side corner is wide open — visibly so.
- Strong-side corner defender is *still* glued to the strong corner (they did NOT help — only the weak-side stunted).

**Question Prompt:** "Two defenders just collapsed on you. Where's the open shooter?"

**Best Read:** Skip pass (one-handed, over the top) to the **opposite (weak-side) corner** shooter. The weak-side corner defender is too far from their player to recover in time.

**Acceptable Reads:**
- Pass to the weak-side wing (left wing) — open, but not as open as the corner; the wing defender can recover faster.
- Step-back jumper at the elbow (only if you can't see the skip — the help is committed, so the elbow may be open enough; but it's the lower-value read here).

**Bad Reads:**
- Force a layup through both defenders (charge or block).
- Kick to the strong-side corner (their defender never helped — they're still right there).
- Pass back to the top (resets the offense; throws away the advantage).

**Common Miss Reason:** Players see "two defenders collapsing" and panic. Their eyes go to the closest teammate (top of key or strong-side corner). But "closest" is also the most defended — those defenders never had to leave. The open shooter is always **opposite the rotation**.

**Why the Best Read Works:** The defense can only collapse by leaving someone. The player who got left is **never** the closest one to the ball — that defender didn't move. It's always the player on the **opposite side**, behind the help. The skip pass is longer through the air than a kick-out, but the recovery distance for the defender is much longer too — so it's actually a higher-value pass.

**Lesson Connection:** Decoder 3 — *Skip the Rotation*. The cue here is **2 in the paint + a stunting weak-side defender**. Same cue, every drive-and-kick.

**One-Sentence Teaching Point:** "Look opposite the help. The shooter you can't see first is the one who's open."

### 3D Court Setup

Coordinates in feet, origin at rim, +x = right, +z = toward half-court. You are driving from the **right wing** to the **right elbow**.

| ID | Role | x | z | Notes |
| --- | --- | --- | --- | --- |
| O1 | PG | 0 | 19 | Top — original passer |
| O2 | Strong-side (right) corner | 22 | 1 | Spaced — defender stayed |
| O3 | Weak-side (left) wing | -18 | 8 | Spaced — defender stayed |
| **O4** | **You — driver at elbow** | 5 | 14 | At freeze; originally at (18, 8) |
| O5 | **Weak-side corner shooter — OPEN** | -22 | 1 | The skip target |
| D1 | On O1 | 0 | 17 | Drop, ball-watching |
| D2 | On O2 | 21 | 3 | Tight on strong corner — **never helped** |
| D3 | On O3 | -15 | 9 | Ball-watching, still on their player |
| D4 | Trailing you | 7 | 13 | **First body in paint** — behind your hip |
| **D5** | **Stunting from weak corner** | -12 | 6 | **Second body in paint** — left O5 to over-help |

### Camera Angle

**Primary cam:** Elevated "driver POV" — slightly behind and over the right shoulder of O4, tilted slightly down so the entire weak-side floor is visible.
- Position: ~ (12, 12, 18) — behind/right of O4 looking diagonally toward the weak-side corner.
- Critical: this is the first scenario where the user must **see across the whole court**. Camera framing must include both the paint (D4 + D5) AND the weak-side corner (O5 alone) in the same shot.
- The whole story has to fit on one screen: 2 in the paint, 1 open corner.

**Secondary cam (replay only):** Top-down 3/4 from the strong-side corner — confirms the geometry of "two in the paint, one open opposite."

### Freeze-Frame Moment

The play runs for ~2.4 seconds:
1. O4 catches on the right wing (~0.3s).
2. O4 rips and beats their defender D4 with one dribble (~0.5s).
3. Second dribble, attacking the elbow (~0.4s).
4. As O4 crosses the elbow, D5 stunts hard from the weak corner; D4 trails in O4's right-rear.
5. **FREEZE** at 1.5s — both feet of D5 are inside the paint, D4 is right behind O4, and the weak corner is unmistakably empty.

The freeze must clearly show: D4 + D5 = two paint bodies; O5 alone in the weak corner; no defender in the skip-pass arc above ~10 ft of air.

### Timeline A — Best Read (Skip to Opposite Corner)

| t | What you do | What the defense does | Result |
| --- | --- | --- | --- |
| 0.0s | Stop on two feet at the elbow, eyes up | D4 + D5 collapse on you | Two-on-one in the paint against you |
| 0.3s | Step-through fake toward rim with eyes | D5 commits one more inch into the paint | The window opens fully |
| 0.5s | One-handed skip pass over the top | D5 starts to recover — too far | Pass on its way |
| 1.0s | O5 catches in rhythm | D5 sprinting back to corner | Recovery distance ~16 ft |
| 1.4s | O5 rises and shoots | D5 contests with hand up but late | Open or near-open three |

**Outcome:** A clean (or barely contested) corner three. The highest-value shot in the half-court.

### Timeline B — Wrong Read (Force the Layup or Kick to Strong Side)

#### B1 — Force the layup
| t | What you do | What the defense does | Result |
| --- | --- | --- | --- |
| 0.0s | Lower shoulder, attack the rim | D4 closes from behind, D5 walls up | Two bodies collide with you |
| 0.4s | Forced floater / contested layup | Both defenders contest | Block, charge, or tough miss |

#### B2 — Kick to strong-side corner
| t | What you do | What the defense does | Result |
| --- | --- | --- | --- |
| 0.0s | Pass to strong (right) corner — O2 | D2 was tight on O2 the whole time, never helped | Hand in face on closeout |
| 0.4s | O2 catches with no space | D2 contests the shot | Forced or passed-up shot, possession risk |

**Outcome:** Either a turnover/block (B1) or a contested low-value shot (B2). The skip pass was the only high-value option.
