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

---

## 6. V1 Pathway: Complete IQ Foundation

**Slug.** `complete-iq-foundation`
**Display title.** Complete IQ Foundation
**Subtitle.** Build your basketball brain from the ground up.
**Target archetype.** Cutter (with foundation in all four decoders).
**Recommended for.** Ball Watcher (mandatory), all new users.
**Estimated minutes.** ~45 minutes total across five chapters.
**Difficulty.** 1–3 (all 20 founder-v0 scenarios are 1–3).

**Pitch (player voice).**
> Build your basketball brain from the ground up. Learn to read denial,
> move when defenders look away, beat closeouts, and punish help rotations.

**Pitch (parent/coach voice).**
> Foundational five-chapter track that teaches a player to recognize four
> universal off-ball / catch-decide cues: backdoor windows, empty-space
> reads, advantage-vs-reset closeouts, and help-rotation skips. Built on
> 20 universally-taught youth basketball scenarios, each authored against a
> single best-read with feedback for every option.

**Decoders covered.** BACKDOOR_WINDOW · EMPTY_SPACE_CUT · ADVANTAGE_OR_RESET ·
SKIP_THE_ROTATION.

**Scenarios used (founder-v0 pack, 20 total).**
- BDW-01, BDW-02, BDW-03, BDW-04, BDW-05
- ESC-01, ESC-02, ESC-03, ESC-04, ESC-05
- AOR-01, AOR-02, AOR-03, AOR-04, AOR-05
- SKR-01, SKR-02, SKR-03, SKR-04, SKR-05

The five chapters below use the existing scenarios in the order their seed
files are authored (difficulty-ascending per family).

---

### Chapter 1 — Read the Denial

- **Slug.** `read-the-denial`
- **Subtitle.** When the defender blocks the pass, the basket is open.
- **Basketball cue.** Defender's hand or foot in the passing lane (chest
  between ball and receiver).
- **Decoder.** `BACKDOOR_WINDOW`
- **Scenarios (recommended order).** BDW-01 → BDW-02 → BDW-03 → BDW-04 →
  BDW-05.
- **Skill nodes.**
  1. **Learn the Cue** — decoder lesson tile linking to academy lesson
     `backdoor-window`. Unlocks after first session start.
  2. **First Reps** — BDW-01 + BDW-02 (difficulty 1).
  3. **Disguised Denials** — BDW-03 + BDW-04 (difficulty 2).
  4. **Timing Test** — BDW-05 (difficulty 3 — air-pass timing).
  5. **Boss Challenge — Denial Reader** — all 5 BDW scenarios in random
     order, no decoder pill, no hints.
- **Goal (player voice).** Learn when your defender blocks the passing lane
  and how to punish it by cutting behind.
- **Goal (parent/coach voice).** Player will recognize a denied passing lane
  (hand/foot in lane, chest blocking line) and counter with a back-cut to
  the rim.
- **Pass criteria (skill nodes).** Each non-boss node passes when its
  scenario set has been attempted at least once and best-answer accuracy on
  those scenarios ≥ 60%.
- **Mastery criteria (chapter).** ≥ 4 of 5 best answers across BDW-01..05
  *and* `Mastery(BACKDOOR_WINDOW, decoder)` rolling accuracy ≥ 0.80 with
  ≥ 5 attempts. (Both signals already exist today.)
- **Boss challenge.** 5 reps, all BDW, decoder pill hidden, no hint
  micro-praise, ≥ 80% best to pass; failure shows a "rerun chapter" CTA, not
  a punishment screen.
- **What the player should understand by the end.** "If his hand or foot is
  in the lane, the basket is open. Cut behind, not in front."
- **Parent/coach summary text.**
  > Player can recognize a denied passing lane and counters with a back-cut
  > rather than holding the spot. Foundation read for off-ball offense.

---

### Chapter 2 — Move When Eyes Leave

- **Slug.** `move-when-eyes-leave`
- **Subtitle.** When the defender looks at the ball, you go.
- **Basketball cue.** Defender's eyes / hips / shoulders rotate toward the
  ball; nearby floor space is empty.
- **Decoder.** `EMPTY_SPACE_CUT`
- **Scenarios (recommended order).** ESC-01 → ESC-02 → ESC-03 → ESC-04 →
  ESC-05.
- **Skill nodes.**
  1. **Learn the Cue** — decoder lesson tile (`empty-space-cut`).
  2. **First Reps** — ESC-01 + ESC-02 (difficulty 1).
  3. **Help-Turn Reads** — ESC-03 + ESC-04 (difficulty 2).
  4. **Replace the Empty Spot** — ESC-05 (difficulty 3).
  5. **Boss Challenge — Cutter** — all 5 ESC, no hints.
- **Goal (player voice).** Learn to cut, drift, or replace when your
  defender turns toward the ball or to help.
- **Goal (parent/coach voice).** Player will move on the help turn instead
  of after it, exploiting the half-second gap before the defender's body
  follows their eyes.
- **Pass criteria (skill nodes).** Same shape as Chapter 1.
- **Mastery criteria (chapter).** ≥ 4 of 5 best on ESC-01..05 *and*
  `Mastery(EMPTY_SPACE_CUT, decoder)` ≥ 0.80 / ≥ 5 attempts.
- **Boss challenge.** 5 reps, no decoder pill, no per-cue micro-praise.
- **What the player should understand by the end.** "When the eyes leave,
  the feet move. Cut into the empty patch, not the wing his eyes are
  pointing at."
- **Parent/coach summary text.**
  > Player anticipates help defense by reading the defender's eyes/hips
  > and relocates *before* the rotation completes. The off-ball habit that
  > separates effective wings from bystanders.

---

### Chapter 3 — Beat the Closeout

- **Slug.** `beat-the-closeout`
- **Subtitle.** Read the feet. Then choose: shoot, drive, reset.
- **Basketball cue.** Closeout defender's feet/balance — parallel + forward
  → drive; squared + balanced → reset; late + short → shoot; high + tilted
  → pump-and-go; sideways recovery → attack the open hip.
- **Decoder.** `ADVANTAGE_OR_RESET`
- **Scenarios (recommended order).** AOR-01 → AOR-02 → AOR-03 → AOR-04 →
  AOR-05.
- **Skill nodes.**
  1. **Learn the Cue** — decoder lesson tile (`advantage-or-reset`).
  2. **Go Now** — AOR-01 (no gap, drive past flat feet).
  3. **Reset Discipline** — AOR-02 (square stance, swing the ball).
  4. **Shoot vs. Pump** — AOR-03 + AOR-04 (late close + high close).
  5. **Open Hip** — AOR-05 (sideways recovery → drive open hip).
  6. **Boss Challenge — Catch Decider** — all 5 AOR, no decoder pill.
- **Goal (player voice).** Learn when to shoot, drive, or reset based on
  the defender's feet and momentum.
- **Goal (parent/coach voice).** Player will read the closeout's stance
  before the catch and choose between shoot, drive, and reset rather than
  defaulting to a single option.
- **Pass criteria (skill nodes).** Same shape as Chapter 1.
- **Mastery criteria (chapter).** ≥ 4 of 5 best on AOR-01..05 *and*
  `Mastery(ADVANTAGE_OR_RESET, decoder)` ≥ 0.80 / ≥ 5 attempts.
- **Boss challenge.** 5 reps, mixed AOR cues (so the player has to
  re-identify each closeout type cold).
- **What the player should understand by the end.** "Three answers on every
  catch — shoot, drive, reset. The defender's feet tell me which one."
