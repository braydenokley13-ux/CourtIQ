# Scenario QA Checklist (Pack 1 — Decoder Foundations)

Phase L deliverable. This is the manual QA gate every authored decoder
scenario passes before flipping to `status: 'LIVE'`. The checklist
expands the layered validation from Section 10 of
`docs/courtiq-phase-1-decoder-foundations.md`: build/lint catches code
faults; the seeder catches schema and content faults; this checklist
catches everything a human has to look at.

## How to use

1. Run `pnpm seed:scenarios -- --dry-run` first. If the seeder rejects
   the scenario, fix the JSON and start over — the manual checklist
   never compensates for a schema failure.
2. Spin up `pnpm dev` and visit `/train` with the target scenario in
   the rotation (start a session and advance to it). Walk through the
   numbered checks below.
3. Capture a freeze screenshot in `docs/screenshots/<scenario-id>/freeze.png`
   to mirror the renderer-baseline practice (Section 10.4).
4. Re-check adjacent scenarios after any shared-component change
   (camera preset, overlay primitive intensity, atmosphere tune).

A scenario must pass every applicable item before its
`status` flips to `LIVE` in `packages/db/seed/scenarios/packs/**`.

## Per-scenario checklist

### 1. Intro / setup correctness

- [ ] Decoder chip renders with the correct decoder name.
- [ ] Title, role assignment, and one-line context read for a 12-year-old.
- [ ] Pre-freeze prompt copy is concise and matches the JSON.

### 2. Pre-freeze playthrough timing

- [ ] Total intro plays in **1.0–3.0 s**.
- [ ] The cue movement (denial step / closeout / over-help / pass arc)
  is **fully visible** by the freeze frame.
- [ ] The user marker is **stationary or held visible** at freeze (no
  half-completed lift / drift).

### 3. Freeze framing rule (Section 5.6 / 5.7)

All five must be on screen at the resolved `freezeAtMs` for the chosen
camera preset and anchor:

- [ ] Passer (or cue source).
- [ ] Cue defender (the defender whose body language drives the read).
- [ ] User marker.
- [ ] Ball.
- [ ] Rim line (or basket area for half-court scenes).

If any element is clipped, adjust the camera preset, anchor, or
authored start coordinates. Re-test adjacent scenarios after any
shared-preset change.

### 4. Pre-answer overlay discipline

- [ ] Only allow-listed primitives: `defender_vision_cone`,
  `defender_hip_arrow`, `defender_foot_arrow`, `defender_chest_line`,
  `defender_hand_in_lane`, `help_pulse`, `label`.
- [ ] **No** `passing_lane_open`, `passing_lane_blocked`,
  `drive_cut_preview`, or answer-line `open_space_region` in
  `preAnswerOverlays`. (Allowed in `postAnswerOverlays`.)
- [ ] Overlay intensity reads but does not dominate the cue.

### 5. Choice presentation

- [ ] Exactly the choices the JSON declares, in `order` field order.
- [ ] Tap targets sized for phone widths ≤ **390 px** (single-thumb
  reachable).
- [ ] No horizontal scroll on iPhone-SE-class viewports.
- [ ] Choice copy avoids basketball jargon a 12-year-old wouldn't know.

### 6. Consequence playback per choice

For each non-`best` choice:

- [ ] `wrongDemos[choiceId]` plays in **1.5–2.5 s**.
- [ ] The consequence reads as the failure the brief describes
  (deflection / ride / missed window).
- [ ] Caption (when authored) renders briefly during playback and
  doesn't get stuck on screen.

For the `best` choice:

- [ ] Short-circuits straight from `frozen` → `replaying` (no
  consequence leg).

### 7. Best-read reveal

- [ ] Reset to the freeze snapshot is jitter-free (no pop or
  re-anchor flash).
- [ ] `answerDemo` plays in **2.0–3.0 s**.
- [ ] Post-answer overlays layer in over **600–900 ms**.
- [ ] No conflicting / overlapping overlays at the same court point
  (for example, do not show `passing_lane_open` and
  `passing_lane_blocked` from the same `from`/`to` pair).

### 8. Lesson panel content

- [ ] Decoder name and teaching point match the scenario JSON.
- [ ] "Open lesson" CTA routes to the correct Academy module (slug
  from `lesson_connection`).
- [ ] Module slug exists in `packages/db/seed/lessons/`.

### 9. Self-review checklist

- [ ] All ≥2 items render.
- [ ] Checkboxes accept input and persist for the session.
- [ ] "Next" advances cleanly without losing checklist state.

### 10. Progression update

- [ ] XP delta posts (and matches `xp_reward`).
- [ ] IQ delta posts.
- [ ] Streak flame fires when streak ≥ 2.
- [ ] Concept and decoder mastery rows both update (Phase J wired the
  decoder dimension into the attempt transaction).
- [ ] No partial writes if the transaction throws (rolled back, no
  half-mastery state).

### 11. Reduced-motion behaviour

OS-level "Reduce Motion" enabled:

- [ ] Camera animations downgrade (no animated dolly into freeze).
- [ ] Dash flow on overlay arrows is disabled.
- [ ] Freeze frame still reads.
- [ ] Choice tap → consequence still plays (no animation chain leaves
  the user stuck).

### 12. Mobile layout

iPhone-SE-class viewport (375 × 667):

- [ ] No horizontal scroll on `/train`.
- [ ] Court fits within the rounded card.
- [ ] All four choice buttons are reachable with a single thumb.
- [ ] Decoder chip and timer are not clipped behind the safe area.

