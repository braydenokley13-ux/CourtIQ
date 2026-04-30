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