- **Parent/coach summary text.**
  > Player distinguishes a closeout that is an advantage from one that
  > isn't, and selects the highest-value response on the catch (catch-and-
  > shoot, rip-and-go, or reset/swing).

---

### Chapter 4 — Punish the Help

- **Slug.** `punish-the-help`
- **Subtitle.** When two defenders show up, find the one they left.
- **Basketball cue.** Two defenders committed to the paint or the ball; a
  weak-side defender stunting/helping in.
- **Decoder.** `SKIP_THE_ROTATION`
- **Scenarios (recommended order).** SKR-01 → SKR-02 → SKR-03 → SKR-04 →
  SKR-05.
- **Skill nodes.**
  1. **Learn the Cue** — decoder lesson tile (`skip-the-rotation`).
  2. **Paint Touch** — SKR-01 (paint collapse → opposite corner).
  3. **PnR Tag Skip** — SKR-02 (drag screen, tagger leaves corner).
  4. **Post Touch Skip** — SKR-03 (post double, weak corner).
  5. **Dribble-At Skip** — SKR-04.
  6. **X-Out Skip** — SKR-05 (baseline drive, X-out leaves slot).
  7. **Boss Challenge — Rotation Reader** — all 5 SKR, mixed.
- **Goal (player voice).** Learn to identify help defense and pass behind
  the rotation.
- **Goal (parent/coach voice).** Player will identify two-defender
  commitments and pass *opposite* the rotation, prioritizing the highest-
  recovery-cost shooter.
- **Pass criteria (skill nodes).** Same shape as Chapter 1.
- **Mastery criteria (chapter).** ≥ 4 of 5 best on SKR-01..05 *and*
  `Mastery(SKIP_THE_ROTATION, decoder)` ≥ 0.80 / ≥ 5 attempts.
- **Boss challenge.** 5 reps, decoder pill hidden, no per-cue
  micro-praise.
- **What the player should understand by the end.** "Look opposite the
  help. The help came from somebody — that somebody is the answer."
- **Parent/coach summary text.**
  > Player recognizes help-side commitments and passes opposite the
  > rotation rather than into traffic. The read that turns drive-and-kick
  > into open threes.

---

### Chapter 5 — Real Game Mix

- **Slug.** `real-game-mix`
- **Subtitle.** Now read the play, not the decoder.
- **Basketball cue.** All four. The player has to *identify* the cue
  before answering — no decoder pill is shown.
- **Decoders.** All four — BACKDOOR_WINDOW, EMPTY_SPACE_CUT,
  ADVANTAGE_OR_RESET, SKIP_THE_ROTATION.
- **Scenarios.** Mixed set drawn from all 20 founder-v0 scenarios.
  Recommended pool: a 10-rep mixed-read final test, drawing 2–3 scenarios
  per decoder, randomized order, with at least one difficulty-3 rep per
  decoder represented.
- **Skill nodes.**
  1. **Mixed Reads — Warmup** — 5 randomized reps (any decoders), decoder
     pill hidden, hints off, but feedback unchanged.
  2. **Mixed Reads — Pressure** — 5 reps, shorter on-screen freeze, but
     same scoring.
  3. **Pathway Boss Challenge — All Reads** — 10-rep mixed final, ≥ 80%
     best to pass.
- **Goal (player voice).** Make game-like decisions without being told
  which decoder to use.
- **Goal (parent/coach voice).** Player will self-identify which read the
  scenario presents (denial / empty-space / closeout / help rotation) and
  execute the correct response without a decoder cue.
- **Pass criteria.** Each warmup/pressure node passes at first attempt.
  The Pathway-level boss requires 8/10 best answers in one attempt.
- **Mastery criteria (chapter / Pathway).** All four decoder masteries at
  ≥ 0.80 with ≥ 5 attempts each, *and* boss attempt ≥ 8/10 best.
- **Boss challenge.** Pathway-level. This is the *capstone* — it is the
  Mixed-Read Final Test.
- **What the player should understand by the end.** "I can recognize the
  read on my own — denial, empty space, closeout, help — and choose the
  right answer without being prompted."
- **Parent/coach summary text.**
  > Player demonstrates cue identification and decision selection across
  > all four foundation reads, mixed and unlabeled. This is the threshold
  > between trainee and decoder.

---

### 6.X Mastery Report (Pathway-end)

When the player completes all five chapters, the **Pathway Mastery Report**
renders. v1 ships the simplest version — derived from existing data, no
schema change.

- **Header.** "You completed Complete IQ Foundation."
- **Big metric tile.** Decoder mastery rings for all four decoders (already
  computable from `Mastery(decoder)` rows).
- **Best read.** Highest-accuracy decoder, named.
- **Watch this.** Lowest-accuracy decoder, named.
- **Parent/coach card.** Pre-written paragraph (per Pathway in config) that
  summarizes the four reads in plain English.
- **Next Pathway.** Recommended Pathway from the catalog
  (default: Off-Ball Weapon if Cutter-leaning, Closeout Killer if Attacker-
  leaning — derived from which decoder accuracy is highest).
- **Share.** "Send to my coach" / "Send to my parent" stub.

---

## 7. Skill Tree / Map UX

The **chapter map** is the single most important Pathway surface. It is the
campaign select that the player taps over and over. It must read at a glance:
where am I, what's next, what's locked, what's mastered.

### Node types

- **Decoder Lesson Node** — links to the existing academy lesson for the
  chapter's decoder. Visual: brand-tinted card with the lesson icon.
- **Scenario Set Node** — opens a /train session with that node's
  scenario IDs. Visual: small node with mastery ring around the icon.
- **Boss Challenge Node** — chapter-end test. Visual: heavier card with a
  "BOSS" eyebrow chip, slight heat-red glow when locked.
- **Mastery Report Node** — surfaces only after a chapter is mastered.
  Visual: brand-green check, `Done` chip.
- **Mixed-Read Final Node** — only on Chapter 5 of any Pathway. Visual:
  larger card spanning two columns, purple-iq tint to signal capstone.

### Node states

- `locked` — prerequisite not met; muted, lock icon, "Finish X to unlock"
  micro-copy.
- `unlocked` — available but not started; brand outline, hairline-2 fill.
- `in_progress` — at least one attempt logged on its scenarios; iq-purple
  ring partially filled.
- `completed` — all scenarios in the node attempted at least once.
- `mastered` — pass criteria met (per §9); brand ring fully closed, soft
  brand glow.

### Mastery rings

Every Scenario Set, Decoder, Chapter, and Pathway gets a ring. Rings show
*progress toward mastery*, not raw count. Computed from existing data:

- Scenario Set ring = (best-answer count on those scenarios) / (set size).
- Chapter ring = (mastered scenario sets in that chapter) / (total sets).
- Decoder ring = `Mastery(decoder).rolling_accuracy` clamped to [0, 1].
- Pathway ring = average of chapter rings.

### Boss challenge cards

