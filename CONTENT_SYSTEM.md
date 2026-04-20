# CourtIQ — Content System

Content is the moat. We treat scenarios and curriculum like a product, not like "copy." This doc is the playbook for how content gets conceived, authored, reviewed, shipped, and improved.

---

## 1. Philosophy

- **Correctness before quantity.** One ambiguous scenario destroys trust. We'd rather ship 40 great scenarios than 200 mediocre ones.
- **Basketball-native voice.** Authored by people who've coached or played. No AI-slop tone.
- **Every scenario teaches a concept, not a trick.** The "why" is more important than the "what."
- **Scenarios are assets.** Every one authored is a permanent addition to the library.

---

## 2. Curriculum Taxonomy

### 2.1 Categories (top level)

| Category | Examples |
| --- | --- |
| **Offense** | Spacing, Cutting, Relocation, PnR Ball-Handler Reads, Post Entry, Off-Screen Actions |
| **Defense** | Help Defense, Low-Man Rotation, Closeouts, PnR Defender Reads, Switching, Tagging |
| **Transition** | Stop-Ball, Rim Protection in Transition, Secondary Break Spacing, Tempo Decisions |
| **Situational** | EOB / SOB plays, ATO reads, Late-Clock, Fouls-to-Give, Free-Throw-Line Game |

### 2.2 Concepts (second level)

A **Concept** is the unit of mastery. Each Concept has:
- `slug` — stable identifier (`low_man_rotation`)
- `name` — display name
- `category` — one of the four above
- `description` — what a player should be able to do after mastering this
- `prerequisite_concepts[]` — chain
- **Target: ≥ 20 scenarios per concept** at v1

### 2.3 Sub-Concepts (third level)

Finer distinctions within a concept. Used for tagging scenarios for deeper analytics and spaced-rep targeting.

Example — Concept `help_defense` has sub-concepts:
- `weak_side_tag`
- `stunt_and_recover`
- `next-pass closeout`
- `gap help`

### 2.4 Difficulty Ladder

| Difficulty | Description |
| --- | --- |
| **1 — Intro** | Clear read, one obvious correct answer, minimal distractors |
| **2 — Basic** | Correct read is obvious to an attentive player |
| **3 — Intermediate** | Two plausible options; correct one requires understanding nuance |
| **4 — Advanced** | High-level read (timing, weak-side manipulation) |
| **5 — Elite** | NBA-level recognition; only elite players get these right fast |

### 2.5 v1 Target Map

| Category | Concepts (v1) | Scenarios (v1) |
| --- | --- | --- |
| Offense | 5 | 100 |
| Defense | 4 | 80 |
| Transition | 2 | 40 |
| Situational | 1 | 30 |
| **Total** | **12** | **250** |

---

## 3. Scenario Authoring Spec

### 3.1 Required Fields (must be non-empty)

- `category`
- `concept_tags` (≥ 1)
- `difficulty`
- `user_role`
- `court_state` (positions for all 10 players + ball)
- `prompt` (≤ 140 chars, punchy)
- `choices` (3 or 4)
- Exactly **one** `is_correct: true`
- `feedback_text` on **every** choice (explain why each is right or wrong)
- `explanation_md` (the deeper "why" — 2–4 sentences)

### 3.2 Quality Bar

A scenario ships only if:
- A basketball SME agrees the correct answer is unambiguously correct
- The court setup is realistic (no impossible spacing)
- Distractors are plausible (not straw-men)
- The `feedback_text` for wrong answers teaches something
- The `explanation_md` ties back to a Concept

### 3.3 Tone Guide

- Second person ("You're the weak-side defender…")
- Present tense, active voice
- Short sentences
- Basketball vernacular, but no obscure slang
- No emojis, no exclamation marks in the prompt
- Feedback can be more energetic ("Nice read." / "That's late.")

---

## 4. Content Pipeline

### 4.1 States

```
DRAFT → REVIEW → LIVE → (optionally) RETIRED
```

Matches `ScenarioStatus` in the DB.

### 4.2 Steps

1. **Author** — writer fills out the scenario form (Notion template for MVP → custom admin CMS for v1). Output is a scenario JSON with all required fields.
2. **SME Review** — basketball expert (ex-college coach or high-level trainer) validates the correct-answer call and the distractors. Flags ambiguity. Sign-off required.
3. **Design** — court state is rendered by the generic `<Court>` primitive for Tier 1. For Tier 2+, an animator produces a Rive/Lottie file.
4. **QA Playtest** — 3 internal users play the scenario cold, without the explanation. If 2+ find it ambiguous, it returns to Author.
5. **Publish** — flip `status` to `LIVE`. Scenario starts appearing in session bundles.
6. **Monitor** — dashboard tracks live scenarios by accuracy %. Auto-flag if:
   - `< 40%` correct → too hard or bad UX → review
   - `> 95%` correct → too easy or telegraphed → re-balance
   - `> 10%` of users report → review

### 4.3 Roles

