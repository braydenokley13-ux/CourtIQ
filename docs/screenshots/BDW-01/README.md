# BDW-01 — Visual QA Screenshots

## Taking authenticated screenshots

The `/train` route requires a logged-in Supabase session. Follow these steps:

### 1. Start the dev server

```bash
pnpm dev
```

### 2. Capture your auth session (once per machine)

```bash
pnpm qa:auth
```

A headed Chromium window opens at `http://localhost:3000/login`. Log in
manually. The browser closes automatically and saves your session to
`.auth/courtiq-user.json` (git-ignored — never committed).

### 3. Take screenshots

```bash
pnpm qa:screenshot
```

Screenshots are written to `docs/screenshots/BDW-01/`:
- `debug.png` — canvas loaded state
- `debug-after-play.png` — after 3-second replay delay

To target a different scenario or base URL:

```bash
SCENARIO=ESC-01 pnpm qa:screenshot
BASE_URL=http://localhost:3001 pnpm qa:screenshot
```

---

# BDW-01 — Visual Upgrade Pass

Scope: small-commit visual redesign + learning-clarity pass for BDW-01
(THE BACKDOOR WINDOW). No new scenarios, no architecture changes, no
business/growth features. Targeted upgrades to the in-scenario rendering
pipeline so BDW-01 reads as a premium basketball learning product
instead of a toy.

## Visual upgrades made

### Player figures (`buildPlayerFigure` in `imperativeScene.ts`)

- **Capsule-based torso + shorts** instead of plain box geometry, so the
  silhouette reads as an athletic body rather than a stack of rectangles.
- **Athletic taper on the legs** (slightly thicker thigh, narrower
  calf), and the shorts cylinder is wider at the bottom than the top.
- **Jersey numbers**: every player wears a deterministic number painted
  onto the chest AND the back via a procedural canvas texture so the
  player reads as a real basketball jersey from any camera angle. User
  is always `0`, offense `4..9`, defense `20..25`.
- **Trim color**: each team color now has a paired trim (deeper
  saturation) used for jersey side stripes, shorts side stripes, and
  the chest band. Reads as a coordinated uniform set.
- **Hair cap**: a dark hemisphere on top of the head so figures don't
  read as featureless skin-toned spheres.
- **Athletic shoes**: white midsole stripe under each shoe sells the
  silhouette without extra meshes.
- **Denial pose**: when a defender is the closest defender to the user
  (or ball-handler), their arm raises into a denial stance — sells the
  BDW-01 "sitting on the pass" lesson visually before any overlay
  fires.
- **YOU identity**:
  - Bigger team ring with a thin white inner outline so it reads as a
    lit disc, not a fuzzy color blob.
  - Two-stage halo (bright inner + soft outer fade) so the user reads
    as a clear focal point at any zoom.
  - Larger floating mint chevron above the head with a dark outline
    cone behind it so it pops against bright gym walls.

### Court (`buildBasketballGroup` in `imperativeScene.ts`)

- **Procedural hardwood texture** with vertical planks, grain streaks,
  plank seams, and a soft varnish sweep — the floor reads as actual
  wood from any angle instead of a flat orange plane.
- **Deeper paint contrast**: a darker baseline trim band along the
  free-throw line edge of the paint sells the painted-on-wood look.
- **Soft warm rim glow**: a faint orange glow under the hoop area
  anchors the eye on the rim/paint without lighting the rest of the
  floor.
- **Updated palette**:
  - Floor: warm hardwood `#C77A36` with dark/light plank variation.
  - Paint: punchier royal `#0B5BD3` with `#063C92` trim.
  - Team colors: brighter offense `#2D8AFF`, deeper defense `#FF3046`,
    user mint `#3BFF9D`.
  - Rim: brighter orange `#FF6A1F`.
  - Backboard frame and pole: deeper navy/black tones for stronger
    contrast against the wood.

### Ball (`buildBasketball` in `imperativeScene.ts`)

- **Higher-resolution sphere** (36 segments vs 32) and richer pebble
  texture (384px vs 256px).
- **Soft contact shadow** disc under the ball so it never reads as
  floating.
- **Faint orange halo** around the ball so the eye finds it from
  broadcast distance even when it's next to a player.
