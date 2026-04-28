# CourtIQ Phase 1 — Decoder Foundations: Implementation Planning

> Working planning document. Built up across small micro-milestones.
>
> **Status:** in progress.
> **Branch:** `claude/courtiq-phased-planning-aISkN`.
> **Goal:** turn the existing CourtIQ scenario engine into a decoder-driven, 3D playable film-room. Ship one gold-standard scenario (`BDW-01`) end-to-end, then reuse the template for `ESC-01` / `AOR-01` / `SKR-01` / optional `SKR-02`.
>
> **Persisted:** Sections 1–4 and Section 5.1. **Pending:** the rest of Section 5, and Sections 6–11. Each remaining section is added in its own small-commit chunk.

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

## Section 3 — Product Architecture

### 3.1 The 10-state scenario loop

Each authored decoder scenario passes through ten distinct states. This is the contract the train page, replay controller, and feedback panel must support.

| # | State | What the user sees | Engine job |
|---|---|---|---|
| 1 | **Intro / setup** | Decoder family chip, scenario title, role assignment, one-line context | Mount scene, position players at `start`, snap ball to holder |
| 2 | **3D possession begins** | Possession plays for 1–3 s up to the cue | Run `movements[]` up to (but not past) the freeze marker |
| 3 | **Freeze on the cue** | Play pauses; question prompt + 3–4 choices appear; minimal pre-answer overlays show the cue | Replay state → `frozen`; pre-answer overlays mounted; answer arrow / cut path stays hidden |
| 4 | **User makes a decision** | User taps a choice (`best` / `acceptable` / `wrong`) | Choice recorded; transition to consequence |
| 5 | **Consequence playback** | The chosen read plays out (recovery, deflection, missed window, or layup) | Replay state → `consequence(choiceId)`; runs `wrongDemos[choiceId]` (or skips for `best`) |
| 6 | **Best-read reveal** | Possession resets to freeze positions and replays the best read with rich teaching overlays | Replay state → `replaying`; runs `answerDemo`; post-answer overlays fade in layered |
| 7 | **Decoder lesson hand-off** | Panel slides in: decoder name + one-sentence teaching point + optional link to the Academy module | Lesson panel mounts; surfaces the decoder module slug |
| 8 | **Feedback** | Quality-aware feedback string + IQ delta + XP delta + streak + any badge animations | Existing attempt transaction commits; per-choice `feedbackText` rendered |
| 9 | **Self-review checklist** | 3–4 short checkboxes the user self-rates | Stored locally for v0; future feed-in to mastery weighting |
| 10 | **Progression / unlocks** | XP toast, IQ ticker, streak flame, badges, "Next" button | Concept mastery and decoder mastery both updated atomically |

States 5, 6, 7, and 9 are the difference between a quiz and a film room. They cannot be collapsed without losing the product.

### 3.2 Decoders vs concepts: two axes, not a replacement

- **Concepts** — broad basketball categories (`closeouts`, `cutting-relocation`, `help-defense`, etc.). The existing Academy module taxonomy. Maps to "what is happening on the floor."
- **Decoders** — the cross-cutting *reads* a player makes within those situations. Each decoder shows up across multiple concepts; each concept can host scenarios from multiple decoders.

Implementation guidance:
- `Scenario.decoder_tag` is a single enum field; every new authored scenario sets exactly one value.
- `Scenario.concept_tags[]` stays as it is; new scenarios may have one or more concept tags, or none if the decoder framing is the whole point.
- The seven legacy fixtures keep their concept tags and do **not** retroactively get a decoder tag unless the mapping is unambiguous.

### 3.3 Academy connection

The existing join — `Module.concept_id` ↔ `Scenario.concept_tags[]` — is preserved. A parallel join is added: **`Module.decoder_id` ↔ `Scenario.decoder_tag`**.

Pack 1 ships with four new Academy modules, one per decoder family:

| Module slug | Decoder id (enum value) | Category |
|---|---|---|
| `backdoor-window` | `BACKDOOR_WINDOW` | OFFENSE |
| `empty-space-cut` | `EMPTY_SPACE_CUT` | OFFENSE |
| `skip-the-rotation` | `SKIP_THE_ROTATION` | OFFENSE |
| `advantage-or-reset` | `ADVANTAGE_OR_RESET` | OFFENSE |

Each module has one lesson written using the existing markdown block grammar (`tip`, `mistake`, `takeaway`, `coach`, `reveal`, `quiz`). The lesson body reuses the in-scenario `decoderTeachingPoint` as a `takeaway` block and the `selfReviewChecklist` as `reveal` flashcards. **No new markdown primitives are introduced.**

### 3.4 Decoder mastery direction

The existing `Mastery` table keys on `(user_id, concept_id)` and tracks `rolling_accuracy`, `attempts_count`, `last_seen_at`, `spaced_rep_due_at`. Decoder mastery is **additive**. Two implementation paths are kept open; the final decision is deferred to engineering phases (Section 9):

- **Option A — `dimension` discriminator on `Mastery`.** Add a `dimension: 'concept' | 'decoder'` column; `concept_id` carries either a concept slug or a decoder enum value. One table, one transaction, one query shape.
- **Option B — Parallel `DecoderMastery` table** with the same shape (`user_id`, `decoder_id`, `rolling_accuracy`, `attempts_count`, `last_seen_at`, `spaced_rep_due_at`). Cleaner separation; slightly more code in the attempt transaction.

Either way, the attempt transaction writes both dimensions in the same `$transaction`, so progression stays atomic. The home screen and Academy can render either dimension without changing the underlying contract.

### 3.5 Why `best | acceptable | wrong` is better than boolean

Basketball decisions are rarely binary. **BDW-01's V-cut is the canonical example.**

- **Best** — plant-and-go cut behind the denying defender. A layup window.
- **Acceptable** — a hard V-cut out to a deeper catch point. Possession is preserved; the layup window is lost. This is a sensible read when the passer is not ready for the backdoor.
- **Wrong** — staying on the wing and asking for the ball; cutting slowly in front of the defender. Either gets the pass deflected or the route ridden.

A boolean `is_correct` flattens the V-cut into either "wrong" (punishing a sensible-but-suboptimal read) or "correct" (rewarding it equally with the layup). Both are bad teaching.

A three-quality enum lets us:
- Award full XP for the best read, partial XP for acceptable, none for wrong.
- Show choice-quality-aware feedback ("the cleaner answer was…", not just "wrong").
- Compute a richer rolling accuracy that distinguishes near-miss from miss.
- Author future scenarios where two reads are genuinely both reasonable in different game contexts.

Backwards compatibility is preserved: `is_correct = quality !== 'wrong'`. The seed validator computes it on write, the API returns both during the transition, and the seven legacy scenarios keep behaving exactly as they do today.

---

## Section 4 — Scenario Data Architecture

This section is a **schema sketch**, not implementation. Engineering phases (Section 9) turn it into code in `apps/web/lib/scenario3d/schema.ts`, the seed validator at `scripts/seed-scenarios.ts`, and the Prisma model in `packages/db/prisma/schema.prisma`. TypeScript-flavoured pseudocode below — comments where intent matters.

### 4.1 Decoder taxonomy

```ts
const DecoderTag = z.enum([
  'BACKDOOR_WINDOW',     // "If they sit on the pass, the basket is behind them."
  'EMPTY_SPACE_CUT',     // "Cut into the space your teammate just created."
  'SKIP_THE_ROTATION',   // "If two defenders shrink to the ball, somebody behind got free."
  'ADVANTAGE_OR_RESET',  // "Read the closeout: shoot, attack, move it, reset."
]);
```

- One enum value per scenario (`decoderTag`).
- Same values are used as `Module.decoder_id` for the four Academy modules in 3.3.
- Future families extend the enum; never repurpose an existing value.

### 4.2 Choice quality

```ts
const ChoiceQuality = z.enum(['best', 'acceptable', 'wrong']);

const ScenarioChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  quality: ChoiceQuality,
  feedbackText: z.string(),
  partialFeedbackText: z.string().optional(),  // optional richer "good but not best" copy
  order: z.number().int(),
});
```

**Backwards compatibility rule:** `is_correct = quality !== 'wrong'`. The seed validator computes `is_correct` on write so the existing Prisma column stays valid for legacy code paths. Legacy JSON that ships `is_correct: true | false` is translated: `true → quality: 'best'`, `false → quality: 'wrong'`. No existing fixture needs editing.

### 4.3 Scenario record fields

```ts
const ScenarioSchema = z.object({
  // identity & status
  id: z.string(),                                // 'BDW-01'
  version: z.number().int().default(1),
  status: z.enum(['DRAFT', 'REVIEW', 'LIVE', 'RETIRED']),
  title: z.string(),

  // taxonomy
  decoderTag: DecoderTag,                        // required for new scenarios
  conceptTags: z.array(z.string()).default([]),

  // difficulty & framing
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  playerRole: z.string(),
  gameContext: z.string(),
  possessionSetup: z.string(),

  // the read
  decisionMoment: z.string(),
  visibleCue: z.string(),
  questionPrompt: z.string(),
  choices: z.array(ScenarioChoiceSchema).min(2).max(4),

  bestRead: z.string(),
  acceptableReads: z.array(z.string()).default([]),
  badReads: z.array(z.string()).default([]),
  commonMissReason: z.string(),
  whyBestReadWorks: z.string(),

  // teaching
  lessonConnection: z.string(),                  // module_slug — must exist
  decoderTeachingPoint: z.string(),
  feedback: z.object({
    correct: z.string(),
    partial: z.string().optional(),
    wrong: z.string(),
  }),
  selfReviewChecklist: z.array(z.string()).min(2).max(6),

  // 3D scene (4.4)
  scene: SceneSchema,

  // governance
  coachValidation: CoachValidationSchema,        // 4.6
  sourceResearchBasis: z.string().optional(),

  // progression
  progressionMetadata: z.object({
    xpReward: z.number().int().default(10),
    masteryWeight: z.number().default(1.0),
    renderTier: z.number().int().min(1).max(3).default(1),
    unlocks: z.array(z.string()).default([]),
    prerequisites: z.array(z.string()).default([]),
  }),
});
```

Conventions:
- `id` uses `<DECODER>-<NN>` (BDW-01, ESC-01, AOR-01, SKR-01).
- `lessonConnection` references a `module_slug`; validator enforces existence.

### 4.4 Scene / 3D fields

```ts
const Vec2Ft = z.object({ x: z.number(), z: z.number() });

const PlayerSchema = z.object({
  id: z.string(),
  team: z.enum(['offense', 'defense']),
  role: z.string(),
  label: z.string().max(8),
  start: Vec2Ft,
  isUser: z.boolean().optional(),
  hasBall: z.boolean().optional(),
});

const MovementKind = z.enum([
  // existing
  'cut', 'closeout', 'rotation', 'lift', 'drift', 'pass', 'drive', 'stop_ball',
  // new
  'back_cut',        // plant-and-go behind a denying defender (BDW)
  'baseline_sneak',  // cut into the empty corner along the baseline (ESC)
  'skip_pass',       // cross-court pass over help (SKR)
  'rip',             // first-touch attack on a tight closeout (AOR)
  'jab',             // jab step (AOR / decoy)
]);

const MovementSchema = z.object({
  id: z.string(),
  playerId: z.string(),                          // or 'ball'
  kind: MovementKind,
  to: Vec2Ft,
  delayMs: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().positive().default(700),
  caption: z.string().optional(),
});

const CameraSchema = z.object({
  preset: z.enum([
    'teaching_angle', 'defense', 'top_down',
    'passer_side_three_quarter',                 // new
  ]).default('teaching_angle'),
  anchor: Vec2Ft.optional(),                     // optional per-scenario override
});

const WrongDemoSchema = z.object({
  choiceId: z.string(),                          // must reference a real choice id
  movements: z.array(MovementSchema),
  caption: z.string().optional(),
});

const SceneSchema = z.object({
  type: z.string().optional(),
  court: z.enum(['half', 'full']).default('half'),
  camera: CameraSchema,
  players: z.array(PlayerSchema),                // exactly one isUser: true
  ball: z.object({ start: Vec2Ft, holderId: z.string() }),

  // pre-freeze possession
  movements: z.array(MovementSchema).default([]),

  // freeze marker — final form pinned in engineering phases
  // candidate A: freezeAtMs (absolute ms)
  // candidate B: freezeBeforeMovementId (id reference)
  // both forms are author-resolvable to a single ms at scene load
  freezeMarker: z.union([
    z.object({ kind: z.literal('atMs'),                atMs: z.number().int().nonnegative() }),
    z.object({ kind: z.literal('beforeMovementId'),    movementId: z.string() }),
  ]).optional(),                                  // omitted = freeze at end of movements[]

  // post-decision playback
  answerDemo: z.array(MovementSchema).default([]),
  wrongDemos: z.array(WrongDemoSchema).default([]),

  // overlays
  preAnswerOverlays: z.array(OverlayPrimitive).default([]),
  postAnswerOverlays: z.array(OverlayPrimitive).default([]),
});
```

