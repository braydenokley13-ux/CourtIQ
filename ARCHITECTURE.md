# CourtIQ — Technical Architecture

This is the engineering blueprint. It should let a new engineer or agent set up, understand, and contribute to the codebase in under an hour. All decisions here favor **shipping speed** first, **scale** second, without painting ourselves into a corner.

---

## 1. Tech Stack (chosen)

| Layer | Choice | Why |
| --- | --- | --- |
| **Framework** | Next.js 15 (App Router) | SSR + API routes + edge-ready + best-in-class DX |
| **Language** | TypeScript (strict) | Safety across client/server/shared |
| **Styling** | Tailwind CSS + CSS variables for tokens | Fastest iteration, consistent system |
| **UI motion** | Framer Motion | Snappy, declarative animations |
| **UI primitives** | Radix UI (headless) | Accessibility + composition |
| **Forms** | React Hook Form + Zod | Typed, fast, tiny |
| **Client state** | Zustand (session UI) + React Query (server state) | Minimal ceremony |
| **Database** | Postgres via Supabase | Managed, scalable, RLS baked in |
| **ORM** | Prisma | Type-safe migrations, great DX |
| **Auth** | Supabase Auth (email + Google OAuth) | Zero-ops auth |
| **Storage** | Supabase Storage (MVP); Cloudflare R2 (v2+ for video) | Cost and CDN when scaling |
| **Realtime** | Supabase Realtime (later — for head-to-head arena) | Free channel layer |
| **Mobile wrapper** | PWA first, Expo later | Ship faster; native after PMF |
| **Analytics** | PostHog (cloud) | Events + funnels + feature flags + session replay |
| **Error tracking** | Sentry | Frontend + backend, sourcemaps |
| **Hosting** | Vercel | Native Next.js, preview URLs on every PR |
| **CI** | GitHub Actions | Free for us, fits the flow |

**Explicitly rejected for MVP:** microservices, GraphQL, self-hosted DB, NestJS, Redux, Firebase. All would cost speed without buying enough.

---

## 2. Monorepo Layout

```
courtiq/
├── apps/
│   └── web/                     # Next.js 15 app (primary surface)
│       ├── app/
│       │   ├── (marketing)/     # Landing, pricing, about
│       │   ├── (auth)/          # Login, signup, callback
│       │   ├── (app)/           # Authenticated product
│       │   │   ├── train/       # Session flow
│       │   │   ├── academy/     # Modules & lessons
│       │   │   ├── profile/     # User profile & stats
│       │   │   └── leaderboard/ # v1+
│       │   └── api/             # Route handlers
│       ├── components/
│       │   ├── ui/              # Design system primitives
│       │   ├── court/           # <Court>, <Player>, <Ball>, <Arrow>
│       │   └── scenario/        # ScenarioCard, ChoiceTile, FeedbackPanel
│       ├── features/            # Feature modules (colocated state + hooks)
│       │   ├── auth/
│       │   ├── onboarding/
│       │   ├── scenarios/
│       │   ├── academy/
│       │   ├── progression/
│       │   └── profile/
│       ├── lib/
│       │   ├── services/        # scenarioService, iqService, xpService...
│       │   ├── supabase/        # Client + server clients
│       │   ├── analytics/       # PostHog wrapper with typed events
│       │   └── utils/
│       └── styles/
├── packages/
│   ├── core/                    # Shared types + pure logic (IQ calc, XP calc)
│   ├── config/                  # tsconfig, eslint, tailwind presets
│   └── db/                      # Prisma schema + migrations + seed
├── scripts/
│   └── seed-scenarios.ts        # Seeds the 60 MVP scenarios
├── .github/workflows/
│   └── ci.yml
├── turbo.json                   # Turborepo for monorepo task running
└── package.json
```

**Why monorepo:** `packages/core` lets us later share IQ/XP calc logic with a React Native app. `packages/db` isolates Prisma. Turborepo makes CI fast.

