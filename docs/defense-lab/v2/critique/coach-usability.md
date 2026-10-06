# CourtIQ coach-usability critique (55-year-old JV coach, 10 minutes, hates software)

Method: scripted Playwright walks (scripts/qa-local/critic-coach/*.mjs) at 1280x720 and 1440x900, plus the golden screenshots (g3/) and a code read of components/courtiq/. Shots: `shots/coach-*.png`.
Caveats: the dev server died repeatedly and the box hit memory limits (other agents). The **phone (390x844) run, Save-twice, Save-then-Teach and Our System walk never completed live**. Those items are marked "code-read" or "not verified". One finding below (lens buttons covered by the problem card) was real in my first build and is **already fixed** by commit 6d974c7 (toolbar; I re-verified all 10 toolbar buttons clickable at 1280x720).

## First 3 minutes, as him
- 0:00 "What are you working on?" One card, "Ball screens". Fine. Under it five greyed dashed chips ("NEXT UP: Stopping drives...") look clickable but are not (they are previews). He will click them.
- 0:20 "What are you trying to stop?" Seven options. Good plain English. "Show me my options" and "I already know my coverage" sit in the same list as goals, so he is unsure which is the "normal" door.
- 0:40 "A few ways teams keep them away from the basket": four cards. Two are named "Keep the big **way** back" and "Keep the big back" with near-identical text (shot 01). He cannot tell them apart without reading all four paragraphs, and "Often called Sink / Deep drop / Drop / Deep tag / Full tag" is a wall of words he does not own.
- 1:00 "What does your team call it?" with chips Sink / Deep drop (shot 02). He is being asked to name something he has not yet seen. Escape hatch exists ("Doesn't matter - run it").
- 1:30-2:00 (software GL: ~45 s of nothing but a court) then "Here's the problem" (shot 03). He reads a headline, then a 4-line paragraph, then three boxes with numbers. This is where he stalls (P0-1).
- 2:30 He clicks "How do I fix it?" and gets five fixes with seven different pills each (P0-3). He quits or picks the first one.

## P0 - he quits or misreads the basketball

**P0-1. The three numbers do not mean anything to him** (shot 03).
Screen: "0.38 s Layup ready in | 0.81 s Closest defender needs | +0.43 s Too late by", plus court tags "Open 1.0 s" and "Needs 0.81 s". "Layup ready in 0.38 s" reads like a countdown to a layup, not "after the pass he is open for 0.38 s". "Closest defender needs 0.81 s" does not say to do what. "Open 1.0 s" and "0.38 s" are two different open-times for the same player. The disclaimer ("modeled for high-school players. It doesn't predict makes or misses") is the only sentence that sounds like a person.
Why: this is the single moment of "recognize the problem". If the numbers read as lab output he stops trusting it.
Fix (one sentence + one number, then hide the grid behind "Details"):
> "After the pass, #5 can shoot the layup in about **half a second**. Your nearest defender needs **almost a second** to get there. He is **late by about half a second** - that's a layup."
Round to 0.5 s in Plain ("about half a second", "almost a second"), keep exact decimals in Coach. Label boxes: "Shooter is ready in" / "Nearest defender needs" / "He's late by". Drop the "+" sign.

**P0-2. The problem sentence is basketball he did not choose, in words he does not use** (shots 03, 05).
"The far-corner shooter drives past his man to the basket. It starts at the screen: your helper under the basket goes all the way to the screener diving to the basket, so the far side has less help." Four roles in two sentences ("far-corner shooter", "helper under the basket", "screener", "far side"), none labelled on the court (the chip at the player says only "Open 1.0 s"). The headline says "far-corner shooter drives" but the highlighted player (ring + "Open") is next to the ball, not in a corner.
Fix: put the role name on the court tag ("#5 shooter - Open 1.0 s", "Your helper (#3) - Needs 0.81 s") and give the paragraph one cause:
> "Your helper ran to the screener, so nobody was left to stop the shooter."

**P0-3. Fix list is unreadable: repeated labels with different numbers** (shot 07).
"Help less on the roller" shows `Ball to the rim -1.0 s`, `Far-corner shot -0.3 s`, `Ball to the rim -0.3 s`, `Shooter moving up -0.2 s`, `Ball to the rim +0.3 s` - **"Ball to the rim" three times with three different values, one red and two green**. Same on the Compare panel ("Ball to the rim closed 1.0->0.0 s", "...closed 0.3->0.0 s", "...opened 0.0->0.3 s"). A coach reads this as the app contradicting itself.
Why: the pills are keyed by threat but several threats share the display name.
Fix: name them by who: "Ball handler's drive -1.0 s", "Screener's roll +0.3 s", "Far-corner three -0.3 s". Show max 2 pills per fix: best gain (green) and worst cost (red), with words: "Stops the drive. Gives up the corner three."

**P0-4. The compare panel contradicts itself** (shot 08).
Headline: "Closed the shooter moving up, far-corner shot and ball to the rim. **Opened** the screener to the rim." Body: "...does not open anything new." Same panel, same run.
Fix: generate the body from the same data as the headline: "Fixes the drive and both corner shots. **New problem:** the screener is open for a quick layup (0.3 s)." Never write "does not open anything new" when `opens.length > 0`.

**P0-5. Plain register still speaks coach-jargon** (fix details come from lib/defense-lab/explore.ts line ~290, not corpus).
Seen in Plain: "Low man stays closer to the shooter", "Backside defender stays with the lift instead of splitting or X-ing out", "Start the X-out during the tag instead of waiting for the pass", "Stay home on the lift", "Help less on the roller", "Helper: 95%", "Far side swaps". He said he does not know X-out, lift, low man, tag, roller.
Fix rewrites:
- "Help less on the roller" -> "**Helper stays closer to his own man**" / "Your helper leaves the diving big alone and stays with his shooter."
- "Stay home on the lift" -> "**Far-side defender stays with his own man**" / "He doesn't slide over to help, so he can't be beaten on the pass out."
- "Rotate earlier" -> "**Far-side swap starts sooner**" / "Your far-side defender slides over as soon as the helper leaves, not after the pass."
- "Switch the screen" -> "**Switch** - the two defenders trade men" (fine as is, but drop "nobody has to tag").
- Chips under the title: "Helper: 95%" -> "Helper goes: all the way" (the % is meaningless); "Far side swaps" -> "Far-side defender covers for the helper".
Also "roller" is used everywhere in Plain; use "the big who dives" once, then "the diving big".

**P0-6. Teach is a drill-down for a coach who wants to show players a picture** (shot 10; also code-read of TeachHud).
With nothing saved, Teach opens with the title "Current Lab answer (not saved)" overlapped by the player-picker (title is cut to "Current Lab answer (not sa" at 1280x720) and "Who are you teaching? CourtIQ shows only his job, from his point of view." He has not run anything, so a bare court with five names and a 3-way view switch is shown. "His eyes" is a camera of an invented player; coaches say "see it from his side". There is no "send this to the team" or print. For "showing his players" the missing step is output, not more camera angles.
Fix: if no saved answer and the Lab has never been run, Teach shows one card: "Teach starts from an answer you saved. Pick a problem in the Lab first. [Go to Lab]". When opened with an answer: rename "His eyes" -> "Through his eyes", "Overhead" -> "Bird's-eye", and add "Share link / Print one page" (not verified whether a share path exists).

## P1 - slows him down

**P1-1. X-Ray lenses are mystery switches; the explanation is hidden or missing** (shot 04).
"Who has who" paints thin lines with no legend. "Who can get there" turns the court black and draws ghost bodies: nothing says "anyone outside every circle is open". The explanatory sentence (`idea` in lenses.ts) exists but was covered in the first build and is hidden under 820 px (CSS `.lensIdea{display:none}`). After the toolbar fix it is a tooltip (`title`) plus a line below - tooltips do not exist on a phone or for keyboard users.
Fix: always show the one-line `idea` in plain words under the toolbar while a lens is on, and rename: "Who has who" -> "Who's guarding whom"; "Who can get there" -> "Who gets there in time"; "Open passes" -> "Who's open for a pass"; "Room to drive" -> "Lanes to the basket". Put a "Back to normal" pill on the lens line.

**P1-2. Problem panel stays up (stale) while other panels pile on top** (shots 05, 06).
Click "Helper: 95%" or any player on the court and the coach card opens at left while "Here's the problem" is still at right: 3 stacked boxes plus the dock at 1280x720. Press Play, click a defender while it runs: playback pauses at 4.2 s (not at the problem moment), the card changes, the old problem text still describes 3.8 s. At 720p the helper card (7 controls) is cut off at the bottom; "Full control" needs a scroll he won't discover.
Fix: opening the coach card collapses the problem panel to one line ("The problem: ... [Show]"). Pause at the problem moment, not wherever the click lands.

**P1-3. Coach-card controls are two decisions at once and partly duplicated** (shot 05).
Helper card: "Does he help on the screener? Yes, help / No, stay home", slider "How far he helps - All the way to the screener" with end-labels "Stay near shooter / All the way" (value label and right end label say nearly the same thing), "He goes back when: The ball is passed / The big is back", "Change it from: The start of the play / This moment (3.8 s)". The "JOB RIGHT NOW" box says "Run at the shooter moving up - high hand, short steps" while the paragraph next to it says this same helper has gone to the screener. "Change it from" is the most important and least self-explanatory control (it decides whether the edit applies to the whole play or just from now).
Fix: "Change it from" -> "Apply to: **the whole play** / **just from here on**". Job box must match the current phase: at 3.8 s say "Right now he is helping on the screener." Replace the hint with: "Tip: pause, then drag the white dot to move where he helps." Unit "m": the app shows metres ("3.2 m" in Save, "1.6-6 m" in the big's card); a US coach thinks in feet. Show feet (e.g. "10 ft") in Plain.

**P1-4. Break My Defense is the scariest button and the best-named one.** Result: "THEY BROKE IT. The ball handler gets to the basket. **How:** Turn screen -37 deg. The screener's defender has to cover that player." (shot 09). He does not know "Turn screen -37 deg"; "How:" is a developer diff. The footer "CourtIQ tried 26 basketball-legal counters (screen angle, lift timing and spacing, reject, re-screen, short roll)" is the first place "short roll" appears.
Fix: "How: they set the screen at a flatter angle, so your big had to turn his back to the ball." Footer: "CourtIQ tried 26 different things an offense could run against you." Buttons: "Fix it" / "Watch it again" / "We can live with that" / "Leave Break Mode" -> keep first three; replace the last with "Back to my defense".

**P1-5. Save sheet asks 5 things and shows a table he must read** (code-read; live run not completed).
Sheet: name, "Who uses it? Whole program / Varsity / JV / Freshman / One lineup / This game only", "When do we use it?" (pre-filled "High ball screen, middle of the floor"), note, then a side table ("Screener's defender: Near the free-throw line (3.2 m)", "Helper under the basket: Halfway", "Far-side defender: Swaps with the helper") and "Ball to the rim can be open 0.3 s". Defaults are good (name filled), but "Save as our answer" -> "Save to Our System" -> "Save & teach it" is three similar verbs. "Escape" does **not** close the sheet (verified live: still open). "Not yet" is the only exit and reads like a nag.
Fix: primary button "Save" (name only visible; the rest under "More details"); "Save & teach it" -> "Save and show the players"; "Not yet" -> "Cancel". Make Esc and clicking outside close. Say "Saved. Find it under Our System." in the toast ("Our System" is a strange name; "Our Plays" or "Our Playbook" is closer to coaches' language).

**P1-6. "Plain / Coach" toggle labels are backwards for him.** "Coach" sounds like "for me" - he is the coach - but turns on jargon. And the third register ("Ours") appears only after he saves something (seen in the DOM after the first save).
Fix: "Plain" -> "Simple words"; "Coach" -> "Coaching terms".

**P1-7. Lens/camera toolbar and pills that look like tags are buttons** (and chips that look like buttons are not).
"Big stays back near the basket", "Helper: 95%", "Far side swaps" open a coach card; "Change problem" abandons the current run (no confirm; Back from there returns to a blank entry, the run is lost). Meanwhile the "NEXT UP" topic chips are dead.
Fix: make the three chips visibly editable (small pencil icon, label "Tap to change"). Make dead chips look dead (no border) or give them a "coming soon" note. "Change problem" -> "New problem" and confirm only if unsaved.

**P1-8. Speed.** On the software-GL box the problem appears ~45 s after "run it". Real laptops will be much faster, but there is no progress text at all (court only). Add "Setting up the play..." after the name step; a coach watching a blank court for 3 s assumes it hung.

## Keyboard-only
- Play/pause: Space works only when nothing has focus; once he Tabs or clicks a button, Space activates that button instead (CourtIQApp.tsx keydown handler returns early for BUTTON). The first Tab lands on the logo-area tabs, ~11 stops before Play.
- The timeline (`role="slider"`) has no `tabindex`; arrows scrub only through the global handler, same early-return problem. No visible instruction.
- Escape: closes the coach card/lens only if focus is on the page body. It does not close the Fix panel, Compare panel, Break panels or the Save sheet (verified for the sheet). The panels' "x" buttons are reachable only after tabbing through the whole page.
- Focus visibility: toolbar buttons have a blue outline (good); the browser default outline on tabs is `rgb(16,16,16)` (invisible on dark). `.choice`, `.answer`, `.fix` set `outline:none` and rely on a faint border change; `.btn`, `.pill`, `.dockBtn` have no focus style at all. The Save sheet has no focus trap and does not focus its first field.
- Fix: global focus ring `:focus-visible{outline:2px solid #4fb8ff;outline-offset:2px}`; handle Space/Esc/arrows on `window` unless target is INPUT/SELECT/TEXTAREA (let BUTTON handle Enter only); add `tabindex=0` to the timeline; Esc closes the top-most panel/sheet; focus the dialog on open and return focus on close.

## Phone 390x844 and laptop 1280x720
- Laptop 1280x720 (verified): court is cropped at left (a player cut off in shots 04-06); problem card is ~400 px wide and 520 px tall, leaving ~half the court. The scrub-bar labels collide: "SCREEN PASS PASS 2" run together (shot 03). Court tags on Compare overlap each other and clip at the left edge (shot 08: "up closed 0.2->0.0 s", "0.3->0.0 s"). Compare and Fix panels clip their last buttons at the panel bottom ("Try something else" half-visible, shot 08). Next dev-overlay badge ("2 Issues") sits on top of the dock in dev (ignore for prod).
- Phone (not verified live; code-read only): at <=820 px the panel becomes a bottom sheet `bottom:80px; max-height:46vh` (about 390 px). The problem panel's content is ~520 px at 1280 wide, so it will scroll inside the sheet, with the primary button "How do I fix it?" below the fold. The toolbar becomes a one-line horizontal scroller at `bottom:74px` and would sit behind the 46vh sheet, so lenses are again hard to reach. `.lensIdea` is `display:none`. Dock labels are hidden (icons only: a bare "⚡" and "+" with no words). The coach card is `left:16px; top:150px` with no phone rule (code-read).
- Fix to check first on a real phone: a bottom sheet with a drag handle and a collapsed first state showing headline + the primary button only; the dock shows "Play / Fix / Save" with text.

## Break-the-flow tests
- Teach with nothing saved: works, but see P0-6. (verified)
- Switching to Library mid-run, then back to Lab: the run stopped and the moment panel was back as before. Good. (verified)
- Back buttons: "Back" on the goal and answer screens work (code-read). "Change problem" discards the current result with no warning. (code-read)
- Clicking players while playing: pauses at that instant and opens the card; see P1-2. (verified)
- Save twice: "Save to Our System (v2)" is shown for the same name (code-read); the toast says "saved - v2". A coach will think he has two copies. Say "Updated your answer (version 2)". Not verified live.
- The Teach tab with saved answers, and Our System, were not walked live.

## P2 - polish
- "Our program - 0 answers" chip at top-right is a counter with no action; on first visit it says "0 answers", which reads as a failure. Hide until >=1.
- Lab/Our System/Teach/Library: four tabs on a first-use screen. Hide all but "Lab" until something is saved (the principle: easy to start).
- Answer cards: "Often called ..." appears under every card in Plain. Move to a small "Also called" tooltip.
- The "Name" step: show the four names as large buttons ("Drop", "Sink", "Contain", "Back") not a text field first.
- Three different "ready" times appear on one screen ("Open 1.0 s", "Layup ready in 0.38 s", "Needs 0.81 s"). Pick one.
- "+0.43 s" red with a plus sign: use "late by 0.4 s".
- Court tag "Helping here" appears only in Plain; in Coach it says "Tagging". Fine; add the player number to every tag.

## Verdict
Would this coach say "Can we use this before our next game?" **Not yet.** He loves the idea of seeing his coverage on a real court; the Plain intro (what are you trying to stop? -> pick the picture you recognize) is the best part. But the moment that has to earn his trust - the problem screen and the fix list - speaks in decimals, repeats labels with contradicting numbers, and uses the words he said he doesn't know.

**Single biggest blocker: the explanation layer (P0-1, P0-3, P0-4, P0-5).** One run must produce one plain sentence a player could hear ("Your helper left the shooter, he's open by half a second"), one fix per card described by who moves where, and numbers rounded to "about half a second". Until the explanation passes the "read it aloud to a freshman" test, he will not trust the product, and everything after it (compare, save, teach) inherits that distrust.

Quick-win order (all copy or small CSS): P0-4 contradiction, P0-3 pill names, P0-5 rewrites, P0-1 sentence, then keyboard/Esc, then phone check.
