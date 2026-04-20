# CourtIQ — Build Plan

Execution playbook. This doc exists so any new agent or engineer can pick up a workstream Monday morning and know exactly what to do, how it fits with everything else, and what "done" looks like.

---

## 1. Multi-Agent Workstreams

We break the product into eight parallel lanes. Each lane can be owned by a single agent, engineer, or small team, with well-defined interfaces between them.

| ID | Workstream | Primary Surface | Key Deliverables | Dependencies |
| --- | --- | --- | --- | --- |
| **WS-1** | Auth & Onboarding | `features/auth`, `features/onboarding` | Supabase auth wiring, signup/login UI, 5-screen onboarding, calibration scenarios, Profile row creation | WS-0 (foundation) |
| **WS-2** | Design System | `components/ui`, `components/court`, tokens | Tailwind tokens (port from `courtiq/project/design-system.jsx`), UI primitives (`Button`, `Card`, `Chip`, `Icon`, `Progress`, `Dot`), court SVG primitives (half-court + player dots, port from `courtiq/project/court.jsx`), motion library (port `ciq-pulse`, `ciq-slideup`, `ciq-pop`, `ciq-fadein`) | WS-0 |
| **WS-3** | Scenario Engine | `features/scenarios`, `app/api/session/*`, `lib/services/scenarioService` | Scenario schema, session generator, render pipeline, attempt logging, feedback UI | WS-2 (court primitives) |
| **WS-4** | Progression | `lib/services/{iq,xp,streak,mastery,badge}Service`, `packages/core` | IQ/XP calc, levels, streaks, badges, mastery model | WS-3 (attempts stream) |
| **WS-5** | Content Ops | `packages/db/seed`, `scripts/seed-scenarios.ts`, `/admin` stub | Seed script, 60 MVP scenarios authored and loaded, SME review workflow | WS-3 (schema) |
| **WS-6** | Analytics & Instrumentation | `lib/analytics`, Sentry wiring | Typed event wrapper, complete event spec wired, dashboards in PostHog | WS-1, WS-3 (events originate here) |
| **WS-7** | Marketing Surface | `app/(marketing)`, landing page | Hero, feature walkthrough, waitlist form, pricing page (v1), share-link pages | WS-2 |
| **WS-8** | QA & Playtest | Test harness, bug triage | Internal test harness (fake user, fake sessions), device matrix testing, beta feedback loop | All |

There's also an implicit **WS-0 Foundation** (repo scaffold, CI, envs) that must land first.

### 1.1 Interfaces Between Workstreams

- **WS-1 → WS-4:** On signup, `Profile` is seeded with `iq_score: 500`, `level: 1`, `xp_total: 0`. Calibration scenarios adjust starting IQ.
- **WS-3 → WS-4:** Every `Attempt` record triggers `iqService.applyAttempt`, `xpService.award`, `masteryService.update`, `badgeService.checkAndAward`. These are synchronous service calls in the same request.
- **WS-3 → WS-6:** Each attempt fires `scenario_answered` with typed properties.
- **WS-5 → WS-3:** Scenarios are read from Postgres; no coupling between content authoring and engine logic.
- **WS-2 → everyone:** All UI ships through the design system. No one-off styles.

### 1.2 Suggested Agent Handoff Pattern

For each workstream, a hand-off brief should include:
- Which `ARCHITECTURE.md` section governs it
- Which `PRODUCT_SPEC.md` section describes the UX
- Entry-point file paths (already specified in §1 above)
- Acceptance criteria (tests + manual checks)
- Analytics events to wire (from §3)

---

## 2. Sprint Plan (MVP, Weeks 1–8)

Pulled from `MVP_ROADMAP.md` and expanded with ownership.

| Sprint | Week(s) | WS ownership | Goal |
| --- | --- | --- | --- |
| **S0** | Week 1 | WS-0 (all hands) | Repo scaffold, CI, Supabase projects, design tokens, env mgmt, Sentry + PostHog stubs |
| **S1** | Weeks 2–3 | WS-1 + WS-2 | Auth + 5-screen onboarding + base UI primitives + profile shell |
| **S2** | Weeks 3–4 | WS-3 + WS-2 + WS-5 | Scenario schema + `<Court>` primitive + 10 seeded scenarios + render page |
| **S3** | Weeks 5–6 | WS-3 + WS-4 + WS-6 | Session flow + attempt logging + IQ/XP calc + feedback UI + first events wired |
| **S4** | Weeks 6–7 | WS-4 + WS-2 | Streaks + levels + profile stats page + session summary |
| **S5** | Week 8 | WS-5 + WS-6 + WS-8 | Remaining 50 scenarios + full analytics + PWA + private beta invite |

Weeks overlap intentionally (e.g. S2 ends Week 4 while S3 starts Week 5): this keeps workstreams parallelizable.

---

## 3. Analytics Plan

### 3.1 Event Catalog

Typed `lib/analytics/events.ts`:

```ts
type EventMap = {
  // Auth & onboarding
  auth_signup:            { method: 'email' | 'google' }
  onboarding_completed:   { age: number | 'hidden', position: Position, skill: SkillLevel, goal: string, starting_iq: number }

  // Session lifecycle
  session_started:        { session_run_id: string, scenario_count: number, user_iq: number }
  scenario_presented:     { session_run_id: string, scenario_id: string, difficulty: number, concept_tags: string[], order: number }
  scenario_answered:      { session_run_id: string, scenario_id: string, choice_id: string, is_correct: boolean, time_ms: number, iq_delta: number, xp_delta: number }
  session_completed:      { session_run_id: string, correct_count: number, total: number, xp_earned: number, iq_delta: number, duration_ms: number }

  // Progression
  iq_updated:             { iq_before: number, iq_after: number, delta: number, source: 'scenario' | 'calibration' }
  level_up:               { level_before: number, level_after: number, xp_total: number }
  streak_extended:        { streak_current: number }
  streak_broken:          { streak_previous: number }
  streak_freeze_used:     { streak_current: number }
  badge_earned:           { badge_slug: string, family: BadgeFamily }
  module_started:         { module_slug: string }
  module_completed:       { module_slug: string, mastery_score: number }

  // Social / retention
  share_click:            { surface: string }
  leaderboard_view:       { period: 'weekly', scope: 'global' | 'friends' }

  // Monetization (v1+)
  paywall_shown:          { trigger: string }
  subscription_started:   { plan: 'pro_monthly' | 'pro_annual' }
  subscription_cancelled: { plan: string, tenure_days: number }
}
```

### 3.2 North Star & Guardrails

- **North Star:** **Weekly Active Sessions per User (WASU)** — captures both retention and engagement depth
- **Guardrails:**
  - D7 retention ≥ 30% (MVP), ≥ 40% (v1)
  - Median session length ≥ 3 minutes
  - Scenario correctness rate stays in `40%–90%` (engine is challenging but not crushing)
  - Dispute rate per scenario < 10%

### 3.3 Cohorts to Track from Day One

- Signup-week cohorts (D1, D7, D30)
- By onboarding skill self-rating
- By age group (11–13, 14–15)
- By starting IQ quartile
- By primary concept weakness

---

## 4. Go-To-Market Plan

### 4.1 Phases

**Phase 0 — Private Beta (Weeks 8–10)**
- 100 invited users from founder's AAU network + 3 trainer partners
- Private PWA link; email-gated
- Goal: validate loop, fix the rough edges, produce testimonials
- Measure: D7 retention, NPS, session length

**Phase 1 — Public Launch (Weeks 12–16)**
- Public landing page + waitlist → mass invite
- Short-form content: TikTok + IG Reels
  - Format: "Would you pass, cut, or clear?" — 15-second scenario hooks with a pin-to-top comment revealing the answer after 24h
  - Post 5x/week minimum
- Trainer affiliate program: trainers get a branded landing page; 20% rev-share on signups
- Parent-focused Facebook group strategy
- Goal: 1,000 MAU, paid tier live
- Measure: MAU, conversion to Pro, CAC

**Phase 2 — Scale (Months 5–8)**
- Paid UGC with youth trainers ($500–1500/deal)
- AAU program partnerships (bulk licensing)
- YouTube long-form: "This is the off-ball read that got him cut" — narrative basketball-IQ content linking to the app
- Discord or Skool community for Pro users
- Goal: 10k MAU, B2B revenue

### 4.2 Pricing (v1+)

| Plan | Price | What's included |
| --- | --- | --- |
| **Free** | $0 | 1 session/day, MVP content, IQ Score, streaks |
| **Pro** | $9.99/mo or $79/yr | Unlimited sessions, full library, streak freeze, Academy modules, weekly drop, leaderboards |
| **Program License** | Custom (starting ~$500/season for 20 players) | Coach dashboard, team analytics, bulk seats, brand customization |

Pricing experiments to run: $7.99 vs $9.99, annual discount depth, free-trial length.

### 4.3 Positioning Hooks

Taglines to test:
- "Train your brain like you train your game."
- "The IQ app for hoopers."
- "Stop being a step late."
- "Your game, finally read correctly."

### 4.4 Distribution Lever to Build Early

**The Shareable IQ Score.** Every user has a public profile card (IQ score + top concept + rank). Designed to be shared on IG stories. Each share = a free acquisition channel + a flex for the user.

---

## 5. Risks & Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Content correctness controversy | Critical | SME review gate, in-product dispute button, weekly accuracy audit |
| Scope creep into a drill/video library | High | `MVP_ROADMAP.md` is the disciplinary document; product review board says no |
| Art/animation bottleneck | High | Ship Tier 1 (SVG) only for MVP; animate only scenarios with proven retention value |
| COPPA exposure (under-13 users) | High | Age gate at signup, 13+ only at launch, parental consent flow ships in v1 |
| Retention cliff past week 2 | High | Streak system + weekly content drops + notifications + social hooks; measure D1/D7/D30 from day one |
| Vendor lock-in (Supabase) | Medium | Prisma abstracts DB; schema is standard Postgres; migration to bare Postgres is viable |
| CAC too high | Medium | Organic-first (TikTok + trainer affiliate) before any paid spend; target LTV:CAC ≥ 3 before scaling paid |
| Apple / Google store friction | Medium | PWA-first means no store dependency for launch; native when ready |
| Single-founder / small team burnout | Medium | Workstream model enables multi-agent parallelization; clear weekly scope |
| Copycat competition | Low–Medium | Moat is content + IQ score + data loop, all compounding; speed is defense |

