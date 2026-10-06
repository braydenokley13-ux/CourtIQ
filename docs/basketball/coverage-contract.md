# Coverage spec: HIGH middle ball screen with weakside lift and corner

Owner: basketball research. Implementer: engine owner. Gate: `apps/web/lib/defense-lab/coverageGate.test.ts`
(run `cd apps/web && COVERAGE_GATE=1 pnpm exec vitest run lib/defense-lab/coverageGate`).

**Founder gate.** DROP / SWITCH / BLITZ / ICE must be behaviorally distinct and basketball-authentic. Policies, reads,
responsibilities, rotations and consequences differ; changing initial coordinates is not a coverage. Switch models the
downstream matchup (small-on-big interior, big-on-guard perimeter). ICE models directional intent and changed geometry.
No coverage is presented as universal truth.

## 0. Sources and their weight

Fetched in full: Hooper University, "How to Ice Ball Screens" (on-ball defender takes the high side by angling his feet; big
positions to help on the baseline drive without letting the screener roll behind him; weak side shrinks the floor; screener's
defender calls "Ice"; middle penetration defeats it). Read as search summaries only (the Breakthrough page returned 403):
Breakthrough Basketball, "Ball Screen Defense: Ice, Drop, and Switch" (Logalbo) and "Defending pick and roll, 4 coverages";
Hoop Mentality, "Why Ice the Ball Screen"; HoopBrief and LevelUpBasket coverage glossaries; The Basketball Dictionary (Medium)
"Ice"; FastModel "LA Lakers ICE 3-on-3 drill"; Chris Filios, "Ice Defense" (Men's Basketball Hoop Scoop). Already verified in
`docs/basketball/policy-sources.md` and `docs/basketball/terminology-research.md`: Costa (Coach's Clipboard, trap/show/re-screen/rotation),
Gels (Coach's Clipboard, switching and gap help), Basketball Immersion (X-out, Obradovic tagger/short roll, peel/scram),
Keane (U18 Europe: middle screens expose the low tag). Treat all numbers below as modelling guidance for a HS court, not
measured data. Programs disagree; every disagreement is listed in section 8 and must stay visible to the coach.

## 1. Frame of reference (this problem)

Metres. x across (0 = rim line), z from the attacked baseline, rim (0, 1.575), FT line z about 5.8, top of key about z 8.8.
O1 starts (1.6, 8.4) with O5 screening at (0.1, 8.0), so the screener sits on O1's **-x** side (screen side = -x; away = +x,
which is toward the near sideline). O4 lifts to (-5.1, 7.5), O3 sits in the weak corner (-6.5, 1.35), O2 strong corner.
D1 = POA, D5 = big, D3 = low man / tagger, D4 = backside / X-out, D2 = strong side.
`S` = screen use = start of O5's dive (0.48 s). HS guideline timings (6-wide HS rosters, mixed athleticism):
reaction 0.3 s; a 5 m closeout about 1.1 to 1.4 s including reaction; a trap needs about 0.4 to 0.6 s to form; a handler
under a trap should pass within about 0.8 to 1.2 s of contact; skip pass 6 to 14 m at 11 to 12 m/s is 0.6 to 1.2 s.

## 2. DROP

Idea: no one gets behind the big, no switch; concede the contested pull-up and pop.
| Role | Before screen | At screen | Handler comes off | After first pass |
|---|---|---|---|---|
| POA D1 | Guard with a slight high-side shade, call "drop" | Fight over; contest the pull-up from behind | Trail/recover to the ball, hands up to shot | Closeout or leave the ball to the next defender |
| Big D5 | Pre-set below screen level, in front of the rim line | Hold the depth mark; do not step to the level of the screen until the handler attacks it | Contain handler; stay between ball and rim; point the roller to D3 | Recover to roller (if ball moved) or to the pop |
| Low man D3 | Nail/gap shaded to the lane | Show early help only if the roller catches deep | Tag the roller in the pocket, then peel back | Closeout to the corner or lift |
| Backside D4 | On the lift, split-the-pair if tagged | Stay (or X-out, a coach choice) | If D3 tags, split lift/corner | First weakside pass: first closeout |
| Strong side D2 | Stay home, gap on O2 | Same | Same | Same |
Offense reads: pull-up three/floater (handler), pocket pass or lob if D5 is deep, pop if D5 is deep, lift pass when D3 tags,
reject if D1 overplays, re-screen. Takes away: layups, lobs, early pocket passes. Gives up: pull-up window (>= 2 m of space
for D5 for a few tenths), pop. HS reality: easy to teach; weak where handlers shoot well off the dribble.

## 3. SWITCH

Idea: remove the screen; the price is size and speed mismatches. Switch-everything is a program choice, not a default.
| Role | Before screen | At screen | Handler comes off | After first pass |
|---|---|---|---|---|
| D1 (becomes the screener's man, a guard on a big) | Talk "switch" early, stay tight | Release the handler, pick up O5 (sag/front/deny, not drop) | Fight for position below/behind O5; stay between O5 and the ball | Stays with O5; in a seal he is pinned and needs help |
| D5 (becomes the handler's man, a big on a guard) | Call, be ready to step to the handler | Meet the handler at screen level, hold his hip, show hands | Slide laterally: staying in front is the whole job; expect a drive or step-back | Closeout or recover on the next pass; may need a "peel" |
| Low man D3 | Stay home on the corner; no tag | Same; may become the help for a seal | Rim help only if D1 is beaten (disagreement: "scram"/"peel" help) | Closeout to the corner |
| Backside D4 | Stay on the lift | Same | Same; may hold gap for D1/D5 | First pass: closeout |
| D2 | Stay home | Same | Same | Same |
Offense reads (exploit the mismatch): **O1 attacks D5** with a drive/step-back/rejection; **O5 seals D1** and receives a high-low or
entry (small-on-big); slip the screen to force a late switch; skip the weakside. Takes away: pocket pass, pull-up space, tag. Gives
up: the two mismatches, communication errors, a late switch. Required consequences: no tag (D3 never tags), D3 stays home,
D5's obligations are O1 and D1's are O5 (not "D1 fronts the roller between him and the rim", which is the *best* spot for the
small; a seal must be possible). Variations: switch 1-4 only, switch with a peel/scram, late-clock switch, "switch and switch back".

## 4. BLITZ / TRAP

Idea: take the ball out of the handler's hands; accept 4-on-3 behind the ball.
| Role | Before screen | At screen | Handler comes off | After first pass |
|---|---|---|---|---|
| D1 | Force the handler to turn into the screen (up or down), no gap | Stay attached at his hip, then seal the trap line | Trap with D5, hands high, no foul | Hustle back/rotate; if no ball, become the first rotator |
| D5 | Close to the screen level, aggressive | Step out at the handler (angle, not a wall) | Two on the ball, shoulder to shoulder, 1 to 2 m, hands in the lanes | Run back to the roller; if the ball moved, first priority is the short roll |
| Low man D3 | Slightly higher than the drop nail | First responsibility: the short roller/roller (tag) | Meet the roller before the pocket (FT line), do not release to the corner early | Next closeout or help |
| Backside D4 | Ready to rotate (X-out early is part of blitz) | Take the weakside high pair | Own O3/O4 together (split) until the first pass | Close to the first weakside receiver |
| D2 | Stay home | Possibly shrink to the nail | Gap on the next pass | Rotate |
Offense reads: split the trap, escape dribble, **short roll** caught between the FT line and the top of the key, skip,
second-side lift. Takes away: shot, drive, pocket. Gives up: 4-on-3 downstream, short roll, skip. HS reality: needs 4 aligned
defenders and a communicative low man; costly when athleticism is mixed. Disagreement: hard-hedge vs trap, "red", "black".

## 5. HEDGE / SHOW (optional)

Idea: delay and turn the ball, then recover; shorter and shallower than a blitz.
D5 steps to the level of the screen for 0.3 to 0.8 s (a flat show), then runs back to the roller while D1 gets over the screen.
D1 keeps the handler attached; D3 tags only once D5 is committed; D4 stays split. Offense: attack the recovering big, slip,
pocket pass behind the show, pop. Takes away: the handler's straight line; gives up: the recovering-big roller window and a
tired big. Signature: D5's obligation flips from O1 to O5 while O1 still has the ball, which a blitz must not do.

## 6. ICE / FORCE (honest presentation)

Real ICE is a **side** pick-and-roll coverage: D1 takes the high side so the handler cannot use the screen (middle) and is forced
toward the sideline/baseline; D5 sits below, parallel to the baseline, to corral the baseline drive and stop O5 rolling behind;
D3 takes the ball-side nail; the weak side shrinks. A **middle** screen has no "sideline" to use, so ICE on it is unusual: many
teams only ICE side screens. CourtIQ honest presentation (section 8): label the middle-screen version "Force away from the
screen" (not "ICE") until a side-screen problem exists, and say so.
| Role | Before screen | At screen | Handler comes off | After first pass |
|---|---|---|---|---|
| D1 | High side of the handler, feet angled, on the screen-side hip; point the force direction | Deny the screen; stay level (not trailing) | Force to the near sideline; contest the pull-up if he stops | Closeout/recover |
| D5 | Below the screen, shaded toward the forced side, between the handler and the baseline | Wall the forced side; stay out of the screener's roll lane | Take away the baseline/middle drive; wall, then recover to the roller | Recover to O5 |
| D3 (nail) | Ball-side nail, not the strong tag | Shift toward the forced side | Tag only the roller who catches in the lane | Closeout |
| D4 | Stay with the lift, shrink | Shift toward the ball side | Hold the weakside pair | X-out/closeout |
| D2 | Gap, no help beyond the nail | Same | Same | Same |
Offense reads: reject (counter to ICE is the screen-side drive: the *defense* gave it up if D1 over-shades), re-screen, slip,
skip the weakside, short roll only if D5 cheats. Takes away: the middle drive and the middle short roll. Gives up: the baseline
drive/step-back, long closeouts and the skip, a lost trap if D5 does not wall. Required differences from drop: D1 high side
(not a x-offset), D5 shifted to the forced side, D3/D4 shifted, the handler denied the middle, no pocket pass.

## 7. Observable behavioral signatures (all asserted in the gate; geometry is relational)

Seeds 2026, 11, 777. `S` = 0.48 s; `passT` = first `pass` event; "holds" = `ball.owner===O1 && phase==='handle'`.

DROP
- D5.z <= O1.z - 0.5 and D5 within 1.6 m of the ball-to-rim line while O1 holds, S+0.3 to S+2.
- Pull-up window: D5 >= 2 m from O1 for >= 0.3 s while he holds.
- D5 obligations only O1 (no `switch`); D1's primary is O1; D3 has `tag` on O5 before the pass.
- First pass >= S+1.2 s (handler is not rushed); a first pass to O5 is caught with D5 within 2 m.

SWITCH
- S+0.4 to the pass: every D5 obligation is O1, every D1 obligation is O5, none `chase`/`tag`.
- D3 and D4 never `tag` or own O5; D3 within 2.5 m of O3 at S+1.5 (weak side stays home).
- Mismatch exists in the content: D1 shorter than O5, D5 taller than O1.
- Small-on-big: O5 receives (a `catch` after S) with O5.z <= D1.z - 0.3 and D1 within 1.6 m (a seal, not a front).
- Big-on-guard: O1 beats D5 (O1.z <= D5.z - 0.5 within 2.5 m) or the selected read is `drive/O1`.
- Reads differ from drop: chain includes drive/O1 or roll|pop/O5 and fewer than 2 of lift/O4, corner/O3.

BLITZ
- D1 and D5 both within 2 m of O1 in S+0.3 to S+0.9 while he holds.
- D5.z >= O1.z - 1.25 while trapping (no drop).
- D5 obligation is O1 only until the ball leaves; D5 holds the handler > hedge by >= 0.3 s.
- First pass <= S+1.3 and >= 0.4 s earlier than drop's; D1 and D5 both within 2.5 m of O1 just before release.
- First pass to O5, caught with z in [4.2, 7.8] (FT line z 5.8, top of key 8.8), |x| <= 2.5, D5 >= 1.5 m from O5.
- D3's primary obligation is `O5:tag` from S+0.5 to the pass; D4 owns O3 by passT+0.05 (early X-out).

HEDGE (optional)
- D5 reaches within 2.5 m of O1 and z >= O1.z - 1.5 in S to S+1.2, then obliges O5 while O1 holds; show is shorter than blitz
  (D5-on-O1 time) and D5 is >= 0.8 m below O1 by S+2.

ICE (force-away on a middle screen)
- Handler dx sign opposite the screen side (screen -x, so dx > 0), |dx| >= 0.5 at S+1.5, and never > 0.6 m toward the screen.
- D1 on the screen-side hip (>= 0.3 m) and level (|dz| <= 1.5) while O1 holds, S to S+1.
- D5 below O1 by >= 0.8, on the forced side of O5 by >= 0.7 at S+1, and >= 0.5 m from D5 in drop.
- No short-roll pocket pass to O5 in the lane (z <= 6.5, |x| <= 2) as the first pass.
- D3 or D4 shifted >= 0.5 m in x from drop at S+1.

DISTINCTNESS MATRIX (every pair of drop, switch, blitz, hedge, ice)
- D1 or D5 RMS trajectory difference over S to S+2.5 >= 0.75 m on every seed.
- Responsibility signatures (D1, D3, D4, D5, kind and target sets) differ; selected read chains differ.
- >= 4 distinct read chains and >= 4 first-pass timings 0.2 s apart across the five.
- Each non-drop coverage differs from drop in D1/D5 obligations (kind or target), not only in position.

## 8. Variations and disagreements (keep visible in the UI)

- **ICE on a middle screen**: contested. Many teams ICE only side screens; some call it "Blue"/"Down"/"Push"/"Black", which
  collides with other teams' drop/blitz calls (see `COLLISIONS`). Recommendation: until the engine has a side/angled
  screen, show "Force away from the screen (middle)" with a note, hide "ICE" as a headline coverage, and add the ICE problem
  with a `screenAngle` above about 0.5 rad or a wing start for the real thing. Do not claim ICE results from a middle screen.
- **Drop depth**: low vs high, matched to handler shooting range; the POA over/under choice is a separate decision.
- **Switch**: 1-4 only vs switch-all; peel/scram vs fight, late-clock switch. A switch that costs nothing is not honest.
- **Blitz**: trap angle (up vs down), who is the first rotator (D3 vs D4), early vs late X-out, "show two" hedge variants.
- **Low man**: shallow stunt vs deep tag vs no tag, "tag until the roller is secured".
- **Backside**: stay with the lift vs X-out; both are legitimate; neither is the right answer.
- **Offense**: handlers who shoot, rollers who pop or seal, 5-out spacing change every coverage's price.

## 9. Engine requirements (target; implementer's choice of mechanism)

1. Per-coverage role policy: D1/D5 obligations, depth, target, kind and timing differ (drop contain/line, switch exchange with a
   late-switch option, blitz trap line and early release, hedge show then flip, ice high side/force-direction).
2. Switch consequences: size-aware read value (height delta), screener seal/post behavior after the exchange, D1 responsible
   for O5 on the high side (not fronting between O5 and the rim by default), D5 guard-lateral job.
3. Blitz consequences: D3 tags first, D4 early exchange, short-roll read preferred, handler releases in <= 1.3 s.
4. ICE: force-direction state (`sideline|baseline|middle`), D1 high-side, D5 wall, nail shift; honest scope (side-screen problem).
5. Counter graph per coverage (reject, re-screen, slip, short roll) must change *obligations*, not just bodies.
6. Verdicts must hold on multiple seeds; the gate checks three.

## 10. UI recommendation

Show: DROP, DROP variants, BLITZ (once signatures pass), HEDGE (optional). Hide until honest: **SWITCH** (no mismatch cost
today, Explore recommends it for free), **ICE** (middle-screen approximation only). Rename ICE to "Force away (middle screen)"
if kept. `fidelity.level` stays `approximate` until the matching gate tests pass.