- Visual weight: noticeably bigger than scenario set nodes.
- Locked appearance: dim with a single-line requirement ("3/3 chapter sets
  mastered to unlock").
- Unlocked appearance: heat-red eyebrow chip *BOSS*, brand glow when
  hovered, "BEST OF 1 · 5 REPS · NO HINTS · 80% TO PASS" stat row.
- After pass: switches to a brand-green *CLEARED* chip with the score, e.g.
  *CLEARED · 5/5*.

### Decoder color coding

Each decoder owns one accent so the chapter map is glanceable.

- **BACKDOOR_WINDOW** — `--brand` (electric green). Cue: cut behind.
- **EMPTY_SPACE_CUT** — `--info` (sky blue). Cue: cut into space.
- **ADVANTAGE_OR_RESET** — `--xp` (orange). Cue: read feet, then choose.
- **SKIP_THE_ROTATION** — `--iq` (purple). Cue: pass opposite the help.
- **Mixed Reads / Capstone** — `--heat` (heat-red). Cue: identify the cue.

(Color tokens are existing CIQ tokens defined in ARCHITECTURE.md §4.2.)

### Recommended next node

Exactly one node on the entire map carries a *Up Next* chip and a soft
breathing pulse. The recommendation logic is in §9. This is the single
"what do I tap?" answer the player needs.

### Weak-skill warning

If the player has a chapter where decoder accuracy is < 0.50 with ≥ 3
attempts, that chapter shows a small *Watch this* chip in heat-red. Not
punishing — informational. It's also the suggested boss-challenge retry
target.

### Visual hierarchy (top to bottom)

1. Pathway hero strip — title, archetype chip, parent/coach summary toggle.
2. Pathway progress ring + chapter dots row.
3. Recommended next action card (sticky-ish on mobile).
4. Chapter list — each chapter is a row with its node cluster inside.
5. Pathway mastery report card (locked until all chapters mastered).
6. Coming-soon next-Pathway teaser at the bottom.

### Desktop vs. mobile layouts

- **Mobile (primary).** Single column. Each chapter row has nodes laid out
  left-to-right with horizontal scroll if needed. Recommended next action
  pinned just below header until the player taps it.
- **Desktop.** Two-column layout for the map: chapter rail on the left
  (sticky), node cluster + decoder lesson on the right. Wider mastery
  rings, parent/coach summary always visible.

The map is **not** a literal zig-zag tree like Academy — Pathways are
linear by design (the chapters are an arc, not a graph), so the map is a
clean ordered list of chapter rows. Skill nodes within a chapter can fan
out, but chapter order is fixed.

---

## 8. Training Modes Inside Pathways

Pathways introduce *training modes* — the same `/train` engine in different
postures. Modes are how the same scenario serves different stages of
learning. Modes are config, not new code paths in v1.

### Mode 1 — Learn the Cue

- **Purpose.** Introduce the decoder before any reps. Player reads the
  academy lesson tile and gets one easy rep with full hints on.
- **UI behavior.** Decoder pill visible. Pre-freeze cue overlays at full
  visibility. Self-review checklist auto-expanded.
- **Scenario selection.** First (lowest difficulty) scenario in the
  chapter's family.
- **Scoring.** Half IQ multiplier so the introduction rep doesn't punish
  or inflate.
- **Where it appears.** First node of every chapter.

### Mode 2 — Freeze-Frame Read

- **Purpose.** Standard guided rep — the current /train experience, with
  decoder pill and cue overlays.
- **UI behavior.** As today: decoder pill visible, freeze marker, choices,
  feedback, replay.
- **Scenario selection.** Sequential within the chapter's pack
  (difficulty-ascending).
- **Scoring.** Standard IQ + XP per current `iqService` formula.
- **Where it appears.** Default for non-boss skill nodes.

### Mode 3 — No-Hint Rep

- **Purpose.** Force the player to identify the read without the decoder
  pill or pre-freeze cue overlays.
- **UI behavior.** Decoder pill *hidden*. Pre-freeze overlays suppressed
  (post-answer overlays still allowed).
- **Scenario selection.** Same chapter, same decoder; one scenario the
  player has already passed at least once.
- **Scoring.** 1.2× IQ multiplier (recognition without hint is harder).
- **Where it appears.** "Test the cue" node late in each chapter; warmups
  in Chapter 5.

### Mode 4 — Mixed Reads

- **Purpose.** Train cue identification across decoders.
- **UI behavior.** Decoder pill hidden; decoder-specific micro-praise
  swapped for generic praise; explanation-md still surfaces post-answer.
- **Scenario selection.** Random pull from all decoders the Pathway has
  taught so far. v1 implementation: just pass `scenarioIds` of mixed
  scenarios to the existing /train flow.
- **Scoring.** 1.3× IQ multiplier.
- **Where it appears.** Chapter 5 of Complete IQ Foundation; *Pressure &
  Speed* and *Advanced Game Reads* later.

### Mode 5 — Boss Challenge

- **Purpose.** Single-attempt chapter test.
- **UI behavior.** Decoder pill hidden. No replay button. No "Why?"
  expansion until the boss is fully complete. Single CTA: keep going.
- **Scenario selection.** All scenarios for that decoder, randomized.
- **Scoring.** 1.5× IQ multiplier on best answers; 0× on misses (no
  penalty either, to keep youth motivation up). Pass = ≥ 80% best
  across the run.
- **Where it appears.** End of every chapter.

### Mode 6 — Film Room Review

- **Purpose.** *Post*-mistake reflection. Lets the player re-watch the
  best-read replay and the consequence replay back-to-back without the
  rep counting.
- **UI behavior.** Reuses today's replay components; no choices, no
  scoring. Two buttons: "best read" / "what would have happened".
- **Scenario selection.** Most recent missed scenario, or any scenario
  the player taps from the chapter's history.
- **Scoring.** None.
- **Where it appears.** Mastery Report and chapter detail page; never
  in a session.

### Mode 7 — Pressure Test

- **Purpose.** Train cue recognition at game speed.
- **UI behavior.** Same as Freeze-Frame Read but with a shorter on-screen
  freeze (~half the default settle window) and the timer ticking
  immediately at freeze.
- **Scenario selection.** Random within Pathway, only scenarios the
  player has previously mastered.
- **Scoring.** 1.4× IQ multiplier.
- **Where it appears.** Pathway 5.8 *Pressure & Speed Mode* (later);
  Chapter 5 second node of Complete IQ Foundation only after the warmup.

### Mode behavior in v1

v1 ships **only Mode 1, Mode 2, and Mode 4** for Complete IQ Foundation.
Mode 5 (Boss) and Mode 7 (Pressure) come in PTH-3. Mode 6 (Film Room)
comes in PTH-2 reusing today's replay UI. Mode 3 (No-Hint) is a query-
param flag (`?mode=no-hint`) that the train page can choose to honor by
hiding the decoder pill — config only, no engine change.

---

## 9. Progress and Recommendation Logic

Progress is **derived**, not stored, in v1. Every number on a Pathway page
can be computed from rows that already exist: `Attempt`, `SessionRun`,
`Mastery` (concept + decoder dimensions), and the static Pathway config.

### Building blocks (existing data)

- `Attempt(user_id, scenario_id, choice_id, is_correct, created_at)` — row
  per rep.
- `Mastery(user_id, concept_id, dimension, rolling_accuracy, attempts_count,
  spaced_rep_due_at)` — already split by `concept` and `decoder`
  dimension.
- Per-scenario `decoder_tag` and `concept_tags` on the `Scenario` row.
- `ChoiceQuality` (`best | acceptable | wrong`) on the chosen choice — gives
  us a "best answer" signal richer than pass/fail.

### Per-skill-node progress

For a node whose `scenarioIds = [s1, s2, s3]`:

- `attemptedCount` = unique scenario IDs from `Attempt` where
  `scenario_id in [s1,s2,s3]` and `user_id = self`.
- `bestCount` = unique scenario IDs where the most recent attempt's choice
  was `quality = best`.
- `state`:
  - `bestCount = scenarioIds.length` → `mastered`.
  - `attemptedCount = scenarioIds.length` → `completed`.
  - `attemptedCount > 0` → `in_progress`.
  - else if all prerequisite nodes are `mastered`/`completed` → `unlocked`.
  - else → `locked`.

### Per-chapter progress

- `chapterProgress = mastered_skill_nodes / total_skill_nodes` (0–1).
- `chapterMastered` = (all non-boss nodes mastered) AND (boss node passed).

### Per-Pathway progress

- `pathwayProgress = average(chapterProgress)` across all chapters.
- `pathwayMastered` = all chapters mastered.

### Recommended next chapter

Run in this priority order, return the first match:

1. **Resume rule.** If any chapter is `in_progress`, recommend the most
   recent in-progress chapter's next un-mastered skill node.
2. **Sequence rule.** Otherwise, the lowest-order chapter that is
   `unlocked` and not mastered.
3. **Weakness rule.** If all chapters are mastered except one and that
   chapter has decoder accuracy < 0.6, recommend it (priority over
   sequence).
4. **Capstone rule.** If all decoders are mastered but the Pathway boss
   has not been attempted, recommend the boss.

The result is a **single recommendation object** the Pathway page can
render as one card.

### Weakest decoder

`weakestDecoder = argmin( Mastery(decoder).rolling_accuracy )` across the
four decoders the Pathway uses, with a minimum 3-attempt floor so a single
wrong rep doesn't dominate.

If a Pathway's chapter map shows a *Watch this* chip on a chapter, it's the
chapter whose decoder is `weakestDecoder`.

### Users with no attempts (cold start)

- Pathway progress = 0%.
- Recommended next = Chapter 1, Skill Node 1 (Learn the Cue).
- All chapters past Chapter 1 are visually `locked`.
- Hub shows: "Start your first Pathway: Complete IQ Foundation."

### Users with partial completion

- Show every node's true state (no rounding up).
- Recommended next is the next un-mastered node within the highest-
  numbered in-progress chapter.
- Mastery Report appears on completed chapters only.

### Boss challenge unlock

- Per-chapter boss: unlocks when all non-boss skill nodes in that chapter
  are at `completed` or `mastered`.
- Pathway boss (Mixed-Read Final): unlocks when all four decoder masteries
  are at ≥ 0.65 AND all four chapter bosses have been attempted.

### Future evolution into adaptive personalization

PTH-4+ replaces the priority-rule recommender with a derived **player
profile**:

- Archetype assignment from highest-mastery decoder.
- Adaptive next-rep selection inside a Pathway based on weakness *and*
  spaced-rep due-at.
- Cross-Pathway recommendation: "you've mastered Foundation Chapter 3 →
  start Closeout Killer."

The data hooks for this are already present (the existing weighting in
`generateSessionBundle`). PTH-4 wires them through Pathway-aware filters
without changing the schema.

---

## 10. Relationship to Academy

Pathways and Academy are **complementary**, not redundant. Today's
`/academy` already exists, with `Module → Lesson → Concept → Mastery`,
plus a separate decoder list. Pathways do not replace Academy. They
*conduct* it.

### The clean split

- **Academy is the textbook.** Modules teach concepts. Lessons explain
  cues. The reader can pick any chapter, any time, in any order. State =
  *did I read this?* + *did I master the underlying concept?*
- **Pathways is the journey.** A directed arc that *uses* Academy lessons
  as nodes inside chapters. State = *where am I on this track?*

Said differently: Academy is "what should I learn?". Pathways is "what
am I becoming?".

### How they connect

- A **Pathway chapter's Decoder Lesson Node links to its Academy lesson.**
  Tapping it routes to `/academy/<lesson-slug>` (e.g. `backdoor-window`),
  which already exists. The Academy lesson page can show a
  *You're inside Complete IQ Foundation, Chapter 1* breadcrumb when
  arrived via a Pathway.
- An **Academy lesson can recommend Pathway reps.** "Practice this read
  in *Read the Denial* → 5 reps." A small Pathway promo at the bottom of
  the Academy lesson page.
- **Missed Pathway reps recommend Academy review.** When the player
  fails a chapter boss, the Mastery Report's "Watch this" card links
  back to that decoder's Academy lesson.

### What lives where

| Surface | Owns |
| --- | --- |
| **Academy** | Lesson body markdown, decoder explanations, evergreen reference content, decoder-mastery tile (already shipped). |
| **Pathways** | Player identity arc, chapter ordering, skill node graph, boss challenge wrappers, Pathway-level Mastery Reports, archetype labels. |
| **/train** | The session itself. Both Academy and Pathways link into /train; only the params change. |

### What we don't duplicate

- **No new Concept rows.** Pathways do not create Concepts.
- **No new Module rows.** A "chapter" is *not* a Module. Modules are
  Academy's unit of mastery; chapters are Pathways' unit of journey.
- **No second Mastery model.** Pathway mastery rings read from existing
  `Mastery` rows by `dimension` (concept or decoder).
- **No second lesson surface.** The Pathway chapter's "Learn the Cue"
  tile is *the existing Academy lesson page*, optionally framed with a
  Pathway breadcrumb.

### The contract

> Every concept lives in Academy.
> Every journey lives in Pathways.
> Every rep lives in /train.
> No piece of content lives in two places.

If we ever feel the urge to write a "lesson" inside a Pathway chapter,
that lesson belongs in Academy, and the chapter should *link* to it.

---

## 11. Data Model Recommendation

### v1: typed config, no migration

The single biggest decision: **Pathways v1 is a typed TypeScript config
file**, not a set of database tables. Three reasons.

1. **Speed to ship.** A config file ships in a day; a migration plus
   admin tooling ships in weeks.
2. **Existing data is sufficient.** Every number Pathways needs is
   derivable from `Attempt`, `SessionRun`, `Mastery`, `Scenario`. There
   is no per-user state Pathways must persist that today's tables don't
   already cover.
3. **Lower risk.** A config-only Pathway can be edited, A/B tested,
   re-ordered, and tuned without touching the schema or the seed
   pipeline.

What v1 uses today:

- **`Scenario.id`** — referenced by `scenarioIds[]` in the Pathway config.
- **`Scenario.decoder_tag`** — used to color-code chapters and group
  scenarios by decoder.
- **`Scenario.concept_tags`** — used to bridge to Academy modules.
- **`Mastery(user_id, concept_id, dimension)`** — both `concept` and
  `decoder` rows are already populated by `masteryService.update`
  (see `apps/web/lib/services/masteryService.ts`). Pathway page reads
  them directly.
- **`Attempt`** — most-recent attempt per scenario per user is the
  source-of-truth for "did the player give the best answer on this
  scenario?"
- **`ScenarioChoice.quality`** — `best | acceptable | wrong` already
  ships, so a "best answers" count is a single query away.

The Pathway config file is the single source of truth for Pathway
identity, chapter list, scenario IDs, and mastery thresholds. v1 lives
at `apps/web/lib/pathways/config.ts` (proposal — see §12).

### Future DB model (later, not v1)

When Pathways become persistent — for example because we want
*per-user* enrollment, A/B Pathway variants, custom coach Pathways, or
explicit "Pathway started at" timestamps for streak gamification — we
will introduce these tables. **All of this is later.**

```
model Pathway {
  id              String   @id @default(uuid())
  slug            String   @unique
  title           String
  subtitle        String?
  archetype       String?
  status          PathwayStatus  @default(ACTIVE)
  estimated_min   Int?
  parent_summary  String?  // long-form
  coach_summary   String?
  recommended_for String[]
  unlock_rule     Json?    // typed unlock criteria
  chapters        PathwayChapter[]
  enrollments     PathwayEnrollment[]
}

model PathwayChapter {
  id              String   @id @default(uuid())
  pathway_id      String
  pathway         Pathway  @relation(fields: [pathway_id], references: [id])
  slug            String
  order           Int
  title           String
  subtitle        String?
  basketball_cue  String
  decoder_tag     DecoderTag?
  parent_summary  String?
  coach_summary   String?
  pass_criteria   Json
  mastery_criteria Json
  skill_nodes     SkillNode[]
  boss_challenge  BossChallenge?
  progress        ChapterProgress[]
  @@unique([pathway_id, slug])
}

model SkillNode {
  id              String   @id @default(uuid())
  chapter_id      String
  chapter         PathwayChapter @relation(fields: [chapter_id], references: [id])
  slug            String
  order           Int
  kind            SkillNodeKind  // LEARN_CUE | SCENARIO_SET | BOSS | FILM_ROOM | MIXED
  scenario_ids    String[]
  training_mode   String          // matches PathwayTrainingMode union
  prerequisite_node_ids String[]
  @@unique([chapter_id, slug])
}

model PathwayEnrollment {
  id              String   @id @default(uuid())
  user_id         String
  pathway_id      String
  pathway         Pathway @relation(fields: [pathway_id], references: [id])
  status          EnrollmentStatus // ACTIVE | PAUSED | COMPLETED
  started_at      DateTime  @default(now())
  completed_at    DateTime?
  current_chapter_slug String?
  @@unique([user_id, pathway_id])
}

model ChapterProgress {
  id              String  @id @default(uuid())
  user_id         String
  chapter_id      String
  chapter         PathwayChapter @relation(fields: [chapter_id], references: [id])
  state           ChapterState  // LOCKED | UNLOCKED | IN_PROGRESS | COMPLETED | MASTERED
  best_count      Int     @default(0)
  attempts_count  Int     @default(0)
  mastered_at     DateTime?
  @@unique([user_id, chapter_id])
}

model BossChallenge {
  id              String   @id @default(uuid())
  chapter_id      String   @unique
  chapter         PathwayChapter @relation(fields: [chapter_id], references: [id])
  scenario_ids    String[]
  scoring         Json     // pass thresholds, multipliers
  attempts        BossChallengeAttempt[]
}

model BossChallengeAttempt {
  id              String   @id @default(uuid())
  user_id         String
  boss_id         String
  boss            BossChallenge @relation(fields: [boss_id], references: [id])
  session_run_id  String?
  best_count      Int
  total           Int
  passed          Boolean
  created_at      DateTime @default(now())
  @@index([user_id, boss_id, created_at])
}

enum PathwayStatus    { ACTIVE COMING_SOON RETIRED }
enum SkillNodeKind    { LEARN_CUE SCENARIO_SET BOSS FILM_ROOM MIXED }
enum EnrollmentStatus { ACTIVE PAUSED COMPLETED }
enum ChapterState     { LOCKED UNLOCKED IN_PROGRESS COMPLETED MASTERED }
```

**This DB model is later, not v1.** Ship the config-first version,
validate the product, then migrate when the persistence requirement is
real (coach Pathways, paid seasons, A/B testing).

---

## 12. Suggested TypeScript Config Shape

The full Pathway catalog ships as a typed export at
`apps/web/lib/pathways/config.ts` (proposal). The pathway page imports
this file directly; the API surface (if any) just re-emits it.

### Top-level types

```ts
// apps/web/lib/pathways/types.ts (proposal — not implemented yet)

import type { DecoderTag } from '@prisma/client'

export type PathwayTrainingMode =
  | 'learn-the-cue'
  | 'freeze-frame-read'
  | 'no-hint'
  | 'mixed-reads'
  | 'boss-challenge'
  | 'film-room'
  | 'pressure-test'

export type PathwayArchetype =
  | 'ball-watcher'
  | 'cutter'
  | 'connector'
  | 'attacker'
  | 'floor-general'
  | 'off-ball-weapon'
  | 'help-defender-punisher'

export interface UnlockCriteria {
  /** Other pathway slugs that must be mastered first (later use). */
  pathwaysMastered?: string[]
  /** Minimum IQ score before this pathway is recommended. */
  minIq?: number
  /** Special-case: open from day one. */
  alwaysAvailable?: boolean
}

export interface PassCriteria {
  /** Minimum number of `best` answers across the node's scenario set. */
  minBest?: number
  /** Minimum decoder rolling accuracy required to consider node mastered. */
  minDecoderAccuracy?: number
  /** Minimum decoder attempts required (avoid mastering on a single rep). */
  minDecoderAttempts?: number
  /** Boss-only: percentage of best answers required across the run. */
  bossBestRatio?: number
  /** Boss-only: minimum answered scenarios for the result to count. */
  bossMinAttempts?: number
}

export interface SkillNodeConfig {
  slug: string
  order: number
  title: string
  subtitle?: string
  kind: 'learn-cue' | 'scenario-set' | 'boss' | 'film-room' | 'mixed'
  trainingMode: PathwayTrainingMode
  /** Existing Scenario IDs (e.g. 'BDW-01'). Pathways never own scenarios. */
  scenarioIds: string[]
  /** Optional: Academy lesson slug to link from this node. */
  academyLessonSlug?: string
  /** Slugs of nodes within the same chapter that must be completed first. */
  prerequisiteNodeSlugs?: string[]
  passCriteria?: PassCriteria
}

export interface BossChallengeConfig {
  slug: string
  title: string
  subtitle?: string
  /** Scenario pool (mixed/random within the chapter or pathway). */
  scenarioIds: string[]
  passCriteria: PassCriteria
  /** Hide decoder pill, suppress hints, single attempt. */
  hideDecoderPill: true
}

export interface PathwayChapterConfig {
  slug: string
  order: number
  title: string
  subtitle: string
  /** The single basketball cue this chapter teaches. */
  basketballCue: string
  /** Primary decoder; null for the mixed-read capstone chapter. */
  decoderTag: DecoderTag | null
  skillNodes: SkillNodeConfig[]
  bossChallenge?: BossChallengeConfig
  passCriteria: PassCriteria
  masteryCriteria: PassCriteria
  /** Two voices, surfaced on the Mastery Report. */
  parentSummary: string
  coachSummary: string
  /** Internal goal copy (player-voice). */
  goal: string
}

export interface PathwayConfig {
  slug: string
  title: string
  subtitle: string
  description: string
  /** Color-bound to the Pathway hero strip; null = use brand. */
  accentToken?: 'brand' | 'iq' | 'xp' | 'info' | 'heat'
  decoderTags: DecoderTag[]
  chapters: PathwayChapterConfig[]
  unlockCriteria: UnlockCriteria
  passCriteria: PassCriteria
  estimatedMinutes: number
  recommendedFor: PathwayArchetype[]
  targetArchetype: PathwayArchetype
  comingSoon: boolean
  parentSummary: string
  coachSummary: string
}

export interface PathwayProgressSummary {
  slug: string
  pathwayProgress: number          // 0..1
  chapters: Array<{
    slug: string
    state: 'locked' | 'unlocked' | 'in_progress' | 'completed' | 'mastered'
    progress: number               // 0..1
    bestCount: number
    attemptedCount: number
    decoderAccuracy: number | null
  }>
  recommendedNext: {
    chapterSlug: string
    skillNodeSlug: string
    /** Built /train URL (with scenarioIds + mode params). */
    trainHref: string
    label: string                  // e.g. "Continue Beat the Closeout"
  } | null
  weakestDecoder: DecoderTag | null
  pathwayMastered: boolean
}
```

### Why this shape

- All identity data — title, summaries, archetype — is config. Editable
  without a migration.
- Scenario references are by **string ID** to existing rows. The Pathway
  config never duplicates scenario content.
- Both `passCriteria` and `masteryCriteria` are normalized objects with
  the same fields, so rendering the same shape across nodes/chapters is
  trivial.
- `PathwayProgressSummary` is the *single object* the Pathway page
  consumes, decoupled from Prisma — derived once on the server and
  shipped to the client without leaking row shapes.

---

## 13. Page / Route Plan

Pathways add **two routes** in v1, with one optional drill-in.

### `/pathways` — the Hub

- **Purpose.** Campaign-select. The first surface a player sees that
  organizes "what am I becoming" decisions.
- **Sections.**
  1. Header strip with player's archetype label (v1: derived from
     highest-accuracy decoder; falls back to "Foundation Trainee").
  2. **Active Pathway card** — pinned top, big. For v1 this is Complete
     IQ Foundation for everyone. Shows Pathway progress ring,
     recommended-next chip, and a single Continue CTA.
  3. **Recommended for you** — a single card sized like the active card.
     v1: empty (or "Finish your foundation first" placeholder).
  4. **Coming soon catalog** — a 2-up grid of the eight coming-soon
     Pathways. Each card shows title, target archetype, basketball
     problem, and a "Notify me" stub.
  5. Footer: link back to `/home`.
