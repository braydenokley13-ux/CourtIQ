# Coach proxy walk 2 (NAIVE-USER PROXY, not a real coach; all verdicts are proxy evidence)

Persona: 55-year-old JV coach, hates software, does not know X-out / lift / low man / tag / roller. Only instruction: "Show me how you would guard this."
Method: Playwright scripts in `scripts/qa-local/proxy-coach/` (laptop.mjs, laptop2.mjs, laptop3.mjs, phone.mjs, keys.mjs). Runs: 1280x720 first-time empty storage, 390x844 phone (actually run, full loop to Save/Teach/Our System), keyboard-only, Teach-with-nothing-saved, Save twice (same name), Coaching terms and Our words registers. Shots: `shots/proxy2-*.png` (12). Software GL; after the server restart everything ran fast (problem screen ~35 s after naming).

## COACH-TEST table (PROXY, not a real coach)
| # | Behavior | Time | Unaided? | Notes (what a proxy would say) |
|---|---|---|---|---|
| 1 | Choose / recognize an answer | ~1:10 | Y | "Ball screens" then "Keep them away from the basket" then a card. Still two near-twin cards ("Keep the big way back" / "Keep the big back"); he picks the one with the picture. |
| 2 | Run it, reach "Here's the problem" | ~1:50 | Y | Typing a name is optional ("Doesn't matter - run it"). Blank court for a few seconds, no "setting up" text seen. |
| 3 | Understand what is shown | ~2:30 | PARTLY | He can say "my helper left his man." He cannot say who: sentence says "Your helper (#3) ... their far-corner shooter (#3)" (shot 01). Two different people, same #3. "Late by about a quarter second" is hard to picture. |
| 4 | Change something | ~3:00 | Y | "How do I fix it?" gives 4 plain-named cards (shot 03); chips with a pencil open the helper card. |
| 5 | Rerun, read the tradeoff | ~3:45 | PARTLY | Headline names what is fixed and given up. But for fix 2 "Gives up: far-corner shot" is the very problem he started with (see N-4). |
| 6 | Own "what if...?" | - | N (proxy) | Nothing invites it besides the pencil chips. "Or coach it yourself: click any of your defenders" is a footer line. He would likely stop after picking a card. |
| 7 | Tried Break My Defense | ~4:30 | Y, hesitant | Button is visible and well named. Result: "Their shooter is open. How: their normal play already finds it." Unclear who. |
| 8 | Saved under his own word | ~5:30 | Y | Sheet pre-filled; "Save / Save and show the players / Cancel". |
| 9 | Opened Teach, showed one job | ~6:00 | PARTLY | Lands in Teach after save; five role names to pick; "Pick a player" card is clear. Header says "version 1" after a version-2 save (N-8). |
Proxy read on gate A criteria: behaviors 1-5 plausible in ~5 minutes if N-1/N-2 are fixed; behavior 6 is the weak spot.

## Previous P0 / P1 status
| Item | Status | Evidence |
|---|---|---|
| P0-1 numbers | PARTLY | Plain sentence replaces the grid; boxes hidden behind "Show the numbers" with new labels "Shooter is ready in / Nearest defender needs / He's late by" (0.4 / 0.6 / 0.2). But the sentence in runs 1-2 said "about half a second ... about half a second ... late by about a quarter second" (0.4/0.6/0.2 rounded three ways), later runs say "a little longer than that" (better). Still two different "open" words on court ("#3 open", "late about a quarter second"). |
| P0-2 problem names who | PARTLY | Roles named ("Your helper ran all the way to the screener, so nobody was left for his own man"). Court tag "#3 · open" is on the shooter; the second tag "#3 · late..." is on the helper: same number twice (shot 01). |
| P0-3 fix pills | FIXED (mostly) | Cards named by who ("Helper stays closer to his own man"), one "Stops:" and one "Gives up:" line (shot 03). Left over: "+3" after Stops is unexplained. |
| P0-4 Compare contradiction | FIXED | Checked 3 compares (simple + coach): headline, body and rows agree; "New problem:" appears exactly when something got worse. |
| P0-5 jargon in Simple | PARTLY | Fix names fixed. Still in Simple: compare title "AFTER: STAY HOME ON THE LIFT" / "AFTER: HELP LESS ON THE ROLLER"; Our System section header "HIGH P&R"; answer cards "Often called Deep tag / Full tag / Sink"; Save sheet "Ball to the rim". |
| P0-6 Teach | FIXED (core) | Nothing saved: one card "Teach starts from your answer ... [Go to the Lab]" (shot 07). Camera names "Through his eyes / Bird's-eye". No share/print yet. |
| P1-1 lenses | PARTLY | One-line idea now always shown ("Rings show how soon a defender can get to each spot..."), but it renders under the VIEW bar and behind the problem card at 1280x720 (shot 02); lens names not changed. |
| P1-2 stale problem panel | FIXED | Opening a card collapses the problem to a pill "The problem - show again" (shot 06). |
| P1-3 card controls | PARTLY | "Apply to: The whole play / Just from here on" and "Tip: pause, then drag the white dot" fixed; Save sheet shows feet. "JOB RIGHT NOW: Run at the shooter moving up" is still wrong at the problem moment (helper is at the screener). Court bubbles still metric: "2.2 m deeper", "3.0 m to the right", "1.4 m higher". |
| P1-4 Break | PARTLY | Footer and buttons fixed ("CourtIQ tried 26 different things...", "Back to my defense"). "How:" line vague; headline does not name the player. |
| P1-5 Save sheet | FIXED (mostly) | Esc closes it, name field focused, Cancel, "Update "Blue" (version 2)" on second save, feet. Left: tradeoff text names things the compare never used (N-7). |
| P1-6 toggle labels | FIXED on laptop | "Simple words / Coaching terms / Our words". On phone only a "Simple" pill is visible (shot 08). |
| P1-7 chips | PARTLY | Pencils added, "New problem" renamed. "NEXT UP" dead topics still sit on the entry screen. |
| P1-8 progress text | NOT VERIFIED | Not seen in the gap before the problem. |
| Keyboard | FIXED (mostly) | Tab order reaches the first card in 8 stops; blue 2px focus ring everywhere; Esc closes Fix panel, Compare panel, Save sheet and helper card; Space on a focused Play button toggles play. Left: after Esc focus falls to the page body so Tab restarts from the top (15 tabs back to "How do I fix it?"); ArrowLeft with Play focused did not move the clock (inconclusive). |
| Phone 390x844 | PARTLY | No horizontal page scroll; full loop completes (shots 08-11). Bottom sheet, but "Break it / Save as our answer" sit below the fold and court tags clip left ("he far wing fixed"). Dock is icons only. |