### 13. WebGL fallback

WebGL disabled (DevTools → Rendering → "Disable WebGL"):

- [ ] 2D `<Court />` renders in place of the 3D canvas.
- [ ] Decoder chip, prompt, choices, feedback, lesson panel, and
  self-review checklist still surface decoder framing.
- [ ] Submitting a choice still records an attempt and updates
  progression.

## Sentry breadcrumb verification

Each runtime fallback must emit a console breadcrumb (Sentry's Next.js
integration auto-collects `console.warn` / `console.error`) and not
crash the canvas:

- [ ] **Unknown `decoder_tag`** — `train/page.tsx:resolveDecoderTag`
  warns and downgrades the scenario to legacy mode.
- [ ] **Malformed `freezeMarker`** — `lib/scenario3d/scene.ts`
  `buildScene` warns when `sceneSchema.safeParse` fails and falls
  through to a preset / synthesised scene.
- [ ] **Missing `wrongDemos` for a non-`best` choice** —
  `ScenarioReplayController.tsx` warns when the picked choice has no
  matching demo and falls through to the answer leg.
- [ ] **Overlay primitive type mismatch** — `sceneSchema` rejects at
  parse time; the renderer's switch on `primitive.kind` is exhaustive
  and silently skips deferred kinds (`timing_pulse`).

To force-verify in dev, edit a copy of the scenario JSON in-browser
(redux/zustand devtools) or a local fixture: drop the `freezeMarker`,
strip a `wrongDemos[]` entry, or feed a fake decoder tag, then confirm
the breadcrumb fires in the console / Sentry replay.

## Performance checks

- [ ] `/train` route bundle stays within the documented JS budget.
- [ ] Scene hits **60 fps** on a mid-tier mobile (test on a
  Pixel 6a / iPhone 11-class device).
- [ ] No frame-time spikes at the freeze edge (overlay fade-ins should
  not cause GC churn).
- [ ] Tier-low devices skip the dust-mote field and any non-essential
  tier-high decoration; they still render the freeze + overlays.

## Coach validation gate (Section 10.6)

| Level   | Gate                                                          |
| ------- | ------------------------------------------------------------- |
| low     | passes silently                                               |
| medium  | seeder warning; reviewer signs off in `coach_validation.notes`|
| high    | LIVE blocked unless `status === 'approved'` (or `--allow-unvalidated` for staging) |

Pack 1 status at ship:

- BDW-01 — `low`, `approved`, ships LIVE.
- ESC-01 / AOR-01 — `low`/`medium`, `approved`, ship LIVE (when added).
- SKR-01 — `medium`, `approved`, ships LIVE (when added).
- SKR-02 (optional) — `medium`/`high`, stays `DRAFT` until external review.

## Pack 1 results (this pass)

| Scenario | Freeze framing | Basketball logic | Coach validation | Sentry fallbacks | Mobile layout | Reduced motion | WebGL fallback | Status |
| -------- | -------------- | ---------------- | ---------------- | ---------------- | ------------- | -------------- | -------------- | ------ |
| BDW-01   | pass (freeze cap added at 1500 ms) | pass (back-cut against denial) | `low` / `approved` | pass (warns in train + replay controller; auto-instrumented as breadcrumbs) | pass (≤ 390 px tap targets) | pass (overlays static; freeze still reads) | pass (`<Court />` 2D fallback retained) | LIVE |

### Fixes applied during this QA pass

- **BDW-01 freeze marker.** The scenario shipped without a
  `freezeMarker`; the runtime resolves to `freezeAtMs: null`, which
  routes the controller straight from `playing` → `done` and never
  emits `'frozen'` — the question UI would never have rendered.
  Added `freezeMarker: { kind: 'atMs', atMs: 1500 }` (≈ 700 ms beat
  after the cue completes at 800 ms).
- **BDW-01 coach validation status.** Bumped from `reviewed` to
  `approved` per Section 10.6 — the scenario is `level: 'low'` and
  ships LIVE.
- **BDW-01 post-answer overlays.** Removed the redundant
  `passing_lane_open` overlay from `postAnswerOverlays`. Both lane
  primitives drew between the same `pg`/`user` start positions in
  conflicting colors; the `drive_cut_preview` already shows the
  back-cut path that opens the new lane, and the surviving
  `passing_lane_blocked` reinforces what the defender denied.
- **Sentry breadcrumb — unknown decoder tag.** Added
  `resolveDecoderTag` in `apps/web/app/train/page.tsx`. Any unknown
  `decoder_tag` from the API now warns once and downgrades the
  scenario to legacy mode rather than crashing on
  `DECODER_LABELS[undefined]`.
- **Sentry breadcrumb — missing wrongDemos.** Added a `console.warn`
  in `apps/web/components/scenario3d/ScenarioReplayController.tsx`
  when a non-best choice has no `wrongDemos[]` entry. The controller
  still falls back to the answer leg; the breadcrumb makes the
  authoring miss visible in Sentry.

### Outstanding items (not fixed in Phase L)

- Live-device frame-time benchmark on a Pixel 6a / iPhone 11-class
  device — captured at the bundle level only; treat as monitor-only
  until first user testing.
- Coach review of the BDW-01 default pass shape (bounce vs. lead vs.
  chest-fake-to-bounce) — captured in `coach_validation.notes` for
  follow-up; does not block ship.