### 4.5 Overlay primitive list

Overlays are typed primitives, not free-form annotations. The full v0 set:

```ts
const OverlayPrimitive = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('passing_lane_open'),    from: z.string(), to: z.string() }),
  z.object({ kind: z.literal('passing_lane_blocked'), from: z.string(), to: z.string() }),
  z.object({ kind: z.literal('defender_vision_cone'), playerId: z.string(),
             targetId: z.string().optional() }),
  z.object({ kind: z.literal('defender_hip_arrow'),    playerId: z.string() }),
  z.object({ kind: z.literal('defender_foot_arrow'),   playerId: z.string() }),
  z.object({ kind: z.literal('defender_chest_line'),   playerId: z.string() }),
  z.object({ kind: z.literal('defender_hand_in_lane'), playerId: z.string() }),
  z.object({ kind: z.literal('open_space_region'),     anchor: Vec2Ft, radiusFt: z.number().default(4) }),
  z.object({ kind: z.literal('help_pulse'),            playerId: z.string(),
             role: z.enum(['tag', 'low_man', 'nail', 'stunter', 'overhelp']) }),
  z.object({ kind: z.literal('drive_cut_preview'),     playerId: z.string(), path: z.array(Vec2Ft) }),
  z.object({ kind: z.literal('label'),                 anchor: Vec2Ft, text: z.string().max(24) }),
  z.object({ kind: z.literal('timing_pulse'),          anchor: Vec2Ft, durationMs: z.number().int().positive() }),
]);
```

Authoring discipline (enforced in seed validator):
- **Pre-answer overlays must not reveal the answer.** Allowed pre-answer: `defender_vision_cone`, `defender_hip_arrow`, `defender_foot_arrow`, `defender_chest_line`, `defender_hand_in_lane`, `help_pulse`, subtle `label`. Rejected pre-answer: `passing_lane_open`, `drive_cut_preview`, answer-line `open_space_region`.
- **Post-answer overlays may use any primitive.**

Detailed visual language and per-primitive timing live in Section 6.

### 4.6 Coach validation gating

```ts
const CoachValidationSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  status: z.enum(['not_needed', 'needed', 'reviewed', 'approved']),
  notes: z.string().optional(),
  reviewerId: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
});
```

Seed-time gating rules:
- `level: 'high'` + `status: 'not_needed'` → invalid.
- Top-level `status: 'LIVE'` + `coachValidation.level: 'high'` + `coachValidation.status !== 'approved'` → **rejected** unless `--allow-unvalidated` flag is passed.
- `level: 'medium'` produces a seeder warning but does not block.
- `level: 'low'` passes silently.

BDW-01 is `level: 'low'`. ESC-02, SKR-03, AOR-03, BDW-03 are `level: 'high'` and stay `DRAFT` until reviewed.

### 4.7 Scenario packs

A pack is a content unit, not a database concept. Implementation: a folder under `packages/db/seed/scenarios/packs/<pack_slug>/` containing one JSON per scenario plus a `pack.json` manifest. The seed script reads the manifest and seeds scenarios in declared order.

**Pack 1: Founder v0 / Decoder Foundations** — the only pack this phase ships.

| Order | Scenario id | Decoder | Coach validation level |
|---|---|---|---|
| 1 | `BDW-01` — Denied Wing Backdoor | `BACKDOOR_WINDOW` | low |
| 2 | `ESC-01` — Empty Corner Baseline Sneak | `EMPTY_SPACE_CUT` | low–medium |
| 3 | `AOR-01` — No Gap Go Now | `ADVANTAGE_OR_RESET` | low |
| 4 | `SKR-01` — Paint Touch Opposite Corner | `SKIP_THE_ROTATION` | medium |
| 5 (optional) | `SKR-02` — First Kick Then One More | `SKIP_THE_ROTATION` | medium–high |

The pack manifest declares ids, difficulty curve, and prerequisite chain (e.g., `SKR-02` requires `SKR-01`).

### 4.8 Legacy migration plan

1. **All seven legacy fixtures stay `LIVE`.** Their existing `concept_tags`, `court_state`, `scene` blocks, and `ScenarioChoice` rows are unchanged.
2. **No retroactive `decoderTag`** unless the mapping is unambiguous. Forcing tags creates noise.
3. **Optional retro-tagging** is allowed post-phase for clean mappings. Not in scope here.
4. **Choice migration:** seed validator translates `is_correct: true | false` into `quality: 'best' | 'wrong'` at seed time. No JSON edits required.
5. **New schema fields are optional on legacy scenarios.** `freezeMarker`, `wrongDemos`, `preAnswerOverlays`, `postAnswerOverlays`, `decoderTag`, `coachValidation` are not required for legacy content. Validator gates them only on new scenarios (detected by presence of `decoderTag` or by pack membership).
6. **No deletion.** If a legacy scenario is later judged harmful, retire via `status: 'RETIRED'`.

### 4.9 Validation strategy

Layers, in order:

1. **Authoring time (TypeScript):** Zod-inferred types back the seed JSON's TS types. Schema drift fails `pnpm typecheck` before seeding.
2. **Seed time (Zod + custom rules):** `scripts/seed-scenarios.ts` runs the schema plus:
   - exactly one `isUser: true`
   - `wrongDemos[].choiceId` references a real choice
   - new scenarios must include `decoderTag`, `freezeMarker` (or accept default), `preAnswerOverlays`, `postAnswerOverlays`, `feedback.correct`, `feedback.wrong`, `selfReviewChecklist` (≥2)
   - `lessonConnection` resolves to an existing module slug
   - pre-answer overlays use the allow-listed primitives only
   - coach-validation gating per 4.6
3. **CI:** `pnpm prisma:validate && pnpm typecheck && pnpm lint && pnpm test`. Optional dry-run seed against the fixtures to catch breakage.
4. **Runtime fallback:** `useScenarioSceneData` validates the scene block with Zod and degrades gracefully — unknown `decoderTag`, malformed `freezeMarker`, or missing `wrongDemos` entries log a Sentry breadcrumb instead of crashing the canvas.
5. **High-validation gate:** seeder refuses `LIVE` + `level: 'high'` + `status !== 'approved'` without an explicit override flag.

**Fail-fast rule for BDW-01:** missing any of `decoderTag`, `freezeMarker` (or default applied), `bestRead`, `feedback.correct`, `feedback.wrong`, `selfReviewChecklist`, at least one `quality: 'best'` choice, or at least one `wrongDemos` entry rejects the scenario at seed time.

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

### 5.2 Player / ball positioning

Mounting rules (formalize what `ScenarioScene3D` already does in part):

- For each `players[i]`, mount one `PlayerMarker3D` at `start` (court feet). Team coloring from `team`. Label from `label`. Exactly one marker has `isUser: true`; the renderer marks it with the existing user ring/glow.
- The ball mounts at `ball.start`. If `ball.holderId` resolves to a real player, the ball snaps to that player's hand offset; otherwise it sits at `ball.start`.
- During `setup` and `playing`, `PlayerMarker3D` and `BallMarker3D` interpolate via `useFrame` against the active timeline (existing behaviour, unchanged).

**One-component rule:** the user player, defenders, and ball use the **same components** with prop-driven variation. There is no `UserPlayer3D` vs `DefenderPlayer3D` vs `OffensePlayer3D` split. Visual differences (team color, user glow, label style) come from props on `PlayerMarker3D`. The ball is always `BallMarker3D`. New scenarios never introduce a new player component — they introduce data.

`AutoFitCamera` continues to bound the live scene `Box3` as a safety net; an explicit camera preset overrides it (see 5.6).

### 5.3 Freeze-frame architecture

**Runtime contract: `freezeAtMs` (absolute milliseconds).** This is the field `Scene3DInput` carries into the canvas. `MotionController.advance()` checks the playhead against a single number; nothing more.

**Authoring shorthand: `freezeBeforeMovementId`.** Authors who think in cue events (rather than millisecond budgets) write `{ kind: 'beforeMovementId', movementId: 'x2_step_to_denial' }` in the schema's `freezeMarker` discriminated union (see 4.4). At scene load, `lib/scenario3d/scene.ts` resolves it to the corresponding `freezeAtMs` by summing `delayMs + durationMs` across preceding entries in `movements[]`. The runtime never sees the id form.

Why this split:
- **Authors win.** "Freeze right before x2 commits to denial" is how coaches narrate the moment; tweaking an earlier movement's `durationMs` does not break the freeze point.
- **Runtime wins.** A single `number` is what the per-frame loop wants; no per-frame id lookups.
- **Validator wins.** `freezeBeforeMovementId` must reference a real movement id; `freezeAtMs` must be ≥ 0 and ≤ the total `movements[]` duration. Both checks happen once at seed time and once at scene load.
- **Default behaviour preserved.** When `freezeMarker` is omitted, the runtime defaults to "freeze at end of `movements[]`" — the existing implicit behaviour for legacy scenes.

Playback flow:

1. **`setup`** seeds player and ball start positions; mounts pre-answer overlays at zero opacity.
2. **`playing`** advances `MotionController` along `movements[]`. Pre-answer overlays start fading in at the half-way point of the playthrough so the cue is fully readable by the time freeze hits.
3. When the playhead reaches `freezeAtMs`, the controller snaps player and ball positions to their frozen values (no jitter from a partial lerp), pauses (`advance` becomes a no-op), and emits a **`frozen` event**. The train page subscribes to this event and mounts the question UI (prompt + 3–4 choice buttons). The `useFrame` loop continues running so reduced-motion and quality-tier behaviours stay correct, but no scene state changes until a choice is recorded.
4. Pre-answer overlays remain at full opacity throughout `frozen`. Camera holds. No answer-revealing primitive is mounted.

### 5.4 Replay state machine

```
idle → setup → playing → frozen → consequence(choiceId) → replaying → done
```

| State | User sees | Engine | UI mounted | Overlays |
|---|---|---|---|---|
| **`idle`** | Scenario card / "Start" | Scene unmounted or pre-mount | Train page intro card | None |
| **`setup`** | 3D court appears, players at starting positions, ball with holder | Scene mounted, players at `start`, ball snapped, atmosphere/quality applied | Decoder chip, role assignment, scenario title | None |
| **`playing`** | Possession plays for ~1–3 s up to the cue | `MotionController` runs `movements[]` to `freezeAtMs` | Same as setup | Pre-answer overlays fade in toward end of playthrough |
| **`frozen`** | Play paused on the cue | `advance` is a no-op; positions snapped; `frozen` event emitted | Question prompt + 3–4 choice buttons | Pre-answer overlays at full opacity. No answer-revealing primitives. |
| **`consequence(choiceId)`** | The chosen read plays out — recovery, deflection, missed window, or layup | `MotionController` runs `wrongDemos[choiceId].movements` | Choice buttons disabled; optional caption | Cue overlays remain; **no teaching overlays yet** |
| **`replaying`** | Same possession replays with the best read and post-answer teaching overlays | `MotionController` runs `answerDemo` from snapshotted freeze positions | "Show me again" enabled | Post-answer overlays mount (visibility-flip from pre-answer set) |
| **`done`** | Decoder lesson panel, feedback string, IQ/XP toast, self-review checklist, "Next" button | Scene held at end-of-replay frame; resources retained for "Show me again" | Lesson panel + feedback card + checklist | Post-answer overlays visible while lesson panel is open |

**Best-read short-circuit:** when the picked choice has `quality: 'best'`, the controller skips `consequence(choiceId)` and goes directly to `replaying` — because the consequence *is* the answer demo. Implementation: if `wrongDemos.find(d => d.choiceId === pickedId)` is undefined, transition `frozen → replaying` directly.

`replaying` is **idempotent**. "Show me again" cycles `done → replaying → done`. All transitions are React state updates inside `ScenarioReplayController`; per-frame work stays in `useFrame` and the parent rAF loop. No per-frame `setState`.

