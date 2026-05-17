# Tactical Templates — Authoring Guide

Templates compile to scenarios. Every variant in this tree materializes into a
fully-formed scenario JSON under `packages/db/seed/scenarios/packs/templates-v1/`,
which the existing seeder picks up like any other pack.

Authoring loop:

```sh
# 1. write or edit a template
$EDITOR packages/db/seed/scenarios/templates/BDW.denied-wing/template.json

# 2. write or edit a variant
$EDITOR packages/db/seed/scenarios/templates/BDW.denied-wing/variants/01-base.json

# 3. compile templates → packs/templates-v1/
pnpm exec tsx scripts/materialize-templates.ts

# 4. lint the variant set (warnings + repetition checks)
pnpm exec tsx scripts/lint-variants.ts

# 5. seed (existing pipeline; reads packs/templates-v1/ unchanged)
pnpm seed:scenarios
```

`pnpm seed:content` runs all of the above in order.

---

## File layout

```
templates/
  _schema.ts                              ← Zod schemas. Read this first.
  <DECODER>.<topic>/                      ← one template
    template.json                         ← tactical truth + scaffold
    variants/
      01-base.json                        ← prose + axis selections
      02-mirror.json
      03-disguised-d2.json
      ...
```

Convention: template id is `<DECODER>.<topic>` (e.g. `BDW.denied-wing`).
Variant ids are scenario ids materialized into the DB; use `<DEC>-T1-NN`
(e.g. `BDW-T1-01`). They must be globally unique across all packs.

---

## What templates own (variants cannot override)

- decoder_tag, category, concept_tags, sub_concepts
- cue_atoms, lesson_connection
- decoder_teaching_point, common_miss_reason, why_best_read_works
- scene skeleton (player slots, movements, freeze marker, answer demo)
- wrong demos (consequence replays — outcome-keyed)
- overlay recipe (with disguise menu)
- choice scaffold (quality + outcome — variants supply prose only)
- coach_validation (default; variants inherit)

## What variants own

- All player-facing prose: title, prompt, copy, feedback, explanation, choices
- `variation.user_slot`, `variation.mirror`, `variation.difficulty`,
  `variation.disguise`, `variation.clock_pressure`
- Per-slot `start` deltas (narrow positional tweaks only)
- `xp_reward`, `mastery_weight`, `render_tier`, `status`

## Prose-bank feedback fallback

A variant choice may omit `feedback_text`. When it does, the materializer
fills that choice's feedback from the template's `prose-bank.json` —
picking a skeleton for the choice's quality and filling it with the
bank's `slots` values. Hand-authored `feedback_text` always wins; the
bank only fills choices left blank.

To use the fallback: add a `slots` block to `prose-bank.json` (see any
shipped bank) and drop `feedback_text` from the variant choice, keeping
`label`. A variant that omits `feedback_text` with no bank/slots to fall
back to fails materialization with a named error.

## What variants must NOT do

- Change the correct answer
- Add new choice outcomes
- Author custom wrong demos
- Add overlays beyond what disguise removes
- Override the lesson connection or decoder

If you find yourself wanting any of these — author a new template.

---

## Disguise levels (template-defined, variant-selected)

| Level | What it removes / changes | Difficulty bump |
| --- | --- | --- |
| `none` | Nothing | template default (D1–D2) |
| `light` | One body cue overlay | +1 |
| `moderate` | Two body cue overlays | +1 or +2 |
| `heavy` | All but one cue; freeze compressed | +2 (boss-tier) |

Disguise is the cheapest difficulty knob. Use it before inventing new templates.

---

## Variation healthy mix

A solid template ships ~6 variants spread across these axes:

1. base (D-floor, no mirror, no disguise, default user_slot)
2. mirror (other side of the court)
3. user-slot swap (e.g. user is now the passer)
4. light disguise (one cue removed)
5. moderate disguise (two cues removed)
6. boss / chained read (handcraft this one — see below)

Lint flags a template that's just 5 mirror flips.

---

## Boss variants

A "boss" is **not** just a heavy disguise. A boss variant either:
- adds a competing-decoder distractor cue (the wrong answer is correct in a
  different decoder family), or
- chains a second movement post-freeze (delayed help-rotation that
  punishes a slow read).

Boss variants are handcrafted. Limit to one per template.

---

## Failure modes

The materializer refuses to write if:
- Two variants in a template share an identical variation signature
- A variant overrides more than 4 individual fields
- Disguise levels are non-monotone (heavy variant has lower difficulty than light)
- The materialized output fails the existing scenario Zod schema
- The materialized output exceeds the beginner overlay cap (≤3 pre / ≤3 post)

Fix the source, re-run.
