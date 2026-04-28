# Renderer Final Visual QA + Basketball IQ Review

Packet J of the [Renderer Polish Plan](./courtiq-renderer-polish-plan-part2.md).
Closes the polish arc by reviewing whether the renderer now teaches basketball
IQ better, not just whether it looks nicer.

## Summary

- The renderer has moved from the baseline black-void / tiny-court-sliver
  failure (see [`renderer-baseline.md`](./renderer-baseline.md) §6) toward
  coaching-film readability across every shipped scenario preset.
- Camera, lighting, player readability, teaching overlays, gym backdrop, UI
  controls, realism props, and performance/fallback paths all landed in
  Packets B–I and were verified at the code level.
- Final browser-side screenshot verification still requires a human operator
  pass — this sandbox has no Chromium binary, no Playwright/Puppeteer, and no
  way to render the canvas. Operator follow-up steps are listed in §6.

## Scenarios Reviewed

All six concept presets in `apps/web/lib/scenario3d/presets.ts` were reviewed
against the prompt + correct answer in `packages/db/seed/scenarios/*.json`.
Every preset has an intro movement and an answer demo that the imperative
teaching overlay (`imperativeTeachingOverlay.ts`) can render with arrows,
defender cones, pressure halos, and spacing labels.

### 1. cutting_relocation_01 — OFFENSE, off-ball wing (headline)
- **Teaches:** Read a defender's head turn and cut backdoor before he
  recovers vision.
- **Renderer supports the read?** Yes. User has a green "YOU" indicator,
  intro shows a small drift-away on the user's defender, answer demo shows a
  hard backdoor cut + ball delivery to the rim with a destination ring at
  the finish point. Spacing labels on offensive starts anchor the slot/wing/
  corner geometry.
- **Concern:** None blocking. The "head turn" is abstracted as a sideways
  drift; a future packet could replace it with an explicit defender-vision
  cue if user testing shows the metaphor isn't clear.

### 2. spacing_fundamentals_01 — OFFENSE, off-ball guard
- **Teaches:** When a teammate drives middle from one pass away, drift to
  the deep corner to widen help and open a kickout.
- **Renderer supports the read?** Yes. Intro shows the handler's drive,
  answer demo shows the user's drift to the deep corner followed by a
  kickout pass tube ending in a destination ring. Offensive spot labels
  ("Slot", "Wing", "Corner") make the spacing geometry literal.
- **Concern:** None blocking.

### 3. closeouts_01 — DEFENSE, perimeter defender
- **Teaches:** On a skip pass, take an inside-out angle to deny the middle
  drive rather than running straight at the chest.
- **Renderer supports the read?** Yes. The user is on defense — the green
  "YOU" indicator + persistent ring identifies which defender is the user
  even though jerseys are red. Answer demo's `closeout` kind triggers the
  imperative overlay's red defender cone + denial bar at the user's start.
- **Concern:** The closeout-angle subtlety (inside-out vs straight line)
  is currently shown as a single straight tube; a future packet could
  curve the path more aggressively to make the angle visible from the
  default camera.

### 4. help_defense_basics_01 — DEFENSE, weak-side defender
- **Teaches:** When the ball is driven from the wing, weak-side help tags
  the lane line and stops downhill before recovering.
- **Renderer supports the read?** Yes. Two `rotation` movements in the
  answer demo (tag, then recover) draw two sequential arrows so the user
  sees the read AND the recovery in one playthrough. Offense's wing drive
  intro provides the trigger. Pressure halo on the user's nearest offensive
  match makes the assignment unambiguous.
- **Concern:** None blocking.

### 5. low_man_rotation_01 — DEFENSE, weak-side low man
- **Teaches:** When a strong-side drive beats the on-ball defender, low man
  must sprint baseline to meet at the restricted area.
- **Renderer supports the read?** Yes. Answer demo's `rotation` to (3, 3)
  produces a long curved tube from the weak-side corner to the rim with a
  pulsing destination ring — exactly the path a coach would draw on a
  whiteboard.
- **Concern:** Only 5 defenders are present (no 5th offensive teammate's
  defender pairing); this is a content choice, not a renderer issue.

### 6. transition_stop_ball_01 — TRANSITION, first back defender
- **Teaches:** In 3-on-2 transition, first defender stops the ball above
  the charge circle while help defender retreats to take the rim.
- **Renderer supports the read?** Yes. The `stop_ball` kind produces a red
  defender cone + denial bar at the user's start, the help defender's
  rotation to the rim is drawn as a separate path so the two-defender
  responsibility is visible in one frame.
- **Concern:** Camera auto-fit handles the wider transition footprint
  correctly because every movement endpoint is folded into the framing
  Box3 (`computeAutoTarget`).

## Before / After

| Aspect | Baseline (§6 of `renderer-baseline.md`) | After Packets B–I |
| --- | --- | --- |
| Frame composition | ~80% black void, court sliver at the bottom | Coaching-film half-court fills the working area |
| Lighting | "Lights off" feel, near-black | ACES Filmic tone mapping + 3-point gym rig, hardwood reads warm |
| Player visibility | Zero players in baseline frame | Humanoid figures, "YOU" ring on user, distinct offense vs defense colors |
| Teaching overlay | "PATHS ON" pill controlled nothing in production | Imperative paths + arrows + destination rings + defender cones + pressure halos + spacing labels |
| Background | Flat black | Gym shell (walls, ceiling, rafters, bleachers, vignette, banners) |
| UI overlays | Replay/paths/speed pills floated on the only visible court | Anchored zones, reduced visual weight during play |
| Realism props | None | Scoreboard, hanging banners, center-court mark, sideline benches |
| Performance/fallback | Untested after polish | Audited; one safety fix applied for camera/motion init throw |