### 5.5 Correct / wrong consequence replay + timing budget

Behaviour:
- **`quality: 'best'` picked** — skip consequence; play `answerDemo` once, post-answer overlays fade in layered (defender cues already on screen → red blocked lane → open-space region → green open lane → drive/cut preview).
- **`quality: 'acceptable'` picked** — play `wrongDemos[choiceId]` (partial-success outcome: possession kept, layup window missed). Then play `answerDemo` with post-answer overlays.
- **`quality: 'wrong'` picked** — play `wrongDemos[choiceId]` (failure: defender deflects / route ridden / angle disappears). Then play `answerDemo` with post-answer overlays.
- **Missing wrong demo** — engine logs a Sentry breadcrumb and skips to `replaying`. The seed validator should make this case impossible for new scenarios.

**Reset between consequence and replay:** the controller snapshots the freeze-frame positions at the end of `playing`. After `consequence(choiceId)` finishes, players and ball are snapped back to those frozen positions before `replaying` starts. Camera holds. Overlay groups visibility-flip between pre-answer and post-answer instead of being torn down.

**Recommended timing budget** (validator emits warnings beyond these, not hard errors):

| Phase | Target | Rationale |
|---|---|---|
| `setup` | < 400 ms | Mounting; should feel instant |
| `playing` (pre-freeze) | 1.0–3.0 s | Long enough to see the cue develop, short enough to keep attention |
| `frozen` | unbounded | User-driven |
| `consequence(choiceId)` | 1.5–2.5 s per choice | Enough to teach the failure; longer drags the loop |
| `replaying` | 2.0–3.0 s | Best-read playthrough; matches `answerDemo` total |
| Lesson panel hand-off | < 300 ms | Slide-in animation only |

Validator: warn if any single `wrongDemos[choiceId]` exceeds 3.0 s or if `answerDemo` total exceeds 3.5 s.

### 5.6 Camera architecture

Add one preset; allow per-scenario override.

- **`passer_side_three_quarter`** — camera anchored on the same side as the passer, slightly above adult-coach shoulder height, pitched downward so passer, denied receiver, denying defender, and rim line are all on screen.
- **Per-scenario `camera.anchor`** (in feet) overrides the preset's default anchor. Use only when the preset misframes the cue (typically weak-side scenarios).

**Why BDW-01 needs passer-side framing:** the defender's body language — hand and foot in the lane, hips opened toward the sideline, chest between ball and receiver — is most legible from the *passer's* side. A defense-side or top-down view collapses the denial geometry into a flat silhouette. The denied lane (top → wing) and the open lane (top → rim front behind x2) read as distinct vectors only from the passer-side three-quarter angle.

**Off-ball framing rule** — the camera satisfies all three or the preset has failed for that scenario:

1. The passer (or whichever player is the source of the cue) must be visible.
2. The user marker must be visible.
3. The defender giving the cue must be visible.
4. The ball must be visible.

If any of those is outside the frame at freeze time, the preset is wrong; the author supplies an explicit `camera.anchor` rather than zooming through a hack. `AutoFitCamera` is **not removed** — it remains the safety net when no preset is selected.

### 5.7 Off-ball visibility rules

Authoring rules — enforced by the seed validator where mechanical, by visual QA where not:

1. **Defender, cutter, and ball in one frame at freeze.** Validator checks that all three positions at the resolved `freezeAtMs` fall within the camera's frustum bounds for the chosen preset (computed once from `presets.ts`).
2. **Freeze on the cue, not the outcome.** Validator warns if `freezeMarker` is unset *and* the last entry in `movements[]` has a `kind` of one of the cue/answer-revealing kinds (`back_cut`, `baseline_sneak`, `skip_pass`, `rip`).
3. **Answer path hidden pre-answer.** Validator rejects `preAnswerOverlays` containing `passing_lane_open`, `drive_cut_preview`, or an answer-line `open_space_region` (per Section 6).
4. **Small-sided geometry preferred.** Validator emits a soft warning when a new scenario has more than 6 players per team or uses `court: 'full'`. Pack 1 stays half-court 4-on-4.

### 5.8 Scene path policy

This is the rule that prevents visual drift across scenarios:

> **Authored decoder scenarios run on the `Court3D + ScenarioScene3D` path with the imperative overlay system only.** No authored decoder scenario uses the simplified `BasketballScene3D` path or the legacy JSX `MovementPath3D` / `PremiumOverlay.tsx` paths.

Supporting rules:
- **Simplified path is for legacy / auto-fallback content.** `BasketballScene3D` is fine for legacy concept scenarios that already run there or for the emergency 3D fallback. Do not author against it.
- **2D `<Court />` stays as the WebGL-unavailable fallback only.** It does not need to render decoder overlays. WebGL-unavailable users see the legacy 2D experience for that attempt; decoder framing in surrounding UI still applies.
- **No parallel "decoder train" route.** `/train` handles all scenarios — legacy and decoder. Differences are data-driven, not route-driven.
- **PR-4 (engineering phases) schedules `?simple=0` as the default for the decoder pack.** The train page picks the full path automatically for any scenario that carries a `decoderTag` or that ships under a Pack 1 manifest entry. The flag remains as a manual override for QA.

---

## Section 6 — Overlay System Plan

### 6.1 Overlay codepath decision

- **Imperative overlay system (`apps/web/components/scenario3d/imperativeTeachingOverlay.ts`) is the single authoring target** for new decoder scenarios. New primitive types (Section 4.5) extend this controller. The rAF-driven group, dash-offset animation, and pulse loop continue to live there.
- **`PremiumOverlay.tsx` is deprecated for new authoring.** It remains in the tree only to serve the legacy concept scenarios that currently depend on it. No new scenario references it. PR-4 will list its formal removal as a follow-up cleanup phase.
- **JSX `MovementPath3D` is deprecated for new authoring.** The imperative path replaces it for production runtime overlays. `MovementPath3D` may remain as an authoring/preview helper inside scene-authoring tooling, but it does not appear in the production scenario render path for decoder content.
- **One controller, one rAF loop, one visibility-flip toggle** between pre-answer and post-answer states. Mounting and unmounting overlay groups during scene playback is forbidden — primitives are constructed once during `setup` and toggled thereafter.

### 6.2 Pre-answer vs post-answer rule

**Pre-answer:**
- Make the cue **readable**, not the answer **discoverable**.
- Sparse: a typical pre-answer overlay set is 2–4 primitives, not 8.
- Focused on defender body language, vision direction, and named help position.
- No green lanes, no cut/drive previews, no answer-revealing region shading.

**Post-answer:**
- Rich teaching is allowed.
- All primitives permitted.
- Fade-in is layered over ~600–900 ms total — defender cues first, then lanes, then open space, then the cut/drive preview as the climax. The user should read the explanation in order, not all at once.

### 6.3 Allowed pre-answer primitives

Allow:
- `defender_vision_cone`
- `defender_hip_arrow`
- `defender_foot_arrow`
- `defender_chest_line`
- `defender_hand_in_lane`
- `help_pulse`
- `label` — only if subtle and not answer-revealing (e.g., "you" on the user marker is fine; "empty corner" is not).

**Validator rejects pre-answer:**
- `passing_lane_open`
- `drive_cut_preview`
- `open_space_region` whose anchor falls within a configurable threshold of any `answerDemo` movement endpoint (the answer-line region check). The validator measures distance from the region's `anchor` to each `answerDemo[i].to` and rejects below threshold.

### 6.4 Post-answer primitives

All primitives are allowed. The same `help_pulse` or `defender_vision_cone` may appear in both pre-answer and post-answer arrays; the post-answer set is the **complete teaching annotation**, not a delta over pre-answer. Repeating a primitive is the rule, not a smell — it lets the controller treat post-answer as a full mount, with visibility-flipped continuation of the cues already on screen.

### 6.5 Visual language

Color semantics at the meaning level (the design system owns the exact tokens):
- **Green** = playable / correct lane or path.
- **Red / orange** = blocked / capped / dangerous lane.
- **Brand accent at low alpha** = open space, helper highlight.
- **Neutral / white** = defender body-language indicators (so they read across uniform colors).
- **Translucent cool tone** = vision cone (so it does not compete with body-language white).

Per-primitive table:

| Primitive | Purpose | Anchor | Animation / fade timing | Visual intensity | V0 status |
|---|---|---|---|---|---|
| `passing_lane_open` | Show the lane the ball/cut may take | Two endpoints (player ids or `'ball'`) | Fade-in 250–400 ms; optional dash flow | Bright green, medium weight, slight glow | **Must-have** (post-answer only) |
| `passing_lane_blocked` | Show a capped/dangerous lane | Two endpoints | Fade-in 250 ms; no flow | Red/orange, medium weight, slight noise | **Must-have** (post-answer only) |
| `defender_vision_cone` | Where the defender is looking | `playerId`; optional `targetId` for direction | Static during `frozen`; subtle pulse during `replaying` | Translucent wedge, ~30° spread | **Must-have** (both phases) |
| `defender_hip_arrow` | Direction of defender hips | `playerId` (rendered at hip height) | Fade-in 200 ms | Short, thick, white-amber | **Must-have** (both phases) |
| `defender_foot_arrow` | Lead-foot direction | `playerId` (foot anchor) | Fade-in 200 ms | Small, white | **Must-have** (both phases) |
| `defender_chest_line` | Chest plane between passer and receiver | `playerId` (segment between defender and capped line) | Static; subtle pulse | Thin line | **Must-have** (pre-answer especially) |
| `defender_hand_in_lane` | Hand intruding into a passing lane | `playerId` (hand anchor) | Fade-in 200 ms | Small bracket/marker | **Must-have** (pre-answer) |
| `open_space_region` | Shaded shape of the empty seam/corner/lane | `anchor` + `radiusFt` | Fade-in 300–500 ms post-answer | Subtle radial glow at brand-accent low alpha | **Must-have** (post-answer; pre-answer only if non-revealing) |
| `help_pulse` | Named help defender called out | `playerId` + `role` (`tag`, `low_man`, `nail`, `stunter`, `overhelp`) | ~1 Hz pulse; gentle pre-answer, stronger post-answer | Halo around marker; role label fades in post-answer only | **Must-have** (`tag`, `low_man`, `nail`, `overhelp`); `stunter` deferred |
| `drive_cut_preview` | The right cut/drive path | `playerId` + `path[]` | Dashed line builds out 400–700 ms; arrowhead on completion | Bright accent, dashed | **Must-have** (post-answer only) |
| `label` | Small text at a court spot | `anchor` + `text` | Fade-in 200 ms; pre-answer dimmer | Small caps, neutral | **Defer** unless `text` is non-revealing (role tags, "You") |
| `timing_pulse` | Show how short the window was | `anchor` + `durationMs` | One-shot pulse at window close | Bright outward ripple | **Defer** for v0 unless implementation is trivial |

**Animation discipline:**
- **Pre-answer:** max **two** animated primitives at once (e.g., a gentle vision cone and a slow help pulse). More creates motion noise that hurts the read.
- **Post-answer:** layered fade-ins sequenced over **600–900 ms** total. Recommended layer order:
  1. Defender cues already on screen — intensify (no fade in, just visibility-flip).
  2. `passing_lane_blocked` — fade in.
  3. `open_space_region` — fade in.
  4. `passing_lane_open` — fade in.
  5. `drive_cut_preview` — build out as the user marker travels.
  6. `help_pulse` — strengthen, role label fades in.

### 6.6 V0 must-have overlays

The shipping minimum for Pack 1. Each must be authorable, render correctly, and respect the pre/post phase rule:

1. `passing_lane_open` (post-answer)
2. `passing_lane_blocked` (post-answer)
3. `defender_vision_cone`
4. `help_pulse` with at least the `tag`, `low_man`, `nail`, `overhelp` roles wired
5. `defender_hip_arrow`
6. `defender_foot_arrow`
7. `defender_chest_line`
8. `defender_hand_in_lane`
9. `open_space_region`
10. `drive_cut_preview` (post-answer)

### 6.7 Deferred overlays

Defer to a later phase:

- **Rotation ghost trails** — full ghost motion of would-be defenders. Useful for advanced rotation teaching (SKR-03 territory); not needed for Pack 1.
- **"One-more" prompt line** — a tactile UI hint nudging the user to a next pass. Belongs to a future SKR-focused pack.
- **Automatic freeze labels** ("nail," "low man," "tag," "help side," "empty corner") as auto-generated captions. The seed-time `label` primitive already covers this manually; an auto-label system can come later.
- **`timing_pulse`** unless its implementation is trivial within v0 budget. Schema-valid but optional.
- **`stunter` help role** — the `help_pulse` primitive accepts the value, but Pack 1 does not exercise it. Visual treatment can be tuned in a later pack.

