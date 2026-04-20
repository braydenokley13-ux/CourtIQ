CourtIQ — MVP Roadmap

This is the order we build in. Every feature has a version it belongs in; anything not on this list is explicitly out of scope until PMF signal says otherwise.

---

## Version Stages

| Stage | Timeline | Goal |
| --- | --- | --- |
| **MVP (Private Beta)** | Weeks 1–8 | Prove the core loop. 100 beta users. D7 retention ≥ 30%. |
| **v1 (Public Launch)** | Weeks 9–16 | Ship the polished consumer product. 1,000 users. Paid tier test. |
| **v2** | Months 5–8 | Film Room, Arena, social, trainer dashboard. |
| **v3+** | Months 9+ | 3D sim, AI-generated content, team/program licensing. |

---

## MVP — "Prove the Loop" (Weeks 1–8)

**Success criteria:**
- 100 invited beta users onboarded
- Median session length ≥ 3 minutes
- D1 retention ≥ 50%, D7 retention ≥ 30%
- Users complete ≥ 3 sessions in first week
- NPS ≥ 40 from first 50 respondents

**In Scope:**

- Email + Google auth (Supabase Auth)
- Onboarding flow (age, position, skill, goal, calibration scenarios)
- Profile page (avatar, IQ score, level, XP, streak)
- Scenario Engine v1:
  - Tier 1 rendering (static SVG court)
  - 3–4 choice interaction
  - Instant feedback + explanation
  - Attempt logging
- **60 seeded scenarios** across 6 concepts:
  1. Spacing Fundamentals
  2. Cutting & Relocation
  3. Help Defense Basics
  4. Low-Man Rotation
  5. Closeouts
  6. Transition Stop-Ball
- Daily session (5 scenarios) with session generator (weakest-concept + spaced-rep weighting)
- IQ Score (ELO-inspired) with live animation
- XP + Levels (1–15 for MVP)
- Daily streak (no streak freeze yet)
- PostHog analytics instrumented
- Sentry for error tracking
- PWA-installable web app

**Explicitly Out of Scope (MVP):**

- Academy module UI (scenarios drive everything in MVP)
- Animated scenarios (Tier 1 only)
- Leaderboards
- Badges
- Social/friends
- Native iOS/Android app
- Paid tier / billing
- Parent/coach dashboards

---

## v1 — Public Launch (Weeks 9–16)

**Success criteria:**
- 1,000 MAU
- 10% paid conversion on Pro
- D30 retention ≥ 15%
- Content library: 250+ scenarios, 12 concepts, 4 modules

**New in v1:**

- **IQ Academy module UI**
  - Module index, lesson pages (text + diagrams), module-end mastery check
  - 4 initial modules: Off-Ball Offense, Weak-Side Defense, PnR Fundamentals, Transition IQ
- **Scenario library expansion** — 250+ scenarios, 12 concepts
- **Tier 2 rendering** — animated scenarios via Rive or Lottie
- **Badges** (3 families: concept mastery, milestones, accuracy)
- **Levels 16–50** with basketball-themed rank names
- **Weekly leaderboard** (friends + global)
- **Parent/coach share link** (read-only progress view, no auth)
- **Push notifications** (streak-at-risk, daily reminder, new content drop)
- **Streak freeze** (earned weekly, max 2 banked)
- **Paid tier**
  - **Free:** 1 session/day, core content
  - **Pro $9.99/mo:** unlimited sessions, full content, streak freeze
  - Stripe subscription, paywall UX
- **Marketing site** — hero, feature walkthrough, pricing, waitlist/signup
- **iOS/Android** — Expo wrapper OR PWA install as primary mobile surface (decide based on Apple review friction)

---

## v2 — Moat & Depth (Months 5–8)

- **Film Room**
  - Tier 3 rendering (real short clips)
  - Freeze-frame decision points embedded in clips
  - Coach-style breakdowns: right vs. wrong, side-by-side
  - Initial library: 50 Film Room scenarios
- **Competitive Arena**
  - Ranked mode with matchmaking on IQ
  - Timed gauntlet (10 scenarios, 90 seconds)
  - Weekly boss test (hardest scenarios of the week)
  - Seasonal ladders with reset rewards
- **Social**
  - Friends list, friend leaderboards
  - Squads (join a crew with shared XP goal)
  - Challenge-a-friend (head-to-head gauntlet)
- **Trainer/Coach Dashboard** (paid tier)
  - Bulk-invite players
  - Team-level concept heatmap
  - Export progress reports
- **Content Creator Pipeline**
  - External contributor submission form
  - Moderation queue
  - Revenue share for approved scenarios

---

## v3+ — Platform (Months 9+)

- **Tier 4 rendering** — full 3D court sim with multiple camera angles
- **AI-generated scenarios** — upload game film, auto-generate decision points
- **Team/Program licensing** — AAU clubs, high schools, college programs
- **International expansion** — localization, region-specific concepts
- **Creator marketplace** — verified coaches monetize their scenario packs

---

## Sprint-by-Sprint Plan (MVP, Weeks 1–8)

| Sprint | Week(s) | Deliverables |
| --- | --- | --- |
| **S0 — Foundation** | Week 1 | Repo scaffold (Next.js + TS + Tailwind + Prisma + Supabase), CI (GitHub Actions: typecheck + lint + prisma validate), Sentry + PostHog stubs, env management, design tokens, base layout shell |
| **S1 — Auth & Onboarding** | Weeks 2–3 | Supabase auth (email + Google), onboarding flow (5 screens), user + profile schemas, calibration scenarios for starting IQ |
| **S2 — Scenario Data + Renderer** | Weeks 3–4 | Scenario + Choice + Attempt schemas, Prisma migrations, 10 seeded scenarios, `<Court>` SVG primitive with `<Player>`, `<Ball>`, `<Arrow>` children, scenario render page |
| **S3 — Session Flow** | Weeks 5–6 | Session generator API, 5-scenario bundle delivery, feedback UI (200ms flash + explanation reveal), attempt logging, IQ Score calc + animation, XP calc |
| **S4 — Progression & Profile** | Weeks 6–7 | Streak tracking, levels 1–15, profile page, session summary screen, concept-by-concept strength view |
| **S5 — Content + Polish + Beta** | Week 8 | Remaining 50 scenarios authored and seeded, full PostHog event wiring, PWA manifest, private beta invite flow (email-gated), bug bash |

---

## Release Checklist (MVP → Beta)

- [ ] All 60 scenarios reviewed by basketball SME
- [ ] D1 / D7 retention cohorts wired in PostHog
- [ ] Sentry capturing ≥ 95% of errors with source maps
- [ ] Core-loop session tested on 3 real phones (iOS Safari, Android Chrome)
- [ ] Load time to first scenario < 2s on 4G
- [ ] COPPA gate: under-13 users blocked until parental consent flow ships
- [ ] Privacy policy + ToS pages
- [ ] Beta invite email with a clear CTA
- [ ] Weekly retro cadence set with beta cohort

---

## What We're NOT Building in MVP (and Why)

| Tempting feature | Why we're skipping for MVP |
| --- | --- |
| Leaderboards | Without critical mass they look empty and demotivating |
| Social/friends | Pre-PMF; social is a retention multiplier, not a retention creator |
| Native app | PWA proves the loop; native adds complexity without proving product |
| Coach dashboard | B2C first, B2B later; avoids two products at once |
| Video scenarios | Art bottleneck; SVG gets us to learning fast |
| Multiple languages | English-first; localization after PMF |
| AI content generation | Quality bar too high for AI-first content at this stage |

Discipline here is what keeps us alive.