## New issues, ranked
**N-1 (P0) Helper and shooter are both "#3".** Sentence and both court tags use #3 for two different players.
Rewrite: "Your helper (D3) ran all the way to the screener, so nobody was left on his own man, their far-corner shooter (O3)." Tags: "Their shooter (O3) · open" and "Your helper (D3) · one step late". Use the same pair in Break and Compare.

**N-2 (P0) Rounded numbers disagree.** Sentence run 1-2: ready "about half a second", helper needs "about half a second", late "a quarter second"; the numbers behind it are 0.4 / 0.6 / 0.2.
Rewrite (always): "He can shoot in about 0.4 seconds. Your helper needs about 0.6. That is one step too slow - an open shot." Use "late by a fifth of a second" only if a unit word is wanted; never "quarter" for 0.2.

**N-3 (P1) Compare title still jargon in Simple words.** "AFTER: STAY HOME ON THE LIFT" -> "AFTER: FAR-SIDE DEFENDER STAYS WITH HIS OWN MAN"; "AFTER: HELP LESS ON THE ROLLER" -> "AFTER: HELPER STAYS CLOSER TO HIS OWN MAN" (reuse the card name).

**N-4 (P1) A fix can "give up" the problem it was picked for, and says so softly.** Card 2: "Stops: #4's drive from the far wing +2 / Gives up: far-corner shot", and the original problem was the far-corner shot (compare: open about a quarter second, now almost a second). Rewrite card: "Stops: #4's drive (+2 more) / Makes worse: the far-corner shot you started with." Compare line: "Careful: this makes your first problem bigger." Replace "+3" with "+3 more".

**N-5 (P1) Overlaps / clipping at 1280x720.** Lens idea line hidden behind VIEW bar and panel (shot 02); compare court tags land on top of the chips ("#3's Far-corner shot fixed fixed", shot 04); helper card covers the chips (shot 06); problem card is cut at "We can live with this - save it", with "Break my defense" and "Show the numbers" below the fold (shot 01). Move the lens line under the X-RAY bar; keep tags below y=210; let the problem card scroll with a visible fade.

**N-6 (P1) Metres on the court, feet in the sheet.** "2.2 m deeper" -> "7 ft deeper"; "3.0 m to the right" -> "10 ft to the right"; "1.4 m higher" -> "4 ft higher".

**N-7 (P1) Save sheet names a different tradeoff than the compare.** Compare: "worse: #5's drive from the post". Sheet: "Ball to the rim can be open 0.3 s / Screener to the rim can be open 0.3 s". Rewrite: "#5's drive from the post can be open about 0.3 s (a third of a second)." Use the same wording in Our System.

**N-8 (P1) Teach shows "Blue - version 1" after saving version 2** (shot 12). Show "Blue - version 2".

**N-9 (P2) Answer cards.** "Keep the big way back" and "Keep the big back" still look alike; "Often called Deep tag / Full tag" is jargon under Simple words. Rewrite: "Big drops to the basket" / "Big stays between ball and basket"; hide "Often called" in Simple words.

**N-10 (P2) Break result unclear.** "Their shooter is open. How: their normal play already finds it." -> "#3 is open. Their usual play already gets him a shot: your far-side defender (D4) is about half a second late."

**N-11 (P2) "JOB RIGHT NOW" is stale at the problem moment.** Helper card says "Run at the shooter moving up - high hand, short steps" while he is at the screener. -> "Right now he is helping on the screener."

**N-12 (P2) Phone.** Show all three register choices (or "Simple v"), word labels on dock ("Play / Break / Save"), put "Break it / Save as our answer" above the fold, stop clipping court tags at left.

**N-13 (P2) Coaching terms register tone.** Correct for a coach, but "3 of 8 jittered runs (seed, +-0.05 s reaction, +-4% speed, +-0.25 m spots)" reads like lab output. -> "3 of 8 slightly different runs (a step slower, a bit out of place) end the same way."

## What reads well (keep)
Entry, goal and name screens; "Your call: How do you want to handle it?"; fix card names; Compare bars "fixed / worse"; Esc and focus ring; Save sheet pre-fill; Teach empty card; Our System history ("v2 - Same basketball (re-saved)").

## Proxy verdict
Gate A (real coach test) is worth running now, supervised. Biggest risk is behavior 3 and 6: who is who (#3 twice), rounded numbers that disagree, and nothing that invites a "what if".
