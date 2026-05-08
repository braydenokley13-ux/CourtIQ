# BDW.late-clock-corner-deny — Pack 2 gold-standard reference template

This template is the **canonical Pack 2 reference**. It is intentionally
simple in basketball content (a baseline back-cut every coach teaches)
so the architectural decisions stand out. Use it when authoring a new
Pack 2 template; everything below the §3.1 lint floor is demonstrated
end-to-end here.

## What this template demonstrates

| Concern | Where to look |
| --- | --- |
| Decoder enum (Pack 1 family) | `decoder_tag: BACKDOOR_WINDOW` |
| Concept-tag enum (Pack 2 §3.1.1) | every entry in `concept_tags` is in the `_schema.ts` enum |
| Cue-atom vocabulary (Pack 2 §3.1.12) | `tactical.cue_atoms: ["hand_in_lane"]` — single cue at D3 |
| Per-difficulty cognition hold (Pack 2 §3.1.4) | `scene.timingOverrides.cognitionHoldMs: 1200` (D3 target) |
| Decoder camera preset (Pack 2 §3.1.3) | `scene.camera: passer_side_three_quarter` (BDW default; no lint warn) |
| Decoder overlay preset (Pack 2 §3.1.2) | `overlays.pre` uses only kinds the BDW preset allows |
| Difficulty-aware overlay caps (Pack 2 §3.6) | 2 pre / 4 post — exactly matches the D3 ceiling |
| Per-non-best-choice wrong demo (Pack 2 §3.1.9) | 3 entries in `scene.wrongDemos` for 3 non-best choices |
| Cross-pack signature differentiation (Pack 2 §3.1.8) | `user_role: strong_corner_shooter` ≠ founder-v0 BDW-05's `off_ball_wing` at D3 |
| Coach validation (Pack 2 §3.1.10) | `level: low` + `status: approved` (no bypass exists) |
| Disguise menu | `light` and `moderate` defined; `heavy` deferred until variant matures |

## Variants ship-ready checklist

`BDW-T2-01` ships in `DRAFT` status with TODO prose so the lint
catches it as a warning (correct rule for DRAFT). Promotion to
`REVIEW` requires:

1. Replace every `TODO:` in `variants/01-base.json:copy`. `pnpm
   templates:lint` flips DRAFT-warns to REVIEW-errors at status flip.
2. Use the `prose-bank.json` skeletons as a starting point. Each
   skeleton uses canonical slot identifiers (`{cue_atom_short_desc}`,
   `{action_short_desc}`, etc.) — see `_proseBankSlots.ts`.
3. Run `pnpm qa:screenshot baseline --id BDW-T2-01` once the variant
   is `LIVE` to lock the visual baseline.
4. Run the QA checklist (`docs/scenario-qa-checklist.md`) end-to-end.

## Why these architectural choices

- **Single cue atom (`hand_in_lane`)** at D3, not the founder's `[hand_in_lane, foot_in_lane]`. D3 cluster cap is 2; tightening the cue cluster also tightens the read.
- **`strong_corner_shooter` role** instead of the founder's `off_ball_wing`. The cross-pack collision lint requires this; the corner is also the only catch x2 cannot recover to with the clock under 8.
- **`shot_clock` clock_pressure axis** baked into `variation.clock_pressure`. The variation signature includes clock pressure, so cross-template collisions automatically distinguish clock-pressured Pack 2 variants from clock-neutral founder variants.
- **`timingOverrides.cueRepaintHoldWrongMs: 600`** (vs default 400). The wrong-demos teach a clock-expiration consequence; an extra 200ms of repaint hold gives the player time to register that the clock died, not just that the play stopped.
- **Disguise `heavy` deferred**. Every disguise tier costs review effort; we ship `none`/`light`/`moderate` for the base variant and add `heavy` when the variant matures.

## Future variants to scaffold

The template is designed to support four to six variants:

1. `02-mirror.json` — mirror of base
2. `03-as-passer.json` — `user_slot: passer` (re-author from PG perspective; tests `variation.overrides.players` substitution)
3. `04-light-disguise.json` — `disguise: light`, no clock pressure
4. `05-moderate-disguise.json` — `disguise: moderate` (drops the hip-arrow + compresses freeze 300ms)
5. `06-boss-game-clock.json` — `clock_pressure: game_clock` + tighter cognition hold (set `timingOverrides.cognitionHoldMs: 1100` — at the D5 floor)

Author each via `pnpm templates:scaffold BDW.late-clock-corner-deny --id BDW-T2-NN ...`
and let the lint matrix flag drift.
