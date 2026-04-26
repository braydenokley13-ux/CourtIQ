# Lessons

Each lesson is a JSON file under `packages/db/seed/lessons/`. The seeder
(`pnpm seed:lessons`) reads every `*.json` in that directory and upserts the
matching `Module` + `Lesson` rows.

## File shape

```jsonc
{
  "module_slug": "closeouts",            // unique, lowercase, hyphenated
  "title": "Closeouts",                  // shown on the academy card
  "concept_id": "closeouts",             // concept tag scenarios share
  "category": "DEFENSE",                 // OFFENSE | DEFENSE | TRANSITION | ...
  "order": 1,                            // sort order in /academy
  "prerequisite_module_ids": [],         // other module_slug values
  "lesson": {
    "order": 1,
    "title": "Stop the shot. Don't get blown by.",
    "body_md": "## What is a closeout?...",
    "media_refs": []
  }
}
```

## body_md = markdown + interactive blocks

The lesson body uses a small subset of markdown:

- `## H2`, `### H3`
- Paragraphs
- `- bullet`, `1. numbered`
- `> blockquote`
- inline `**bold**`, `*italic*`, `` `code` ``

Plus **fenced interactive blocks** that the lesson player styles distinctly
and can paginate one slide at a time:

| Fence       | Use it for                                                     |
| ----------- | -------------------------------------------------------------- |
| ` ```tip`        | A quick coaching cue                                       |
| ` ```mistake`    | A common mistake / "watch out"                             |
| ` ```takeaway`   | The headline you want kids to remember                     |
| ` ```coach`      | A short coach quote                                        |
| ` ```scenario`   | A mini story prompt without choices                        |
| ` ```reveal`     | Tap-to-reveal Q/A flashcard                                |
| ` ```quiz`       | One-question quiz with scored choices                      |

### `tip` / `mistake` / `takeaway` / `coach` / `scenario`

Plain text inside the fence. Example:

````markdown
```tip
A closeout is just three things: sprint, slow down, hand up.
```
````

### `reveal` — tap to reveal an answer

```
```reveal
Q: A great shooter just caught the ball at the wing. What do you take away?
A: Take away the shot. Closeout high with your hand up.
```
```

The `Q:` line(s) become the prompt, `A:` line(s) become the hidden answer.

### `quiz` — one-question quiz

```
```quiz
Q: You're sprinting at a great shooter. Where's your hand?
- Both hands down ✗
- High hand on their shooting side ✓
- Hands behind your back ✗
Why: A high hand makes them think twice. Two hands down is wide-open.
```
```

- The first line should start with `Q:`.
- Each `-` is an option. Mark the correct one with a trailing `✓` (or `[x]`).
- `Why:` is the explanation shown after the player picks.

## Pagination rules

The interactive lesson player groups blocks into "slides":

- Every `## H2` starts a new slide.
- Every `quiz`, `reveal`, or `takeaway` block gets its own slide.
- Other blocks collect ~3 per slide before flushing.

This means **you don't author slides directly** — you write a lesson body and
the player chunks it for you. Aim for a lesson that takes 3–5 minutes to read.

## Authoring style

Write for a 12-year-old reader.

- Short sentences. One idea per sentence.
- Plain words. Explain any basketball term you can't avoid.
- Lots of short blocks rather than one big essay.
- Use `tip`, `mistake`, `takeaway`, `quiz`, and `reveal` to break up reading.
- End the lesson with a `takeaway` block, then the line `Now try it in practice.`

## Adding a new lesson

1. Create `packages/db/seed/lessons/<slug>.json`.
2. Make sure the `concept_id` matches the `concept_tags` on the scenarios that
   teach this concept (`packages/db/seed/scenarios/`). Otherwise the
   "Practice" button on the lesson page will produce zero scenarios.
3. Run `pnpm seed:lessons` against your dev database.
4. Visit `/academy` to confirm the card shows up.

## Schema validation

The seeder validates each file with Zod and refuses to write if:

- `module_slug` is duplicated
- `prerequisite_module_ids` references an unknown slug
- Any required field is missing

So a bad file fails fast — it won't half-import.