- **Components needed.**
  - `PathwayHeroCard` (active state).
  - `PathwayCatalogCard` (coming-soon and recommended states).
  - Existing `Card`, `Chip`, `ProgressRing` primitives from the design
    system.
- **Data needed.** All Pathway configs + the player's
  `PathwayProgressSummary` for the active Pathway.
- **Empty states.** New user with no attempts → active Pathway shows
  "Start here" instead of "Continue", progress = 0%, recommended next
  = Chapter 1 / Learn the Cue.
- **Mobile behavior.** Single column. Active Pathway card is full-width;
  catalog cards stack 1-up under sm, 2-up at sm+.

### `/pathways/[pathwaySlug]` — the Detail / Chapter Map

- **Purpose.** Pathway interior. Shows the chapter map, recommended
  next, and Mastery Report.
- **Sections.**
  1. Hero strip: title, subtitle, archetype chip, parent/coach summary
     toggle (the toggle swaps the long-form copy in place).
  2. Pathway-level progress ring + chapter dots row (5 dots for
     Foundation, each colored by decoder).
  3. Recommended next action card (sticky on mobile until tapped).
  4. Chapter list, top-to-bottom in `order`. Each chapter renders:
     - Chapter eyebrow ("CHAPTER 1") + title + cue line + state chip.
     - Decoder Lesson Node (links to `/academy/<lesson-slug>`).
     - Skill node row (small nodes with mastery rings).
     - Boss Challenge node (locked/unlocked/cleared visual).
  5. Pathway Mastery Report card — locked until pathwayMastered = true.
  6. "Up next when you finish" teaser of the next coming-soon Pathway.
