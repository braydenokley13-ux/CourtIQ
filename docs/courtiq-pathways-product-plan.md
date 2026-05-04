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

---

## 4. Player IQ Archetypes

Archetypes are the *long-term* personalization layer. v1 does not assign
archetypes; it *names them*, so every Pathway can reference the archetype
it builds and the player has language for who they are becoming.

Archetypes are the personality of a Pathway, not a separate engine. A player
on **Off-Ball Weapon** is becoming a Cutter. A player on **Closeout Killer**
is becoming an Attacker. The archetype label sits at the top of the Pathway
detail page as a chip ("YOU'RE TRAINING TO BE A CUTTER").

We ship 7 archetypes. Each is intentionally a *basketball stereotype the kid
already recognizes*, not a CourtIQ-invented persona.

### 4.1 Ball Watcher (the anti-archetype)

- **Strengths.** None — this is the starting state we're trying to graduate
  the player out of. Watches the ball, stands still, reacts late.
- **Weaknesses.** Backdoor reads, empty-space reads, off-ball spacing,
  defensive recognition.
- **Recommended pathways.** *Complete IQ Foundation* (mandatory entry),
  *Off-Ball Weapon* (next).
- **CourtIQ voice.** "Right now you watch the ball. Let's fix that."
- **Parent/coach summary.** "Player currently keys on the ball; this Pathway
  builds the off-ball habit of reading the defender first."

### 4.2 Cutter

- **Strengths.** Backdoor windows, empty-space cuts, off-ball relocation,
  baseline reads.
- **Weaknesses.** Pick-and-roll ball-handler reads, late-clock decision
  making.
- **Recommended pathways.** *Off-Ball Weapon*, *Help Defense Punisher*,
  later *Wing Decision-Maker*.
- **CourtIQ voice.** "You move when the eyes leave."
- **Parent/coach summary.** "Player consistently moves into vacated space
  when the defender's attention shifts."

### 4.3 Connector

- **Strengths.** Skip passes, advantage passes, weak-side reads, second-side
  creation, post-touch responses.
- **Weaknesses.** Self-creation off the dribble, finishing through contact.
- **Recommended pathways.** *Help Defense Punisher*, *Big Man Connector*,
  later *Wing Decision-Maker*.
- **CourtIQ voice.** "You see the second pass before the first one lands."
- **Parent/coach summary.** "Player recognizes help rotations and moves the
  ball to the open shooter behind the rotation."

### 4.4 Attacker

- **Strengths.** Closeout reads, advantage attacks, baseline / middle drives,
  rip-and-go.
- **Weaknesses.** Reset discipline, weak-side scanning, non-advantage
  patience.
- **Recommended pathways.** *Closeout Killer*, *Pressure & Speed Mode*,
  later *Wing Decision-Maker*.
- **CourtIQ voice.** "You read the feet, then go."
- **Parent/coach summary.** "Player reliably distinguishes a closeout that
  is an advantage from one that isn't, and chooses between shoot, drive, and
  reset."

### 4.5 Floor General

- **Strengths.** Decision speed, reading defenses, organizing teammates,
  PnR ball-handler reads, late-clock.
- **Weaknesses.** Off-ball discipline (often over-uses the ball).
- **Recommended pathways.** *Point Guard Brain*, *Advanced Game Reads*,
  capstone *Pressure & Speed Mode*.
- **CourtIQ voice.** "You see the play before it starts."
- **Parent/coach summary.** "Player anticipates defensive rotations and
  organizes spacing accordingly; capable of making the correct read under
  shot-clock pressure."

### 4.6 Off-Ball Weapon

- **Strengths.** Cuts, relocation, advantage catches, decoy spacing, screen
  rejections.
- **Weaknesses.** On-ball creation, contact finishing.
- **Recommended pathways.** *Off-Ball Weapon*, *Closeout Killer* second.
- **CourtIQ voice.** "Your defender forgot about you. That's the point."
- **Parent/coach summary.** "Player spaces with intent and converts catch
  opportunities into shots, drives, or extras."

### 4.7 Help Defender Punisher