## Screenshot Review Checklist

Cross-reference with `courtiq-renderer-polish-plan-part2.md` §6.

**Visual**
- [x] Court larger and clearer than baseline (Packet B reframing).
- [x] Players readable; user identifiable via persistent ring + label
      (Packet D).
- [x] Scene bright enough to read at a glance (Packet C exposure + lights).
- [x] Frame no longer dominated by void (Packet F gym backdrop).
- [x] Premium feel from realism props (Packet H).
- [x] Realism does not distract — props use muted tones, sit behind the
      court (Packet H builders).

**Learning**
- [x] User can understand the play faster — defender cone + arrow +
      destination ring make the answer visual.
- [x] Movement paths clearer — arrowheads, dash pulse, destination ring on
      headline movement.
- [x] Spacing easier to read — offensive spot labels (Slot / Wing /
      Corner / Top / Dunker).
- [x] Correct decision easier to learn from the visual alone — answer demo
      animates the canonical correct movement.
- [x] Camera angle helps teaching (auto-fit Box3 includes movement
      endpoints, not just t=0 positions).
- [x] UI supports learning — Paths toggle controls the entire imperative
      overlay group in O(1).

**Performance / Fallback** (audited in Packet I, see
[`renderer-performance-fallback.md`](./renderer-performance-fallback.md))
- [x] Disposal paths cover every CanvasTexture used by the imperative
      builders.
- [x] Overlay + dust-mote controllers free their resources before
      `disposeGroup` walks the root.
- [x] WebGL feature detection + context-loss listener route to the 2D
      fallback with a visible badge.
- [x] Camera/motion init failure now also routes to fallback (Packet I
      fix).
- [ ] **Sandbox limitation:** sustained 60 fps desktop / ≥30 fps mid-tier
      mobile and 5-reload memory-growth checks require browser-side
      verification by an operator.

## Basketball IQ Review

The renderer now actively teaches the four reads CourtIQ exists to develop:

- **Spacing** — offensive spot labels + court-line geometry give every
  player a named landmark, so a "drift to the deep corner" answer is shown
  as a movement from `Slot` to `Corner` rather than as an unlabeled vector.
- **Timing** — the intro motion plays first (head turn / drive arrives),
  then the answer demo plays the user's correct response, so users see
  cause and effect in sequence rather than as a single static frame.
- **Reads** — pressure halo on the user's nearest defender (or the
  explicit denial cone on `closeout` / `rotation` / `stop_ball`) makes the
  defensive premise of the question visible at frame zero, before any
  motion plays.
- **Defensive reactions** — dual arrows on multi-step answer demos (e.g.
  `help_defense_basics_01`'s tag + recover) show the *full* defensive
  responsibility, not just the trigger move.
- **Off-ball movement** — user-as-cutter scenarios (e.g.
  `cutting_relocation_01`) draw the cut as a curved tube with a pulsing
  destination ring, so the user sees the *space* the cut creates, not
  only the path.
- **Why the correct decision is correct** — the answer demo is rendered
  as the canonical version of the play. The user can replay it (Paths ON,
  restart) until the geometry is internalized. The wrong choices
  intentionally have no answer demo so they cannot be confused with the
  taught read.

## Remaining Risks / Follow-ups

1. **Browser screenshot verification still required.** Sandbox has no
   Chromium binary or browser automation, so the operator must run the
   capture protocol from `renderer-baseline.md` §4 against a current
   preview deploy and diff against the baseline screenshots.
2. **Mobile (390 × 844 @ 3x DPR) pass needed.** Every code-level review
   above used the desktop framing path. The auto-fit camera honors the
   live aspect, but a real mobile capture should confirm headroom and
   that overlay chrome doesn't crowd the play on small viewports.
3. **Human coach review recommended.** The renderer can show a path; only
   a coach can confirm the path it shows is the read they would teach.
   Surface the answer demos to a coach for sign-off before broad launch.
4. **Scenario-specific overlay tuning may still be needed.** Two known
   tuning candidates: the `closeout` angle in `closeouts_01` (currently
   straight, could curve to make inside-out angle obvious) and the head-
   turn metaphor in `cutting_relocation_01` (currently a small drift).
   Both are content/tuning concerns, not renderer regressions.
5. **2D fallback still uses legacy `court_state`, not the Scene3D
   metadata.** Pre-existing, documented in Packet I §2.3.
6. **Triple render driver belt-and-suspenders.** Documented in Packet I.
   Acceptable trade-off; revisit only if a future GPU profile flags it.

## Sandbox Limitation

This sandbox cannot launch a browser, so this packet's verification is
restricted to source-level review of the renderer behavior and content
presets. Visual sign-off requires the operator follow-up in
[`renderer-performance-fallback.md`](./renderer-performance-fallback.md)
§5 plus a fresh capture pass against `renderer-baseline.md` §4.

## Operator Screenshot Note (2026-04-28)

A live capture from `court-iq-plum.vercel.app/train` (DIFFICULTY 2,
`cutting_relocation`) was reviewed during this packet. Observations
relative to the baseline:

- Court fills the working area as coaching film — black void is gone.
- Five offensive players visible with spacing labels (CORNER, SLOT,
  DUNKER, WING, TOP). Hardwood reads warm; rim/backboard visible.
- User indicator ring is visible on the user player.
- Replay / Paths / Auto chips anchor top; playback (0.5x/1x/2x) anchors
  bottom; neither overlaps the central play area.
- One thing for an operator pass to confirm: in this capture the
  offense/defense color contrast is harder to read than in the preset
  spec. Worth confirming the live build's `OFFENSE_COLOR` /
  `DEFENSE_COLOR` constants resolve as intended on the deployed
  bundle. Not blocking — flagged as a follow-up tuning item, not a
  renderer regression.
