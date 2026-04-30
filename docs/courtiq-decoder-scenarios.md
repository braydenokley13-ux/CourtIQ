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