- **Strengths.** Reading two-defender commitments, skip passing, baseline
  drift, weak-side lift.
- **Weaknesses.** Decision speed under heavy pressure, on-ball defense.
- **Recommended pathways.** *Help Defense Punisher*, *Big Man Connector*.
- **CourtIQ voice.** "When two defenders show up, you find the open one."
- **Parent/coach summary.** "Player identifies help-defense commitments and
  passes opposite the rotation rather than into traffic."

### How archetypes are used in v1 vs later

- **v1 (PTH-1).** Each Pathway config has a `recommendedFor` archetype and
  a `targetArchetype` archetype. Display only — no assignment engine.
- **PTH-4.** A simple assignment derived from `Mastery` rows: which decoder
  has the player attempted most + has the highest accuracy? That decides
  their starting archetype label, which the home screen surfaces and the
  Pathway hub uses to highlight a recommended Pathway.
- **Later.** Adaptive assignment that updates as the player progresses; a
  "you've graduated to Connector" notification when an archetype's accuracy
  thresholds are crossed.

---

## 5. Initial Pathway Catalog

Nine Pathways at launch. **One active in v1** (Complete IQ Foundation). Eight
shown as **coming soon** cards with full identity copy so the catalog feels
like a real product, not a single-track demo. Player can tap "Notify me"
(stubbed) on coming-soon cards.

Each entry below carries: title, target player, basketball problem solved,
decoders used, example skills, difficulty, why it matters, unlock logic
(later), and v1 status.

### 5.1 Complete IQ Foundation — `complete-iq-foundation`

- **Target player.** Anyone new to CourtIQ. Required first track.
- **Basketball problem.** Player watches the ball, doesn't react to defender
  cues, and freezes in catch-and-decide moments.
- **Decoders.** All four — BACKDOOR_WINDOW, EMPTY_SPACE_CUT, AOR
  (ADVANTAGE_OR_RESET), SKR (SKIP_THE_ROTATION).
- **Example skills.** Read denial → cut behind. Move when defender's eyes
  leave. Beat the closeout. Punish the help.
- **Difficulty.** 1–3.
- **Why it matters.** This is the basketball brain at the floor — every other
  Pathway assumes these reads.
- **Unlock logic (later).** Auto-assigned to all new users.
- **v1 status.** **Active.**

### 5.2 Off-Ball Weapon — `off-ball-weapon`

- **Target player.** Wing or guard who plays without the ball most
  possessions.
- **Basketball problem.** Player gets stuck in the corner and gets ignored
  on defense.
- **Decoders.** EMPTY_SPACE_CUT, BACKDOOR_WINDOW, ADVANTAGE_OR_RESET.
- **Example skills.** Drift on the stunt. Replace into vacated wing.
  Backdoor the ball-watcher. Catch-and-shoot vs. catch-and-attack reads.
- **Difficulty.** 2–4.
- **Why it matters.** Coaches play kids who move; this is the muscle that
  earns minutes.
- **Unlock logic (later).** Unlocks after Complete IQ Foundation
  Chapters 1–2 mastered.
- **v1 status.** Coming soon.

### 5.3 Closeout Killer — `closeout-killer`

- **Target player.** Anyone who catches the ball off a swing or drive-kick.
- **Basketball problem.** Player either rushes a contested three or holds
  too long and gives the advantage back.
- **Decoders.** ADVANTAGE_OR_RESET, BACKDOOR_WINDOW (for closeout-too-hard
  cases), SKIP_THE_ROTATION (for closeout-into-help cases).
- **Example skills.** Flat feet → drive. Square stance → reset. High close →
  pump-and-go. Late close → catch-and-shoot.
- **Difficulty.** 2–4.
- **Why it matters.** Most of the half-court game ends with a closeout
  decision. Get this right and your shot quality goes up.
- **Unlock logic (later).** Unlocks after Complete IQ Foundation Chapter 3
  mastered.
- **v1 status.** Coming soon.

### 5.4 Help Defense Punisher — `help-defense-punisher`

- **Target player.** Connectors and decision-makers who get the ball after
  a paint touch.
