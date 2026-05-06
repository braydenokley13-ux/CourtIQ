# V6 — Scenario Cinematic Audit

> Pre-implementation audit for the V6 Gameplay Feel + Scenario Cinematics
> packet sweep. Walks the 20 founder-v0 scenarios, reads the authored
> JSON timings against the runtime curves (`easeForKind`, V2 athletic
> curves, `easeOutDefenseSlide`), and flags the cinematic gaps that
> should drive Packets 2 → 7.
>
> Audit method: per-scenario read of `movements`, `freezeMarker`,
> `answerDemo`, and `wrongDemos`. No visual playback (Claude has no
> headless renderer); everything below is derivable from the timings
> and the runtime ease dispatch.

## Common gaps (apply across the whole pack)

These are the patterns that cost the most cinematic feel across the
20 scenarios — they are the highest-leverage targets for Packets 2,
3, 4, 5.

### G-1 — Defenders react with a flat 200/250 ms lag everywhere
Almost every defensive movement uses `delayMs: 200` or `delayMs: 250`,
regardless of how far the cue actually has to travel. A real defender
reading a backdoor reacts later than a defender mirroring a slow lift,
and a help-side rotation lags the on-ball drive by a different beat
than a closeout. The flat lag reads as "everyone moves on the same
metronome."

### G-2 — Wrong-demo defenders arrive in lockstep with offense
Many wrong demos pair a 600-700 ms offense action with a 600-700 ms
defense action whose `delayMs` is 100 ms. The defender is therefore
~100 ms behind the offense for the entire segment and lands at the
same instant. That sells "guarded" but it also flattens the rhythm of
the consequence — there is no "defender catches up" beat.

### G-3 — Best-read pass timing is uniform
Lead passes consistently fire at `delayMs: 350-500`, `durationMs:
550-700`. A back-cut lead, a baseline drop, and a swing-back-to-PG
should not feel like the same throw. BDW back-cut leads need a
slightly later launch (so the cutter is past the defender before the
pass leaves), AOR resets need a faster swing (the ball is moving
*away* from the read), SKR skips need a flatter / faster arc
(handled by `passArc.ts` already, but the launch timing still feels
generic).

### G-4 — Receiver "ready to catch" beat is missing
Skip-pass receivers (SKR-01..05, ESC-04 weak-side outlet) use
`lift` durationMs=300 with delay=50 — basically "catch the moment
the ball arrives." A real catch-and-shoot flashes a small body lift
~150 ms BEFORE the ball arrives so the shooter looks ready. Today
the receiver only animates after the catch.

### G-5 — Some best-reads have no "settle" beat
A clean rep ends with the shooter releasing or the cutter landing,
then a brief settle so the eye has time to land on the read. Today,
many best-reads just stop mid-action (AOR-04 trail catch ends at
the lift's apex; ESC-04 ends on the kickout pass with no shooter
release).

## P0 — confusing / visually wrong

| ID | Issue | Why it matters |
| --- | --- | --- |
| AOR-03 | Best-read demo is **2 movements totalling ~300 ms** (`user_pivot_reset (lift) 200ms` + `user_swing_back (pass) 700ms`). | Reads as "did anything happen?" — the reset/no-advantage decision needs a visible read beat (jab → swing) so the user feels the *re-read*, not just the bail-out. |
| BDW-01 c4 | Wrong-demo `user_front_cut` (800 ms) + `x2_ride` (delay=100, dur=700) end at the same instant. | The defender mirrors the cut so tightly that the cut and the recovery look like one motion. Should land *late* so the user reads "your front cut got tracked." |
| ESC-02 c4 | `user_cut_lane_line` and `pg_collision_path` both start at 0 ms going to the same point. | Reads as "two players overlap and stop" — visually unclear. Should be two distinct visuals (cutter + driver collide). |

## P1 — visually weak

| ID | Issue | Suggested upgrade |
| --- | --- | --- |
| All BDW (01–05) | The user's `lift` setup (durationMs=500-600) and the defender's denial (durationMs=600-700, delay=200) feel synchronized. | Stagger denial later (delay=350-450) so the user finishes their lift first, sees the denial *appear*, and the freeze lands on a clear cue. |
| All AOR (01,02,05) | Closeout `delay=350 dur=750-800` shares the pass timing exactly. The closeout reads as "ball + defender arrive together" instead of "ball arrives, defender chases." | Add 100-150 ms to the closeout delay so the defender is still behind when the catch happens (which is the cue). |
| All SKR | The skip-pass best-read has a stale receiver: `o3/o4/lift dur=300 delay=50`. Receiver only "wakes up" after the ball is already in flight. | Add a small "set" beat (60-100 ms shorter `lift` starting *before* the skip pass releases). |
| BDW-02 c2 | `user_drift_corner (drift) 700ms` + `pg_corner_pass (pass) delay=250 dur=500` — pass duration is shorter than the drift, so the ball flies through air to a still-moving target. | Stretch the drift slightly OR delay the pass so the catch lands on a settled cutter. |
| BDW-04 c4 | `wing_force_reverse (pass) 500ms` + `x1_deflect (rotation) delay=100 dur=350`. Defender deflects in 350 ms but the pass takes 500 ms — the deflect arrives *before* the ball. | Either move x1's deflect to fire mid-flight (delay≈250) or extend its duration to land near the ball arrival. |
| ESC-04 best | Only 2 movements (`user_lift_to_wing` + `wing_kickout`). No "shooter catches" beat. | Add a small `o3` or kickout-target lift after the pass so the rep finishes on a clean shooter. |
| AOR-03 c4 | `user_pump_fake (jab) 400ms` is the entire wrong demo. | Add a defender response (closeout cushion, contest) so the user reads *why* the pump fake fails. |
| SKR-04 c4 | `pocket_to_screen (pass) 500ms` + `x_screen_deflect (rotation) delay=100 dur=400` — the deflect lands while the pass is still in flight (pass arrives at 500 ms, deflect at 500 ms exactly). | Slow the deflect, or move the deflect target slightly off the lane so the deflect reads as a "cut-off," not a teleport. |
| All best-reads (BDW family) | Cut → pass → finish: pass arrives near the rim *after* the cut lands. The user reads "lay-up confirmed" but there is no "ball into hands" tell. | Drop a tiny `lift` on the cutter at the catch point so the shooter visibly receives the ball, not just runs to a spot. |

