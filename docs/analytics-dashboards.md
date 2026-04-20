# CourtIQ — PostHog Analytics Dashboards

Reference for all core insights and funnels defined in BUILD_PLAN.md §3.2–§3.3.
Paste the live PostHog URLs into the **Insight URL** column once each insight is saved.

---

## Dashboard: North Star

| Insight | Type | Insight URL |
|---------|------|-------------|
| WASU — Weekly Active Sessions per User | Trend | _TODO: paste PostHog insight URL_ |

### WASU Configuration

- **Events:** `session_completed` (count, grouped by week)
- **Formula:** unique sessions ÷ unique users in the same week window
- **Breakdown:** none (top-line only; add skill cohort as secondary once cohort sizes are large enough)
- **Display:** weekly bar chart, rolling 12-week window
- **Goal (MVP):** ≥ 2 sessions/user/week; stretch ≥ 3

---

## Dashboard: Retention Cohorts

| Insight | Type | Insight URL |
|---------|------|-------------|
| D1 Retention | Retention | _TODO_ |
| D7 Retention | Retention | _TODO_ |
| D30 Retention | Retention | _TODO_ |
| Retention by Skill Self-Rating | Retention (breakdown) | _TODO_ |
| Retention by Age Group | Retention (breakdown) | _TODO_ |
| Retention by Starting IQ Quartile | Retention (breakdown) | _TODO_ |

### D1 / D7 / D30 Configuration (apply to all three, change period)

- **Cohort event:** `auth_signup` (baseline — defines cohort entry)
- **Retention event:** `session_started` (return action)
- **Periods:** Day 1 / Day 7 / Day 30
- **Guardrails:**
  - D7 ≥ 30% (MVP), ≥ 40% (v1)
  - Alert in PostHog if D7 drops below 25%

### Skill Breakdown

Add a **breakdown** on `onboarding_completed.skill`:
`ROOKIE` | `VARSITY` | `ELITE`

### Age Group Breakdown

Add a **breakdown** on `onboarding_completed.age` with bucket transform:
- 11–13 → "13 and under"
- 14–15 → "14–15"
- 16+ / `hidden` → "16+ / hidden"

### Starting IQ Quartile Cohorts

Create four **static cohorts** in PostHog after first 100 signups:
- IQ 500–624 (Q1)
- IQ 625–749 (Q2)
- IQ 750–874 (Q3)
- IQ 875–900 (Q4)

Filter `onboarding_completed.starting_iq` with numeric range filter per cohort.

---

## Dashboard: Session Quality

| Insight | Type | Insight URL |
|---------|------|-------------|
| Scenario Correctness Rate Distribution | Bar chart | _TODO_ |
| Session Length — Median (ms) | Trends / formula | _TODO_ |
| Drop-off Funnel: session_started → session_completed | Funnel | _TODO_ |

### Scenario Correctness Rate

- **Event:** `scenario_answered`
- **Property breakdown:** `is_correct` (true / false)
- **Chart:** percentage bar
- **Guardrail:** correctness rate must stay in **40%–90%** (engine tuning range)

### Session Length Median

- **Event:** `session_completed`
- **Property aggregation:** `p50(duration_ms)`
- **Display:** trend line, weekly granularity
- **Guardrail:** median ≥ 180 000 ms (3 minutes)

### Drop-off Funnel

Steps (ordered, conversion window = 30 minutes):

1. `session_started`
2. `scenario_presented` (order = 1)
3. `scenario_answered` (any)
4. `session_completed`

- **Breakdown:** none at launch; add `user_iq` bucket once data is available
- **Watch:** if step 3 → step 4 conversion < 70%, investigate session abandonment

---

## Dashboard: Progression Health

| Insight | Type | Insight URL |
|---------|------|-------------|
| IQ Updates per Day | Trend | _TODO_ |
| Level-up Rate | Trend | _TODO_ |
| Badge Earned by Family | Breakdown | _TODO_ |
| Streak Extension Rate | Trend | _TODO_ |

### Badge Earned Breakdown

- **Event:** `badge_earned`
- **Property breakdown:** `family` → `CONCEPT` | `MILESTONE` | `ACCURACY`
- Useful for detecting which badge families are achievable in the wild.

---

## Sentry — Release Tracking

Sentry releases are tagged with the Vercel git SHA (`VERCEL_GIT_COMMIT_SHA`), set via `NEXT_PUBLIC_COMMIT_SHA` in `next.config.ts`. Source maps are uploaded by `@sentry/nextjs` (`withSentryConfig`) on every Vercel build.

| Surface | SDK | Source maps |
|---------|-----|-------------|
| Browser (Next.js client) | `@sentry/nextjs` | Uploaded via `widenClientFileUpload: true` |
| Node.js (server routes) | `@sentry/nextjs` (server) | Uploaded automatically |
| Edge runtime (middleware) | `@sentry/nextjs` (edge) | Uploaded automatically |

Required Vercel env vars:

```
SENTRY_ORG=courtiq
SENTRY_PROJECT=web
SENTRY_AUTH_TOKEN=<from Sentry CI integrations page>
NEXT_PUBLIC_SENTRY_DSN=<from Sentry project settings>
```

---

## Setup Checklist

- [ ] Create PostHog project, copy key into `NEXT_PUBLIC_POSTHOG_KEY`
- [ ] Enable **Session Replay** (free tier covers MVP beta)
- [ ] Create each insight above and paste URLs into this table
- [ ] Set PostHog **data retention** to 12 months
- [ ] Configure PostHog **alert** on D7 < 25%
- [ ] Configure PostHog **alert** on correctness rate outside 40–90%
- [ ] Enable Sentry Vercel integration for automatic release tagging
- [ ] Set `SENTRY_AUTH_TOKEN` in Vercel encrypted env vars (production + preview)