- **Components needed.**
  - `PathwayHero`.
  - `ChapterRow` (the meat of the page).
  - `SkillNodeTile` with the five states.
  - `BossChallengeTile`.
  - `PathwayMasteryReportCard` (locked variant + ready variant).
- **Data needed.** The full Pathway config plus
  `PathwayProgressSummary`.
- **Empty states.** A coming-soon Pathway slug routes here too — render
  the hero, the parent/coach summary, and a single "Notify me" CTA in
  place of the chapter map.
- **Mobile behavior.** Single column, chapter rows are stacked. Skill
  node rows scroll horizontally if they overflow. Recommended next
  card pins under the hero on first paint.

### `/pathways/[pathwaySlug]/chapters/[chapterSlug]` — Chapter Detail (optional)

- **Purpose.** Drilled-in view when a player taps a chapter title from
  the map. v1 can defer this — tapping a chapter scrolls the map to
  that chapter row, and the chapter row has all the same info.
- **When to ship this route.** PTH-2 if user testing shows the chapter
  row is too cramped on mobile. Otherwise PTH-3.
- **Sections (when shipped).**
  1. Chapter eyebrow + title + cue line.
  2. Decoder Lesson summary tile (with link to Academy).
  3. Skill node list (vertical stack on mobile).
  4. Boss Challenge tile.
  5. Chapter Mastery Report card.
  6. "Back to Pathway" CTA.