---

## 3. Environments

| Env | Purpose | Supabase project | Vercel |
| --- | --- | --- | --- |
| `local` | Dev machines | Local Supabase (Docker) or shared dev project | `next dev` |
| `preview` | Every PR | Dev Supabase project | Auto preview URL |
| `production` | Beta + launch | Prod Supabase project | `courtiq.app` |

**Secrets:** Vercel env vars + Supabase vault. `.env.example` committed with keys, never values.

---

## 4. Frontend Architecture

### 4.1 App Router Layout

- Route groups (`(marketing)`, `(auth)`, `(app)`) keep layouts separate without affecting URLs.
- `(app)` layout enforces auth via a server-side Supabase client; unauthenticated users redirect to `/login`.
- Server Components by default; Client Components opt-in where interactivity or state is required.

### 4.2 Design System

The visual source of truth is the prototype bundle at `courtiq/project/`. Production tokens should match the `CIQ` object in `courtiq/project/design-system.jsx`. Exact values:

**Background stack (dark-mode first):**
- `--bg-0` `#0A0B0E` — page
- `--bg-1` `#13151A` — card raised
- `--bg-2` `#1C1F26` — card raised 2
- `--bg-3` `#262A33` — hover / active
- `--hairline` `rgba(255,255,255,0.06)`
- `--hairline-2` `rgba(255,255,255,0.10)`

**Text:**
- `--text` `#F4F5F7`
- `--text-dim` `#9BA1AD`
- `--text-mute` `#5B6170`

**Brand / accents:**
- `--brand` `#3BE383` (electric signal-green; on-brand ink `#021810`)
- `--brand-dim` `#1F9F5B`
- `--xp` `#FF8A3D` (orange, for XP / energy; dim `#B84E12`)
- `--iq` `#8B7CFF` (purple-indigo, for IQ metric; dim `#5040B8`)
- `--heat` `#FF4D6D` (streak / fire)
- `--info` `#5AC8FF`

**Court:**
- `--court-line` `rgba(255,255,255,0.55)`
- `--court-fill` `#13151A`
- `--court-accent` `rgba(59,227,131,0.08)`

**Typography:**
- Display: `'Space Grotesk', 'Inter', system-ui, sans-serif` (headlines, IQ numbers, rank labels)
- UI: `'Inter', system-ui, -apple-system, sans-serif` (body, chips, stats)
- Mono: `'JetBrains Mono', ui-monospace, monospace` (timers, tier codes)

**Spacing:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64
**Radii:** 6, 12, 16, 18, 20, 24 (primary button uses 18; cards use 20)
**Motion:** 80–160ms micro-interactions; 500ms cubic-bezier(0.2, 0.8, 0.2, 1) for progress bars; `ciq-pulse`, `ciq-slideup`, `ciq-pop`, `ciq-fadein` keyframes defined in the prototype — port to Framer Motion variants.

**Primitives (`components/ui/`):** `Button` (Primary: 58px tall, radius 18, brand bg, uppercase Space Grotesk), `GhostButton`, `Card` (bg-1, radius 20, 1px hairline border), `Chip` (uppercase 11px, 4/9 padding), `Dot`, `Icon` (custom SVG set — the prototype ships `home`, `academy`, `play`, `trophy`, `flame`, `bolt`, `brain`, `target`, `eye`, `shield`, `zap`, `clock`, `chevron-*`, `lock`, `check`, `x`, `sparkle`, `compass`, `info`, `stats`, `user`, `arrow-right`), `Progress` (6px default, optional glow), `ProgressRing`, `NumberTicker`, `StreakFlame`, `XPBar`, `Sheet`, `Dialog`, `Toast`.

**Court primitives (`components/court/`):** `<Court>` renders a half-court SVG (see `courtiq/project/court.jsx` for the reference implementation). Children: `<Player position={{x, y}} team="off|def" label role glow ghost />`, `<Ball position />`, `<Arrow from to color dashed curve />`. Scenario `court_state_json` renders through this. The half-court is the canonical view — full-court only when a scenario requires transition context.