### 6.8 Overlay discipline

Three load-bearing rules for the authoring team:

1. **Do not overload the scene before the answer.** The pre-answer view should pass an "if a coach paused the film here, could a 12-year-old name the cue?" test. If the user can name the *answer* instead of the *cue*, there are too many overlays.
2. **The user should read the cue, not follow an answer arrow.** No overlay primitive that points *at* the destination of the best read appears pre-answer. The validator enforces this for `passing_lane_open` and `drive_cut_preview`; authors enforce it manually for `open_space_region` and `label`.
3. **Richer overlays belong in the feedback replay.** The post-answer view is where teaching happens. Layer it deliberately — defender cues first, then lanes, then open space, then the path. The user should feel taught, not buried.

---

## Section 7 — BDW-01 First Scenario Build Plan

| Field | Value |
|---|---|
| Scenario id | `BDW-01` |
| Title | Denied Wing Backdoor |
| Decoder | `BACKDOOR_WINDOW` |
| Difficulty | `beginner` |
| Player role | `off_ball_wing` |
| Game context | 4-on-4 half-court shell, ball reversal from the left slot, 14 on the shot clock |

### 7.1 Why BDW-01 first

**Product:**
- Universally taught — backdoor against denial is unambiguous across systems and ages. Coach-validation risk is low.
- Cue is sharp: hand and foot in the passing lane, hips opened toward the sideline, chest between ball and receiver.
- Best read is a single sharp action (plant-and-go) with one clean acceptable fallback (V-cut).
- 4-on-4 geometry is small, readable, and fast to author and visually QA.
- Teaches CourtIQ's headline idea — read the defender, not the spot.

**Engineering (this is what makes BDW-01 the *template*):**
- Exercises every new mechanic exactly once: decoder taxonomy, three-quality choices, freeze-frame, defender body-language overlays (hip / foot / chest / hand-in-lane), open-space region, named help pulse, per-choice consequence replay, decoder lesson hand-off, self-review checklist.
- One camera preset (`passer_side_three_quarter`), one open lane, one cut. Visual QA is decisive.
- No new movement kinds beyond the additions already needed across Pack 1; uses existing kinds plus `back_cut` and `jab`.
- Once it ships, ESC-01 / AOR-01 / SKR-01 reuse 100% of the runtime — their differences are entirely data + scene authoring.

### 7.2 User experience mapped to the 10-state loop

| State | What the BDW-01 user sees |
|---|---|
| **1. Intro / setup** | Decoder chip "The Backdoor Window." Title "Denied Wing Backdoor." Role assignment "You are the right wing." One-line context: "The ball is at the left slot. The defense is denying your reversal." |
| **2. Possession begins** | The 3D scene plays for ~1.4 s. Player 2 (the user) lifts and shows hands toward the ball; defender x2 steps into the passing lane and squares chest between ball and receiver. |
| **3. Freeze on the cue** | Play pauses. Pre-answer overlays mount (vision cone on x2 toward pg, hip/foot/chest/hand cues on x2, gentle `low_man` pulse on x4). Question: "Your defender is sitting on the reversal. What is the smartest move right now?" Four choice buttons appear. |
| **4. User decision** | User taps `c1` / `c2` / `c3` / `c4`. |
| **5. Consequence playback** | The chosen choice plays out (1.5–2.0 s). Skipped if `c1`. |
| **6. Best-read reveal** | Possession resets to freeze positions and replays with the best read (~2.5–3.0 s). Post-answer overlays fade in layered: red blocked top→wing, green pg→rim front, vision cone pulses, open-space region behind x2 glows, x4 `low_man` pulse strengthens with label, drive/cut preview builds out. |
| **7. Decoder lesson hand-off** | Panel slides in: *The Backdoor Window* — teaching point + "Open lesson" CTA. |
| **8. Feedback** | Quality-aware feedback string + IQ delta + XP delta + streak flame + any badge animations. |
| **9. Self-review** | Four checkboxes; user can self-rate. |
| **10. Progression / unlocks** | Concept and decoder mastery both updated atomically; "Next" button advances to the next Pack 1 scenario. |

### 7.3 3D setup (court-feet coordinates)

First-pass anchors using the landmarks documented in `docs/scene-authoring.md`. Visual QA may tune any value ±2 ft.

**Offense:**
- `pg` (1) — left slot — `start: { x: -9, z: 14 }` — `hasBall: true`
- `user` (2) — right wing — `start: { x: 18, z: 8 }` — `isUser: true`
- `o3` (3) — high left wing — `start: { x: -18, z: 9 }`
- `o4` (4) — deep right corner — `start: { x: 22, z: 1 }`

**Defense:**
- `x1` — on ball at left slot — `start: { x: -9, z: 16 }`
- `x2` — denying the user — `start: { x: 15, z: 10 }` — between ball and receiver, with hand and foot in the lane
- `x3` — matched on `o3`, one step inside help — `start: { x: -15, z: 10 }`
- `x4` — matched on `o4`, one step inside as late low helper — `start: { x: 19, z: 3 }`

**Ball:** `start: { x: -9, z: 14 }`, `holderId: 'pg'`.

**Camera:** `preset: 'passer_side_three_quarter'`. No `anchor` override expected. Visual QA at freeze confirms passer (`pg`), denying defender (`x2`), user marker (`user`), and rim line are all on screen.

### 7.4 Freeze-frame timing

Pre-freeze movements (`scene.movements[]`):

1. `id: 'user_show_hands'`, `playerId: 'user'`, `kind: 'lift'`, `to: { x: 18, z: 9 }`, `delayMs: 0`, `durationMs: 600` — the user steps toward the ball and presents target hands.
2. `id: 'x2_step_to_denial'`, `playerId: 'x2'`, `kind: 'rotation'`, `to: { x: 14, z: 11 }`, `delayMs: 200`, `durationMs: 600` — x2 jumps into the passing lane.

Total pre-freeze playthrough: **~1.4 s**. `freezeMarker` is **unset**; the implicit "freeze at end of `movements[]`" behaviour is sufficient. The freeze hits the moment x2 has visibly committed (hand and foot in the lane, chest between ball and receiver) and the user has finished showing target hands without starting the cut.

Optional later refinement: if visual QA wants a small jab to begin before freeze without playing the full backdoor cut, add a third movement `id: 'user_jab_outside_foot'` and set `freezeMarker: { kind: 'beforeMovementId', movementId: 'user_jab_outside_foot' }` so the jab does not play during setup.

### 7.5 Decision choices with quality

| id | label | quality |
|---|---|---|
| `c1` | "Cut backdoor behind the defender." | `best` |
| `c2` | "V-cut out to a deeper catch point." | `acceptable` |
| `c3` | "Stay on the wing and call for the ball." | `wrong` |
| `c4` | "Slowly cut in front of the defender." | `wrong` |

Order presented to the user is the order above.

### 7.6 Correct timeline (`answerDemo`)

Total ~2.5–3.0 s.

1. `user_jab` — `playerId: 'user'`, `kind: 'jab'`, `to: { x: 19, z: 9 }`, `durationMs: 250` — user jabs toward the ball to commit x2's hips outward.
2. `user_plant_and_go` — `playerId: 'user'`, `kind: 'back_cut'`, `to: { x: 4, z: 2 }`, `delayMs: 100`, `durationMs: 750` — user plants the outside foot and explodes behind x2 toward the front of the rim.
3. `pg_lead_pass` — `playerId: 'ball'`, `kind: 'pass'`, `to: { x: 4, z: 2 }`, `delayMs: 350`, `durationMs: 500` — passer leads the cutter to the front of the rim.
4. `user_finish` — `playerId: 'user'`, `kind: 'cut'`, `to: { x: 0, z: 0.5 }`, `delayMs: 100`, `durationMs: 350` — user catches and finishes at the rim before x4 can rotate.

### 7.7 Wrong / acceptable demos (`wrongDemos`)

Each entry ≤ 2.0 s.

**`c2` (acceptable — V-cut to deeper catch, ~1.5 s):**
- `user_v_cut` — `playerId: 'user'`, `kind: 'cut'`, `to: { x: 21, z: 10 }`, `durationMs: 600`.
- `pg_late_pass` — `playerId: 'ball'`, `kind: 'pass'`, `to: { x: 21, z: 10 }`, `delayMs: 200`, `durationMs: 500`.
- `caption: 'Possession kept, layup window missed.'`

**`c3` (wrong — stay on the wing, ~1.5 s):**
- `pg_force_pass` — `playerId: 'ball'`, `kind: 'pass'`, `to: { x: 18, z: 8 }`, `durationMs: 450`.
- `x2_deflect` — `playerId: 'x2'`, `kind: 'rotation'`, `to: { x: 16, z: 9 }`, `delayMs: 100`, `durationMs: 350`.
- `ball_loose` — `playerId: 'ball'`, `kind: 'pass'`, `to: { x: 18, z: 12 }`, `delayMs: 300`, `durationMs: 350`.
- `caption: 'Defender deflects the reversal.'`

**`c4` (wrong — slow front cut, ~1.7 s):**
- `user_front_cut` — `playerId: 'user'`, `kind: 'cut'`, `to: { x: 8, z: 6 }`, `durationMs: 800`.
- `x2_ride` — `playerId: 'x2'`, `kind: 'rotation'`, `to: { x: 9, z: 7 }`, `delayMs: 100`, `durationMs: 700`.
- `caption: 'Defender rides the cut. Window closes.'`

### 7.8 Pre-answer overlay spec

```ts
preAnswerOverlays: [
  { kind: 'defender_vision_cone',  playerId: 'x2', targetId: 'pg' },
  { kind: 'defender_hip_arrow',    playerId: 'x2' },
  { kind: 'defender_foot_arrow',   playerId: 'x2' },
  { kind: 'defender_chest_line',   playerId: 'x2' },
  { kind: 'defender_hand_in_lane', playerId: 'x2' },
  { kind: 'help_pulse',            playerId: 'x4', role: 'low_man' }, // gentle
]
```

What the user sees: x2 reads as a fully committed denying defender. x4 pulses subtly as the help that will arrive late if the user does cut. **No green lane. No backdoor preview. No "answer is here" arrow.**

### 7.9 Post-answer overlay spec

```ts
postAnswerOverlays: [
  { kind: 'passing_lane_blocked',  from: 'pg',   to: 'user' },                       // top → wing
  { kind: 'passing_lane_open',     from: 'pg',   to: 'user' },                       // green pg → cutter destination near rim front; renderer interprets as pg → cutter end-of-cut
  { kind: 'defender_vision_cone',  playerId: 'x2', targetId: 'pg' },                 // pulses now
  { kind: 'defender_hip_arrow',    playerId: 'x2' },
  { kind: 'defender_foot_arrow',   playerId: 'x2' },
  { kind: 'defender_chest_line',   playerId: 'x2' },
  { kind: 'defender_hand_in_lane', playerId: 'x2' },
  { kind: 'help_pulse',            playerId: 'x4', role: 'low_man' },                // strengthens; role label fades in
  { kind: 'open_space_region',     anchor: { x: 5, z: 4 }, radiusFt: 4 },            // shaded space behind x2
  { kind: 'drive_cut_preview',     playerId: 'user',
    path: [{ x: 18, z: 8 }, { x: 19, z: 9 }, { x: 4, z: 2 }, { x: 0, z: 0.5 }] },     // jab → plant → cut → finish
]
```