- **Mobile behavior.** Same column model as the detail page.

### Route layout / shared chrome

- All Pathway pages live under the existing `(app)` route group, so the
  authenticated layout chrome (top nav, IQ/XP chips) is unchanged.
- Pathway pages render server-side (`async` page components, like
  `/academy`). Progress derivation happens once per request. No client
  state caching is required for v1.
- Cache: revalidate-on-attempt is overkill for v1; let Pathway pages
  re-fetch fresh on every navigation.

---

## 14. /train Integration Plan

Pathways do not modify the training loop. They drive `/train` via query
params. The integration is intentionally narrow.

### URL contract

| URL | Behavior |
| --- | --- |
| `/train` | Today's behavior. Weighted 5-rep session. Unchanged. |
| `/train?concept=X` | Today's behavior. Filter by concept. Unchanged. |
| `/train?scenario=X` | Today's behavior. Single-scenario pin. Unchanged. |
| `/train?scenarioIds=A,B,C` | **New (PTH-2).** Run a session with this exact list of scenario IDs in this order. |
| `/train?pathway=foundation` | **New (PTH-2).** Drives the standard Pathway *resume* — server picks the recommended next chapter's recommended next skill node, hands its scenario IDs to the session. |
| `/train?pathway=foundation&chapter=read-the-denial` | Resume in that specific chapter; server picks the next un-mastered node within it. |
| `/train?pathway=foundation&chapter=read-the-denial&node=first-reps` | Run that specific node's `scenarioIds`. |
| `/train?mode=boss-challenge&pathway=foundation&chapter=...` | Run the chapter's Boss config: hide decoder pill, suppress per-cue hints, score at boss multiplier. |
| `/train?mode=mixed-reads&pathway=foundation` | Run mixed-reads from all decoders the Pathway has taught. |
| `/train?mode=no-hint&scenarioIds=...` | Hide the decoder pill on these scenarios. |

### How params flow

1. Pathway page constructs the URL — never the client. The server-side
   `getRecommendedNext` builds the URL using the Pathway config + the
   player's progress.
2. /train page reads `searchParams` exactly as today (it already reads
   `concept` and `scenario`). Two new keys: `scenarioIds` (CSV) and
   `mode`.
3. /train calls `POST /api/session/start`, passing `{ n,
   scenarioIds?, mode? }`.
4. The session endpoint:
   - If `scenarioIds` is present and all IDs are LIVE, build the bundle
     from those IDs in order. Skip the weighted generator. (One-line
     branch in `generateSessionBundle`; existing `scenarioId` pin is
     analogous.)
   - If `mode === 'boss-challenge'`, set `hide_decoder_pill = true` on
     the response meta and tag the resulting `SessionRun` with a
     `boss=true` JSON marker (could be in `scenario_ids` payload — no
     schema change needed for v1).
5. /train UI honors `meta.hide_decoder_pill` by skipping the pill render
   and the per-cue micro-praise. Today's UI already centralizes those
   in the same effect block.

