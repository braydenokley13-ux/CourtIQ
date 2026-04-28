# CourtIQ Renderer Baseline

This document is the "before" reference for the
[Renderer Polish Plan](./courtiq-renderer-polish-plan-part2.md). Every
later packet (B–J) must produce a side-by-side comparison against the
artifacts defined here.

It is **deliberately frozen**. Do not edit baseline screenshots or
measurements once captured — capture new ones under a packet-specific
folder instead.

---

## 1. Why this packet exists

The live `/train` renderer currently shows a near-black canvas with only
a thin orange sliver of court at the bottom. The user cannot see
players, ball, spacing, or the defensive read. Without a frozen baseline
we cannot prove that later packets actually fix this.

## 2. Capture environment

This sandbox does not include browser automation (no Playwright,
Puppeteer, or Cypress in the repo, and no browser binary in the agent
environment), so the baseline is captured with a **manual protocol**.
The protocol is deterministic enough that any operator with a Chromium
browser can reproduce it.

## 3. Evaluation rig (fixed for all future packets)

Every packet's before/after must use exactly these settings.

### 3.1 Routes

- Production: `https://courtiq.app/train`
- Preview (current Vercel deploy used for the headline screenshot):
  `https://court-9gbc678g3-brayden-whites-projects-9b00092f.vercel.app/train`
  *(deploy URL rotates — capture against the latest preview if production
  is stale.)*

### 3.2 Primary evaluation scenario

`cutting_relocation_01` (file:
`packages/db/seed/scenarios/cutting_relocation.json`).

- `category`: `OFFENSE`
- `concept_tags`: `cutting_relocation`
- `user_role`: `off_ball_wing`
- Used in the headline screenshot at "DIFFICULTY 4".
- Question: *"After you pass from slot to wing, defender denies your
  return lane. Counter?"*

### 3.3 Secondary scenarios (for breadth)

Picked to cover offense, defense, and spacing concepts:

- `spacing_fundamentals_01` — spacing read clarity.
- `closeouts_01` — defensive reaction read.

If a packet only has time for one, use `cutting_relocation_01`.

### 3.4 Camera

- Camera mode: **`auto`** (default `?camera=auto` / no query param).
- Auxiliary captures for Packet B will also include `?camera=broadcast`
  and `?camera=tactical`.

### 3.5 Viewports

| Target  | Viewport         | Device-pixel ratio | Notes                    |
| ------- | ---------------- | ------------------ | ------------------------ |
| Desktop | 1440 × 900       | 1                  | Chrome window, no zoom.  |
| Mobile  | 390 × 844        | 3                  | iPhone 14 emulation.     |

### 3.6 Browser settings

- Chromium-based browser (Chrome / Edge / Arc).
- Cache disabled (DevTools → Network → "Disable cache").
- Theme: system dark.
- No browser extensions affecting rendering (1Password, dark-reader,
  etc. disabled for capture).

### 3.7 Capture timing

- Load the route, dismiss any onboarding modals.
- Wait until the scenario's first replay frame has fully painted (paths
  and players visible) **OR** ~3 seconds after the canvas mounts,
  whichever is later.
- Pause playback (`||` in the playback chip) before capturing so frames
  are deterministic.

## 4. Manual capture protocol

1. Open the route from §3.1 in Chrome.
2. Open DevTools → Toggle device toolbar.
3. Set viewport per §3.5 (desktop first, mobile second).
4. Navigate to `/train`, sign in if prompted, advance to the target
   scenario.
5. Wait per §3.7, then pause playback.
6. Use **DevTools → "Capture full size screenshot"** (Cmd/Ctrl+Shift+P
   → "screenshot"). Do not use OS screenshot — DevTools captures the
   viewport without browser chrome.
7. Save as `docs/screenshots/baseline/<scenario>__<viewport>__auto.png`.
   - Example: `cutting_relocation__1440x900__auto.png`
   - Example: `cutting_relocation__390x844__auto.png`
8. Repeat for each scenario in §3.2 + §3.3 and each viewport in §3.5.
9. Repeat once more for `cutting_relocation_01` with
   `?camera=broadcast` and `?camera=tactical` (desktop only) to give
   Packet B a camera-mode reference.

**Do not edit, crop, compress, or recolor baseline screenshots.** Save
PNG, lossless.

## 5. Required baseline artifacts

Place all baseline images under `docs/screenshots/baseline/`.

Required filenames:

- `cutting_relocation__1440x900__auto.png`
- `cutting_relocation__390x844__auto.png`
- `cutting_relocation__1440x900__broadcast.png`
- `cutting_relocation__1440x900__tactical.png`
- `spacing_fundamentals__1440x900__auto.png`
- `spacing_fundamentals__390x844__auto.png`
- `closeouts__1440x900__auto.png`
- `closeouts__390x844__auto.png`

Track each capture in §7 below.

## 6. Headline visual failures (recorded from current screenshot)

These are the failures every later packet is being measured against.
They come from the live screenshot reviewed in the polish plan, not
from assumption.

1. **Black void dominance** — ~80% of the canvas is dead black with no
   visible scene geometry, lights, or atmosphere.
2. **Court sliver at bottom** — only a thin orange/brown floor strip is
   visible at the very bottom edge. No painted lines, hoop, key, or arc
   visible from the default frame.
