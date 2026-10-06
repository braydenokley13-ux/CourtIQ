# Final adversarial critique (integrated checkpoint, HIGH P&R)

Method: golden-path shots (`scratchpad/g6`), coverage gate run, plus fresh live captures at 1280x720 and 390x844 on the
running app (software GL, so FPS is not judged). Coverages were driven from the screener's-defender card (`?select=D5`);
Drop was the default run (my scripted Drop re-click timed out, so Drop-after-ICE was not re-captured). Shots: `shots/final-*.png`.
I did not try to defend anything. Verdicts: (a) mostly beaten, (b) not yet beaten, (c) not yet beaten, (d) split,
(e) cannot be answered, but there are two likely failures.

## Gate result (run today)
`COVERAGE_GATE=1 vitest run coverageGate`: 54 pass, 3 fail. All 3 are Hedge-related (hedge's D5 is 0.14 m too low at screen+2 s;
hedge and ICE share the read chain `lift/O4>drive/O4`; only 3 distinct chains across 5 coverages). Hedge is hidden in the UI,
and Drop/Switch/Blitz/ICE are pairwise distinct in the matrix, so the founder gate is met for the four shown coverages. But a
passing gate means "different numbers", not "looks like that coverage" (see b).

## (a) "Just FastDraw in 3D / a scripted animator" -> MOSTLY BEATEN
For us:
- Changing one defender changes the whole possession. In the live captures, with the same offense: Switch gave "Ball handler's drive
  now open / #3's drive fixed" (job: "You have the ball now"); Blitz fixed #4's drive but opened a 2-man trap with a 5.5 m "higher" ghost
  delta; ICE gave "#4's drive from the far wing now open" and put the handler on the sideline. Each coverage produced a different problem
  sentence and different ghosts (shots 02, 03, 04). A drawing tool cannot do this.
- The offense reads and the tradeoff is computed ("Fixes #5's drive from the post. Gives up the far-corner shot", shot 07).
- Break mode finds a counter you did not draw (shot 08: "turn the screen at a slightly different angle").
Against us:
- The 3D reads as a fixed-camera replay. You cannot drag an offensive player to try your own set; the offense is always the one
  problem, "ball screen with shooter lifting". The entry screen offers exactly one problem card plus greyed "next up" chips (the mockup
  shows six). A coach who sees the same 4-second possession every time will say "that's a play animator that argues back".
- Only one situation (High P&R middle) works in the UI; a second problem exists engine-only (reusability.md).
- No clip/export/share. FastDraw's value is a PDF in a binder; we have no equivalent output (Teach is on-screen only).
Fix: add 2 more UI problems and one "draw their set" entry before any coach demo (items 1, 9).

## (b) "Untrustworthy simulator / fake precision" -> NOT BEATEN (improved, still attackable)
Fixed since the basketball review:
- P0-3 (verdicts as facts): now "3 of 8 slightly different tries end the same way" (shot 01). Honest and visible.
- P0-1/P0-2 (moment narrates a play the sim did not run; closeout abandoned on keep): pass latch landed, cause sentence names
  defender and player. Moment copy now matches the visible frame ("#3 open", "late about a quarter second").
- P0-4 (counters cosmetic), P1-2 (counters create no obligations): fixed per CHECKPOINT and engine tests; I did not re-prove.
- P1-4 fake precision: Simple words rounds to "about a quarter second". Fixed in Simple words.
Still open:
- A 3-of-8 headline is an honest number but a coach will read it as "5 of 8 times this would not have happened, so why
  is it the headline". The moment should lead with the likelier outcome or show the spread (the coach text says "Likely").
- Coaching-terms mode regresses on precision and jargon: "3 of 8 jittered runs (seed, +/-0.05 s reaction, +/-4% speed, +/-0.25 m
  spots)" and the chip "low man: 95% tag" (shot in scratchpad lens-08). "seed" is developer language; 95% tag depth is fake
  precision to a coach.
- Stale/meaningless controls after switching coverage: the D5 card still shows "How far back he waits: 10 ft from the baseline"
  under Switch, Blitz and ICE (shots 02-04). Moving it presumably does nothing (or is silently used). This is exactly the "placebo
  slider" the first review attacked.
- Naming bug: after changing coverage via the card, the title/chip lose the coach's name ("vs. a ball screen..." and the chip becomes
  "Swap who guards who"). Names the coach typed are overwritten by the label.
- "Looks like a coverage": the ICE capture shows the handler on the sideline with the screener's man 4 m to the left, fine, but the
  Blitz shot shows three bodies stacked on the ball with no readable trap. Is that two defenders, or a pile? At 1280x720 it is
  not legible. Basketball authenticity of the picture is below what the numbers claim.
