 CourtIQ

> **Train your brain like you train your game.**
CourtIQ is the operating system for basketball decision-making. We train the part of the game that film rooms, drills, and private trainers rarely do: **basketball IQ** — off-ball movement, spacing, cuts, help defense, rotations, closeouts, pick-and-roll reads, transition decisions, and recognition speed.

Think **Duolingo + Basketball IQ Academy + Interactive Film Room + Gamified Progression**, built for the phone-native generation.

---

## Who It's For

**Primary:** Youth basketball players (ages 11–15) who love the game, watch the NBA, and have upside — but get lost in games and need to learn *where to move and what to do*.

**Secondary (post-MVP):** Parents, trainers, coaches, and AAU programs who want to track and develop their players' IQ.

---

## The Five Product Pillars

1. **IQ Academy** — Structured, short-form modules that teach real basketball concepts.
2. **Scenario Engine** — The core moat. An interactive decision simulator that puts players in realistic situations and trains pattern recognition and reaction speed.
3. **Film Room** — Visual, coach-style breakdowns of right vs. wrong decisions.
4. **IQ Score** — A single, trackable number that reflects a player's basketball intelligence and its growth over time.
5. **Motivation Layer** — XP, streaks, ranks, badges, daily goals, leaderboards.

---

## Current Status

**Pre-MVP. Planning phase.** This repo currently contains the full strategy, architecture, and build plan. No code yet — that begins with Sprint 0 of the [MVP roadmap](./MVP_ROADMAP.md).

---

## Documentation Map

| Doc | What's In It |
| --- | --- |
| [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) | The single source of truth for what CourtIQ *is* — vision, pillars, UX principles, Scenario Engine deep design, IQ Score, gamification |
| [MVP_ROADMAP.md](./MVP_ROADMAP.md) | Feature prioritization across MVP / v1 / v2 / v3 with sprint-by-sprint breakdown |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Tech stack, frontend/backend architecture, full data model, infra, CI |
| [CONTENT_SYSTEM.md](./CONTENT_SYSTEM.md) | Curriculum taxonomy, scenario authoring pipeline, content ops |
| [BUILD_PLAN.md](./BUILD_PLAN.md) | Multi-agent workstreams, analytics plan, go-to-market, risks, coverage matrix |

Start with `PRODUCT_SPEC.md` for the *what*, then `ARCHITECTURE.md` for the *how*, then `BUILD_PLAN.md` for the *when and who*.

## Design Reference

The `courtiq/` folder is a **design handoff bundle** from Claude Design — HTML/CSS/JS prototypes of three screens (Home Dashboard, Academy, Scenario Engine) with a full design system. Treat it as **visual source of truth** to match pixel-for-pixel during implementation. Tokens, typography, and UX conventions extracted from it are documented in `ARCHITECTURE.md` §4.2 and `PRODUCT_SPEC.md` §10. The React/Next.js implementation should **match the visual output, not copy the prototype structure**.

Key files:
- `courtiq/project/CourtIQ MVP.html` — entry point, loads all three screens
- `courtiq/project/design-system.jsx` — tokens, primitives (`CIQ`, `Chip`, `Icon`, `PrimaryButton`, `Progress`, `Card`)
- `courtiq/project/home.jsx`, `academy.jsx`, `scenario.jsx` — screen mocks
- `courtiq/project/court.jsx` — half-court SVG renderer
- `courtiq/chats/chat1.md` — design intent & rationale

---

## Repo Conventions

- **Default branch:** `main` (code ships here after review)
- **Feature branches:** `feature/<short-name>` or `claude/<task>-<id>`
- **Commits:** Conventional-ish — `docs:`, `feat:`, `fix:`, `chore:`, `refactor:`
- **No direct pushes to `main`.** PR + review required once we're out of planning phase.

---

## License

TBD — will be set before first external contributor or public launch. Default to "All rights reserved" until then.
