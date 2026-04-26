# 3D Scenario Engine — Architecture Plan (Phase 4)

CourtIQ's 3D scenario engine turns scenario training into a tactical 3D
basketball IQ simulator. It is intentionally **not** a video game: clarity,
mobile performance, and teaching value beat visual realism.

This doc captures the architecture that the Phase 4 sub-phases (4A → 4I)
implement. Treat it as the source of truth for how 3D scenes are wired into
the existing Next.js app.

## Goals

1. Render basketball scenarios in real 3D without breaking the existing 2D
   flow, scoring, XP, IQ, or session logic.
2. Be readable on phone screens — large markers, clear labels, simple colors.
3. Stay snappy on mid-tier mobile devices (target: 60fps, < 250 KB JS added
   to the train route).
4. Reuse a single component tree for question, replay, and explanation
   states.
5. Author scenes in JSON next to the existing scenario seeds.

## Non-goals

- Full physics or player AI.
- Realistic player models, jerseys, or rim physics.
- Network multiplayer or live match rendering.

## Stack decisions

| Concern | Choice | Why |
| --- | --- | --- |
| Renderer | `@react-three/fiber` | React-friendly Three.js binding, integrates with Next.js 15 / React 19. |
| Helpers | `@react-three/drei` | Pre-built `OrbitControls`, `Text`, `Line`, `Html`, `useGLTF`, etc. Cherry-picked imports keep bundle small. |
| Engine | `three` | Underlying WebGL engine. |
| Animation | `framer-motion` (already installed) for DOM, hand-rolled `useFrame` lerps for 3D. | Avoid pulling in `framer-motion-3d` until we need it. |
| Validation | `zod` (already installed) | Validate scene JSON in seed + at runtime. |

Estimated added bundle (gzip): `three` ~ 130 KB, `@react-three/fiber` ~ 35 KB,
`@react-three/drei` ~ 20 KB with selective imports. All loaded **only on the
training route**, behind a `next/dynamic` boundary.

## Client-only rendering

`react-three-fiber` requires a real DOM and WebGL context. To keep the rest
of the app SSR-friendly:

- The 3D canvas lives in `apps/web/components/scenario3d/Scenario3DCanvas.tsx`
  marked `'use client'`.
- The training page imports it through `next/dynamic` with `ssr: false` and a
  lightweight skeleton fallback that matches the existing 2D court box.
- The dynamic import is keyed by the train page route, so the WebGL bundle
  only ships when a user actually starts a session.

```tsx
const Scenario3DCanvas = dynamic(
  () => import('@/components/scenario3d/Scenario3DCanvas').then(m => m.Scenario3DCanvas),
  { ssr: false, loading: () => <CourtSkeleton /> },
)
```

## Fallback strategy

Three layers of fallback, in order:

1. **Reduced motion** — when `prefers-reduced-motion: reduce` is set, the 3D
   scene mounts but disables animated camera moves and movement trails.
2. **WebGL unavailable / context lost** — `Scenario3DCanvas` probes for
   WebGL on mount via a feature-detection hook (`hasWebGL()`). If absent or
   if the canvas fires a `webglcontextlost` event, the component renders the
   existing 2D `<Court />` from `components/court/`.
3. **Feature flag opt-out** — `NEXT_PUBLIC_DISABLE_3D=1` forces the 2D
   fallback. Useful for QA and emergency rollback.

The 2D `<Court />` is intentionally **not removed** in Phase 4 — it remains
the single source of truth for fallback rendering and content authors who do
not yet ship a `scene` block.

## Component architecture

```
Scenario3DCanvas             -- wrapper, sets up <Canvas>, lighting, camera, fallbacks
├── Court3D                  -- floor, paint, three-point line, hoop
├── PlayerMarker3D           -- single player (offense/defense/user) with label, glow
├── BallMarker3D             -- ball with optional trail
├── MovementPath3D           -- arrow / dotted line for cuts, rotations, passes
└── ScenarioReplayController -- drives time, plays movement keyframes
```

Hooks:

- `useScenarioSceneData(scenario)` — derives a normalised `Scene3D` object
  from a scenario. If the scenario carries an explicit `scene` block, it is
  validated with Zod and returned. Otherwise the hook synthesises a default
  scene from the legacy `court_state` (player positions are projected from
  the 500×470 SVG viewbox into court feet).
- `useReducedMotion()` — wraps the standard media query.
- `useHasWebGL()` — one-time WebGL feature probe.

State and animation:

- `ScenarioReplayController` owns a small state machine:
  `idle → question → answered(correct|wrong) → replaying → done`.
- It exposes `play()`, `reset()`, and a `progress` value (0..1) that
  `MovementPath3D` and `PlayerMarker3D` use to interpolate.
- All per-frame work happens in `useFrame` callbacks; React state is only
  updated at phase transitions (no per-frame `setState`).

## Coordinate system

We keep the visual layer in **court feet** to make scene authoring legible
for basketball coaches.

- Origin `(0, 0)` is **center of the rim**.
- Positive `x` runs from the rim toward the right sideline.
- Positive `z` runs from the rim out toward half-court.
- Y is height (always 0 for floor markers, > 0 for the rim and ball).
- Half-court is 50 ft wide × 47 ft long, so `x ∈ [-25, 25]`,
  `z ∈ [0, 47]`.

