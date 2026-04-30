# Phase K — Trainer correction screenshot QA checklist

Phase K is a four-fold correction pass on top of Phase J:
fullscreen layout, gameplay-camera composition, motion smoothness,
and athlete proportions. The targeted unit tests
(`Scenario3DCanvas.test.tsx`, `replayStateMachine.test.ts`,
`imperativeScene.athlete.test.ts`) cover the determinism / disposal
/ indicator contracts but do **not** cover product feel — that
gap is what this manual checklist fills.

If automated screenshots via `pnpm qa:screenshot` are available,
prefer that path; the checklist below maps each Phase K issue to the
specific frame the reviewer should inspect. If not, the checklist
documents the manual capture flow so the reviewer can produce the
same evidence by hand.

---

## Capture matrix (BDW-01)

The screenshots that prove Phase K landed are taken on BDW-01, the
canonical decoder scenario, in the following six configurations:

| # | mode      | window      | replay rate | premium athlete | notes                                  |
|---|-----------|-------------|-------------|-----------------|----------------------------------------|
| 1 | embedded  | Mac/Chrome  | 1x          | on              | default trainer, default camera        |
| 2 | embedded  | Mac/Safari  | 1x          | on              | confirms Safari fullscreen layout fix  |
| 3 | fullscreen| Mac/Chrome  | 1x          | on              | the Phase K fullscreen layout fix      |
| 4 | fullscreen| Mac/Chrome  | 0.5x        | on              | smoothness reads on slow-motion replay |
| 5 | fullscreen| Mac/Chrome  | 2x          | on              | smoothness reads on fast-motion replay |
| 6 | embedded  | Mac/Chrome  | 1x          | off             | Phase F fallback still renders         |

If only Mac/Chrome is available, capture rows 1, 3, 4, 5, 6 and
note Safari as deferred. Row 2 is the only Safari row and exists to
catch any vendor-specific `:fullscreen` regressions.

---

## What to look for in each screenshot

### Row 1 (embedded, Mac/Chrome, 1x, premium on)

- [ ] Court fills the canvas with no large gray border around the
      action.
- [ ] Players read as athletic shapes — visible thigh / calf mass,
      visible torso / shoulder mass; no stick-figure feel.
- [ ] The wing area where the BDW-01 read happens is roughly
      canvas-centred, not pushed to the upper third.
- [ ] Defenders no longer wear a forearm cuff (Phase K removed it).
- [ ] The ball-handler's right wrist shows a slim possession band.
- [ ] Indicators (chevron, possession ring, stance halo) are
      positioned correctly above / under the figures.

### Row 2 (embedded, Mac/Safari, 1x, premium on)

- [ ] All checks from row 1.
- [ ] No extra gray strip at the canvas top or bottom (a Safari
      flexbox-quirk symptom that the Phase K resize-dispatch
      addressed).

### Row 3 (fullscreen, Mac/Chrome, 1x, premium on)

- [ ] The court fills the entire viewport. There is **no** large
      black band at the bottom of the screen — that was the
      headline Phase K screenshot defect.
- [ ] The court is roughly canvas-centred vertically, not stuck in
      a top band.
- [ ] The PremiumOverlay controls (camera selector, paths, transport)
      remain visible and clickable in fullscreen.
- [ ] Pressing `Esc` returns to embedded mode without leaving a
      stale fullscreen sizing.

### Row 4 (fullscreen, Mac/Chrome, 0.5x, premium on)

- [ ] Watch a single player segment from rest → motion → rest at
      0.5x. The acceleration off rest should look smooth, not
      snap-explosive (Phase K replaced `easeOutCubic` with a
      front-weighted athletic ease that has zero start derivative).
- [ ] Watch a defender during a holder swing. The body yaw should
      read as a confident reaction, not a twitch (Phase K relaxed
      the defender yaw constant from 0.10s to 0.14s).
- [ ] Confirm the play still arrives at the same final positions
      it did at 1x — Phase K is a smoothness pass, not a timing
      pass, and replay determinism is preserved.

### Row 5 (fullscreen, Mac/Chrome, 2x, premium on)

- [ ] At 2x speed the segment-start ramp is shorter but should
      still read as smooth, not stutter at segment boundaries.
- [ ] Pass arrival camera shake (the existing polish hook) should
      still trigger; verify it doesn't visually cumulate at higher
      speeds.

### Row 6 (embedded, Mac/Chrome, 1x, premium off)

- [ ] Toggle `USE_PREMIUM_ATHLETE` off in `imperativeScene.ts` and
      reload, OR set the URL escape hatch if one exists.
- [ ] The Phase F fallback figure must still render — thinner
      proportions, no trap dome, no shoulder piping, no jaw plane.
      This row is the cheap insurance against a future regression
      in the premium builder.

---

## Defect → root-cause pointer

When a screenshot finds a defect, the entry below points at the
narrowest file that owns the contract.

| defect                                      | first place to check                                   |
|---------------------------------------------|--------------------------------------------------------|
| Black band in fullscreen                    | `app/globals.css` `[data-fullscreen='true']` rules      |
| Court not centred vertically                | `imperativeScene.ts` `BROADCAST_LOOKAT` / `computeAutoTarget` |
| Court too small / too far                   | `imperativeScene.ts` `BROADCAST_POSITION` / auto `padding`     |
| Stick-figure athletes from broadcast        | `imperativeScene.ts` `ATH_*` proportion constants       |
| Choppy / robotic player movement            | `lib/scenario3d/timeline.ts` `easeOutAthletic`          |
| Twitchy defender body yaw                   | `imperativeScene.ts` `YAW_TIME_CONSTANT_DEFENSE_S`      |
| Visible jitter on near-stationary defender  | `imperativeScene.ts` `MOVEMENT_DIRECTION_EPS_SQ`        |
| Defender forearm cuff still showing         | `imperativeScene.ts` `upgradePremiumRoleReadability`    |
| Premium athlete fails to render             | `buildPlayerFigure` try/catch — Phase F path is the live fallback |

---

## Out of scope for this checklist

- Coach / teaching-clarity review of stance accents (separate pass).
- License-clean GLB athlete experiment (still gated on the J1–J7
  follow-up tickets in the recovery plan).
- SkinnedMesh / AnimationMixer evaluation (still rejected for
  Phase K; revisit only if root-motion smoothing proves
  insufficient after this checklist runs).
