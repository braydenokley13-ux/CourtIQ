# Progress & unlocks

This is what happens, in order, every time a player picks an answer.

## 1. The attempt request

Client (`/train`) calls
`POST /api/session/[sessionId]/attempt` with:

```json
{ "userId": "…", "scenarioId": "…", "choiceId": "…", "timeMs": 4500 }
```

The route is in `apps/web/app/api/session/[id]/attempt/route.ts`.

## 2. Inside one transaction

`prisma.$transaction(async (tx) => …)` runs all of these atomically — either
they all succeed or none do.

| Step              | Service                                  | What it writes                                           |
| ----------------- | ---------------------------------------- | -------------------------------------------------------- |
| IQ update         | `iqService.applyAttempt`                 | new `Profile.iq_score`, returns iq_before / iq_after     |
| XP award          | `xpService.award`                        | bumps `Profile.xp_total` and `Profile.level`             |
| Attempt log       | `tx.attempt.create`                      | new `Attempt` row, joined to the `SessionRun`            |
| Session totals    | `tx.sessionRun.update`                   | `correct_count`, `xp_earned`, `iq_delta` increments      |
| Mastery rolloff   | `masteryService.update`                  | upserts `Mastery` for each `concept_tag` on the scenario |
| Streak tick       | `streakService.tick`                     | upserts today's `StreakEvent`, updates streak counters   |
| Badges            | `badgeService.checkAndAward`             | inserts `UserBadge` rows when criteria are met           |

## 3. Response

The route returns:

```json
{
  "is_correct": true,
  "feedback_text": "...",
  "iq_delta": 4,
  "xp_delta": 12,
  "iq_after": 524,
  "xp_total": 312,
  "level": 4,
  "streak": 3,
  "badges_awarded": [{ "slug": "first-100", "family": "MILESTONE" }]
}
```

`/train` reads this and shows praise, the floating XP toast, the combo flame,
and any new badges.

## 4. Unlock logic

`apps/web/lib/services/academyService.ts` derives the `state` of every module:

```text
if any prerequisite module is NOT mastered      → 'locked'
else if attempts >= 5 AND rolling_accuracy >= 0.8 → 'mastered'
else if attempts > 0                              → 'in_progress'
else                                              → 'new'
```

`prerequisite_module_ids` lives on the seed JSON. A locked module shows the
list of prerequisites and is unclickable.

Mastery thresholds are tuned for kids (lower attempts requirement, higher
accuracy bar). Edit `ACADEMY_THRESHOLDS` in
`apps/web/lib/services/academyService.ts` if you need to retune.

## 5. Streaks

`streakService.tick` is called inside every attempt transaction:

- If the latest `StreakEvent` was yesterday → extend (current + 1)
- If it was today → unchanged
- If it was older than yesterday → broken (current = 1)

The home screen and the `/train` header show the current streak. A streak-of-1
day still shows so kids see momentum on day one.

## 6. Sanity checks for content authors

After running `pnpm seed:lessons` and `pnpm seed:scenarios`:

- Every `module.concept_id` should exist as a `Scenario.concept_tags` value
  somewhere — otherwise the lesson's "Practice" button hits zero scenarios and
  shows an empty state.
- Every `prerequisite_module_ids` value should match an existing `module_slug`.
  The seeder enforces this, but double-check after deletions.

## 7. Where to look when something feels off

| Symptom                                       | Look here                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Lesson stays "Locked" forever                 | `prerequisite_module_ids` + `Mastery.rolling_accuracy` for that user     |
| `/academy` card shows 0 plays                 | Scenario `concept_tags` doesn't include the module's `concept_id`        |
| XP not increasing                             | `xpService.award` was passed `amount: 0` (only correct picks award XP)   |
| IQ delta of 0                                 | Tuned by difficulty in `iqService.applyAttempt`                          |
| Streak not growing                            | Local timezone / `StreakEvent.date` mismatch — events are stored in UTC  |