### How selected scenario IDs flow into session start

- The Pathway page builds `?scenarioIds=BDW-01,BDW-02,BDW-03`.
- `/train` page parses the param, passes it to `/api/session/start`.
- `generateSessionBundle` receives `scenarioIds: ['BDW-01', ...]`,
  validates that each ID exists and is LIVE, and returns them in
  order — *no weighting, no shuffle, no fill-ins*.
- The summary page (`/train/summary`) accepts a `pathway` and
  `chapter` query param so it can render the right "Back to chapter"
  CTA after the session completes.

### How normal weighted training stays unchanged

- If neither `scenarioIds` nor `pathway` is present, /train uses today's
  weighted bundle. Zero behavior change. This is the entire risk-control
  strategy: *no Pathway query params = no Pathway code path.*

### How answer keys stay hidden

- /train remains the single surface that talks to the API for attempts.
- `is_correct`, `feedback_text`, `explanation_md`, `correct_choice_id`
  are still server-only on the bundle response (per ARCHITECTURE.md
  §5.4). Pathway plumbing never sees these — it only sees the same
  sanitized `SessionScenario` shape today's /train sees.

### How the summary page knows the pathway context

- Train passes `pathway` and `chapter` to `/train/summary`.
- Summary page renders:
  - "You finished Chapter 1 — Read the Denial." (when chapter complete).
  - "Up next: Beat the Closeout" CTA.
  - "Back to Complete IQ Foundation" CTA.
- If no Pathway context, summary keeps today's chrome unchanged.

### Boss challenge shape

- Boss session = pinned `scenarioIds` + `mode=boss-challenge`.
- Decoder pill hidden client-side based on `mode` param (no server
  flag needed for v1; the client already conditionally renders the
  pill).
- Pass/fail evaluated client-side from `feedback.is_correct` counts;
  recorded in localStorage *or* in a SessionRun JSON marker. v1 stores
  it in localStorage to avoid schema work; PTH-3 introduces a real
  `BossChallengeAttempt` row.

---

## 15. MVP Scope (PTH-1)

What ships in the first Pathways PR and what does not.

### In scope

- **`/pathways` Hub** with the active Complete IQ Foundation card and
  eight coming-soon catalog cards.
- **`/pathways/[pathwaySlug]` Detail** for the Foundation Pathway.
  Renders the five-chapter map using the existing 20 founder-v0
  scenarios.
- **Typed Pathway config** (`apps/web/lib/pathways/`) with the full
  catalog (one active, eight coming-soon stubs) and the typed shapes
  from §12.
- **Progress derivation** from existing `Attempt` and `Mastery` rows.
  Single server-side `getPathwayProgress(userId, slug)` function used
  by both pages.
- **Start / Continue buttons** that route into `/train` with the
  correct query params (no `mode=boss-challenge` yet — see PTH-3).
- **Coming-soon cards** render archetype, problem, decoders.
- **Basic /train query integration**: support `scenarioIds=` for
  pinned-set sessions only. *No* `mode=` honoring in PTH-1.
- **Home screen entry point**: a single CTA card on `/home` linking to
  the active Pathway. Uses existing home page layout.
- **No schema migration.**

### Explicitly out of scope (later phases)

- Full adaptive personalization engine.
- Coach dashboard / parent reporting integration.
- New scenarios, new decoders.
- New DB tables (Pathway, PathwayChapter, SkillNode, etc.).
- Boss challenge engine + `BossChallengeAttempt` row.
- Mixed-Read Final Test rendering at Pathway level.
- Archetype assignment from data.
- Mastery Report (v1 ships a placeholder card).
- Paid Pathway seasons / leaderboards.
- Editable Pathway config via admin CMS.
- Push notification stubs on coming-soon cards.

### What "done" looks like for PTH-1

A new user can:

1. See `/pathways` from `/home` and recognize "I'm on Complete IQ
   Foundation".
2. Tap the active Pathway, land on `/pathways/complete-iq-foundation`,
   see five chapters laid out with their decoder lessons and scenario
   nodes.
3. Tap "Continue" or any unlocked node, get routed to `/train?...` with
   the right scenarios.
4. Finish the session, return to the Pathway page, and see their
   progress moved (mastery rings updated, recommended-next changed).
5. Browse the catalog and see eight coming-soon Pathways with
   identity copy.

If those five steps work, PTH-1 is shippable.

---

## 16. Future Roadmap

Six phases from PTH-1 (config + UI) through PTH-6 (seasonal Pathways).
Each phase is shippable on its own.

### PTH-1 — Config + UI Foundation

- **Goal.** A real Pathways product surface using only existing data.
- **Features.** Typed config, `/pathways` hub, `/pathways/[slug]`
  detail, progress derived from `Attempt` + `Mastery`, /train
  integration via `scenarioIds=`.
- **Risks.** Visual hierarchy on mobile (chapter map cramped); coming-
  soon cards feeling empty.
- **Success criteria.** New users can find Complete IQ Foundation,
  start a chapter, finish a session, and see progress move.

### PTH-2 — /train Integration + Progress Polish

- **Goal.** Pathway context flows end-to-end through the training
  loop.
- **Features.** `pathway`/`chapter`/`node` query params honored;
  `/train/summary` shows Pathway breadcrumb and "Up next" CTA;
  `/api/session/start` accepts `scenarioIds[]` cleanly; chapter
  detail page (optional `chapters/[chapterSlug]` route) ships if
  user testing demands.
- **Risks.** Summary page state pollution; query param bloat.
- **Success criteria.** A player can run an entire Foundation
  chapter without ever leaving the Pathway flow.

### PTH-3 — Boss Challenges + Mixed Reads

- **Goal.** Real test mechanics — chapter bosses and Pathway
  capstone.
- **Features.** `mode=boss-challenge` honored in /train; pass/fail
  shape; `BossChallengeAttempt` table introduced *only if*
  localStorage-driven boss state is insufficient. Pathway-level
  Mixed-Read Final Test renders at Chapter 5.
- **Risks.** Schema migration complexity; pass thresholds tuning.
- **Success criteria.** Players can attempt a boss, fail, retry, and
  pass; pass state persists across devices.

### PTH-4 — Archetypes + Recommendations

- **Goal.** Personalize the hub.
- **Features.** Archetype derived from highest-accuracy decoder;
  archetype label on home + Pathway hub; recommended Pathway swaps
  based on archetype; weakest-decoder card.
- **Risks.** Archetype ping-pong (player flips archetype with one
  bad session); over-personalizing for new users.
- **Success criteria.** Archetype label is stable across sessions
  for an active player; Pathway recommendations match player
  intuition in user testing.

### PTH-5 — Coach / Parent Reporting

- **Goal.** Pathway becomes shareable proof of work.
- **Features.** Parent/coach toggle on detail page; emailable
  Pathway report; "Send to my coach" stub becomes real (link with
  read-only progress view); coach dashboard shows team-level
  Pathway adoption; first non-player UserRole experience.
- **Risks.** Privacy review (sharing youth data); link auth.
- **Success criteria.** A parent can view a read-only Pathway
  Mastery Report from a shared link.

### PTH-6 — Seasonal Pathway System

- **Goal.** Pathways as a recurring product surface, not a one-time
  catalog.
- **Features.** Seasonal Pathways (4-week tracks); paid Pathway
  passes; coach-authored Pathways; cross-Pathway leaderboards;
  Pathway-specific badges.
- **Risks.** Content production cost (each Pathway needs 15–25
  scenarios authored); paid-tier UX; coach moderation.
