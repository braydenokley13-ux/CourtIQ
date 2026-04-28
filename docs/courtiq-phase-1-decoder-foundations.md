# CourtIQ Phase 1 — Decoder Foundations: Implementation Planning

> Working planning document. Built up across small micro-milestones.
>
> **Status:** in progress.
> **Branch:** `claude/courtiq-phased-planning-aISkN`.
> **Goal:** turn the existing CourtIQ scenario engine into a decoder-driven, 3D playable film-room. Ship one gold-standard scenario (`BDW-01`) end-to-end, then reuse the template for `ESC-01` / `AOR-01` / `SKR-01` / optional `SKR-02`.
>
> **Persisted:** Sections 1, 2, and Section 5.1. **Pending:** Sections 3, 4, the rest of Section 5, and Sections 6–11. Each remaining section is added in its own small-commit chunk.

---

## Section 1 — Executive Summary

### What we are building

CourtIQ is becoming a **decoder-driven, 3D playable film-room scenario system** for middle-school and early-high-school basketball players. The core loop is one possession at a time:

1. Watch a short 3D possession.
2. The play freezes on the decision cue.
3. Choose a read from a small set of choices.
4. Watch the consequence of the chosen read play out.
5. Watch the best read replayed with teaching overlays.
6. Learn the decoder — the named, transferable IQ framework — behind the read.

The decoder framework introduces four cross-cutting reads as the headline learning vocabulary:

- **The Backdoor Window** — read denial, cut behind.
- **The Empty-Space Cut** — read help that left, cut into the gap.
- **Skip the Rotation** — read overhelp, punish with the extra pass.
- **Advantage or Reset** — read the closeout, decide on first touch.

This phase extends the existing scenario engine to support those decoders, ships one gold-standard scenario (`BDW-01`) end-to-end, and reuses its template across `ESC-01` / `AOR-01` / `SKR-01` (and optional `SKR-02`) to form **Pack 1: Founder v0 / Decoder Foundations**.

### Why this phase matters

The scenario system, the 3D rendering, and the decoder framework together are the **core product**. Academy markdown lessons, the IQ score, the XP/streak/badge stack, and the leaderboard are support systems that motivate or recap the scenario loop. If the scenario loop is generic, every other surface compounds the genericness. If the loop is decoder-shaped and visually concrete, the rest of the product compounds the strength of the decoders.

This phase also produces the **template scenario**. Every later content pack — passing reads, screening, transition defense, advanced rotations — reuses the data shape, scene-authoring conventions, overlay primitives, freeze-frame mechanics, and consequence-replay wiring established here.

### Why 3D differentiates CourtIQ from a quiz

A quiz collapses everything between question and feedback into text. A 3D scene can do three things text cannot:

- Show the **cue spatially** before the user chooses (defender hips, hand in the lane, head turned to the ball, the seam help just opened).
- Play the **consequence** of the user's wrong choice (defender deflects, defense resets, layup window closes).
- Re-play the same possession with **post-answer overlays** that name the read (open lane, blocked lane, vision cone, open space, drive/cut path).

These are spatial reads. They cannot be taught with words alone. The existing renderer (Next.js + `@react-three/fiber` + an imperative THREE overlay group animated in a parent rAF loop) is already capable of this; this phase gives it the missing primitives — explicit freeze-frame, defender body-language overlays, open-space region highlights, named help pulses, and per-choice consequence playback.

### Why this phase extends existing infrastructure, not a rewrite

The audit (PR-1) established that the existing system has:

- A tested 3D engine: `Scenario3DCanvas`, `Court3D`, `PlayerMarker3D`, `BallMarker3D`, `AutoFitCamera`, `imperativeScene.ts`, `lib/scenario3d/{scene,presets,timeline,coords,quality,atmosphere,schema,feature}.ts`, plus the WebGL/reduced-motion/3-second emergency-scene fallback chain.
- A Zod-validated, idempotent JSON seed pipeline (`scripts/seed-scenarios.ts`, `scripts/seed-lessons.ts`).
- An atomic attempt transaction (IQ + XP + Mastery + Streak + Badge in one Prisma `$transaction`).
- An Academy / lesson markdown system with the `tip / mistake / takeaway / coach / quiz / reveal` block grammar already perfect for decoder teaching.
- A polished design system, render polish recently merged through PR #51, and a 2D fallback in `components/court/`.

Rebuilding any of this would burn the phase budget on parity with no user-visible gain. The plan is **additive at every layer** — new scenario fields, new movement kinds, new overlay primitives, new replay states, new decoder mastery dimension — leaving the working pieces alone.

### Why BDW-01 is the right first template scenario

Product reasons:
- Universally taught, low coach-validation risk.
- Fast payoff loop: read denial → cut behind → layup.
- Teaches CourtIQ's headline idea — read the defender, not the spot.

