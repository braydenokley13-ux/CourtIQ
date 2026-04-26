# Authoring 3D scenario scenes

Scenarios may include an optional top-level `scene` block that drives the
3D scenario engine (`apps/web/components/scenario3d`). Scenes are authored
right next to the rest of a scenario in the JSON files under
`packages/db/seed/scenarios/`.

## Why bother?

Without a `scene`, the 3D engine still renders the scenario by projecting the
legacy 2D `court_state` into 3D. That auto-projection is good enough for
QA but lacks:

- correct user marker (it falls back to whichever offensive player is `id:
  "you"` or matches `user_role`)
- movement animations
- correct-answer replay

Authoring a scene unlocks all of the above.

## Coordinate system

All coordinates are in **feet**.

- Origin `(0, 0)` is at the **center of the rim**.
- Positive `x` runs toward the right sideline (max ~25 ft).
- Positive `z` runs from the rim toward half-court (max ~47 ft).
- Half-court is 50 × 47 ft.

Useful landmarks:

| Spot | x | z |
| --- | --- | --- |
| Top of the key | 0 | 19 |
| Free-throw line | 0 | 15 |
| Right wing | 18 | 8 |
| Left wing | -18 | 8 |
| Right corner | 22 | 1 |
| Left corner | -22 | 1 |
| Right slot | 9 | 14 |
| Left slot | -9 | 14 |

## Schema

The full Zod schema lives in `apps/web/lib/scenario3d/schema.ts` and is
mirrored in `scripts/seed-scenarios.ts` so seeded JSON is validated.

```jsonc
{
  "scene": {
    "type": "weak_side_cut",          // optional label
    "court": "half",                  // "half" | "full" (default "half")
    "camera": "teaching_angle",       // teaching_angle | defense | top_down
    "players": [
      {
        "id": "user",
        "team": "offense",            // "offense" | "defense"
        "role": "weak_corner",
        "label": "You",               // shown above the marker; <= 8 chars
        "start": { "x": -18, "z": 8 },
        "isUser": true                // exactly one player may set this
      },
      {
        "id": "ball_handler",
        "team": "offense",
        "role": "ball_handler",
        "label": "PG",
        "start": { "x": 0, "z": 22 },
        "hasBall": true
      }
    ],
    "ball": {
      "start": { "x": 0, "z": 22 },
      "holderId": "ball_handler"
    },
    "movements": [],                  // played as soon as the scene mounts
    "answerDemo": []                  // played after the user answers
  }
}
```

### Movement entries

```jsonc
{
  "id": "lift_to_wing",
  "playerId": "user",                 // or "ball" for a pass
  "kind": "cut",                      // cut | closeout | rotation | lift |
                                      // drift | pass | drive | stop_ball
  "to": { "x": -18, "z": 14 },
  "delayMs": 200,                     // optional, default 0
  "durationMs": 900,                  // optional, default 700
  "caption": "Lift to the wing"        // optional, shown during replay
}
```

## Authoring workflow

1. Open the scenario JSON in `packages/db/seed/scenarios/<concept>.json`.
2. Add a `scene` block alongside `court_state`. You can copy from the
   matching preset under `apps/web/lib/scenario3d/presets/`.
3. Run the seed script — it validates the scene with Zod and refuses bad
   data:

   ```bash
   pnpm exec tsx scripts/seed-scenarios.ts
   ```

4. Boot the app and inspect the scenario in `/train`. The 3D canvas hot
   reloads on save.

## Tips

- Keep player counts under 6 per scene. Fewer markers = clearer teaching.
- Mark the user once — the schema rejects multiple `isUser: true` players.
- Set `hasBall: true` on the offensive player who starts with the ball *and*
  set `ball.holderId` to their id; the engine snaps the ball to the holder.
- If you skip authoring a scene, the engine falls back first to the
  matching concept preset (see `apps/web/lib/scenario3d/presets.ts`) and
  then to a synthetic scene built from `court_state`. That keeps existing
  scenarios working.

## Full example

A complete scenario JSON with both legacy `court_state` and a new `scene`
block lives at [docs/scene-example.json](./scene-example.json).