The legacy 2D viewbox (500 × 470 px, hoop at `(250, 52)`, half-court line at
`y = 450`) is mapped by `projectLegacyCourtState`:

```
x_ft = (px_x - 250) * (50 / 460)
z_ft = (px_y - 52)  * (47 / 398)
```

This projection lives in `lib/scenario3d/coords.ts` and is unit tested.

## Data shape

Authors add an optional `scene` field next to `court_state` in scenario JSON:

```jsonc
{
  "scene": {
    "type": "weak_side_cut",
    "court": "half",
    "camera": "teaching_angle",
    "players": [
      {
        "id": "user",
        "role": "user",
        "team": "offense",
        "label": "You",
        "start": { "x": -18, "z": 8 }
      }
    ],
    "ball": { "start": { "x": 0, "z": 0 }, "holderId": "ball_handler" },
    "movements": [
      {
        "id": "cut",
        "playerId": "user",
        "kind": "cut",
        "to": { "x": 0, "z": 4 },
        "delayMs": 200,
        "durationMs": 900
      }
    ],
    "answerDemo": [
      { "playerId": "user", "kind": "cut", "to": { "x": 0, "z": 4 } },
      { "playerId": "ball", "kind": "pass", "to": { "x": 0, "z": 4 } }
    ]
  }
}
```

Required:

- `players[]` — at minimum one player marked `role: "user"`.
- `ball.start` — initial ball location.

Optional:

- `court` — `"half"` (default) or `"full"`.
- `camera` — `"teaching_angle"` (default), `"defense"`, `"top_down"`.
- `movements[]` — initial setup motion played before the question.
- `answerDemo[]` — replay shown after the user answers.

The full Zod schema lives in `lib/scenario3d/schema.ts`. It is **additive**:
existing scenarios without a `scene` block still validate and seed.

## Migration plan for existing scenarios

Phase 4 keeps every existing scenario working with zero edits:

1. Phase 4A–4C: 3D engine renders **only** scenarios whose 3D feature flag is
   enabled (`NEXT_PUBLIC_ENABLE_3D=1` for now, on by default in dev).
2. Phase 4D: Scene schema is added but optional. The seeder accepts JSON with
   or without a `scene` block.
3. Phase 4G: We backfill scenes for the 6 launch concepts (closeouts,
   cutting-relocation, help-defense, low-man-rotation, spacing,
   transition-stop-ball) by editing their seed JSON files.
4. Anything missing a scene falls back to a deterministic auto-scene
   generated by `useScenarioSceneData` from `court_state`.

## Performance budget

- Single `<Canvas>` per scene; no nested canvases.
- `dpr={[1, 2]}` — caps device pixel ratio at 2× for retina without burning
  battery.
- Geometry is shared via React module-level `useMemo` (one cylinder geometry
  for all player markers, one sphere for the ball).
- Lighting: one `ambientLight` + one `directionalLight`; no shadows by
  default, soft `contactShadows` enabled only on `render_tier >= 2` content.
- Lazy-load `OrbitControls` and `Text` from drei via subpath imports.

## Testing notes

Automated:

- `lib/scenario3d/coords.test.ts` — projection / unprojection round-trip,
  half-court bounds.
- `lib/scenario3d/schema.test.ts` — Zod validation accepts well-formed
  scenes and rejects duplicate ids, multiple users, unknown movement
  targets, bad ball holders.
- `lib/scenario3d/timeline.test.ts` — chained movements share start/end
  times, sampling produces interpolated positions, idle players hold their
  start.
- `lib/scenario3d/scene.test.ts` — preset selection by concept tag,
  authored-scene precedence, graceful fallback when authored scene is
  malformed.

Run with:

```bash
pnpm --filter @courtiq/web test
```

Manual QA matrix (run before shipping a scene change):

| Check | How |
| --- | --- |
| All 6 launch concepts render with distinct visuals | Start a session for each concept (`/train?concept=closeouts`, etc.) |
| Existing scenarios with no `scene` block still render | Pick any older scenario; preset or synth fills in |
| Answer flow still works (XP, IQ, streaks) | Submit a correct + an incorrect choice in the same session |
| Replay plays and "Show me again" replays it | Answer, watch the answer demo, hit the button |
| Captions appear during replay | Authored scenes with `caption` strings should show them |
| Mobile (≤390 px) layout | DevTools mobile emulation, no horizontal scroll, court fits |
| Reduced motion | OS-level "reduce motion"; ball stops bouncing, user ring stops spinning |
| WebGL fallback | DevTools "Disable WebGL" or `NEXT_PUBLIC_DISABLE_3D=1`; 2D court appears |
| No SSR hydration warnings | View `/train` page source → no `Scenario3DCanvas` markup, only fallback |

## Authoring docs

- [Scene authoring guide](./scene-authoring.md) — schema, coordinate
  system, examples.
- [Scenario seed README](../packages/db/seed/scenarios/README.md) — DRAFT →
  REVIEW → LIVE workflow and the existing scenario JSON shape.
