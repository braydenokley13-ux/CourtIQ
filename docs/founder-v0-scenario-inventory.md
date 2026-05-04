# Founder v0 — Scenario Inventory

**Pack:** `packages/db/seed/scenarios/packs/founder-v0/`
**Status:** 20 LIVE scenarios across 4 decoder families (5 per family).
**Authoring discipline:** every scenario is universally-taught youth basketball, `coach_validation.level: low, status: approved`, beginner clutter cap (≤3 pre / ≤3 post overlays), freeze cue inside the 1.0–2.5 s window, replay under the 4 s budget.

The seed format is documented in `scripts/seed-scenarios.ts` and `apps/web/lib/scenario3d/schema.ts`. Renderer compatibility is exercised by `apps/web/lib/scenario3d/founderScenarios.test.ts` (originals) and `apps/web/lib/scenario3d/founderExpansionScenarios.test.ts` (expansion).

---

## Backdoor Window (BDW) — 5 scenarios

| ID | Difficulty | Main cue | Best read | 3D readability requirement | Movement / animation intent |
| --- | --- | --- | --- | --- | --- |
| **BDW-01** | 1 | x2 hand + foot in passing lane (wing denial) | Plant outside foot, back-cut behind x2 to rim | Defender hand-in-lane visible; rim path between x2 and basket clear | `back_cut`+`pass`; cutter→`BACK_CUT`, denier→`DEFENSIVE_DENY` |
| **BDW-02** | 1 | x2 above the line of the ball (top-lock) | Plant top foot, back-cut behind to rim | Chest line on x2 above user's top foot; rim corridor empty | `jab`+`back_cut`+`pass`+`cut`; same intents as BDW-01 |
| **BDW-03** | 2 | x2 hand-in-lane + head turned to wing (corner denial) | Baseline back-cut along the lane to rim | Hand-in-lane + vision-cone on x2; baseline strip empty | `jab`+`back_cut`+`pass`+`cut`; passer is the wing, not pg |
| **BDW-04** | 2 | x1 stepped into reversal lane (slot denial) | Back-cut behind x1 through the elbow to rim | Hand-in-lane + chest-line on x1; elbow-to-rim corridor empty | `jab`+`back_cut`+`pass`+`cut` |
| **BDW-05** | 3 | x2 airborne in the passing lane (jumped the lane) | Back-cut while pass is in the air | Foot-arrow on x2 leaving the floor; timing pulse on the air pass | `jab`+`back_cut`+`pass`+`cut`; emphasizes timing-on-cue |

**Family animation intents required:** cutter→`BACK_CUT`, deny_defender→`DEFENSIVE_DENY`, passer→`PASS_FOLLOWTHROUGH`, receiver→`RECEIVE_READY`. All five scenarios reach these intents through the existing role-substring + movement-kind dispatch.

---

## Empty-Space Cut (ESC) — 5 scenarios

| ID | Difficulty | Main cue | Best read | 3D readability requirement | Movement / animation intent |
| --- | --- | --- | --- | --- | --- |
| **ESC-01** | 1 | x2 turned hips into paint to tag PG drive (corner cutter) | Baseline cut to rim into vacated paint | Help-pulse on x2; baseline corridor open between user and rim | `cut`+`pass`; cutter→`EMPTY_SPACE_CUT`, helper→`DEFENSIVE_HELP_TURN` |
| **ESC-02** | 1 | x2 stunted at the ball (wing-stunt) | Slide to dunker spot below ball | Hip-arrow + help-pulse(stunter) on x2; dunker spot empty | `cut`+`pass` |
| **ESC-03** | 1 | x3 hips turned to ball (45° help turn) | 45° cut from weak wing to rim | Hip-arrow + help-pulse(tag) on x3; diagonal lane clear | `jab`+`cut`+`pass` |
| **ESC-04** | 2 | x4 rotated into paint (low-man tag) | Lift from corner to wing for open shot | Help-pulse(tag) on x4; corner-to-wing lift area empty | `cut`+`pass` (kickout); intent: `RECEIVE_READY` on lift |
| **ESC-05** | 2 | x_slot stepped to the nail (nail-help dig) | Slash to strong-side elbow | Foot-arrow + help-pulse(nail) on x_slot; elbow open | `jab`+`cut`+`pass` |

**Family animation intents required:** cutter→`EMPTY_SPACE_CUT`, helper→`DEFENSIVE_HELP_TURN`, receiver→`RECEIVE_READY`, passer→`PASS_FOLLOWTHROUGH`. New `help_pulse` roles `stunter` and `nail` are already in the existing schema enum.

---

## Skip the Rotation (SKR) — 5 scenarios