- Slightly less rough material so the ball catches the new key/fill
  lighting without going glossy.

### Lighting (`buildBasketballGroup`)

- Brighter ambient (`0.45` vs `0.35`) and warmer hemisphere
  (`#fff5e0 / #1c2330` at `1.05`) so the gym reads as a real lit
  arena.
- Punchier warm key (`1.6` vs `1.35`) so hardwood and player jerseys
  hold real luminance.
- Cooler, slightly stronger fill (`0.65` vs `0.55`) keeps the off-side
  of player figures from going muddy.
- Tighter teal rim (`0.55` vs `0.45`) lifts player silhouettes off the
  back wall.
- New warm point light over the rim/paint area mimics arena spot
  lighting and centers the eye on the read.

### HUD / overlays (`PremiumOverlay.tsx`, `app/train/page.tsx`)

- **Concept chip**: brighter border, bigger letter-spacing, larger
  shadow, slightly bolder type so the orientation chip reads cleanly
  without competing with the court.
- **Decoder chip**: now carries a small mint pulse dot, larger
  letter-spacing, and a soft brand-colored shadow.
- **Reading-the-play indicator**: replaced the static "Reading…" text
  with a pulsing dot + "Reading the play…" copy so the user knows the
  scene is actively unfolding.
- **Scene caption**: pre-existing caption pill upgraded to a rounded
  card with brand-colored border, bigger inner padding, stronger shadow,
  and slight backdrop blur — sells the teaching beat instead of reading
  as a tiny status pill.

## Learning-clarity improvements

- **Defender denial pose** is now a built-in part of the figure
  rendering (not just an authored overlay primitive), so the BDW-01
  "sitting on the pass" read is visible from frame 1 even before any
  pulse rings or vision cones animate.
- **YOU identity layered cues**: bright team ring + white inner edge +
  outer mint halo + soft outer fade + floating chevron with dark
  outline. Five overlapping signals so kids never lose track of which
  player they are.
- **Better team color separation**: brighter offense blue and deeper,
  more saturated defense red read as clearly different teams against
  both the warm hardwood and the gym backdrop.
- **Jersey numbers** anchor the player as "a real basketball player"
  cognitively, which makes the lesson feel credible to parents/coaches
  without making the renderer expensive.
- **Stronger paint contrast** makes the active basket area
  unmistakable — the read is "the basket is open behind the defender"
  and the paint should be visually anchored.

## ADHD-friendly improvements

- **One clear focal point**: the user's mint identity stack pulls the
  eye to YOU first, then to the denying defender's red pose, then to
  the open paint. Three steps, in order, no clutter.
- **Higher base contrast** (deeper team colors, warmer floor, brighter
  paint, deeper trim) makes the scene read at a glance even on
  glare-heavy screens.
- **Cleaner HUD typography**: bigger letter-spacing on chips, stronger
  shadows so floating chrome reads as chrome (not part of the play).
- **Pulsing "Reading the play…" indicator** tells the user the scene
  is intentionally building, not stalled.
- **Snappier, more obvious YOU marker** — the floating chevron is now
  larger with a dark outline so it cannot be missed.

## Remaining known issues

- No new scenarios were added — BDW-01 is the only fully-decoded
  scenario in the founder pack. The rest of `Pack 1` (ESC-01, AOR-01,
  STR-01) still need their authored scenes.
- Camera orientation / positioning is unchanged in this commit.
  Tactical / replay presets continue to work but were not re-tuned.
- Player jersey numbers are deterministic by mount order within a team
  (offense `4..9`, defense `20..25`). If a future scenario authors more
  than 6 offense + 6 defense players, numbers will start cycling — fine
  for the current 4-on-4 decoder format but worth noting for larger
  scenes.
- Screenshots from a live `pnpm qa:screenshot` run could not be captured
  in this environment because the `/train` route requires authenticated
  Supabase credentials; the production CI/preview pipeline still
  exercises that capture path.

## Validation

| check                       | status  |
| --------------------------- | ------- |
| `pnpm typecheck`            | clean   |
| `pnpm lint`                 | clean   |
| `pnpm test` (96 tests)      | passing |
| `pnpm seed:scenarios --dry-run` | passing |
| `pnpm build`                | passing |