3. **Players invisible** — zero players visible in the captured frame.
   Either below the crop, too small, too dim, or culled.
4. **No identity cues** — even where geometry is implied, there is no
   way to tell offense vs defense or which player is the user.
5. **Flat black background** — no gym walls, ceiling falloff, bleachers,
   banners, or scoreboard. Breaks "indoor arena" illusion.
6. **No grounding** — no shadow, no reflection, no contact cue under
   anything.
7. **Overlay/court conflict** — replay chip, paths toggle, and playback
   bar (`0.5x / 1x / 2x`) sit on top of the only visible piece of court.
8. **Learning blocked** — the question text references a "return lane"
   and a "denial" that are not visualized in the scene at all.

## 7. Baseline measurement table

Fill in each row when capturing. Leave blanks if the operator cannot
measure a value — empty cells are still data.

| Scenario              | Viewport   | Camera    | Canvas px (W×H) | Court % of canvas | FPS (devtools) | Load to first paint | Notes                          | File                                                   |
| --------------------- | ---------- | --------- | --------------- | ----------------- | -------------- | ------------------- | ------------------------------ | ------------------------------------------------------ |
| cutting_relocation_01 | 1440×900   | auto      |                 | ~5–10% (sliver)   |                |                     | Headline failure scene.        | `cutting_relocation__1440x900__auto.png`               |
| cutting_relocation_01 | 390×844    | auto      |                 |                   |                |                     | Mobile reference.              | `cutting_relocation__390x844__auto.png`                |
| cutting_relocation_01 | 1440×900   | broadcast |                 |                   |                |                     | Camera-mode reference for B.   | `cutting_relocation__1440x900__broadcast.png`          |
| cutting_relocation_01 | 1440×900   | tactical  |                 |                   |                |                     | Camera-mode reference for B.   | `cutting_relocation__1440x900__tactical.png`           |
| spacing_fundamentals_01 | 1440×900 | auto      |                 |                   |                |                     | Spacing read breadth.          | `spacing_fundamentals__1440x900__auto.png`             |
| spacing_fundamentals_01 | 390×844  | auto      |                 |                   |                |                     | Mobile spacing.                | `spacing_fundamentals__390x844__auto.png`              |
| closeouts_01          | 1440×900   | auto      |                 |                   |                |                     | Defensive read breadth.        | `closeouts__1440x900__auto.png`                        |
| closeouts_01          | 390×844    | auto      |                 |                   |                |                     | Mobile defensive.              | `closeouts__390x844__auto.png`                         |

### 7.1 How to measure each cell

- **Canvas px** — DevTools → inspect the `<canvas>` inside
  `Scenario3DCanvas` → read its `width` / `height` attributes (not CSS).
- **Court % of canvas** — eyeball estimate to the nearest 5%. Goal in
  Packet B is to push this to roughly 50–70%.
- **FPS** — Chrome DevTools → Rendering panel → "Frame Rendering Stats"
  while replay plays.
- **Load to first paint** — Performance tab → record reload → capture
  time from navigation start to first non-empty canvas frame.

## 8. Before/after evaluation protocol (used by every later packet)

When a future packet finishes, the operator must:

1. Capture a matching `<scenario>__<viewport>__<camera>.png` for every
   row of §7 under
   `docs/screenshots/<packet-letter>-<short-name>/` (e.g.
   `docs/screenshots/B-camera-framing/`).
2. Place the new image next to the baseline (do not overwrite baseline).
3. Re-fill §7's measurement columns into the packet's own report.
4. Run the §6 checklist of headline failures and mark which were fixed.
5. Run the Section 6 checklist of
   `docs/courtiq-renderer-polish-plan-part2.md` (visual / learning /
   performance) and tick each item.
6. Reject the packet if a baseline failure is unchanged or if a new
   regression appears in any other scenario.

## 9. Snapshot of current renderer config (read-only)

Captured for reference so later packets can diff against it. **Do not
change these values in this packet.**

- Default canvas mount: `apps/web/components/scenario3d/Scenario3DCanvas.tsx`
- Imperative scene builder: `apps/web/components/scenario3d/imperativeScene.ts`
  - Ambient light intensity: `1.4` (white).
  - Directional light 1: intensity `1.1`, white.
  - Directional light 2: intensity `0.6`, cool blue tint.
  - No tone-mapping / exposure overrides observed in the imperative
    builder.
- Camera modes available: `auto | broadcast | tactical | follow | replay`
  (`apps/web/lib/scenario3d/feature.ts`).
- Default mode: `auto` (autofit).

## 10. What this packet did NOT do

- No camera, lighting, player, overlay, gym, or renderer code changes.
- No new scripts, dependencies, or test harnesses.
- No edits to existing tests.
- Screenshots themselves must be added by the operator using §4 — this
  packet only commits the protocol and the empty target directory.

## 11. Operator follow-up checklist

To fully complete Packet A, the operator with browser access should:

- [ ] Capture all 8 baseline PNGs into `docs/screenshots/baseline/`.
- [ ] Fill in §7 measurements.
- [ ] Commit the screenshots and the filled table separately
      (`docs/renderer: add baseline screenshots`).
- [ ] Then, and only then, hand off to Packet B.