Engineering reasons (this is what makes BDW-01 the *template*):
- Exercises every new mechanic exactly once: decoder taxonomy, freeze-frame, three-quality choices, defender body-language overlays, open-space region, named help pulse, per-choice consequence replay, decoder lesson hand-off, self-review checklist.
- 4-on-4 half-court geometry — small, readable, fast to author and visually QA.
- One camera preset, one open lane, one cut. Visual QA is decisive.
- Once it ships, the next three scenarios in Pack 1 are mostly data work.

---

## Section 2 — Current-State Assessment

### Stack

| Concern | Reality |
|---|---|
| Repo shape | pnpm 9 + turbo monorepo. Workspaces: `apps/web`, `packages/core`, `packages/db`, `packages/config` |
| App framework | Next.js 15 + React 19 in `apps/web` |
| 3D stack | `three` 0.184, `@react-three/fiber` 9, `@react-three/drei` 10, plus an imperative THREE API alongside R3F |
| Animation | Framer Motion (DOM); `useFrame` lerps and a parent rAF loop (3D) |
| Validation | Zod (in seed scripts and runtime scene parsing) |
| DB / ORM | Prisma 5.22 + PostgreSQL (Supabase-hosted) |
| Auth / data | Supabase |
| Observability | Sentry + PostHog |
| Styling | Tailwind with shared preset in `packages/config/tailwind` |
| Tests | Vitest in `apps/web`; existing tests for `coords`, `schema`, `timeline`, `scene` |
| Scripts | `dev`, `build`, `lint`, `typecheck`, `test`, `prisma:validate`, `seed:scenarios`, `seed:lessons`, `seed:content`, `format` |

### Keep (touch nothing)

- **3D engine core** — `Scenario3DCanvas`, `Court3D`, `PlayerMarker3D`, `BallMarker3D`, `AutoFitCamera`, `imperativeScene.ts`, and all of `apps/web/lib/scenario3d/*.ts`. Including the reduced-motion / WebGL / 3-second emergency fallback chain.
- **Seed pipeline** — `scripts/seed-scenarios.ts`, `scripts/seed-lessons.ts`, Zod validation, idempotency, prerequisite enforcement.
- **Attempt transaction** — `POST /api/session/[id]/attempt` and the IQ/XP/Mastery/Streak/Badge bundle in one Prisma transaction.
- **Progression services** — `iqService`, `xpService`, `masteryService`, `streakService`, `badgeService`, plus `@courtiq/core` math.
- **Academy / lesson markdown** — `Module`, `Lesson`, `Concept` Prisma models; `InteractiveLesson.tsx`; the `tip / mistake / takeaway / coach / quiz / reveal` block grammar.
- **Design system** — `apps/web/components/ui/`, `packages/config/tailwind/preset.js`.
- **2D `<Court />` fallback** in `apps/web/components/court/` — the WebGL-unavailable path. Do not delete.
- **Existing seven seed scenarios** (`closeouts`, `cutting_relocation`, `help_defense_basics`, `low_man_rotation`, `spacing_fundamentals`, `transition_stop_ball`, plus the README) — leave `LIVE` and coexisting with new decoder content.

### Key gaps (what this phase must close)

1. **No decoder taxonomy.** The four decoder families have no representation in the data model. Concepts are not the same axis as decoders.
2. **Binary choice correctness.** `ScenarioChoice.is_correct: boolean` cannot express "best vs acceptable vs wrong." BDW-01's V-cut acceptable read is impossible to teach today.
3. **No explicit freeze-frame primitive.** The renderer plays through movements without a precise stop point at the cue; the question UI and pre-answer overlays cannot land at a guaranteed moment.
4. **Missing defender body-language overlays.** Hip arrow, foot arrow, chest line, hand-in-lane indicator are not primitives. The decoder framework requires reading defender body, not just position.
5. **Missing open-space region highlight.** Pulses and cones exist; a shaded *region* (the lane behind the defender, the empty corner, the seam) does not.
6. **Missing per-choice consequence replay.** `answerDemo[]` only encodes the correct timeline. Wrong/acceptable reads have no consequence playback.
7. **Two scene paths and two overlay paths coexist.** `BasketballScene3D` (simple) vs. `Court3D + ScenarioScene3D` (full); `PremiumOverlay.tsx` (legacy JSX) vs. `imperativeTeachingOverlay.ts` (production). Without an explicit policy, authored decoder content drifts.
8. **No coach-validation gating.** Some scenarios in the broader roadmap (`ESC-02`, `SKR-03`, `AOR-03`, `BDW-03`) need expert review before public launch; the seeder cannot enforce this today.

### Do-not-rebuild principle

Every change in this phase is **additive**. New fields on the scenario record. New movement kinds in the existing typed union. New overlay primitive types in the existing typed union. New states on the existing replay state machine. New decoder mastery dimension on top of the existing transaction. New camera preset alongside the existing presets. No file in `apps/web/components/scenario3d/` or `apps/web/lib/scenario3d/` is replaced; each is extended in place. No parallel "decoder train" route is created — `/train` handles all scenarios, legacy and decoder.

