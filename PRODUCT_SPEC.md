# CourtIQ — Product Specification

This document is the single source of truth for **what CourtIQ is**. Engineering follows `ARCHITECTURE.md`. Content ops follows `CONTENT_SYSTEM.md`. Execution follows `BUILD_PLAN.md`. Everything starts here.

---

## 1. Executive Summary

CourtIQ is a mobile-first product that trains youth basketball players' **basketball IQ** the way Duolingo trains language: short, addictive, structured sessions with instant feedback and visible progression.

The moat is the **Scenario Engine** — an interactive decision simulator, not a quiz bank. Players are placed into realistic basketball situations, must make a fast decision, and immediately see whether they were right, why, and how it changed their IQ score. Over time, the engine adapts to their weaknesses.

This is not a drill library. Not a video app. Not a generic SaaS. The category is **basketball decision training**, and we're defining it.

---

## 2. Vision & Positioning

### 2.1 One-Line Positioning

> *The operating system for basketball decision-making.*

### 2.2 Analogies (internal use)

- **Duolingo** for the loop (short sessions, streaks, XP, spaced-repetition)
- **Basketball IQ Academy** for the curriculum (structured concept mastery)
- **Interactive Film Room** for the learning style (see plays, make calls)
- **ELO / chess.com** for the ratings (IQ Score that moves)

### 2.3 What CourtIQ Is NOT

- Not a drill library
- Not a generic training app
- Not a YouTube-style video dump
- Not a skills/workout tracker
- Not childish or gimmicky

The product must feel **premium, modern, fast, and elite** — Apple simplicity + modern sports energy + startup polish.

### 2.4 The Moat

The Scenario Engine + the curated curriculum + the IQ Score form a compounding moat:
- Every attempt makes the engine smarter about a user's weaknesses.
- Every scenario authored is a permanent asset.
- Every IQ Score earned increases switching cost.
- Every creator or coach contributing content deepens the library.

---

## 3. Personas

### 3.1 Primary — "Jayden", age 13

- Plays AAU, middle school team
- Watches NBA highlights every day on his phone
- Has athletic tools but gets lost on defense
- Coach tells him "you're always a step late"
- Attention: fast. Session tolerance: 3–7 minutes
- Motivations: look smart, get more minutes, beat his friends

### 3.2 Secondary — Parents, Trainers, Coaches (post-MVP)

- **Parents:** want visible proof their kid is improving; willing to pay $10–20/month
- **Trainers:** want a modern tool that supplements in-person sessions; shareable links
- **Coaches:** want team-level visibility into which concepts their roster has/doesn't have
- **AAU Programs:** license in bulk for competitive edge

---

## 4. The Five Pillars

### 4.1 IQ Academy

Structured **modules** that each teach one real basketball concept (e.g. "Spacing Fundamentals", "Low-Man Rotations", "Reading the Pick-and-Roll").

- Each module = a short lesson (≤ 2 minutes) + 8–15 scenarios
- Clear prerequisite chain — unlocks next module on mastery
- Evergreen curriculum; new modules shipped continuously

### 4.2 Scenario Engine *(see §6 for deep design)*

The core of the product. Every training session is driven by the engine. Even inside Academy modules, the "practice" is scenarios.

### 4.3 Film Room *(v2)*

Visual breakdowns — animated or real-clip — showing the *same* situation played right vs. wrong. Freeze-frame decision points embedded. Connects IQ Academy concepts to real plays.

### 4.4 IQ Score

A single 0–2000 number, visible at all times, that moves with every attempt. The psychological anchor of the product. See §7.

### 4.5 Motivation Layer

XP, levels, streaks, badges, leaderboards, daily goals, weekly drops. See §8.

---

## 5. User Experience Flows

### 5.1 Onboarding (first 60 seconds)

1. Splash → "Train your brain like you train your game."
2. Age picker (gate under 13 for COPPA until parental consent flow ships)
3. Position (PG / SG / SF / PF / C / I play everywhere)
4. Self-rated skill (Rookie / Varsity / Elite)
5. Goal (Get more minutes / Understand the game / Be a better teammate / Just for fun)
6. **Immediate scenario** — no account wall yet. Win the first interaction.
7. After first scenario: "You just earned +12 IQ. Save your progress?" → auth

**Design principle:** The product is playable before signup. Account creation is rewarded, not required.

### 5.2 Daily Loop (the hook)

1. Open app → home screen shows streak flame, current IQ, "Today's Session"
2. Tap "Train" → 5-scenario session (target 3–5 minutes)
3. Each scenario: court visual → prompt → 3–4 choices → tap → feedback + explanation → XP/IQ delta animates → next
4. End-of-session summary: XP earned, IQ delta, streak extended, concept strength updates
5. Prompt: "Share your IQ delta" or "Tomorrow's session unlocks in 24h" (soft-cap drives habit)

### 5.3 Weekly Loop (the progression)

- Module progress bar fills as scenarios in that concept are mastered
- Weekly boss/mastery check — 10 scenarios across the module, must hit 80%+
- New module unlocks + new concept badge + new avatar flair
- Weekly leaderboard resets Monday