## P2 — nice-to-have

- Add a brief "head-turn → react" beat on key defenders so the
  rotation visibly *decides* before it moves (would need a new
  `head_turn` movement kind or a posture cue; not required for V6).
- Off-ball offense currently stands still during the play. A
  micro-drift on non-acting wings/corners (≤ 0.5 ft) would prevent
  the "frozen mannequins" read at the gameplay camera.
- Best-read replays could ramp slightly slower the *closer* the cut
  is to the rim, so the layup/finish feels cinematic.
- Pass-arc apex is computed from authored `from`/`to`. For long
  skip passes the visual arc is correct but the *release* still
  feels like a chest pass. A future packet could differentiate
  release pose by `kind === 'skip_pass'`.

## Per-family read

### BDW (Backdoor Window)
- All five scenarios use the same template: user lifts, defender
  denies, user back-cuts, lead pass, finish.
- The cue is consistent (defender hand/foot/chest in lane). The
  freeze lands cleanly because the denial movement settles 500-700
  ms before freeze.
- Biggest cinematic gap: the cut feels good; the *catch at the rim*
  is missing. The user runs to a spot and the ball arrives, but the
  hands-up read is implicit. Adding a tiny lift at the rim sells the
  layup.

### ESC (Empty Space Cut)
- All five scenarios stage helper rotation as the cue. The freeze
  is sharp (helper turn ends 700-1000 ms before freeze).
- Best-reads pair a slash with a pocket pass — feels good.
- ESC-04 is the weakest: kickout to wing reads as "and we passed it
  out," not "the cut OPENED the wing." A wing receiver lift would
  fix this.
- ESC-02 has the c4 collision overlap (P0 above).

### AOR (Advantage or Reset)
- AOR-01/02/05 share the catch-and-read template; AOR-03/04 vary
  (reset + outlet).
- The closeout cue is the most-time-sensitive across the pack: the
  user has to read the cushion *during* the closeout, before the
  defender plants. Today the closeout finishes at exactly the freeze
  point (closeout delay+dur = 350+750 = 1100 ms; freeze at 1500).
  The cushion is therefore visible for 400 ms — enough, but the
  defender's *deceleration* (the actual cue) finishes too early.
  Tightening this is the single highest-leverage AOR upgrade.
- AOR-03 reset best-read needs more body language (P0 above).

### SKR (Skip the Rotation)
- All five share the "help loads → skip past" template.
- The skip pass reads correctly thanks to the `skip_pass` apex
  multiplier in `passArc.ts`.
- The receiver readiness gap (G-4) is most visible here because
  the throw is so long.
- SKR-04 has the c4 deflect synchronization issue (P1 above).

## Mapping to packets

- **Packet 2 (movement rhythm)** → fixes G-1, G-2; tunes defender
  delays and stagger. Adds deterministic helper for "reaction-lag"
  per role (on-ball, denial, help, closeout).
- **Packet 3 (pass timing)** → fixes G-3, G-4; tightens
  best-read pass delays per intent and adds a short receiver-set
  lift before the catch.
- **Packet 4 (freeze polish)** → confirms freezeAtMs lands on the
  cue settling, not still moving (BDW family stays at 1400-1500;
  AOR may bump 100 ms later so the closeout deceleration is
  visible).
- **Packet 5 (branch consequence)** → fixes BDW-01 c4, ESC-02 c4,
  AOR-03 c4, SKR-04 c4 distinctness.
- **Packet 6 (best-read satisfaction)** → fixes G-5; adds the
  "ball-into-hands" lift at the rim for BDW best-reads, the
  shooter-set lift for ESC-04 best-read, and the second beat for
  AOR-03 reset.
- **Packet 7 (family-specific)** → final per-family tuning pass:
  BDW back-cut explosiveness, ESC helper turn cue, AOR closeout
  deceleration timing, SKR skip-pass arc + receiver set.

This audit is the single source of truth for the V6 changes. Each
follow-up packet references the IDs above when modifying scenario
JSON or adding deterministic helpers.
