# CourtIQ Pathways Product Plan

> **Status:** Planning document — no code in this PR. Source of truth for what
> Pathways are, how they fit alongside the existing CourtIQ surfaces, and what
> the v1 build (PTH-1) actually ships.

> **Scope guardrails for the implementation that follows this doc:**
> - No schema migration in v1.
> - No new scenarios.
> - No edits to the training loop, renderer, or scenario seeds.
> - Use the existing 20 founder-v0 scenarios (BDW / ESC / AOR / SKR — 5 each).
> - Derive progress from existing `Attempt` + `Mastery` rows.

---

## 1. Product Thesis

**Pathways turn CourtIQ from a random scenario trainer into a guided basketball
IQ development system.**

Today, when a player taps "Train", the engine assembles 5 weighted scenarios
out of the LIVE pool. That session is great. The problem is *between* sessions:
nothing tells the player what they're building, what they've mastered, what
they're weak at, or what to do tomorrow that's different from today. Reps are
abundant; *direction* is not.

Pathways are **guided basketball IQ development tracks** — long-form journeys
that organize scenarios, decoder lessons, mastery rings, boss challenges,
mixed-read tests, and personalized recommendations into a structured arc the
player can see, choose, and commit to.

A Pathway answers the five questions a young player can't currently answer
inside CourtIQ:

1. **What kind of player am I becoming?** ("You're training to be an Off-Ball
   Weapon.")
2. **What reads have I mastered?** ("Backdoor Window: 4/5 — strong. Skip the
   Rotation: 1/5 — weak.")
3. **What should I train next?** ("Beat the Closeout, chapter 3, 5 reps.")
4. **What weaknesses are holding me back?** ("Help-side reads — let's punish
   the rotation.")
5. **How do my reps connect to real basketball improvement?** ("These are the
   reads that get you minutes when your defender ball-watches.")

Pathways are how CourtIQ stops feeling like a quiz and starts feeling like a
**basketball brain career mode**: a player progresses through a track, unlocks
skill nodes, beats boss challenges that mix reads, earns parent/coach-friendly
reports, and gets pointed at the next chapter that closes the largest hole in
their game.

The core promise: *every rep belongs somewhere, and somewhere is moving you
toward the player you're trying to be.*

---

## 2. User Experience Vision

A Pathway is not a list. It's a destination. The player should experience it
the way a kid in a video game experiences a campaign — the map shows where
you've been, where you are, and where the next boss fight is. Reps are pages
in a story.

### The "perfect day" arc for a player on a Pathway

1. Open app. Home screen shows: "You're on **Complete IQ Foundation** — 32%.
   Up next: Beat the Closeout, Chapter 3."
2. Tap the active Pathway card. Land on the **Pathway Detail** page.
3. See a **chapter map** — five chapters, each shown as a node with a mastery
   ring. The current node is breathing/active; future ones are dim; one is
   marked as a **boss challenge** with a heavier visual.
4. Tap "Continue" → drops directly into a Pathway-aware **/train** session
   with that chapter's scenarios and the right teaching mode.
5. Finish the session. Summary screen shows chapter progress moving from 60%
   → 80%, the decoder mastery ring filling on the right concept, and a
   **recommended next action** ("You're one boss challenge away from
   Chapter 4").
6. Optional tap into the **chapter mastery report** — written in clean, parent-
   friendly basketball English: *"Jayden can recognize denial pressure and cut
   behind. Next: punish help defense."*

### Surfaces

- **Pathway Hub (`/pathways`)** — the campaign select screen. Cards for active,
  recommended, and "coming soon" Pathways. The player's current Pathway is
  pinned and live with a progress ring.
- **Pathway Detail (`/pathways/[slug]`)** — the chapter map / skill tree, plus
  a hero block ("This Pathway makes you an Off-Ball Weapon"), the parent/coach
  summary, the recommended next chapter, and the boss challenge gating.
- **Chapter Detail (optional, `/pathways/[slug]/chapters/[chapterSlug]`)** —
  drilled-in view of one chapter: decoder lesson tile, scenario list, current
  mastery, boss challenge card, next-action CTA.
- **Skill Node tile** — a scenario or scenario-set slot inside a chapter,
  shown as a small node on the map with a mastery ring + decoder color.
- **Boss Challenge card** — bigger, heavier visual; "5 reps. No hints. 80%
  to pass." Locked until prerequisites met.
- **Mixed-Read Final Test** — last chapter of every Pathway. Pulls from all
  decoders that Pathway taught, no pre-freeze decoder pill, no decoder hint.
- **Progress Summaries** — chapter complete + Pathway complete views. Two
  voices: kid voice ("You can read denial."), parent/coach voice ("Player
  reliably recognizes a denied passing lane and counters with a back-cut.")
- **Recommended Next Action** — every screen ends with a single CTA: *Continue
  Chapter 3*. No dead ends. No empty home screens.

### Tone

- Kid voice: confident, basketball-native, never childish. "Punish the help."
  Never "Let's learn together!"
- Parent/coach summary: plain English, evaluative, specific. "Recognizes
  closeout momentum and chooses between shoot, drive, and reset."
- No emojis on the player surface; reserved for win bursts and badges only.

---

## 3. Core Pathway Architecture

A Pathway is a **hierarchy**, not a list. Each layer has a single purpose and
a single corresponding UI element.

```
Pathway
  └── Chapter
        └── Skill Node
              └── Decoder
              └── Scenario Set
              └── Boss Challenge (chapter end)
        └── Mastery Report (chapter end)
  └── Mixed-Read Final (last chapter)
  └── Pathway Mastery Report (Pathway end)
```

### Layer purposes

- **Pathway** — the player-facing identity arc. One Pathway = one answer to
  "What kind of player am I becoming?" (Off-Ball Weapon, Closeout Killer,
  Floor General). Holds title, target player, parent/coach summary, decoder
  set, ordered chapters, unlock criteria.
- **Chapter** — one **basketball cue** taught from intro to mixed reps. Maps
  to one decoder family (with the final chapter mixing all). Holds chapter
  title, basketball cue, skill nodes, recommended order, boss challenge, pass
  criteria.
- **Skill Node** — a *bite* the player taps into. One node = one teaching
  mode + one scenario set (or one boss challenge). Carries its own state:
  `locked | unlocked | in_progress | completed | mastered`.
- **Decoder** — the read being taught. Already exists in CourtIQ as the four
  `DecoderTag` values. Pathways do not invent new decoders; they *organize*
  them.
- **Scenario Set** — the actual reps. Today this is a list of scenario IDs
  drawn from the existing `Scenario` rows (founder-v0). Pathway never owns
  scenarios; it references them.
- **Boss Challenge** — chapter-end test. Same scenarios but in challenge mode
  (no hints, decoder pill hidden, 80% to pass, single attempt).
- **Mixed-Read Final Test** — Pathway-end test. Mixed scenarios from all
  decoders the Pathway taught; no hints; the player must self-identify the
  cue.
- **Mastery Report** — narrative summary at chapter and Pathway end, in two
  voices (kid + parent/coach). Computed from existing `Mastery` rows + chapter
  attempt history.

### Why this layering matters

- **Pathway** is identity ("who am I becoming").
- **Chapter** is curriculum ("what cue").
- **Skill Node** is action ("what do I tap right now").
- **Decoder + Scenario Set + Boss** is content (existing CourtIQ assets).
- **Mastery Report** is reflection (the moment a parent screenshots and
  texts a coach).

A Pathway can ship without a custom Mastery Report. It cannot ship without
chapters or skill nodes. The minimal MVP node is `decoder + scenario set` —
no boss yet — and we add boss + report in PTH-3.
