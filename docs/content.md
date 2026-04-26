# Content authoring

Two kinds of content power CourtIQ:

1. **Lessons** — short readable explainers (under `packages/db/seed/lessons/`)
2. **Scenarios** — court-state plays the player answers (under
   `packages/db/seed/scenarios/`)

A module = one lesson + a set of scenarios that share its `concept_id`.

## Add a lesson

1. Create `packages/db/seed/lessons/<concept>.json`. See
   [docs/lessons.md](./lessons.md) for the file shape and the interactive
   block reference (`tip`, `mistake`, `quiz`, `reveal`, `takeaway`, `coach`,
   `scenario`).
2. Set `concept_id` to the value the matching scenarios already use in their
   `concept_tags` array. This is the join.
3. Run `pnpm seed:lessons`. The seeder validates with Zod, refuses to write
   on duplicates or unknown prereqs, and is idempotent.

## Add a scenario

1. Create or edit a JSON file under `packages/db/seed/scenarios/<concept>.json`.
   See `packages/db/seed/scenarios/README.md` for the shape.
2. The `concept_tags` array must include the `concept_id` of the lesson that
   teaches this scenario.
3. Status `LIVE` makes the scenario appear in sessions; `DRAFT` keeps it out.
4. Run `pnpm seed:scenarios`.

## Run both at once

```sh
pnpm seed:content
```

Equivalent to `pnpm seed:scenarios && pnpm seed:lessons`.

## Writing for kids

Every string in the app — lessons, scenarios, prompts, choices, feedback,
errors, buttons — must be readable by a 12-year-old.

Rules:

- Short sentences. One idea each.
- Plain words. Explain any basketball term you can't avoid.
- No coach-speak. ("Your weak-side defender has shifted visual attention" → "Your defender looked away.")
- Confident, fun tone. ("Smart move!", "Got it!", "Try again — you got this.")
- No corporate language. ("Module mastery threshold achieved" → "You mastered this lesson.")

If a string is longer than ~80 characters or uses jargon, rewrite it.

## Where each kind of copy lives

| Where the user sees it             | File                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| Lesson body                        | `packages/db/seed/lessons/*.json` (`lesson.body_md`)              |
| Scenario prompt + choices          | `packages/db/seed/scenarios/*.json`                               |
| Choice feedback / explanation      | same scenario JSON (`feedback_text`, `explanation_md`)            |
| `/train` praise + transitions      | `apps/web/app/train/page.tsx`                                     |
| `/train/summary` rank + recap      | `apps/web/app/train/summary/page.tsx`                             |
| `/academy` headline + state labels | `apps/web/app/academy/page.tsx`                                   |
| Friendly error messages            | `apps/web/lib/errors.ts`                                          |

## Verifying before commit

```sh
pnpm prisma:validate     # schema + Zod schema checks
pnpm typecheck           # TS strict
pnpm lint
pnpm test
```

If you only changed a lesson JSON, you can also just run `pnpm seed:lessons`
locally and visit `/academy` to confirm the card looks right.
