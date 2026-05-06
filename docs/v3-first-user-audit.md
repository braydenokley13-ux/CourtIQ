# V3 — First-user audit (Packet 1)

Audit of the cold-start flow:
`/` → `/onboarding` → `/home` → `/pathways` → `/pathways/[slug]` → `/train` → `/train/summary` → `/pathways/[slug]/progress`.

The film room and Pathways layers are visually polished, but the first-time
experience asks the player to learn three new vocabulary words ("decoder",
"pathway", "Final Mix") with no inline explanation. The audit calls out the
specific surfaces where a brand-new player loses motivation, gets stuck on
copy, or has no obvious next action.

## P0 — must fix before user testing

1. **Landing page is empty.** `/` is a placeholder ("Train your brain like
   you train your game.") with no link into auth, no explanation of what
   CourtIQ is, no demo. Anyone who lands directly on the marketing route
   bounces.
2. **No "what is CourtIQ" intro after onboarding.** The 5-step onboarding
   collects birth year + position + skill + goal + a 3-rep calibration,
   then drops the player on `/home` with a giant IQ number, "🏀 Start Today's
   Session", and nav to Pathways/Academy/Profile. A new player has no
   in-app definition of "Basketball IQ", "decoder", "pathway", or
   "scenario" before being asked to pick one.
3. **"Decoder" vocabulary is undefined for first-time users.** The home
   page has a "Decoder Mastery" section that only appears after attempts
   exist, and the Pathway detail page lists decoder names as small
   tag-pills with no explanation. There is no "what is a decoder" panel.
   Decoder names like "Backdoor Window" and "Skip the Rotation" are
   self-explanatory to a coach but opaque to a 12-year-old.
4. **Pathway hub doesn't state what a Pathway is.** `/pathways` reads
   "Guided basketball IQ tracks. Each Pathway is a long-form journey
   that organizes scenarios, decoders, and mastery into a single arc."
   That's three undefined nouns ("scenario", "decoder", "mastery") in a
   single sentence. Foundation should be a one-tap "Start here" with a
   plain-language hook.
5. **Home page has too many CTAs.** In one viewport: Continue Pathway
   card, "Start Today's Session" green slab, Decoder Mastery grid, Recent
   Sessions list, 5 nav tiles (Pathways / Academy / Profile / Leaderboard
   / Settings). A new user with zero data sees a wall of UI and no clear
   first move.
6. **Boss / Final Mix copy is ungrounded.** The Pathway detail page shows
   "Boss Challenge" rows and a "Real Game Mix / Final Mix" capstone, but
   nothing explains *why* a Boss is harder or what "Final Mix" tests
   (i.e. "no decoder pill — you read the play yourself"). Without that
   framing, the player just sees harder reps with no visible upside.

## P1 — should fix

7. **Home → Train CTA buries the Pathway.** "🏀 Start Today's Session"
   greys out Pathway routing — tapping it just runs the random 5-pack
   from `/api/session/start`. For a Pathway-first product, the brand-
   primary CTA on home should drop the player into the recommended
   Pathway node, not a random session.
8. **Train page has no "what skill" line.** Inside a session, the only
   context strip is "Pathway · Title" + a chapter/node breadcrumb. The
   actual concept being trained ("you're learning to read backdoor
   windows") is not stated in the prompt, so the player can't connect
   the rep back to the lesson.
9. **Boss/Final Mix lack "hints reduced" framing on the rep page.** The
   challenge strip says "Boss Challenge · 80% to pass" but doesn't tell
   the player *why* this run feels different (no decoder label, no
   decoder pill, no lesson hand-off). When the cue overlay disappears,
   it just looks broken.
10. **Train summary "What just happened" is generic.** It says "You
    finished N plays in M seconds. You earned XP." but doesn't tell the
    player what they got better at (e.g. "you got 3/3 backdoor reads
    right" → mastery moved). The "What improved" promise is unmet.
11. **Onboarding never names the four decoders.** The 5-step setup ends
    on calibration ("3 quick reads") and then routes to home, but never
    names the four decoders by name. The first time the player sees
    "Backdoor Window" is mid-rep on the Pathway page.
12. **No return loop.** A player closes the tab after a session — when
    they come back, the home page just shows yesterday's IQ. There is
    no "Continue where you left off" or "Today's focus" or "1 rep to
    master Backdoor Window" front-and-center on home for a returning
    player. The Pathway detail card has it, but home is the entry point.
13. **`/onboarding` doesn't link to a quick "skip and explore"** for
    impatient testers — the only path is straight through 5 steps.

## P2 — defer

14. Course catalog routing: `/academy` is loosely connected; the Pathway
    "Read the lesson" link on a skill node tile sends the player to an
    Academy detail page that doesn't reciprocate (no "back to Pathway").
15. Profile / Leaderboard / Settings tiles in Home's nav grid are visual
    weight without near-term value — could collapse to a single "More"
    chip after first session.
16. The "Quick 5 plays" link on `/pathways` competes with the active
    Pathway CTA. Acceptable for v1; consider deferring it to a chip.
17. The 5-step onboarding could compress age + position into one screen
    — the calibration is already a third of the flow. Not blocking
    first-user testing.

## Summary of the V3 work

The flow is mechanically intact. The product just needs:
- a real landing-page hook with a path into auth + calibration,
- a one-screen "Welcome to CourtIQ" cover page right after onboarding,
- decoder explanation surfaces (info panel + "what is a decoder" copy),
- a Pathway-centric home page that always has one obvious next action,
- training-loop copy that names the read and explains hints-off mode,
- a return-loop chip on home for the day-2+ returning player.

All other surfaces (renderer, scenario JSON, scoring, schema) are
unchanged.