| Role | Responsibility |
| --- | --- |
| **Content Lead** | Owns the curriculum roadmap, prioritizes concepts by launch timeline |
| **Authors** (in-house + contractors) | Write scenarios |
| **SME Reviewer** | Basketball authority; final say on correctness |
| **Designer/Animator** | Court visuals (Tier 2+) |
| **QA** | Playtest + ambiguity flagging |

For MVP, one person can wear multiple hats, but **SME Review must be a separate person from Author**.

---

## 5. Tooling

### 5.1 MVP Authoring Tool

- Notion database with one row per scenario
- Columns mirror the schema
- Export script (`scripts/seed-scenarios.ts`) pulls from Notion API, validates with Zod, inserts into Postgres
- Same pipeline for updates

### 5.2 v1 Admin CMS

- Internal Next.js admin route (`/admin/scenarios`) gated to `UserRole.ADMIN`
- Create/edit scenarios with a visual court editor (drag players, place arrows)
- Live preview using the real `<Court>` component
- State transitions (`DRAFT → REVIEW → LIVE`) with audit trail
- Version history per scenario

### 5.3 v2 Contributor Portal

- Public submission form for vetted external coaches
- Reputation system (approved scenario count, accuracy in the wild)
- Revenue share for contributors whose scenarios ship
- Automated checks: required fields, tag validity, no duplicate prompts

---

## 6. Content Cadence

| Cadence | What ships |
| --- | --- |
| **Pre-MVP** | 60 scenarios across 6 concepts (internal authoring sprint) |
| **v1 launch** | 250 scenarios, 12 concepts, 4 Academy modules |
| **Weekly drop (v1+)** | 10 new scenarios per week — "This Week's Drop" banner drives return visits |
| **Monthly module** | 1 new Academy module per month starting v1 |
| **Quarterly retire** | Poorly-performing scenarios retired or rewritten |

---

## 7. Measurement

Per scenario, tracked continuously:

- **Accuracy** (% correct first-try)
- **Avg time-to-answer**
- **Skip rate** (users who leave session mid-scenario)
- **Dispute rate** (v1 feature: "this feels wrong" button)
- **Concept impact** (delta to user's rolling accuracy on tagged concept)

Dashboard lives in PostHog (insights) + a custom admin view at `/admin/scenarios/analytics`.

---

## 8. Academy Modules

### 8.1 Structure

```
Module {
  title
  concept_id          // one primary concept
  prerequisite_ids    // other modules that must be mastered first
  lessons[]           // short text + diagram lessons
  practice_scenario_ids[]  // 8–15 scenarios specific to this module
  mastery_check       // 10-scenario test; 80% to complete
}

Lesson {
  title
  body_md             // 200–400 words, tight
  media_refs[]        // static diagrams; animations in v1+
}
```

### 8.2 v1 Module Launch Set (aligned with design prototype)

The academy is rendered as a **zig-zag skill tree** (`courtiq/project/academy.jsx`). Each node has a progress ring and one of four states: `locked` / `unlocked` / `active` / `mastered`. Prerequisite chain is strict — you can't jump modules.

1. **Court Awareness** — *See the floor before it happens.* (icon: `eye`, color: `#5AC8FF`) — 8 lessons. Foundation: spacing principles, sight lines, recognizing actions before they trigger.
2. **Off-Ball IQ** — *Cuts, relocation, spacing.* (icon: `compass`, color: `#3BE383`) — 12 lessons. Offense without the ball.
3. **Defensive IQ** — *Help, recover, rotate.* (icon: `shield`, color: `#8B7CFF`) — 10 lessons. Help defense, closeouts, low-man rotations.
4. **Transition IQ** — *Break decisions, timing.* (icon: `zap`, color: `#FF8A3D`) — 9 lessons. Stop-ball, rim protection, secondary spacing. Requires Off-Ball IQ 80%.
5. **Smart Decisions (Capstone)** — *Reads under pressure.* (icon: `brain`, color: `#FF4D6D`) — 14 lessons. PnR, late-clock, EOB/SOB, reading defenses. Requires all above + a final exam.

Each module: 1 short lesson per concept (or animated clip at v1), 10–15 practice scenarios, 1 mastery check.

**Total v1 scope:** 5 modules, 53 lessons, 250+ scenarios. Trophy count shown in top-right of Academy is lessons completed / 53.

---

## 9. Content Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Wrong "right answer" shipped | SME review gate + in-product dispute button + weekly accuracy audit |
| Ambiguity in court state | QA playtest with 3 cold users before publish |
| Stale content as basketball evolves | Scenario versioning; retire flag; quarterly review |
| Bias toward one playing style | Explicitly balance positions/roles in the library; track representation |
| Author bottleneck | Paid external coaches from v1; contributor portal in v2 |
| Legal issues with real clips (Tier 3) | Use licensed footage; avoid team/logo infringement until deals are signed |

---

## 10. Long-Term Content Vision

- **User-tagged clips** — players upload their own game film; AI finds decision points; a coach verifies; becomes a scenario
- **Personalized pathways** — the engine auto-assembles a mini-module when it detects a persistent weakness
- **Team playbook mode** — a coach uploads their team's sets; CourtIQ generates scenarios from them for his players (B2B wedge)