---

## Section 5 — 3D Runtime Architecture

The 3D runtime exists. This section describes the **delta** that turns it into a decoder-aware engine. No file in `apps/web/components/scenario3d/` or `apps/web/lib/scenario3d/` is replaced; each gets a small, well-scoped extension.

### 5.1 Scenario state input

The runtime has one entry contract: a normalised `Scene3D` produced by `apps/web/lib/scenario3d/scene.ts` from the scenario record. That contract is the **only** thing 3D components depend on.

**What flows into the canvas (and only this):**

```ts
// produced once per scenario by useScenarioSceneData(scenario)
type Scene3DInput = {
  scenarioId: string;            // for telemetry / fallback identity only
  court: 'half' | 'full';
  camera: { preset: CameraPreset; anchor?: Vec2Ft };
  players: Player3D[];           // includes exactly one isUser: true
  ball: { start: Vec2Ft; holderId: string };
  movements: Movement3D[];       // pre-freeze setup
  freezeBeforeMovementId?: string;
  answerDemo: Movement3D[];      // best-read replay
  wrongDemos: { choiceId: string; movements: Movement3D[] }[];
  preAnswerOverlays: OverlayPrimitive[];
  postAnswerOverlays: OverlayPrimitive[];
  qualityTier: 1 | 2 | 3;
};
```

**What does *not* flow into the canvas:**

- `decoderTag`, `conceptTags`, `playerRole`, `gameContext`, `questionPrompt`, `choices`, `bestRead`, `acceptableReads`, `badReads`, `commonMissReason`, `whyBestReadWorks`, `lessonConnection`, `decoderTeachingPoint`, `feedback`, `selfReviewChecklist`, `coachValidation`, `sourceResearchBasis`, `progressionMetadata`.

These belong to the train page, the question UI, the feedback panel, the lesson hand-off, and the attempt transaction. They never enter `Scenario3DCanvas`. Keeping them out is what guarantees the canvas stays scenario-agnostic.

**How each runtime concern is fed:**

| Runtime concern | Source field | Consumer |
|---|---|---|
| Player positioning | `players[i].start` (court feet) | `PlayerMarker3D` (mounted by `ScenarioScene3D`) |
| Ball location | `ball.start` + `ball.holderId` | `BallMarker3D` (snaps to holder if resolvable) |
| Camera | `camera.preset`, optional `camera.anchor` | `presets.ts` resolves preset → camera transform; `AutoFitCamera` is bypassed when a preset is set |
| Pre-freeze possession | `movements[]` | `MotionController` in `imperativeScene.ts`; resolved freeze time cached at scene load |
| Freeze stop point | `freezeBeforeMovementId` (optional; defaults to end-of-`movements[]`) | `MotionController.advance()` becomes a no-op once the playhead reaches the resolved freeze time |
| Best-read playback | `answerDemo[]` | `MotionController` re-driven from the snapshotted freeze positions |
| Wrong/acceptable consequence | `wrongDemos[].movements` keyed by `choiceId` | Same; dispatched on the chosen choice id |
| Pre-answer overlays | `preAnswerOverlays[]` | `imperativeTeachingOverlay` controller, mounted once during `setup`, faded in during `playing → frozen` |
| Post-answer overlays | `postAnswerOverlays[]` | Same controller; visibility-flip only — no teardown, no re-mount |

**How this prevents BDW-01 (or any single scenario) being hardcoded into components:**

1. **`scene.ts` is the choke point.** All schema additions land in `scene.ts` first, get normalised into `Scene3DInput`, and only then surface in components. No component reads `scenario.decoderTag` or any other top-level scenario field.
2. **Components are id-blind.** `Scenario3DCanvas`, `Court3D`, `ScenarioScene3D`, `PlayerMarker3D`, `BallMarker3D`, `MotionController`, and the imperative overlay controller never branch on `scenarioId`. They render whatever is in `Scene3DInput`. If a future scenario needs new visual behaviour, the path is: add a primitive in the schema → renderer reads the primitive → author uses it. Never: add an `if (scenarioId === 'BDW-01')` branch.
3. **Movement kinds and overlay primitives are typed unions, not strings of intent.** Adding `back_cut` or `defender_hip_arrow` is a schema-level change with one well-scoped renderer addition; it is never a per-scenario component patch.
4. **Camera presets resolve through `presets.ts`.** A scenario that needs framing the existing presets can't deliver supplies a `camera.anchor` override in feet — never a custom camera component.
5. **Authoring is data, not code.** Once Section 5.1's contract is honoured, ESC-01 / AOR-01 / SKR-01 reuse 100% of the runtime; their differences are entirely inside `Scene3DInput`.

The runtime stays a generic 3D scenario player. The decoder scenarios become the first tenants of that contract; they are not the contract itself.

---

*Sections 5.2 onward, plus Section 6 (Overlay System Plan), Section 7 (BDW-01 Build Plan), and Sections 8–11 are pending micro-milestones.*