| ID | Difficulty | Main cue | Best read | 3D readability requirement | Movement / animation intent |
| --- | --- | --- | --- | --- | --- |
| **SKR-01** | 2 | x4 left weak corner to tag PG drive | Skip cross-court to weak-side corner shooter | Help-pulse(overhelp) on x4; weak corner clear | `skip_pass`; passer→`PASS_FOLLOWTHROUGH`, open_player→`SHOT_READY` |
| **SKR-02** | 2 | x3 sank to wall up wing-drive | Skip to weak-side wing | Help-pulse(overhelp) + chest-line on x3; weak wing clear | `jab`+`skip_pass`+`lift` |
| **SKR-03** | 2 | Double team came from weak-side wing | Skip back to weak wing over double | Hip-arrow + chest-line on x3; weak wing clear | `jab`+`skip_pass`+`lift` |
| **SKR-04** | 3 | Drop coverage — screen-defender deep | Skip back to trail at top of key | Chest-line + help-pulse(overhelp) on x_screen; trail label visible | `jab`+`skip_pass`+`lift` |
| **SKR-05** | 3 | x3 x-outed to corner (second rotation) | Skip to weak-side wing (vacated by x-out) | Hip-arrow on x3; wing label visible | `jab`+`skip_pass`+`lift` |

**Family animation intents required:** passer→`PASS_FOLLOWTHROUGH`, open_player→`SHOT_READY`, helper→`DEFENSIVE_HELP_TURN`, closeout→`CLOSEOUT`. The `lift` movement on the open shooter renders as `RECEIVE_READY`/`SHOT_READY` via the stationary-read fallback.

---

## Advantage or Reset (AOR) — 5 scenarios

| ID | Difficulty | Main cue | Best read | 3D readability requirement | Movement / animation intent |
| --- | --- | --- | --- | --- | --- |
| **AOR-01** | 1 | x2 closing late, cushion not yet closed | Catch-and-shoot (advantage = shoot) | Hip-arrow + foot-arrow on x2; shooting pocket open | `lift`; receiver→`RECEIVE_READY`/`SHOT_READY`, closeout→`CLOSEOUT` |
| **AOR-02** | 1 | x2 flying past the catch (out of control) | Rip and drive baseline (advantage = attack) | Hip + foot + chest-line arrows on x2; baseline drive corridor open | `lift`+`rip`+`drive`+`cut` |
| **AOR-03** | 2 | x2 set with cushion, no momentum (no advantage) | Reset — swing back to point | Foot-arrow + chest-line + label on x2; reset path visible | `lift`+`pass` (swing) |
| **AOR-04** | 1 | x3 in corner on x-out, ball arriving cross-court | Catch-and-shoot off the long closeout | Vision-cone + foot-arrow on x3; shooting pocket open | `lift` |
| **AOR-05** | 3 | x2 outside foot forward (overcommit baseline) | Rip middle, drive past outside hip | Foot + hip arrows on x2; middle drive corridor open | `lift`+`rip`+`drive`+`cut` |

**Family animation intents required:** receiver→`RECEIVE_READY`/`SHOT_READY`/`JAB_OR_RIP`/`RESET_HOLD` (branched), closeout→`CLOSEOUT`, helper→`SLIDE_RECOVER`, passer→`PASS_FOLLOWTHROUGH`. The receiver branch is selected by `aorBranch` in `getDecoderAnimationIntent`; the existing `glbAthlete` clip ladder routes stationary reads to `receive_ready` and forward closeouts to `closeout_read`.

---

## 3D readability standard

Every scenario uses overlays in only the schema-allowed kinds and stays at or below the beginner cap of 3 pre-answer + 3 post-answer overlays. The pre-answer cluster always includes (a) the primary defender body cue (hip arrow / foot arrow / chest line / hand-in-lane / help-pulse) and (b) at least one disambiguating cue (vision cone, chest-line, label) so the user can resolve the read in <1.5s of freeze. The post-answer cluster always includes (a) the open-space region or open-passing-lane that the read attacked, (b) a drive-cut preview or timing pulse showing the action that solves it, and (c) at most one supporting reveal.

## Movement-kind / animation-intent coverage

All 20 scenarios use only kinds in the existing `SceneMovementKind` union and roles whose substrings already match the existing `deriveDecoderRole` rules. No schema migration was required. New role labels (e.g. `denying_corner_defender`, `weak_wing_help_turn`, `wing_help_stunter`, `weak_slot_help_at_nail`, `wing_defender_flying_closeout`, `weak_wing_x_out_recover`) all contain a recognized substring (`deny`, `help`, `closeout`, etc.) so the existing dispatcher resolves them without changes.

## GLB asset dependencies

None added. Every scenario renders against the existing shared-athlete GLB plus the existing imported clips (`closeout`, `back_cut`, `defensive_deny`, `defense_slide`, `cut_sprint`, `idle_ready`, `receive_ready`, `closeout_read`). Procedural and 2D fallback paths remain intact and exercised by the unchanged scenario3d test suite.