### 4.3 State Management

- **React Query** for all server data (sessions, scenarios, profile, leaderboard). Cached aggressively; invalidated on attempt submit.
- **Zustand** for transient session UI state (current scenario index, timer, locked-in choice).
- **No global Redux**. Each feature owns its slice.

### 4.4 Page Map

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing |
| `/login`, `/signup` | Auth |
| `/onboarding` | 5-step onboarding + calibration |
| `/home` | Dashboard: streak, IQ, "Train" CTA, daily goal ring |
| `/train` | Session runner |
| `/train/summary` | End-of-session summary |
| `/academy` | Module index (v1) |
| `/academy/[slug]` | Module page with lessons + scenario shortcut |
| `/profile` | Stats, badges, concept radar, history |
| `/leaderboard` | Weekly ladder (v1) |
| `/settings` | Account + notifications |

---

## 5. Backend Architecture

### 5.1 Route Handlers

All under `app/api/`. REST-ish, JSON.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/onboarding/calibrate` | POST | Returns 5 calibration scenarios |
| `/api/session/start` | POST | Creates a `SessionRun`, returns scenario bundle |
| `/api/session/:id/attempt` | POST | Logs attempt, returns updated IQ/XP/mastery |
| `/api/session/:id/complete` | POST | Finalizes the session, awards streak/badges |
| `/api/profile` | GET | Current user's profile + stats |
| `/api/academy/modules` | GET | Module list + progress |
| `/api/leaderboard/weekly` | GET | Top N + user's rank |
| `/api/admin/scenarios` | CRUD | Internal CMS endpoints (role-gated) |

### 5.2 Service Layer

`lib/services/` — pure functions where possible, Supabase client injected.

- `scenarioService.generateSessionBundle(userId, n)` — applies weighting from PRODUCT_SPEC §6.3
- `iqService.applyAttempt(userId, scenario, choice, timeMs)` — computes delta, persists
- `xpService.award(userId, amount, reason)` — XP + level-up check
- `streakService.tick(userId, today)` — handles streak increment/break/freeze
- `masteryService.update(userId, conceptIds, isCorrect)` — rolling accuracy update
- `badgeService.checkAndAward(userId, trigger)` — evaluates badge criteria

Pure calc logic (`iq`, `xp`, `mastery`) lives in `packages/core` so it's testable and future-mobile-shareable.

### 5.3 Row Level Security (RLS)

Every user-scoped table has RLS:
- `auth.uid() = user_id` on SELECT/UPDATE
- `service_role` key used only server-side for system writes
- No raw Supabase client in the browser for privileged tables

### 5.4 Session Bundle Response

On `POST /api/session/start`:

```json
{
  "session_run_id": "uuid",
  "scenarios": [
    {
      "id": "sc_001",
      "difficulty": 2,
      "prompt": "...",
      "court_state": { ... },
      "choices": [{"id": "a", "label": "..."}, ...],
      "render_tier": 1
    }
    /* ...4 more... */
  ],
  "meta": {
    "user_iq": 812,
    "streak": 5,
    "daily_goal_progress": 0
  }
}
```

**Critical:** `is_correct`, `explanation`, and `feedback_text` are NOT included in the bundle. They're fetched on attempt submission to prevent client-side cheating.

---

## 6. Data Model

### 6.1 Prisma Schema (sketch)

```prisma
// packages/db/prisma/schema.prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  display_name String?
  birthdate    DateTime?
  position     Position?
  skill_level  SkillLevel?
  role         UserRole @default(PLAYER)
  created_at   DateTime @default(now())
  profile      Profile?
  attempts     Attempt[]
  session_runs SessionRun[]
  masteries    Mastery[]
  badges       UserBadge[]
  streaks      StreakEvent[]
}
model Profile {
  user_id             String   @id
  user                User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  avatar_url          String?
  iq_score            Int      @default(500)
  xp_total            Int      @default(0)
  level               Int      @default(1)
  current_streak      Int      @default(0)
  longest_streak      Int      @default(0)
  streak_freeze_count Int      @default(0)
  updated_at          DateTime @updatedAt
}
model Concept {
  id          String    @id @default(uuid())
  slug        String    @unique
  name        String
  category    Category
  parent_id   String?
  parent      Concept?  @relation("ConceptTree", fields: [parent_id], references: [id])
  children    Concept[] @relation("ConceptTree")
  description String?
}
model Module {
  id               String   @id @default(uuid())
  slug             String   @unique
  title            String
  concept_id       String
  order            Int
  prerequisite_ids String[]
  lessons          Lesson[]
}
model Lesson {
  id         String   @id @default(uuid())
  module_id  String
  module     Module   @relation(fields: [module_id], references: [id])
  order      Int
  title      String
  body_md    String
  media_refs String[]
}
model Scenario {
  id              String         @id @default(uuid())
  version         Int            @default(1)
  status          ScenarioStatus @default(DRAFT)
  category        Category
  concept_tags    String[]
  sub_concepts    String[]
  difficulty      Int
  court_state     Json
  user_role       String
  prompt          String
  explanation_md  String
  xp_reward       Int            @default(10)
  mastery_weight  Float          @default(1.0)
  render_tier     Int            @default(1)
  media_refs      String[]
  created_at      DateTime       @default(now())
  updated_at      DateTime       @updatedAt
  choices         ScenarioChoice[]
  attempts        Attempt[]
}
model ScenarioChoice {
  id            String   @id @default(uuid())
  scenario_id   String
  scenario      Scenario @relation(fields: [scenario_id], references: [id], onDelete: Cascade)
  label         String
  is_correct    Boolean
  feedback_text String
  order         Int
}
model SessionRun {
  id             String    @id @default(uuid())
  user_id        String
  user           User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  started_at     DateTime  @default(now())
  ended_at       DateTime?
  scenario_ids   String[]
  correct_count  Int       @default(0)
  xp_earned      Int       @default(0)
  iq_delta       Int       @default(0)
  attempts       Attempt[]
}
model Attempt {
  id              String   @id @default(uuid())
  user_id         String
  user            User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  scenario_id     String
  scenario        Scenario @relation(fields: [scenario_id], references: [id])
  choice_id       String
  is_correct      Boolean
  time_ms         Int
  iq_before       Int
  iq_after        Int
  session_run_id  String?
  session_run     SessionRun? @relation(fields: [session_run_id], references: [id])
  created_at      DateTime @default(now())
  @@index([user_id, scenario_id])
  @@index([user_id, created_at])
}
model Mastery {
  user_id           String
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  concept_id        String
  rolling_accuracy  Float    @default(0)
  attempts_count    Int      @default(0)
  last_seen_at      DateTime?
  spaced_rep_due_at DateTime?
  @@id([user_id, concept_id])
}
model Badge {
  id           String       @id @default(uuid())
  slug         String       @unique
  name         String
  family       BadgeFamily
  criteria     Json
  icon_ref     String
  user_badges  UserBadge[]
}
model UserBadge {
  user_id   String
  user      User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  badge_id  String
  badge     Badge    @relation(fields: [badge_id], references: [id])
  earned_at DateTime @default(now())
  @@id([user_id, badge_id])
}
model StreakEvent {
  user_id    String
  user       User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  date       DateTime @db.Date
  completed  Boolean  @default(true)
  @@id([user_id, date])
}
model LeaderboardEntry {
  user_id     String
  week_start  DateTime @db.Date
  xp_week     Int      @default(0)
  rank        Int?
  updated_at  DateTime @updatedAt
  @@id([user_id, week_start])
}
enum Position    { PG SG SF PF C ALL }
enum SkillLevel  { ROOKIE VARSITY ELITE }
enum UserRole    { PLAYER PARENT COACH TRAINER ADMIN }
enum Category    { OFFENSE DEFENSE TRANSITION SITUATIONAL }
enum ScenarioStatus { DRAFT REVIEW LIVE RETIRED }
enum BadgeFamily { CONCEPT MILESTONE ACCURACY }
```

### 6.2 Key Indexes

- `Attempt(user_id, created_at)` — profile history queries
- `Attempt(user_id, scenario_id)` — spaced-rep lookup
- `Scenario` status partial indexes for `status = LIVE`
- `LeaderboardEntry(week_start, rank)` — weekly top-N

### 6.3 Migrations

- Prisma Migrate for schema
- One migration per PR; no hand-edited migrations in `main`
- `prisma validate` runs in CI

---

## 7. Auth Flow

1. User hits `/signup`
2. Supabase client creates user; email confirmation or Google OAuth
3. Server creates `Profile` row on first sign-in via a trigger or edge function
4. JWT cookie set; middleware reads it on every `(app)/*` request
5. Logout clears cookie; redirects to `/`

---

## 8. Instrumentation

### 8.1 PostHog Events (typed)

`lib/analytics/events.ts` exports a typed `track(event, properties)` wrapper. No raw `posthog.capture` calls outside this file.

Core events in MVP (full list in `BUILD_PLAN.md` §3):
- `auth_signup`, `onboarding_completed`
- `session_started`, `scenario_presented`, `scenario_answered`, `session_completed`
- `streak_extended`, `streak_broken`
- `iq_updated`, `level_up`, `badge_earned`

### 8.2 Sentry

- Frontend + backend SDKs
- Source maps uploaded on every Vercel deploy
- Release tag = git SHA

---

## 9. Performance Targets

| Metric | Target |
| --- | --- |
| Time to first scenario (cold start, 4G) | < 2s |
| Attempt-submit → feedback visible | < 200ms (optimistic UI + server reconcile) |
| Lighthouse mobile perf | ≥ 90 |
| First Contentful Paint | < 1.5s |
| JavaScript bundle per route | < 180kb gzipped |

---

## 10. Security & Compliance

- **RLS on all user-scoped tables.** No exceptions.
- **COPPA:** age gate on signup; users under 13 blocked until parental consent flow ships (v1).
- **PII minimization:** store email + display name only. No phone numbers, no addresses.
- **Sensitive config** via Supabase Vault / Vercel encrypted env.
- **Rate limiting** on auth + session-start endpoints (Upstash Redis or Vercel KV).
- **Privacy policy + ToS** shipped before public launch.

---

## 11. CI/CD

`.github/workflows/ci.yml`:
- Trigger on PR + push to `main`
- Steps: `pnpm install` → `pnpm typecheck` → `pnpm lint` → `pnpm prisma:validate` → `pnpm test` → `pnpm build`
- Deploy on merge to `main` via Vercel's native integration
- Preview deploys on every PR
- Supabase migrations: manual `supabase db push` until v1, then auto via GitHub Action

---

## 12. Forward-Compatibility Notes

Designed-in, not built:

| Future feature | How today's architecture enables it |
| --- | --- |
| Animated scenarios (Tier 2) | `render_tier` + `media_refs` fields already in schema |
| Film Room (Tier 3) | Same mechanism — upgrade path is a media swap |
| Competitive Arena | IQ Score already ELO-able; `SessionRun` can extend with `mode` enum |
| Hearts/lives | Add `hearts_remaining` to `SessionRun`; nothing else moves |
| Native app | `packages/core` holds IQ/XP/mastery logic — portable to React Native |
| Coach dashboard | `UserRole` enum already includes `COACH`, `TRAINER`, `PARENT` |
| UGC scenarios | `ScenarioStatus` already has `DRAFT` → `REVIEW` → `LIVE` flow |