- **Basketball problem.** Player forces the layup into help instead of
  finding the abandoned shooter.
- **Decoders.** SKIP_THE_ROTATION, EMPTY_SPACE_CUT (for the cutter side),
  ADVANTAGE_OR_RESET (for the catch).
- **Example skills.** Read low-man tag. Skip behind the rotation. Punish
  the X-out. Read who came to bracket.
- **Difficulty.** 3–5.
- **Why it matters.** The fastest way to make your team better is to find
  the shooter the help left.
- **Unlock logic (later).** Unlocks after Complete IQ Foundation Chapter 4
  mastered.
- **v1 status.** Coming soon.

### 5.5 Point Guard Brain — `point-guard-brain`

- **Target player.** Primary ball-handler.
- **Basketball problem.** Player isn't seeing the second-side action; runs
  the same play into a wall.
- **Decoders.** ADVANTAGE_OR_RESET, SKIP_THE_ROTATION; later adds PnR
  ball-handler reads (post-v0 content).
- **Example skills.** Reset discipline. Dribble-at reads. Skip rhythm.
  Re-screen calls.
- **Difficulty.** 3–5.
- **Why it matters.** PGs who reset the right way get the ball back; PGs
  who force lose minutes.
- **Unlock logic (later).** Unlocks at IQ ≥ 900 OR Complete IQ Foundation
  mastered.
- **v1 status.** Coming soon.

### 5.6 Wing Decision-Maker — `wing-decision-maker`

- **Target player.** 2/3 hybrid; catches and decides.
- **Basketball problem.** Player has tools but freezes on the catch.
- **Decoders.** ADVANTAGE_OR_RESET (primary), BACKDOOR_WINDOW,
  EMPTY_SPACE_CUT, SKIP_THE_ROTATION.
- **Example skills.** Catch decisions. Live-dribble reads. Shoot/drive/skip
  triples.
- **Difficulty.** 3–5.
- **Why it matters.** This is the modern wing role — read, react, finish or
  move it.
- **Unlock logic (later).** Unlocks at IQ ≥ 1000 OR after Closeout Killer
  mastered.
- **v1 status.** Coming soon.

### 5.7 Big Man Connector — `big-man-connector`

- **Target player.** 4/5 with passing chops; high-post or short-roll
  decisions.
- **Basketball problem.** Bigs who catch and either force a contested
  finish or pass into help.
- **Decoders.** SKIP_THE_ROTATION, ADVANTAGE_OR_RESET; later adds short-roll
  reads.
- **Example skills.** Short-roll skip. Post-double escape. High-post elbow
  decisions.
- **Difficulty.** 3–5.
- **Why it matters.** A big who passes opens every other action on the
  floor.
- **Unlock logic (later).** Unlocks after Help Defense Punisher mastered.
- **v1 status.** Coming soon.

### 5.8 Pressure & Speed Mode — `pressure-and-speed`

- **Target player.** Players preparing for varsity or AAU game speed.
- **Basketball problem.** Player can read it slow but can't read it fast.
- **Decoders.** All four, in mixed-read mode, with shorter freeze windows.
- **Example skills.** 4-second reads. No-hint reps. Rapid-fire mixed reads.
- **Difficulty.** 4–5.
- **Why it matters.** Game speed is a different skill; slow correct =
  garbage time.
- **Unlock logic (later).** Unlocks after any two non-foundation Pathways
  mastered.
- **v1 status.** Coming soon.

### 5.9 Advanced Game Reads — `advanced-game-reads`

- **Target player.** Players ready to mix decoders the way games do.
- **Basketball problem.** Real basketball doesn't tell you which read it
  is — you have to identify the cue.
- **Decoders.** All four, in cross-decoder Mixed Reads.
- **Example skills.** Cue identification. Multi-step reads (e.g., read a
  closeout, then a help rotation off your drive).
- **Difficulty.** 4–5.
- **Why it matters.** This is the test that tells you you've graduated
  from "trainee" to "decoder."
- **Unlock logic (later).** Unlocks after three other Pathways mastered.
- **v1 status.** Coming soon.