Note on `passing_lane_open`: the runtime semantics for "ball lane to the cutter" (rather than to the cutter's start) are pinned in the engineering phases (Section 9). The planning intent is clear: the green lane connects the passer's hand to the cut's destination, not to the wing.

Sequencing during `replaying` (fade-in over ~700 ms): defender cues intensify → red blocked lane → open-space region → green open lane → drive/cut preview builds out → x4 pulse strengthens with `low_man` label.

### 7.10 Lesson panel hand-off

- **Decoder name:** The Backdoor Window
- **Lesson connection:** Read the defender, not the spot
- **Teaching point:** "When your defender sits in the passing lane, the basket is open behind them."
- **Why it works (one line):** "The defender is guarding the pass, not the basket. The denial removes the wing catch but opens the layup window behind it."
- **CTA:** "Open lesson" → links to Academy module `backdoor-window`.

### 7.11 Feedback strings

```ts
feedback: {
  correct: "Good read. You punished the denial instead of fighting for the catch.",
  partial: "Re-spacing can keep the play alive, but the cleaner answer was the layup window behind the defender.",
  wrong:   "You stayed loyal to the spot instead of the cue. If they deny the pass, cut behind them.",
}
```

`scenario.feedback.{correct, partial, wrong}` is the source of truth. Per-choice `feedbackText` may add a one-line specific clarification (e.g., for `c4`: "Cutting in front lets the defender ride your route — go behind them.").

### 7.12 Self-review checklist

```ts
selfReviewChecklist: [
  "Did I see the hand-and-foot denial?",
  "Did I plant and go behind, not in front?",
  "Did I cut hard enough to make it a scoring cut?",
  "Did I show target hands at the rim?",
]
```

Stored locally for v0; a later phase may weight mastery from these answers.

### 7.13 Coach-validation note

```ts
coachValidation: {
  level: 'low',
  status: 'reviewed',  // or 'not_needed' depending on team policy at seed time
  notes: "Backdoor against denial is universally taught. Later confirm whether the default youth pass should be bounce, lead, or chest-fake-to-bounce.",
}
```

Because `level === 'low'`, this scenario can ship `LIVE` without an external review pass. The notes carry the open question for later content tuning.

### 7.14 How BDW-01 becomes the template

Once BDW-01 ships clean, the following are reused **without engine code changes** for ESC-01, AOR-01, SKR-01:

1. **Scenario schema shape** — same fields; only values differ.
2. **Replay state machine** — `idle → setup → playing → frozen → consequence(choiceId) → replaying → done` is universal.
3. **Freeze-frame state** — `freezeMarker` (or implicit end-of-`movements[]`) works for any cue moment.
4. **Choice quality system** — `best | acceptable | wrong` is a content choice per scenario; engine and feedback panel are unchanged.
5. **Overlay reveal discipline** — pre-answer cues (defender body language + named help) and post-answer teaching (lanes, regions, previews) follow the same cadence; only the primitives chosen differ.
6. **Consequence demos** — every scenario authors a `wrongDemos` entry per non-best choice; the 1.5–2.5 s budget per demo is the same.
7. **Decoder lesson panel UI** — shared component; only `decoderTag`, teaching point, and lesson connection change.
8. **Self-review checklist UI** — shared component; copy is scenario-specific.
9. **Progression hooks** — same attempt transaction; decoder mastery dimension updates for whichever decoder the scenario carries.

What the next three Pack 1 scenarios add, **strictly as data + new primitives, not new engine components:**

- **ESC-01 — Empty Corner Baseline Sneak.** First use of the `baseline_sneak` movement kind. First weak-side `camera.anchor` override (the empty driving corner is on the *opposite* side from the ball). Leans on `open_space_region` and `low_man` `help_pulse`.
- **AOR-01 — No Gap Go Now.** First use of the `rip` movement kind. First scenario where the user is the **ball-handler at catch time** (the closeout decision sits on the receiver's first touch). Leans on `defender_chest_line` and `defender_foot_arrow` for closeout posture.
- **SKR-01 — Paint Touch Opposite Corner.** First use of the `skip_pass` movement kind. First scenario where the user is the **ball-handler driving** (paint touch from a slot drive). Leans on `passing_lane_blocked` + `tag` and `low_man` help pulses + `passing_lane_open` to the opposite corner.

Each delta is a one-line schema addition (one movement kind) plus authored data. **No new player components, no new camera components, no new overlay primitives, no new replay states.** That is the test BDW-01 is built to pass.

---

## Section 8 — First 4-Scenario Pack Plan

Pack name: **Founder v0 / Decoder Foundations.** Pack folder: `packages/db/seed/scenarios/packs/founder-v0/`. Order is teaching-driven, not engineering-driven — the engineering deltas per scenario are listed only to confirm each addition stays small.

### `BDW-01` — Denied Wing Backdoor

(a) **Why it's first / what it teaches.** The Backdoor Window is CourtIQ's headline decoder, taught with the cleanest possible cue: defender hand and foot in the passing lane. The user practises reading denial and punishing it with a plant-and-go cut behind the defender. Universally taught at the youth level; no system-dependent caveats. (b) **What it tests technically.** Every new mechanic exactly once — decoder taxonomy, three-quality choices, freeze-frame, defender body-language overlays, named help pulse, open-space region, per-choice consequence replay, decoder lesson hand-off, self-review checklist. (c) **What is reused.** Nothing yet — BDW-01 establishes the template. (d) **Coach validation.** `level: 'low'`. Open question: default youth pass type for the cutter — bounce vs lead vs chest-fake-to-bounce. Captured in `coachValidation.notes`; can ship `LIVE` without a review pass.

### `ESC-01` — Empty Corner Baseline Sneak

(a) **Why next / what it teaches.** The Empty-Space Cut decoder. Strong-side drive pulls weak-side help; the user (in the weak-side corner) sneaks behind the abandoned helper for a baseline drop-off. Teaches "cut into the space your teammate just created" — the off-ball read that turns drives into layups. Visually strong: empty corner is a clear geometric prompt. (b) **What it tests technically beyond BDW-01.** First use of the `baseline_sneak` movement kind. First weak-side `camera.anchor` override (the cue lives on the *opposite* side from the ball, so the default `passer_side_three_quarter` mis-frames; an explicit anchor pulls the camera toward the empty corner). Leans on `open_space_region` and `low_man` `help_pulse`. (c) **What is reused unchanged from BDW-01.** Scenario schema shape, replay state machine, freeze-frame state, choice quality system, overlay reveal discipline (sparse pre-answer, layered post-answer), consequence-demo cadence, decoder lesson panel UI, self-review checklist UI, progression hooks. (d) **Coach validation.** `level: 'low'` → `medium`. Open question: whether the youth default is the baseline drop-off vs a corner skip — varies slightly by program.

### `AOR-01` — No Gap Go Now

(a) **Why next / what it teaches.** Advantage or Reset — the closeout read on the catch. Tight closeout, no cushion, empty baseline lane = rip baseline immediately. Teaches the 0.5-second first-touch decision that every kickout in basketball requires. The lowest-friction example of the decoder family. (b) **What it tests technically beyond BDW-01 / ESC-01.** First use of the `rip` movement kind. First scenario where the **user is the ball-handler at catch time** (the closeout decision sits on the receiver's first touch, not on an off-ball cutter). Leans on `defender_chest_line` and `defender_foot_arrow` for closeout posture readability. Forces the train page's "user just caught" framing path. (c) **What is reused unchanged.** Same as ESC-01 plus the weak-side `camera.anchor` pattern (here used to keep the closeout body line readable). (d) **Coach validation.** `level: 'low'`. No open content questions; rip-baseline-on-tight-closeout is universally taught.

### `SKR-01` — Paint Touch Opposite Corner

(a) **Why next / what it teaches.** Skip the Rotation. The user drives middle from a slot and reaches the paint; weak-side help shrinks; the opposite corner opens behind the help. Teaches "if two defenders shrink to the ball, somebody behind them got free" — the headline passing decoder. First scenario that introduces a true cross-court geometric read. (b) **What it tests technically beyond the prior three.** First use of the `skip_pass` movement kind. First scenario where the **user is the ball-handler driving** (paint touch from a slot drive, not a catch). Exercises both `tag` and `low_man` `help_pulse` roles in the same scene. Heavier post-answer overlay layering (`passing_lane_blocked` for the dump-off lane, `passing_lane_open` to the corner, `open_space_region` on the opposite corner). (c) **What is reused unchanged.** Schema shape, state machine, freeze-frame, choice quality, overlay discipline, consequence-demo cadence, lesson panel, self-review UI, progression. (d) **Coach validation.** `level: 'medium'`. Open content questions: is the opposite corner the default vs the wing one-more, and does the user attempt a layup if the lane is genuinely open? Both belong in `coachValidation.notes`.

### `SKR-02` — First Kick Then One More *(optional)*

(a) **Why optional / what it teaches.** The "good shot vs better shot" extension of Skip the Rotation. The user catches a first kickout at the 45 with a workable but contested look; the corner is more open because x3 is late closing out. Teaches the second-pass habit that separates good IQ from great IQ. Strong content; medium-to-high coach validation cost. (b) **What it tests technically beyond SKR-01.** Same `skip_pass` kind. New nuance: the user's choice between "shoot the workable look" and "extra pass to the better look" requires two `quality: 'acceptable'` reads in tension — exercises the partial-XP path more thoroughly than any other scenario in the pack. May surface a need for a `timing_pulse` overlay on the late closeout if visual QA finds the cue too subtle without it. (c) **What is reused unchanged.** Everything that the first four scenarios use. (d) **Coach validation.** `level: 'medium'` → `high`. Ships only after a coach review. Open content questions: shooter-range threshold (when does the workable shot become "better than one more"), and whether to score the workable shot as `acceptable` or `wrong` for under-13 players. Captured in `coachValidation.notes`. Default ship status: `DRAFT` until reviewed.

---

## Section 9 — Engineering Phases

Phase 1 (Decoder Foundations) is broken into twelve commit-sized sub-phases, A through L. Each phase below describes **future** implementation work — none of it is done yet. Each phase ends with a stop/checkpoint instruction so a fresh Claude Code session can pick up the next phase from this document alone.

Common validation commands referenced below:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm prisma:validate`
- `pnpm seed:scenarios` (seed dry-run against fixtures, where relevant)
- Manual visual QA in `/train` (where the deliverable changes a rendered surface)

### Phase A — Audit current scenario / 3D code

- **Goal.** Sanity-check the assumptions in PR-1's audit before any code edits land. Confirm exact file paths, exported names, and Zod schema shape so Phase B does not collide with reality.
- **Why it matters.** PR-1 was an inventory pass, not a line-by-line read. Phase B writes against `apps/web/lib/scenario3d/schema.ts`; if the actual export structure differs, every later phase shifts.
- **Files likely involved (read-only).** `apps/web/lib/scenario3d/schema.ts`, `apps/web/lib/scenario3d/scene.ts`, `apps/web/lib/scenario3d/timeline.ts`, `apps/web/lib/scenario3d/presets.ts`, `apps/web/components/scenario3d/Scenario3DCanvas.tsx`, `apps/web/components/scenario3d/ScenarioReplayController.tsx`, `apps/web/components/scenario3d/imperativeTeachingOverlay.ts`, `scripts/seed-scenarios.ts`, `packages/db/prisma/schema.prisma`, `packages/db/seed/scenarios/*.json`, `apps/web/app/train/page.tsx`.
- **Deliverable.** A short `docs/audit-confirmation.md` (~80–150 lines): for each subsystem, the current export surface, the smallest extension point Phase B will use, and any deltas from PR-1's audit. No code changes.
- **Validation.** `pnpm typecheck` (sanity); read-only review.
- **Commit message.** `docs: confirm scenario/3D audit assumptions before schema work`.
- **Risks.** Audit may reveal a refactor since PR-1 (renderer polish work continues to merge). If so, capture the delta and adjust later phases before starting B.
- **Stop / checkpoint.** Land the audit-confirmation doc, run typecheck, commit, push. Do not start B in the same session.
- **Next prompt.** "Proceed with Phase B. Implement schema additions in `apps/web/lib/scenario3d/schema.ts` and the seed validator mirror per Section 4 of the planning doc. Do not touch Prisma or runtime components yet."

### Phase B — Define scenario TypeScript / Zod schema additions

- **Goal.** Land the additive schema in TypeScript and Zod: `DecoderTag`, `ChoiceQuality`, `freezeMarker` discriminated union, `wrongDemos[]`, `OverlayPrimitive` discriminated union, `CoachValidation`, plus the new movement kinds (`back_cut`, `baseline_sneak`, `skip_pass`, `rip`, `jab`) and the `passer_side_three_quarter` camera preset. Mirror the schema in `scripts/seed-scenarios.ts`.
- **Why it matters.** Every later phase reads against this schema. Type drift here is contagious.
- **Files likely involved.** `apps/web/lib/scenario3d/schema.ts` (extend), `scripts/seed-scenarios.ts` (mirror), `apps/web/lib/scenario3d/scene.ts` (resolve `freezeBeforeMovementId` → `freezeAtMs` at scene load), `apps/web/lib/scenario3d/timeline.ts` (read freeze marker; no behaviour change yet).
- **Deliverable.** Schema extensions land additively. Existing scenes parse unchanged. New optional fields default sanely. Unit tests in `apps/web/lib/scenario3d/schema.test.ts` (extend) cover: `DecoderTag` enum acceptance, `ChoiceQuality` enum, `freezeMarker` both forms (`atMs` and `beforeMovementId` resolution), `wrongDemos[].choiceId` referential integrity, overlay primitive discriminated-union exhaustiveness, coach-validation gating rules.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm prisma:validate` (no Prisma changes yet but confirms baseline). Plus `pnpm seed:scenarios` dry-run against the seven legacy fixtures — they must continue to pass with no JSON edits.
- **Commit message.** `feat(schema): add decoder, choice quality, freeze, overlays to scenario zod schema`.
- **Risks.** Discriminated-union additions can break existing seed JSON if a field name collides. Mitigation: every new field is optional or has a default; legacy JSONs that ship `is_correct: true | false` are translated by the seeder, not by the schema.
- **Stop / checkpoint.** Schema lands, tests pass, legacy seed dry-run is green. Commit, push, stop.
- **Next prompt.** "Proceed with Phase C. Add Prisma-layer decoder taxonomy and choice-quality columns; decide and implement the `Mastery.dimension` discriminator path."

### Phase C — Add decoder taxonomy and choice quality at the Prisma layer

- **Goal.** Add `decoder_tag` enum on `Scenario`, `quality` column on `ScenarioChoice` (with backwards-compat `is_correct` derivation in the seeder), and `dimension` discriminator on `Mastery` for decoder mastery. Recommendation: reuse the existing `Mastery` table with a `dimension: 'concept' | 'decoder'` discriminator rather than introducing a parallel `DecoderMastery` table — the attempt transaction already writes one row per concept tag; adding a decoder dimension keeps it atomic, single-table, and one query shape for the home screen and Academy.
- **Why it matters.** This is the load-bearing data-model change that lets every later phase (especially F, J, K) read or write decoder-tagged data without per-call workarounds.
- **Files likely involved.** `packages/db/prisma/schema.prisma`, `packages/db/seed/scenarios/README.md` (note new fields), `scripts/seed-scenarios.ts` (translate legacy `is_correct` → `quality`; populate `decoder_tag` only when present in JSON), `apps/web/lib/services/masteryService.ts` (write decoder-dimension row alongside concept-dimension rows), `apps/web/app/api/session/[id]/attempt/route.ts` (no contract change; pass through new mastery rows).
- **Deliverable.** A Prisma migration (`pnpm prisma migrate dev --name add_decoder_and_quality`) that adds: `Scenario.decoder_tag DecoderTag?`, `ScenarioChoice.quality ChoiceQuality NOT NULL DEFAULT 'wrong'` (then back-fill from `is_correct`), `Mastery.dimension MasteryDimension NOT NULL DEFAULT 'concept'`. Seeder translates legacy `is_correct` → `quality` on every run. Existing API responses include both `is_correct` and `quality` during the transition.
- **Validation.** `pnpm prisma:validate`, `pnpm prisma migrate dev` (locally), `pnpm typecheck`, `pnpm lint`, `pnpm test`. Run `pnpm seed:scenarios` and confirm the seven legacy scenarios upsert with `quality` filled in and `decoder_tag` null. Manually inspect one `ScenarioChoice` row.
- **Commit message.** `feat(db): add decoder_tag, choice quality, mastery dimension to schema`.
- **Risks.** Migrations against a Supabase-hosted DB require care; ship with `--create-only` first if production needs review. Backfill of `quality` from `is_correct` must run in the same migration to avoid a window where rows have neither.
- **Stop / checkpoint.** Migration applied locally, seed dry-run green, all checks pass. Commit, push, stop. Do not start D until the migration plan for staging is captured.
- **Next prompt.** "Proceed with Phase D. Wire freeze-frame and the new replay state machine in `lib/scenario3d/timeline.ts` and `ScenarioReplayController.tsx`. No UI behaviour change yet."

### Phase D — Add freeze-frame and replay state machine

- **Goal.** Resolve `freezeMarker` (both `atMs` and `beforeMovementId` forms) into a single `freezeAtMs` at scene load; add the `frozen` event from `MotionController`; replace `ScenarioReplayController`'s state machine with `idle → setup → playing → frozen → consequence(choiceId) → replaying → done` (per Section 5.4). No question UI hand-off yet — that lands in Phase G.
- **Why it matters.** The freeze and the consequence/replay distinction are the load-bearing runtime mechanics for every authored decoder scenario. Wiring them once keeps F / G / H / K cheap.
- **Files likely involved.** `apps/web/lib/scenario3d/timeline.ts`, `apps/web/lib/scenario3d/scene.ts` (freeze resolution), `apps/web/components/scenario3d/ScenarioReplayController.tsx`, `apps/web/components/scenario3d/imperativeScene.ts` (`MotionController.advance` becomes a no-op while `frozen`), `apps/web/lib/scenario3d/timeline.test.ts` (extend — sampling at freeze, snapshot/reset between consequence and replay).
- **Deliverable.** Replay state machine landed end-to-end behind a feature flag (or simply gated by presence of `freezeMarker` in the scene). `frozen` event fires reliably; "Show me again" cycles `done → replaying → done`. Existing scenarios without a freeze marker keep their current behaviour.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`. Manual QA: open a placeholder scenario with a hand-edited `freezeMarker`, confirm the play visibly pauses at the cue and resumes via the controller's `play()` API.
- **Commit message.** `feat(scenario3d): add freeze-frame and consequence replay state machine`.
- **Risks.** State-machine drift is the #1 source of replay bugs in 3D engines. Add exhaustive tests for transitions (idle→setup, setup→playing, playing→frozen, frozen→consequence, consequence→replaying, replaying→done, done→replaying). Best-quality short-circuit (`frozen → replaying` directly) needs its own test.
- **Stop / checkpoint.** All transitions tested, manual QA green for one hand-edited scene. Commit, push, stop.
- **Next prompt.** "Proceed with Phase E. Add the new overlay primitives in `imperativeTeachingOverlay.ts`. No new scenarios yet."

### Phase E — Add overlay primitives

- **Goal.** Extend `imperativeTeachingOverlay.ts` with the v0 must-have primitives from Section 6.6: `defender_hip_arrow`, `defender_foot_arrow`, `defender_chest_line`, `defender_hand_in_lane`, `open_space_region`, `drive_cut_preview`, plus the named `help_pulse` roles (`tag`, `low_man`, `nail`, `overhelp`). Confirm `passing_lane_open`, `passing_lane_blocked`, and `defender_vision_cone` work for both endpoints and `'ball'` source semantics.
- **Why it matters.** Every authored decoder scenario draws on this primitive set. Phase F and beyond cannot author overlays that don't render.
- **Files likely involved.** `apps/web/components/scenario3d/imperativeTeachingOverlay.ts` (extend the controller and primitive registry), `apps/web/lib/scenario3d/atmosphere.ts` (color tokens / intensity if needed), tests under `apps/web/components/scenario3d/__tests__/` (new — primitive build/visibility/animation timing).
- **Deliverable.** Each new primitive renders correctly in a stand-alone Storybook-style harness or a temporary `/dev/overlay-preview` route. Animation timing matches the table in Section 6.5 (fade-in 200–500 ms depending on primitive; layered post-answer fade-in over 600–900 ms total). Visibility-flip toggle (pre-answer ↔ post-answer) is O(1) — no teardown.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`. Manual visual QA in the dev harness for each primitive at both `frozen` and `replaying` states. Performance check: total scene draw calls and triangle count remain within the existing render-tier budget.
- **Commit message.** `feat(overlays): add defender body-language, open-space, drive/cut preview primitives`.
- **Risks.** Primitive proliferation can blow the per-frame budget. Mitigation: share geometry via module-level memoisation (already the pattern for player markers); avoid per-primitive materials; cap simultaneous animated primitives pre-answer at two.
- **Stop / checkpoint.** All primitives render in the harness, animations match spec, performance budget green. Commit, push, stop.
- **Next prompt.** "Proceed with Phase F. Convert BDW-01 into structured data under `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json` and the pack manifest. Run `pnpm seed:scenarios` against it."

### Phase F — Convert BDW-01 into structured data

- **Goal.** Turn Section 7 of this planning document into a real seeded scenario: `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json` plus the pack manifest `pack.json`. No runtime-engine work.
- **Why it matters.** This is the moment the schema, primitives, and freeze-frame become content. Authoring discipline established here is the template every later scenario follows.
- **Files likely involved.** `packages/db/seed/scenarios/packs/founder-v0/BDW-01.json` (new), `packages/db/seed/scenarios/packs/founder-v0/pack.json` (new — manifest with `id`, `slug: 'founder-v0'`, `title: 'Founder v0 / Decoder Foundations'`, ordered scenario list, prerequisite chain), `scripts/seed-scenarios.ts` (extend to discover `packs/<slug>/` directories and seed them with the manifest's order respected).
- **Deliverable.** BDW-01 JSON contains every field from Section 7: identity, decoder, choices with `quality`, scene with court-feet coords (offense, defense, ball), pre-freeze movements, `answerDemo`, three `wrongDemos` keyed by `c2` / `c3` / `c4`, pre-answer overlays, post-answer overlays, lesson connection, decoder teaching point, feedback strings, self-review checklist, coach validation `level: 'low'`. `pnpm seed:scenarios` upserts the row and returns no validation errors.
- **Validation.** `pnpm prisma:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm seed:scenarios`. Manual DB inspection: `Scenario` row with `decoder_tag = 'BACKDOOR_WINDOW'`, four `ScenarioChoice` rows with the right `quality` values.
- **Commit message.** `content(scenarios): seed BDW-01 — Denied Wing Backdoor (Pack 1)`.
- **Risks.** Coordinate misjudgement at seed time — the camera framing rule (passer + cue defender + user + rim on screen at freeze) is not visible without rendering. Mitigation: defer visual tuning to Phase L; ship Phase F with the planning-doc coordinates verbatim.
- **Stop / checkpoint.** BDW-01 seeds clean against the new schema. Commit, push, stop.
- **Next prompt.** "Proceed with Phase G. Wire the train page to dispatch on `decoderTag`, default `?simple=0` for the decoder pack, and mount the question UI on `frozen`."

### Phase G — Connect BDW-01 to scenario runtime

- **Goal.** Make the `/train` flow recognise decoder scenarios: pick the full `Court3D + ScenarioScene3D` path (default `?simple=0`) for any scenario carrying `decoder_tag`, subscribe to the `frozen` event from Phase D, and mount the question prompt + four choice buttons at that exact moment. No consequence playback yet.
- **Why it matters.** This is the first end-to-end render of an authored decoder scenario. After Phase G, BDW-01 is playable through the freeze; everything past freeze is Phase H.
- **Files likely involved.** `apps/web/app/train/page.tsx` (decoder-aware orchestration; `?simple=0` default for decoder scenarios; subscribe to `frozen`), `apps/web/components/scenario3d/Scenario3DView.tsx` (raise the `frozen` event up; expose `replayMode` props per state), `apps/web/components/scenario3d/Scenario3DCanvas.tsx` (pick the full path when `decoder_tag` is present), possibly new UI components under `apps/web/app/train/` (e.g., `DecoderChip.tsx`, `ChoiceButtons.tsx`) — keep small and reuse `components/ui/`.
- **Deliverable.** A user clicking BDW-01 in `/train` sees: intro card → 3D scene plays for ~1.4 s → freeze → question + four choice buttons. Tapping a choice records the choice and freezes the UI in a "consequence pending" state (Phase H wires the playback). Pre-answer overlays are visible.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`. Manual visual QA: framing rule satisfied at freeze (passer + x2 + user + rim visible); pre-answer overlays read; no answer-revealing primitives. Phone-width emulation (≤390 px) sanity check.
- **Commit message.** `feat(train): dispatch decoder scenarios to full 3D path and freeze-frame question UI`.
- **Risks.** `?simple=0` default may regress legacy concept scenarios that currently rely on the simple path. Mitigation: gate the default switch on `scenario.decoder_tag != null`, leave non-decoder scenarios unchanged.
- **Stop / checkpoint.** BDW-01 playable through freeze, manual QA green. Commit, push, stop.
- **Next prompt.** "Proceed with Phase H. Wire `wrongDemos[choiceId]` dispatch and the post-answer overlay visibility flip in `ScenarioReplayController` and `Scenario3DView`."

### Phase H — Add consequence replay and best-read reveal

- **Goal.** Wire the post-decision playback: dispatch `wrongDemos[choiceId]` (or skip for `quality: 'best'`), reset to snapshotted freeze positions, then play `answerDemo` with the post-answer overlay set faded in over the layered timing in Section 6.5. "Show me again" cycles `done → replaying → done`.
- **Why it matters.** Consequence + best-read reveal is what turns the loop from quiz-shaped into film-room-shaped. After Phase H, BDW-01 is end-to-end playable through state 6 of the 10-state loop (lesson + feedback are I).
- **Files likely involved.** `apps/web/components/scenario3d/ScenarioReplayController.tsx` (dispatch on choice id; manage snapshot + reset; layered post-answer fade-in), `apps/web/components/scenario3d/Scenario3DView.tsx` (visibility-flip the overlay group), `apps/web/components/scenario3d/imperativeTeachingOverlay.ts` (expose `setPhase('preAnswer' | 'postAnswer')`), `apps/web/components/scenario3d/__tests__/replayController.test.tsx` (extend — full state-machine integration).
- **Deliverable.** A user picking each of c1–c4 sees the correct consequence, the reset to freeze, the best-read replay, and the post-answer overlays in the correct layered order. Validator timing budgets (consequence ≤ 2.5 s, replay ≤ 3.0 s) honoured. Best-quality short-circuit (`frozen → replaying`) verified.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`. Manual QA: each of the four choices plays cleanly; "Show me again" works after `done`; no per-frame `setState` regressions (check React profiler).
- **Commit message.** `feat(replay): wire consequence playback and best-read reveal with post-answer overlays`.
- **Risks.** Snapshot/reset between consequence and replay is the most likely place for visual jitter. Mitigation: snapshot at the resolved `freezeAtMs` exactly, reset by snapping (not interpolating) before `replaying` begins.
- **Stop / checkpoint.** All four choices in BDW-01 produce clean consequence + replay; "Show me again" works. Commit, push, stop.
- **Next prompt.** "Proceed with Phase I. Add the decoder lesson panel and self-review checklist UI; author the four decoder lesson modules under `packages/db/seed/lessons/`."

### Phase I — Add decoder lesson panel and self-review checklist UI

- **Goal.** Land states 7 (decoder lesson hand-off) and 9 (self-review checklist) of the 10-state loop. Surface the decoder name, teaching point, and "Open lesson" CTA in a slide-in panel; render the four-item self-review checklist with self-rating before "Next." Author the four decoder lesson modules so the CTA links to a real Academy page.
- **Why it matters.** Without the lesson panel and self-review, the loop ends at feedback and the decoder framing never closes. The four lesson modules are also the Academy entry point for users who arrive via Practice rather than Train.
- **Files likely involved.** `apps/web/app/train/page.tsx` (mount the lesson panel after `replaying`; render the checklist before "Next"), new components (e.g., `apps/web/app/train/DecoderLessonPanel.tsx`, `apps/web/app/train/SelfReviewChecklist.tsx`) reusing `components/ui/Card.tsx` and `components/ui/Button.tsx`, `packages/db/seed/lessons/backdoor-window.json`, `packages/db/seed/lessons/empty-space-cut.json`, `packages/db/seed/lessons/skip-the-rotation.json`, `packages/db/seed/lessons/advantage-or-reset.json` (each new), and possibly a small extension to `apps/web/lib/services/academyService.ts` to recognise the new modules.
- **Deliverable.** After the best-read replay, BDW-01 surfaces the decoder lesson panel with the exact Section 7.10 copy. The four self-review checkboxes render and accept rating. "Open lesson" navigates to `/academy/backdoor-window`. The four decoder lesson JSONs use the existing markdown grammar (`tip` / `mistake` / `takeaway` / `coach` / `reveal` / `quiz`); each lesson body reuses the `decoderTeachingPoint` as its `takeaway` block and the `selfReviewChecklist` as `reveal` flashcards.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm seed:lessons` (validates the new module/lesson JSONs against the existing Zod). Manual QA: lesson panel slides in cleanly, "Open lesson" routes correctly, Academy lists the four new modules, and `/academy/backdoor-window` renders.
- **Commit message.** `feat(train,academy): add decoder lesson panel, self-review checklist, four decoder modules`.
- **Risks.** Module prerequisite chain accidentally locks the new decoder modules behind unrelated concept modules. Mitigation: leave `prerequisite_module_ids: []` on all four decoder modules for v0; revisit when concept↔decoder mapping is intentional.
- **Stop / checkpoint.** Lesson panel + checklist render and route correctly; four decoder modules visible in Academy. Commit, push, stop.
- **Next prompt.** "Proceed with Phase J. Extend the attempt transaction to update decoder mastery; surface decoder mastery on the home screen and Academy."

### Phase J — Add progress / completion hooks

- **Goal.** Make decoder mastery a first-class progression dimension. Extend the attempt transaction to write a decoder-dimension `Mastery` row alongside concept-dimension rows. Surface decoder mastery on the home screen (next to streak/IQ/XP) and the Academy page (decoder modules show their own mastery state).
- **Why it matters.** Without progression hooks, the decoder framework looks the same as concept-tagged content to the user; mastery is what makes the four decoders feel like a real curriculum. The atomic single-table approach from Phase C means this is a write-pattern extension, not a transaction redesign.
- **Files likely involved.** `apps/web/app/api/session/[id]/attempt/route.ts` (write decoder-dimension `Mastery` row when scenario carries a `decoder_tag`), `apps/web/lib/services/masteryService.ts` (extend `update` to accept a dimension argument; keep concept-dimension behaviour unchanged), `apps/web/lib/services/academyService.ts` (compute decoder-module state from the decoder dimension), `apps/web/app/academy/page.tsx` (render decoder modules with their state), `apps/web/app/page.tsx` or the home dashboard component (surface a small "Decoder mastery" tile).
- **Deliverable.** Submitting an attempt for BDW-01 writes both a concept-dimension and a decoder-dimension `Mastery` row in one transaction. The home screen surfaces decoder mastery; the Academy decoder modules transition `new → in_progress → mastered` via the same thresholds (≥5 attempts AND ≥0.8 rolling accuracy) but on the decoder dimension.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm prisma:validate`. Manual QA: submit five correct BDW-01 attempts, confirm the Academy `backdoor-window` module flips to `mastered`. Confirm concept-tagged scenarios still update concept mastery as before.
- **Commit message.** `feat(progression): write decoder mastery in attempt transaction; surface in home and academy`.
- **Risks.** Two `Mastery` rows per attempt approximately doubles `Mastery` row volume. Confirm index strategy on `(user_id, dimension, concept_id)` continues to perform; add an index migration if needed.
- **Stop / checkpoint.** Decoder mastery flows end-to-end for BDW-01; concept mastery untouched. Commit, push, stop.
- **Next prompt.** "Proceed with Phase K. Author ESC-01, AOR-01, SKR-01 — three scenario JSONs in `packages/db/seed/scenarios/packs/founder-v0/` plus the necessary new movement kinds and the first weak-side `camera.anchor`. No new components."

### Phase K — Add ESC-01, AOR-01, SKR-01

- **Goal.** Author the three remaining required Pack 1 scenarios as data only. Add the movement kinds they need (`baseline_sneak` for ESC-01, `rip` for AOR-01, `skip_pass` for SKR-01) to the schema's typed union and to the renderer if any rendering nuance is required (most should reuse existing primitives). Introduce the first weak-side `camera.anchor` override for ESC-01.
- **Why it matters.** Phase K is the proof that BDW-01 is a real template. If three scenarios land as pure data + a small typed-union extension, the runtime is correctly decoder-agnostic. If they require new components, the engine is hardcoded somewhere — go back to the offending phase.
- **Files likely involved.** `packages/db/seed/scenarios/packs/founder-v0/ESC-01.json` (new), `packages/db/seed/scenarios/packs/founder-v0/AOR-01.json` (new), `packages/db/seed/scenarios/packs/founder-v0/SKR-01.json` (new), pack manifest update (add the three to the ordered list with prerequisites), `apps/web/lib/scenario3d/schema.ts` (extend `MovementKind` union if not already done in Phase B), `scripts/seed-scenarios.ts` (mirror), `apps/web/lib/scenario3d/timeline.ts` (interpret the new kinds — most map to a generic line/arrow render with the existing primitive, but `skip_pass` may want a slight curve for visual readability), `apps/web/components/scenario3d/imperativeTeachingOverlay.ts` (no expected change — verify the existing primitives cover the new scenarios' overlay specs).
- **Deliverable.** All three scenarios seed cleanly (`pnpm seed:scenarios`). Each runs end-to-end through the 10-state loop using only the schema, state machine, primitives, lesson panel, and self-review UI established by Phases B–I. ESC-01 uses an explicit `camera.anchor` override toward the empty corner; AOR-01 demonstrates the user-as-ball-handler-at-catch path; SKR-01 demonstrates the user-as-ball-handler-driving path.
- **Validation.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm prisma:validate`, `pnpm seed:scenarios`. Manual visual QA per scenario: framing rule satisfied at freeze; pre-answer overlays do not reveal the answer; consequence and best-read replays read correctly.
- **Commit message.** `content(scenarios): seed ESC-01, AOR-01, SKR-01 with new movement kinds`.
- **Risks.** A new scenario surfaces an engine assumption that holds for BDW-01 but breaks elsewhere (e.g., camera framing for weak-side cues; user-as-ball-handler causing a label/glow conflict). Mitigation: bring up one scenario at a time, validate, then the next; do not author all three before testing one.
- **Stop / checkpoint.** All three scenarios playable end-to-end; no new player/camera/overlay components introduced. Commit, push, stop.
- **Next prompt.** "Proceed with Phase L. Run QA + validation passes per Section 10 — visual QA against the freeze framing rule, basketball-logic QA, coach-validation status updates, performance and bundle budget check, Sentry breadcrumb verification."

### Phase L — QA, validation, polish

- **Goal.** Lock Pack 1 ready for users. Visual QA every scenario against the framing rule from Section 5.6/5.7 (passer / cue defender / user / ball / rim all on screen at freeze). Basketball-logic QA pass: do the consequence and best-read playbacks teach the read a coach would teach? Coach-validation status updates from `reviewed` / `not_needed` to `approved` where applicable. Performance and bundle-budget check: confirm `/train` route stays under the documented JS budget and the 3D scene continues to hit 60 fps on mid-tier mobile. Sentry breadcrumb verification: confirm runtime fallbacks (missing `wrongDemos`, malformed `freezeMarker`, unknown `decoder_tag`) emit breadcrumbs and do not crash the canvas.
- **Why it matters.** Phase L converts Pack 1 from "ships" to "should ship." Skipping it means the first cohort of users gets undertuned framing, off-by-default overlays, or perf regressions that take weeks to track down post-launch.
- **Files likely involved.** `docs/scenario-qa-checklist.md` (new — capture the manual checklist for future packs), `packages/db/seed/scenarios/packs/founder-v0/*.json` (visual-QA-driven coordinate or timing tweaks; preserve quality fields), per-scenario `coachValidation.status` updates (where notes have been resolved), and possibly small renderer tunes in `apps/web/lib/scenario3d/atmosphere.ts` or `apps/web/components/scenario3d/imperativeTeachingOverlay.ts` if a primitive's intensity needs adjustment.
- **Deliverable.** A short `docs/scenario-qa-checklist.md` capturing the framing-rule check, the timing-budget check, the pre/post overlay-discipline check, and the Sentry-breadcrumb check. All four (or five) Pack 1 scenarios pass the checklist. Coach-validation statuses for `level: 'low'` and `level: 'medium'` scenarios are `approved`; `SKR-02` (if included) stays `DRAFT` until external review. Performance check captured (e.g., bundle-size delta and frame-time at the freeze point on a mid-tier device).
- **Validation.** Full CI matrix: `pnpm prisma:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm seed:content`. Manual: complete the new QA checklist; force a missing-`wrongDemos` and malformed-`freezeMarker` dev fixture and confirm the Sentry breadcrumb fires while the canvas stays up.
- **Commit message.** `qa(pack1): freeze framing, basketball logic, coach validation, perf, sentry breadcrumbs`.
- **Risks.** Coordinate or timing tweaks driven by visual QA can ripple — a small camera anchor change for ESC-01 may also affect AOR-01 if they share preset behaviour. Mitigation: tweak per scenario, re-run the QA checklist for adjacent scenarios after any shared-component change.
- **Stop / checkpoint.** Checklist green for all Pack 1 scenarios; CI green; `LIVE` status set on all scenarios cleared by coach validation. Commit, push, stop. Pack 1 is ready for user testing.
- **Next prompt.** "Pack 1 (Decoder Foundations) is shipped. Begin Pack 2 planning per Section 8's optional `SKR-02` queue and the deferred-overlay roadmap in Section 6.7. Open a new planning document — do not extend this one."

---

## Section 10 — Validation Plan

Validation runs in **layers**, in this order. Each layer is cheap to run and catches a different class of failure. None replaces the next.

### 10.1 Build & lint layer

The first gate. Runs in CI on every commit and locally before each phase commit:

- `pnpm prisma:validate` — Prisma schema integrity (relations, enums, defaults).
- `pnpm typecheck` — TypeScript strict, including the Zod-inferred types backing seed JSONs.
- `pnpm lint` — ESLint preset across `apps/web` and `packages/*`.
- `pnpm test` — Vitest. Existing `coords`, `schema`, `timeline`, `scene` suites must stay green; phases B/D/E/H extend them.
- `pnpm build` — Next.js production build. Catches dynamic-import boundary breakage on the `/train` route and any SSR regression.

If any of these fail, the phase does not commit.

### 10.2 Seed & scenario-data layer

After build/lint passes, the seed pipeline validates content:

- `pnpm seed:scenarios` (and `pnpm seed:lessons`, or `pnpm seed:content` for both) — runs the Zod schema in `scripts/seed-scenarios.ts` plus the custom rules from Section 4.9. Idempotent; refuses bad data without partial writes.
- **Custom rules enforced:**
  - exactly one player has `isUser: true`
  - `wrongDemos[].choiceId` references a real `ScenarioChoice.id`
  - new scenarios (detected by presence of `decoderTag` or pack membership) include `decoderTag`, `freezeMarker` (or accept default), `preAnswerOverlays`, `postAnswerOverlays`, `feedback.correct`, `feedback.wrong`, `selfReviewChecklist` (≥2 items)
  - `lessonConnection` resolves to an existing `module_slug`
  - pre-answer overlays use only the allow-listed primitives from Section 6.3 (`defender_vision_cone`, `defender_hip_arrow`, `defender_foot_arrow`, `defender_chest_line`, `defender_hand_in_lane`, `help_pulse`, subtle `label`)
  - coach-validation gating per Section 4.6
- **BDW-01 fail-fast rule:** missing any of `decoderTag`, `freezeMarker` (or default applied), `bestRead`, `feedback.correct`, `feedback.wrong`, `selfReviewChecklist`, at least one `quality: 'best'` choice, or at least one `wrongDemos` entry rejects the scenario at seed time.
- **Dry-run against legacy fixtures:** the seven existing concept scenarios must continue to upsert with no JSON edits. If any legacy fixture fails after a schema change, the schema change is wrong (not the fixture).

### 10.3 Manual QA checklist (per scenario)

Captured in `docs/scenario-qa-checklist.md` (Phase L deliverable). Every authored decoder scenario passes the checklist before `status: 'LIVE'`:

1. **Intro / setup correctness.** Decoder chip, title, role assignment, and one-line context render and read for a 12-year-old.
2. **Pre-freeze playthrough timing.** 1.0–3.0 s; the cue is fully visible by freeze.
3. **Freeze framing rule.** Passer (or cue source), cue defender, user marker, ball, and rim line are all on screen at freeze for the chosen camera preset and anchor.
4. **Pre-answer overlay discipline.** Only the allow-listed primitives present; no `passing_lane_open`, `drive_cut_preview`, or answer-line `open_space_region`.
5. **Choice presentation.** Exactly the choices the JSON declares, in `order`. Tap target sized for phone-width (≤ 390 px) usability.
6. **Consequence playback per choice.** Each non-`best` choice plays its `wrongDemos` entry within 1.5–2.5 s and reads as the failure the brief describes (deflection / ride / missed window). `best` short-circuits to `replaying`.
7. **Best-read reveal.** Reset to freeze positions is jitter-free. `answerDemo` plays in 2.0–3.0 s with post-answer overlays layered over 600–900 ms.
8. **Lesson panel content.** Decoder name, teaching point, and "Open lesson" CTA match the scenario JSON exactly. CTA routes to the right Academy module.
9. **Self-review checklist.** All listed items render; checkboxes accept input; "Next" advances cleanly.
10. **Progression update.** XP delta, IQ delta, streak flame, and any badge animations fire. Concept and decoder mastery rows both update.
11. **Reduced-motion behaviour.** OS-level "reduce motion" disables animated camera moves and dash flow, but freeze and overlays still read.
12. **Mobile layout.** No horizontal scroll, court fits, choices reachable with a single thumb.
13. **WebGL fallback.** With WebGL disabled, the 2D `<Court />` renders and the surrounding decoder UI still surfaces decoder framing.

### 10.4 Visual QA gate

The framing rule from Section 5.6/5.7 is checked manually against rendered output for every scenario at the resolved `freezeAtMs`. Hard requirement to ship `LIVE`. Captured screenshots live in `docs/screenshots/<scenario-id>/freeze.png` (mirroring the existing renderer-baseline practice).

### 10.5 Basketball-logic QA gate

A reviewer (initially the author; ideally a coach for medium/high validation scenarios) confirms:

- The cue is the cue a coach would point at.
- The best read is what a coach would teach.
- The acceptable read is genuinely acceptable (or it should be a wrong read).
- Wrong reads fail for the *basketball* reason the consequence shows.
- The decoder teaching point is portable — could the user apply this read in a different possession?

This is a content quality gate, not a code gate. Phase L bakes it into the QA checklist.

### 10.6 Coach-validation gate

Enforced at seed time per Section 4.6:

- `level: 'low'` — passes silently.
- `level: 'medium'` — seeder warning; no block.
- `level: 'high'` + `status !== 'approved'` + top-level `status: 'LIVE'` — **rejected** unless `--allow-unvalidated` flag is supplied (used only for staging dry-runs).

Pack 1 status at ship: BDW-01 / ESC-01 / AOR-01 are `low`/`medium` and ship `LIVE`. SKR-01 is `medium` and ships `LIVE`. Optional SKR-02 is `medium`–`high` and stays `DRAFT` until reviewed.

### 10.7 Regression risks

The phases must not break:

- **Legacy concept scenarios still play.** The seven existing fixtures (`closeouts`, `cutting_relocation`, etc.) continue to render and progress under the simple scene path with their existing `is_correct` semantics. CI dry-runs `pnpm seed:scenarios` against them after every schema change.
- **Legacy `is_correct` semantics resolve via the seeder.** Any legacy JSON shipping `is_correct: true | false` is translated to `quality: 'best' | 'wrong'` at seed time without JSON edits. The `is_correct` Prisma column stays populated for backwards compatibility.
- **`?simple=0` default does not regress non-decoder scenarios.** Phase G gates the default switch on `scenario.decoder_tag != null`; non-decoder scenarios continue to use whichever path they currently use.
- **Mastery transaction stays atomic.** Phase J adds a decoder-dimension `Mastery` write inside the existing `prisma.$transaction`. If the decoder write fails, the entire attempt rolls back — no half-written progression.
- **Bundle and frame-time budgets hold.** Renderer polish work merged through PR #51 set the current baseline; Phase E (overlay primitives) and Phase H (consequence playback) must not exceed it. Phase L verifies on a mid-tier mobile device.
- **Sentry breadcrumbs catch runtime fallbacks.** Unknown `decoderTag`, malformed `freezeMarker`, missing `wrongDemos` for a non-`best` choice, and overlay primitive type mismatches all log breadcrumbs and degrade gracefully without crashing the canvas. Phase L includes a forced-fault dev fixture to verify each path.

---

## Section 11 — API-Safe Execution Plan

The implementation playbook for Phase 1. These rules are derived from how this planning document was written — small commits survive stream timeouts; giant commits do not.

### 11.1 Micro-milestones only

- **One narrow phase per chat response.** Sections 9 phases A–L are sized to fit. If a phase feels like it will not fit, split it at the nearest stop/checkpoint inside the phase before starting work.
- **Never a giant refactor in one chat response.** A "small refactor" that touches more than 2–3 files is a multi-phase change.
- **No "while I'm here" cleanup.** A bug fix does not include surrounding refactor; a one-shot operation does not include a helper. Three similar lines is better than a premature abstraction.

### 11.2 Commit cadence

- **Commit after every meaningful phase.** Each phase in Section 9 ends with a commit. Each commit message follows the per-phase template in that phase's block.
- **Push every commit.** A commit that has not been pushed has not survived a stream timeout.
- **No squash before push.** Each phase commit is a recoverable checkpoint; squashing erases the recovery surface.
- **One scope per commit.** `feat(schema): …`, `feat(db): …`, `content(scenarios): …`, `qa(pack1): …`. Mixed-scope commits make rollback expensive.

### 11.3 Output discipline

- **Never print full files.** Tool results carry the file content; the chat does not need to.
- **Never paste large diffs into the chat.** `git diff --stat` is the correct summary.
- **No marketing copy.** This is an architecture document and an implementation playbook.

### 11.4 Stop and checkpoint discipline

- **Before any change that touches more than 2–3 files, stop and checkpoint.** Confirm the plan, then proceed.
- **At the first sign of a long response, stop and checkpoint.** Long responses time out. Short responses commit.
- **At every checkpoint, give the exact next prompt.** A checkpoint without a next prompt is a half-checkpoint.

### 11.5 Recovery from stream timeout

If a stream timeout occurs mid-phase:

1. Do **not** restart from scratch.
2. Run `git status` to see what is on disk and what is committed.
3. Pick up from the last good commit; the next phase prompt is in this document under that phase's "Next prompt" line.
4. If a partial file write was lost, the planning document is the source of truth — re-derive the lost work from the relevant section.
5. Never delete partial work; commit it with a clear message ("WIP: …") if necessary, but prefer to recover and finish the phase cleanly.

### 11.6 Coach review and high-validation pause

- **Scenarios with `coachValidation.level: 'high'` always pause for coach review** before `status: 'LIVE'`. The seeder enforces this; the override flag exists only for staging dry-runs.
- **Medium-validation scenarios produce a seeder warning.** A reviewer (author, then ideally a coach) signs off in `coachValidation.notes` and updates `status: 'reviewed'` or `'approved'` before merge.
- **Low-validation scenarios ship clean.** BDW-01 is the canonical example.

### 11.7 Runtime fallback discipline

- **Sentry breadcrumbs over crashes.** Unknown `decoderTag`, malformed `freezeMarker`, missing `wrongDemos`, and overlay-primitive mismatches log a breadcrumb and degrade visually without crashing the canvas.
- **2D `<Court />` stays as the WebGL-unavailable fallback.** Do not remove it. Do not extend it with decoder overlays.
- **Reduced-motion mode stays first-class.** Animations downgrade; freeze, choices, and feedback continue to work.

### 11.8 Decoder framing in every commit message and PR

The four decoder names — **The Backdoor Window**, **The Empty-Space Cut**, **Skip the Rotation**, **Advantage or Reset** — are CourtIQ's headline vocabulary. Use them:

- In every commit message that touches decoder content (e.g., `content(scenarios): seed BDW-01 — Denied Wing Backdoor (Pack 1)`).
- In PR titles and descriptions.
- In Academy module slugs (`backdoor-window`, `empty-space-cut`, `skip-the-rotation`, `advantage-or-reset`).
- In analytics events (`scenario_completed` with `decoder_tag` as a property).
- In user-facing copy on the intro card, freeze prompt, lesson panel, and post-session summary.

The vocabulary is the product. Inconsistent naming across commits, files, and UI surfaces dilutes it.

### 11.9 What this document is, and is not

- **Is:** the source of truth for Phase 1 (Decoder Foundations). The schema sketches, scene contracts, overlay primitive set, BDW-01 build plan, engineering-phase order, validation layers, and execution rules above are how this phase ships.
- **Is not:** the implementation. Nothing in Section 9's twelve phases has been built yet. Beginning Phase A requires a new explicit instruction; this planning document does not authorise code work.

When Pack 1 is shipped per Phase L, **open a new planning document for Pack 2.** Do not extend this one. The `SKR-02` queue and the deferred-overlay roadmap in Section 6.7 are the seeds for that next document.

---

*End of Phase 1 planning document. Sections 1 through 11 complete.*
