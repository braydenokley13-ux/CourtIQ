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
- [ ] Install `posthog-node` and wire `lib/analytics/serverEvents.ts`
      so `daily_started` / `daily_completed` / `daily_unavailable`
      flow into PostHog (call sites already pass `distinctId = user.id`)

---

## Dashboard: Daily Challenge (Phase 8 — Phase 11)

The daily ritual is the parallel retention loop next to training. It runs on its own
streak, hits Mastery / training-streak side effects deliberately not at all, and
emits four lifecycle events:

| Event | Source | Properties |
|-------|--------|------------|
| `daily_started` | server (`/api/daily/today`) | `session_run_id, date, seed_key, catalog_incomplete, swapped_slot_index` |
| `daily_completed` | server (`/api/daily/[id]/result`) | `session_run_id, date, hits, total, total_time_ms, streak_current, streak_extended, streak_reset` |
| `daily_shared` | client (`/daily/result`) | `session_run_id, date, hits, total, method` (`clipboard \| fallback`) |
| `daily_unavailable` | server (`/api/daily/today`) | `reason: 'CATALOG_TOO_THIN'` |

> All four events are routed through `captureServerEvent` / `track` with
> `distinctId = user.id` so PostHog person profiles attach correctly. The
> server shim (`lib/analytics/serverEvents.ts`) is currently a console.info
> stub — wire `posthog-node` and replace the body when credentials are
> provisioned (the call sites do not need to change).

### Insights

| Insight | Type | Insight URL |
|---------|------|-------------|
| Daily Funnel — start → complete → share | Funnel | _TODO_ |
| Daily DAU | Trend | _TODO_ |
| Daily Streak Distribution | Trend (breakdown) | _TODO_ |
| Daily Hit Rate | Trend (formula) | _TODO_ |
| Daily P50 Time | Trend (math: p50 of `total_time_ms`) | _TODO_ |
| Daily Catalog Health | Trend (breakdown) | _TODO_ |
| Share Method Mix | Trend (breakdown) | _TODO_ |
| Daily → Training Cross-Conversion | Funnel | _TODO_ |

### Daily Funnel — start → complete → share

- **Step 1:** `daily_started`
- **Step 2:** `daily_completed` (within 1 day)
- **Step 3:** `daily_shared` (within 1 day)
- **Display:** unique users, weekly conversion
- **Goal (MVP):** ≥ 70% start→complete; ≥ 8% complete→share

### Daily DAU

- **Event:** `daily_completed` (count distinct users, daily)
- **Compare to:** `session_completed` daily count for training-side baseline
- **Display:** weekly bar chart, rolling 12-week window
- **Goal (MVP):** ≥ 30% of WAU complete a daily ≥ 1 day per week

### Daily Streak Distribution

- **Event:** `daily_completed`
- **Aggregation:** count per `streak_current` bucket
- **Buckets:** 1, 2-3, 4-7, 8-14, 15-30, 31+
- **Display:** stacked bar, last 30 days
- **Goal:** measure how many players reach the 7-day streak threshold

### Daily Hit Rate

- **Event:** `daily_completed`
- **Formula:** `sum(hits) / sum(total)` (weekly)
- **Display:** line chart, weekly
- **Guardrail:** alert if rate falls outside `0.50 – 0.85` for two consecutive
  weeks (too easy or too hard → seed retune)

### Daily P50 Time

- **Event:** `daily_completed`
- **Math:** percentile_50 of `total_time_ms`
- **Display:** weekly line, log y-axis
- **Goal:** P50 between 90s and 240s (5 reps × ~30s)

### Daily Catalog Health

- **Event:** `daily_started`
- **Breakdown:** `catalog_incomplete` (boolean), `swapped_slot_index` (numeric)
- **Display:** weekly stacked bar
- **Action:** when `catalog_incomplete=true` rate exceeds 10% for a week,
  the LIVE library is too thin for the daily — content team gets paged

### Share Method Mix

- **Event:** `daily_shared`
- **Breakdown:** `method` (`clipboard | fallback`)
- **Display:** weekly pie + trend
- **Goal:** verify the modern Clipboard API path is the dominant route;
  spike in `fallback` indicates a Safari / HTTP regression

### Daily → Training Cross-Conversion

- **Step 1:** `daily_completed`
- **Step 2:** `session_started` (within 24h, filter to non-daily session runs)
- **Display:** weekly funnel
- **Hypothesis:** the daily is a hook into deeper training, not a substitute
- **Goal (MVP):** ≥ 25% of daily completers start a training session same day

### Alerts

- `daily_unavailable` events fire any week → page content team (catalog gap)
- `daily_completed` weekly count drops > 30% week-over-week → alert
- `daily_shared.method = 'fallback'` exceeds 25% of `daily_shared` total → alert