- No make/miss, turnover or foul (honest, but "open by a quarter second" never becomes "so what").
- ICE on a middle screen remains an approximation (CHECKPOINT admits it). Fine, but nothing on screen says so.
Verdict: a skeptic needs more than five minutes now, but will win on "ICE and Blitz don't look like ICE and Blitz" with a coach.

## (c) "Visually mediocre vs mockups-as-floor" -> NOT BEATEN against the floor, BEATEN against the target
Clearly above the floor: athlete silhouettes, jerseys with numbers, foot contact, navy gym, key light, hologram ghosts, glow marks
(shots 01, 07, 08). The mockups' own court is flat-lit gray; ours is richer.
Not at "premium stylized realism":
- Panels are still rounded SaaS cards pinned to the right at every step; the mockups put the panel beside, not over, the world.
  At 720p the problem panel covers a third of the court and its buttons ("We can live with this - save it") clip below the card edge
  (shot 01).
- Compare ghosts are better but noisy: stacked labels collide ("Far-corner shot fixed" over "#3's drive ... fixed" in shots 02-03;
  "Far" overlapped with the title chips in g6 07).
- Chip row overlaps the backboard in several states (g6 10, 07).
- Heads/faces remain flat dark discs at close camera; shot 08 shows the break close-up where this is most visible. Break drama is
  genuinely better (red wash, pink comet, spotlight on #5 open) but the cut to a waist-high shot hides the cause; a coach sees one
  guy under the rim and not why.
- X-Ray lenses now render (fixed from P0-1), but the world dims so much the court nearly vanishes, red ribbons look
  like glitchy stripes (shot 06), and the lens explanation tooltip sits partly underneath the VIEW bar (shots 05, 06;
  text clipped: "a job he can't reach, two strings means he's pulled two ways" is cut).
- "His eyes" for a selected defender points the camera at the empty bleachers (shot 09). Baseline view is a tilted top-down, not a
  baseline view. Overhead is good.
- Dev badge "3 Issues / 4 Issues" (the Next.js "N") appears bottom-left during coverage changes (shots 02-04). Either a real warning
  or dev-only, but it shows on screen in every demo capture. Check it.

## (d) "Too complicated for a coach / too shallow for an expert" -> SPLIT
Coach (55-year-old JV, Simple words): Much better. The first problem sentence is plain ("The far-corner shooter gets an open
pull-up jumper... your helper ran all the way to the screener"). Fixes read as who moves where and cost ("Stops #3's drive +3 / Gives up
#5's drive"). Compare bars agree with the headline. Remaining friction:
- "#3", "#5" numbers refer to offense players; the shooter's number isn't on his back from the default camera angle at moment time.
- "Fixes the #5's drive from the post" (stray "the"). "drive from the post" for a screener rolling is not a coach phrase.
- The coverage buttons use the coach's own team word ("Blue") for Drop, next to "Swap who guards who": two vocabularies in one control.
- Phone (shot 10): the problem panel fills the screen, the X-Ray strip overlaps the timeline and the Fix/Show-me buttons are behind
  it. A coach on an iPad in the gym cannot finish the flow. Same failure the first review reported; not fixed.
- 45-70 s of an empty court before the problem under software GL (real hardware unknown), and still no "Setting up the play" text.
Expert: Full control now has personnel (quick/slow, size), liftWidth, rules, counters. Still no: custom if/then triggers, role swaps, a
second problem in the UI, shot quality/make probability, per-coach opponent scouting. An expert says "this is a good P&R toy".

## (e) "Too heavy for school laptops" -> CANNOT BE ANSWERED YET
perf/README.md says it plainly: instrumented, tiered, NOT validated on real GPU. I did not contradict that. Risks I can see:
- Compare, Break and lens switching each cost seconds on software GL (the first Compare has an unexplained ~5 s stall per
  CHECKPOINT). That is a JS/pipeline cost, not a GPU one, and could be real on a Chromebook CPU.
- 128-segment glow, hologram ghosts, 10 athletes with IK, shadowmap: the tier table sounds right but thresholds are "provisional".
- Initial tier detection for Chromebook: "<=4 cores, <=4 GB -> low". `navigator.deviceMemory` caps at 8 and is missing on Safari, so
  an Intel iGPU school MacBook Air may land in `balanced` and thrash once.
Verdict: unfalsified, not proven. Needs the real-device bench before any claim.

## Status of earlier critique findings
basketball-expert.md: P0-1 narrative mismatch FIXED; P0-2 closeout latch FIXED; P0-3 brittle verdicts PARTLY (ensemble shown, but
as "3 of 8" it reads as unreliable); P0-4 cosmetic counters FIXED (unverified by me); P0-5 switch mismatch PARTLY (handler/roller
shown, post-seal marginal per CHECKPOINT); P1-1 proven; P1-2 FIXED per notes; P1-3 slider dead zones OPEN (unchecked);
P1-4 late-by lower bound PARTLY (rounded, still an estimator); P1-5 personnel FIXED (quick/slow, size, UI); P1-6 saved-system
captures logic PARTLY; P1-6b ICE weak PARTLY (side-line force now visible, still approximate); P1-7 timeline long OPEN;
P2 skip naming OPEN (unchecked); hedge churn: hedge hidden, gate still failing.
coach-usability.md: P0-1 numbers FIXED (words first); P0-2 problem sentence FIXED; P0-3 fix list FIXED (named by player, costs);
P0-4 compare contradiction FIXED; P0-5 plain register PARTLY (Coaching terms now leaks "seed", "95% tag"); P0-6 Teach
drill-down PARTLY (pick-a-player bar with 7 choices, still a lot; shot g6/13 shows overlay clipped under the toast);
P1-1 lens mystery switches FIXED (idea line exists) but clipped; P1-2 stale panel PARTLY; P1-3 coach card duplicated
controls OPEN (stale depth slider, new); P1-4 Break scary: copy better; P1-6 Plain/Coach toggle labels FIXED
(Simple words / Coaching terms / Our words); P1-8 no progress text OPEN; phone OPEN.
visual-world.md: P0-1 lenses empty FIXED; P0-2 camera menu hidden FIXED (View bar visible); P0-3 director framing FIXED;
P0-4 baseline/POV cameras OPEN (his-eyes shows bleachers, baseline is tilted top-down); P1-1 additive marks PARTLY;
P1-2 floating labels PARTLY (still collide); P1-3 athlete acting PARTLY; P1-4 ghosts FIXED (holograms); P1-5 SaaS panels OPEN;
P1-6 timeline clutter PARTLY (PASS/PASS 2 labels overlap on phone); P2 debug footer FIXED; P2-4 mobile OPEN.

## Ranked top-10 next fixes
1. Phone/tablet layout. At 390 wide, collapse the problem panel to a bottom sheet (peek 30% height, drag up), move the X-Ray
   strip into a menu, keep timeline and "How do I fix it?" always reachable. Coaches use iPads. (d, c)
2. Real-device performance run (Chromebook, Intel laptop, Mac Air), then calibrate WARMUP_LIMITS and the first-Compare stall.
   No claim of (e) until this is done. (e)
3. Make coverage changes legible on court: for Blitz show two trap markers and the ball-side wall; for ICE draw the
   force-direction arrow and sideline; for Switch show the new matchup tags (small on big). Shots 02-04 are numbers over
   a pile of bodies. (a, b, c)
4. Remove placebo controls: hide or rewire "How far back he waits" under Switch/Blitz/ICE; keep the coach's name in the
   title when coverage changes (stop writing the coverage label into the name chip). (b, d)
5. Fix camera presets: "His eyes" must look from the selected defender at the ball (not the bleachers); "Baseline" must be a
   low behind-the-baseline camera; add a test per preset that asserts the ball is in frame. (c)
6. Coaching-terms copy pass: drop "seed", "+/-0.05 s reaction" (show "3 of 8 small variations"), drop "95% tag" for
   "Deep tag". Show 0.1 s, not 0.2 s decimals everywhere; lead with the likelier outcome, not 3-of-8. (b, d)
7. Replace the right-edge card with a world-anchored popover or a side dock that shrinks the viewport (the director camera
   already has an inset), and give lens tooltips their own row above the View bar so they stop being clipped. (c)
8. Make the break drama explain itself: hold the camera on the cause for 1.5 s (the late defender and the open player in one
   frame), then cut to the finish. Add a one-line "what to do" under the replay. (c, a)
9. Add what makes it not-FastDraw: a second and third problem card on the entry screen (side P&R, baseline drive, DHO), and let the
   coach move one offensive player. Today the entry offers one card. (a, d)
10. Take a printable/shareable output: "Save as one-page PDF + 15-second clip" from Teach. Coaches live in binders and group
   chats; nothing leaves the app today. (a)

## Not verified (would otherwise be overclaiming)
Drop re-capture after ICE; Hedge in UI (hidden); the Next.js "N Issues" badge content; real-GPU FPS; a real coach.