---

## 6. Recommendations

1. **Start the content engine on Day 1.** Even before the app is built, begin authoring scenarios in Notion. Content is the long-lead item.
2. **Ship private beta by Week 8 non-negotiable.** Delays here compound.
3. **Hire (or contract) a basketball SME before Week 2.** Content quality gate depends on this person.
4. **Invest in a hireable illustrator for Tier 2 animations in parallel with v1 build.** Don't let art block product.
5. **Track D7 retention religiously from first beta user.** It's the single most important metric pre-PMF.
6. **Build the shareable profile card early.** Free distribution channel.
7. **Resist every v2 feature request until MVP retention is proven.** Discipline wins.

---

## 6.1 Design Handoff Reference

The `courtiq/` folder in this repo is a **Claude Design handoff bundle** with three screens already mocked (Home Dashboard, Academy, Scenario Engine) + a full design system. **Every workstream touching UI should reference these files directly** for visual truth — tokens, copy, spacing, motion.

- Entry point: `courtiq/project/CourtIQ MVP.html`
- Design system (tokens + primitives): `courtiq/project/design-system.jsx`
- Home Dashboard: `courtiq/project/home.jsx` — drives WS-4 profile page + WS-7 hero
- Academy: `courtiq/project/academy.jsx` — drives v1 Academy UI
- Scenario Engine: `courtiq/project/scenario.jsx` — drives WS-3 core flow
- Half-court SVG: `courtiq/project/court.jsx` — drives WS-2 `<Court>` primitive
- Design intent transcript: `courtiq/chats/chat1.md`

**Rule:** match the prototype's *visual output* pixel-for-pixel. Do NOT copy its internal structure — it's inline-styled React-in-a-browser. Port to Tailwind + proper React components.

---

## 7. Recommended First Build Sprint (Sprint 0, Week 1)

A concrete day-by-day breakdown of the very first build sprint:

**Day 1 — Foundation**
- Initialize monorepo (`pnpm`, Turborepo, TS strict)
- Create `apps/web`, `packages/core`, `packages/db`, `packages/config`
- Install Next.js 15 + Tailwind + Prisma
- Configure eslint + prettier + tsconfig presets

**Day 2 — Infra**
- Create Supabase dev + prod projects
- Wire Prisma to Supabase
- Create Vercel project; link repo
- Set up env vars (`.env.example` committed)
- GitHub Actions CI: typecheck + lint + prisma validate

**Day 3 — Design tokens & shell**
- Tailwind config with CourtIQ tokens (see ARCHITECTURE §4.2)
- Base layout: dark mode, bottom-nav mobile shell
- Sentry + PostHog client initialization
- Typed analytics wrapper

**Day 4 — Auth scaffold**
- Supabase Auth wired (email + Google)
- `/login` and `/signup` route stubs
- Server-side Supabase client + middleware
- Profile creation trigger

**Day 5 — Retrospective + setup for Sprint 1**
- Verify all CI green
- Smoke test: signup → login → middleware redirect works
- Hand-off brief for WS-1 (Auth & Onboarding) team

---

## 8. Coverage Matrix — Founder's 15 Deliverables

| # | Deliverable | Where it lives |
| --- | --- | --- |
| 1 | Product Architecture | `PRODUCT_SPEC.md` §4–§6 |
| 2 | User Experience Flow | `PRODUCT_SPEC.md` §5 |
| 3 | Feature Prioritization | `MVP_ROADMAP.md` all |
| 4 | Scenario Engine Architecture | `PRODUCT_SPEC.md` §6 + `ARCHITECTURE.md` §6 |
| 5 | Curriculum System | `CONTENT_SYSTEM.md` §2, §8 |
| 6 | Data Model / DB Schema | `ARCHITECTURE.md` §6 |
| 7 | Gamification System | `PRODUCT_SPEC.md` §7–§8 |
| 8 | Frontend Architecture | `ARCHITECTURE.md` §4 |
| 9 | Backend Architecture | `ARCHITECTURE.md` §5 |
| 10 | Content Operations System | `CONTENT_SYSTEM.md` §3–§6 |
| 11 | Analytics Plan | `BUILD_PLAN.md` §3 |
| 12 | Go-To-Market Plan | `BUILD_PLAN.md` §4 |
| 13 | Risks + Recommendations | `BUILD_PLAN.md` §5–§6 |
| 14 | Multi-Agent Build Plan | `BUILD_PLAN.md` §1–§2 |
| 15 | Exact Future Build Order | `MVP_ROADMAP.md` + `BUILD_PLAN.md` §7 |

Every founder deliverable has a documented home.