- **Success criteria.** First seasonal Pathway ships on schedule;
  paid Pathway has a clear conversion funnel.

---

## 17. Implementation Risks and Open Questions

### Risks

- **Duplicating Academy.** If a Pathway chapter starts owning lesson
  body markdown, we now have two homes for the same content. Mitigation:
  keep the *Decoder Lesson Node* a *link* into Academy, never a copy.
  Code review checklist item: any markdown over 200 chars in Pathway
  config is a smell.
- **Unclear progress calculation.** "Mastered" can mean three things at
  once (best-answer count, decoder accuracy, attempts threshold). v1's
  `passCriteria` collapses this into one config object so the
  derivation logic has *one* source of truth. Mitigation: dedicated
  `getPathwayProgress` function with unit tests.
- **Route / query complexity.** Six possible /train query params is a
  lot. Mitigation: build URLs in a single helper (e.g.
  `pathwayTrainHref(node)`) so the param shape lives in one place.
  Never construct /train URLs ad-hoc in Pathway components.
- **Scenario selection conflicts.** A Pathway node says "BDW-01,02,03"
  but the weighted generator might want to inject spaced-rep reps. v1
  resolves this by *bypassing* the weighted bundle entirely when
  `scenarioIds=` is present. The trade-off: Pathway sessions skip
  spaced-rep lookups. Acceptable for v1; PTH-3 can layer in a "Pathway
  + spaced-rep blend" mode if needed.
- **Too much locked content.** A new player who lands on /pathways and
  sees 8 grayed-out cards might bounce. Mitigation: catalog cards must
  carry real value copy (target archetype, problem solved); the
  active Pathway must dominate above the fold.
- **Overwhelming young players.** A 20-rep Pathway can feel like
  homework. Mitigation: chapters are 5 reps each; sessions stay under
  5 minutes; never autoplay the next chapter.
- **Needing a better sub-concept taxonomy.** The current `concept_tags`
  on Scenario rows aren't fine-grained enough to drive a "weakness
  map" for personalization. v1 sidesteps this by using `decoder_tag`
  instead. PTH-4 will need richer sub-concept tags.
- **State drift between Mastery and Pathway progress.** `Mastery`
  rolling-accuracy decays/updates on every attempt; Pathway "best
  count" reads the most recent attempt per scenario. They can
  disagree. Mitigation: be explicit in copy — Pathway shows "best
  reads", Academy shows "rolling accuracy". Don't paper over the
  difference.

### Open product questions

1. **Should Pathways auto-enroll new users?** v1 says yes — Foundation
   is the default Pathway for everyone. Confirm with founder.
2. **Does the Pathway hub replace or sit alongside `/home`?** Proposal:
   sit alongside. Home still has streak + IQ; Pathways is the
   directional layer. Confirm.
3. **What's the right pass threshold for chapter mastery?** Proposal:
   ≥ 0.80 decoder rolling accuracy + ≥ 4/5 best answers across the
   chapter pack. Tunable.
4. **How does a player retry a chapter they've mastered?** Proposal:
   chapter row always carries a "Practice again" CTA that fires a
   non-counting Mode-6 (Film Room) session. Confirm.
5. **Should a coach see what archetype a player is?** Proposal: yes
   in PTH-5; surface as a chip on the player profile in the coach
   dashboard. Confirm.
6. **Will Pathways have their own XP / IQ multipliers, or do they ride
   on the existing scoring?** Proposal: ride on existing scoring for
   v1. PTH-3 introduces boss multipliers per §8.
7. **Is `/pathways` a top-nav peer to `/home`, `/academy`, `/profile`,
   or a child of `/home`?** Proposal: top-nav peer. Confirm.
8. **How do we handle a player who's already mastered all four
   decoders before Pathways exist?** Proposal: Foundation marks itself
   100% on first load and recommends the next coming-soon Pathway as
   the headline; player can still re-run any chapter for fun. Confirm.
9. **Can a player skip Foundation?** Proposal: not in v1. PTH-4 lets
   archetype assignment skip the Pathway if all four decoders are
   mastered. Confirm.

---

## 18. Recommended Build Prompt for Next Step (PTH-1)

This is the prompt to hand to the next implementer (Claude / Codex /
engineer) once this planning doc is approved.

> **Build PTH-1: Pathways v1 — Config + UI Foundation.**
>
> Goal: ship the `/pathways` hub and the `/pathways/complete-iq-
> foundation` detail page using a typed config and progress derived
> from existing rows. No schema migration. No edits to the training
> loop, renderer, or scenario seeds.
>
> 1. Create `apps/web/lib/pathways/types.ts` with `PathwayConfig`,
>    `PathwayChapterConfig`, `SkillNodeConfig`, `BossChallengeConfig`,
>    `PassCriteria`, `UnlockCriteria`, `PathwayTrainingMode`,
>    `PathwayArchetype`, and `PathwayProgressSummary` from §12.
> 2. Create `apps/web/lib/pathways/config.ts` exporting the full
>    nine-Pathway catalog from §5. Only Complete IQ Foundation is
>    `comingSoon: false`. The Foundation entry's chapters reference
>    the existing founder-v0 scenarios (BDW-01..05, ESC-01..05, AOR-
>    01..05, SKR-01..05) as outlined in §6.
> 3. Create `apps/web/lib/pathways/progressService.ts` exporting
>    `getPathwayProgress(userId, slug): Promise<PathwayProgressSummary>`.
>    Derive node/chapter/Pathway state from `prisma.attempt` and
>    `prisma.mastery` (both `concept` and `decoder` dimensions).
>    Use `ChoiceQuality.best` to compute "best answers" counts.
>    Apply the recommended-next priority order from §9.
> 4. Create `apps/web/app/pathways/page.tsx` — the Hub. Active card
>    + coming-soon catalog grid. Server component, like `/academy`.
> 5. Create `apps/web/app/pathways/[pathwaySlug]/page.tsx` — the
>    Detail / chapter map. Renders chapter rows, skill nodes,
>    decoder lesson links into `/academy/<slug>`, and the
>    recommended-next CTA. Server component.
> 6. Add Pathway-aware `scenarioIds[]` support to
>    `apps/web/lib/services/scenarioService.ts`. Specifically: extend
>    `SessionBundleOptions` with `scenarioIds?: string[]` and, when
>    present and all IDs are LIVE, build the bundle from those IDs in
>    order, bypassing the weighted buckets. Mirror the existing
>    `scenarioId` (singular) pin path.
> 7. Add a single CTA card on `/home` linking to the active Pathway.
>    Reuse existing home page layout primitives.
> 8. Do not modify renderer files.
> 9. Do not modify scenario seeds.
> 10. Do not migrate the Prisma schema.
> 11. Add unit tests for `getPathwayProgress` covering: cold start,
>     partial completion, single-chapter mastery, full Pathway
>     mastery, and the recommended-next priority order.
> 12. Add a smoke test for `/pathways/complete-iq-foundation` that
>     renders for an unauthenticated → signed-in user without
>     throwing.
>
> Out of scope: boss challenge mode, mixed-read final, archetype
> assignment, parent/coach reports, push notifications, admin CMS,
> coming-soon notify-me persistence.
>
> Done when: a new user lands on `/pathways`, taps Complete IQ
> Foundation, sees the five chapters, taps Continue, lands in
> `/train` with the chapter's scenarios, completes a session, returns
> to the Pathway page, and sees their progress ring move.

---

## Recommended Next Implementation Step.
