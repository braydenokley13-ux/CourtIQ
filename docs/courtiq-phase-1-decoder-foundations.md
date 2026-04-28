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