### 5.4 Retention Loop (the return)

- Daily streak (missing a day resets; streak freeze earned weekly)
- Weekly new-scenario drop ("This week's drop: Transition D")
- Push notifications: streak-at-risk, streak-saved, "your rank dropped", "a new module unlocked"
- Social: "Jayden just beat your IQ" nudges

---

## 6. Scenario Engine — Deep Design

### 6.1 Anatomy of a Scenario

```
Scenario {
  id: string
  version: int
  status: draft | review | live | retired
  category: offense | defense | transition | situational
  concept_tags: string[]            // e.g. ["help_defense", "low_man_rotation"]
  sub_concepts: string[]            // e.g. ["baseline_drive", "weak_side_tag"]
  difficulty: 1..5
  user_role: string                 // e.g. "weak_side_corner_defender"
  court_state: {
    offense: Player[]               // {id, x, y, hasBall, role}
    defense: Player[]
    ball_location: {x, y}
    defender_orientation?: vector   // key cues like "defender's eyes off the ball"
    motion_cues?: Arrow[]           // arrows that animate or are drawn statically
  }
  prompt_text: string               // "Your man's head turned. What do you do?"
  choices: Choice[]                 // 3–4 realistic actions
  explanation_md: string            // the "why" — why the right answer is right and others aren't
  concept_links: string[]           // into Academy lessons
  xp_reward: int                    // scales with difficulty
  mastery_weight: float             // how much this scenario counts toward concept mastery
  render_tier: 1 | 2 | 3 | 4        // static SVG → animated → video → 3D
  media_refs?: string[]             // for animated/video tiers
}

Choice {
  id: string
  label: string                     // short verb phrase: "Cut backdoor"
  is_correct: boolean
  feedback_text: string             // one-line on-screen feedback
  feedback_video_ref?: string
  order: int
}
```

### 6.2 Rendering Tiers

| Tier | Version | What it looks like |
| --- | --- | --- |
| 1 | MVP | Clean static SVG court with labeled players and arrows |
| 2 | v1 | Animated 2D plays (Rive / Lottie) — subtle motion, defender head-turns |
| 3 | v2 | Real short video clips with freeze-frame decision points |
| 4 | v3 | Full 3D sim with camera angles |

The **schema supports all four tiers from day one**. Upgrading a scenario from Tier 1 to Tier 2 is a media swap, not a rewrite.

### 6.3 Session Generator

Every session is a *bundle* of N scenarios (default 5), assembled by the server on session start. Weighting:

| Source | Default weight |
| --- | --- |
| User's weakest concepts (lowest rolling accuracy) | 40% |
| Current module progression | 30% |
| Spaced-repetition queue (previously-missed scenarios due for review) | 20% |
| Wildcard (variety, unexplored concept, or new content drop) | 10% |

Tunable via server-side config + feature flags; later can be ML-ranked.

### 6.4 Mastery Model

For each `(user, concept)` pair:
- `rolling_accuracy` = accuracy over last 5 attempts
- Concept is **mastered** when `rolling_accuracy ≥ 0.80` AND `attempts_count ≥ 10`
- Missed scenarios re-enter the queue after 1d, 3d, 7d, 21d (spaced-rep)
- Mastery gates module completion; completing a module awards a badge + module-level XP bonus

### 6.5 Feedback Loop (the moment that matters)

Per the Scenario Engine prototype (`courtiq/project/scenario.jsx`), the screen has three phases:

**Phase `prompt`:**
- Scenario header: module name, "Scenario 4 / 8", difficulty chip, 8-second countdown timer (decrements in 0.1s increments; heat-red warning < 2s)
- Half-court SVG with player dots (offense green, defense red, **YOU** highlighted yellow with glow), motion arrows showing what just happened (e.g. ball handler's drive)
- Prompt text + question
- Four choice tiles labeled **A / B / C / D** — each is a single verb phrase

**Phase `feedback`** — fires within 200ms of tap:
1. Selected choice tile flashes correct-green or fail-red (haptic on native)
2. Court re-renders with arrows showing what the **correct** rotation would have been (in brand-green)
3. Feedback tray slides up from the bottom with:
   - One-line verdict
   - Short feedback text (2 sentences max)
   - XP delta animated in (orange)
   - IQ delta animated in (purple)
4. "Next" primary CTA (or "Try again" on miss, depending on mode)

**Phase `xp`** (brief, ~500ms):
- XP/IQ numbers in the header top-bar tick up to new values
- Streak flame pulses if this attempt extended a daily goal

Deeper "why" (the `explanation_md`) is **collapsible-to-reveal** — not in the first tray. Players who want it tap "Why?" to expand. Keeps the default flow fast.

### 6.6 Forward-Compatibility Hooks

Designed-in from day one, not built yet:
- **Hearts/lives system** — `SessionRun` has optional `hearts_remaining` field
- **Speed rounds / timed gauntlets** — `time_ms` already tracked per attempt
- **Film Room mode** — `render_tier` field + `media_refs`
- **Ranked / Arena** — IQ Score is already ELO-inspired; add matchmaking later
- **User-generated scenarios** — `status` flow already includes `draft` → `review` → `live`

---

## 7. IQ Score

A single 0–2000 number. ELO-inspired.

### 7.1 Scoring Formula (v0)

```
iq_delta = base * difficulty_multiplier * correctness * speed_multiplier
  base = 8
  difficulty_multiplier = {1: 0.6, 2: 0.8, 3: 1.0, 4: 1.3, 5: 1.7}
  correctness = +1 if correct else -0.5   // wrong answers deduct less than right answers add
  speed_multiplier = {
    answered < 3s:  1.2
    answered < 7s:  1.0
    answered < 15s: 0.9
    otherwise:      0.75
  }
iq_score = clamp(iq_score + round(iq_delta), 0, 2000)
```

Asymmetric up/down weighting keeps the curve motivating for youth users without making it meaningless. Tunable server-side.

### 7.2 Display

- Always visible top-right of any training screen
- Live animation on delta
- Profile page: big number + 30-day chart + concept-by-concept radar

### 7.3 Starting IQ

New users calibrate via 5 onboarding scenarios of mixed difficulty. Starting IQ = 500–900 based on performance, so early wins feel earned, not handed.

---

## 8. Gamification System

### 8.1 XP and Levels

- XP per correct scenario = `10 * difficulty_multiplier`
- Levels 1–50 with basketball-themed names:
  - 1–5: **Rookie**
  - 6–15: **Starter**
  - 16–25: **Sixth Man of the Year**
  - 26–35: **All-Star**
  - 36–45: **Floor General**
  - 46–50: **Maestro**
- Each rank bump = visual flair on profile + announcement animation

### 8.2 Streaks

- One daily session = streak +1
- Miss a day = streak breaks (unless streak-freeze is used)
- **Streak freeze:** 1 earned per week, auto-applies, max 2 banked
- Streak flame on home screen; visual tiers at 7 / 14 / 30 / 60 / 100 / 365 days

### 8.3 Badges

Three families:
- **Concept Mastery** — one per concept mastered ("Help Side Guru", "Transition Maestro")
- **Milestones** — "100 scenarios", "1000 XP", "30-day streak"
- **Accuracy** — "Perfect Session (5/5)", "10 in a row"

### 8.4 Leaderboards

- Weekly XP leaderboard, resets Monday 00:00 local
- Tabs: Friends / Global / My AAU (v2)
- Top 3 earn a visible rank flair

### 8.5 Daily Goals

- Default: 1 session / day
- Adjustable (1 / 2 / 3 sessions)
- Progress ring on home screen

---

## 9. UX Principles

1. **Mobile-first, thumb-reachable.** Every tap target ≥ 44pt. Primary action in the bottom third.
2. **Under 5 minutes.** A session should never block a player from the rest of their day.
3. **Instant feedback.** Correct/incorrect within 200ms of tap.
4. **Minimal text.** Max 2 sentences on any training surface.
5. **Strong visuals.** Court diagrams do the heavy lifting; text supports.
6. **Premium tone.** Dark-mode default, clean typography (Inter/SF), subtle motion. Never cartoonish.
7. **No dead ends.** Every screen has a clear next action.
8. **Serious, but fun.** Basketball-native voice, not "gamer" lingo. Not a kid's app.

---

## 10. Design System (high level)

Full tokens live in `ARCHITECTURE.md` §4.2. Visual source of truth is the prototype bundle at `courtiq/project/`. At spec level:

- **Palette:** Near-black dark base (`#0A0B0E`), **electric signal-green** (`#3BE383`) as brand/correct, **orange** (`#FF8A3D`) for XP, **purple** (`#8B7CFF`) for IQ, **heat-red** (`#FF4D6D`) for streak/incorrect, **blue** (`#5AC8FF`) for info
- **Typography:** **Space Grotesk** (display, headlines, IQ numbers) + **Inter** (UI, body) + **JetBrains Mono** (timers, tier codes)
- **Motion:** Framer Motion; 80–160ms micro-interactions, snappy easing, never bouncy
- **Iconography:** Custom basketball-native icon set inherited from the prototype (no generic stock icons)
- **Rank labels:** ROOKIE / VARSITY / ALL-CITY / ALL-STATE / ELITE — three tiers each (e.g. "VARSITY TIER III"), displayed as mono-font small caps

**Signature visual moves from the prototype:**
- IQ Score hero card with a green sparkline + "↑ 48 THIS WK" chip
- Daily Challenge card with warm gradient + live countdown
- "Continue Training" CTA with a mini half-court thumbnail
- Academy as a **zig-zag skill tree** with progress rings on each node (locked / unlocked / active / mastered states)
- Scenario screen with a half-court diagram, player dots, and A–D choice tiles

---

## 11. Coverage — Founder's 15 Deliverables

This document covers deliverables **1 (Product Architecture), 2 (UX Flow), 4 (Scenario Engine Architecture), 7 (Gamification)**, and parts of **3 (Feature Prioritization)**. The rest are covered in the remaining docs — see the matrix in `BUILD_PLAN.md`.
