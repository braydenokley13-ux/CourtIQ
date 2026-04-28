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

*Sections 5.2 onward, plus Section 6 (Overlay System Plan), Section 7 (BDW-01 Build Plan), and Sections 8–11 are pending micro-milestones.*
