# Defense Lab baseline QA handoff

This records the first vertical slice before the user's subsequent remodel request. It is regression evidence, **not V1 acceptance**. The root agent has transferred future design and QA ownership to new agents.

## Artifacts and runner

- Independent runner: `scripts/verify-defense-lab.ts`.
- Last executed report: `docs/defense-lab/qa/report.json`, generated 2026-10-05 22:01:20 UTC; 10 passing checks, 9 failing checks/cascades.
- Current initial visual: `docs/defense-lab/qa/01-first-value.png`.
- Current role teaching visual: `docs/defense-lab/qa/final-state.png`.
- X-ray, stress, laptop, reduced-motion and WebGL fallback images are beside the report.
- Original supplied prototype visual: `docs/defense-lab/qa/seam-baseline.png`.

Run against an already running server from the repository root:

```bash
source /workspace/.courtiq-env/activate.sh
BASE_URL=http://localhost:3000 pnpm exec tsx scripts/verify-defense-lab.ts
```

The managed sandbox requires network permission for local browser/tsx sockets. The script launches `/usr/bin/chromium` with software rendering, uses a fresh anonymous context, and writes screenshots/error evidence. It never seeds authentication or invokes a production mutation API. Agent-browser was separately used for initial visual verification as required by the browser skills; its isolated executable is `/workspace/.courtiq-env/tools/agent-browser/node_modules/.bin/agent-browser`.

## Verified baseline behavior

Anonymous `/lab` responds 200 with no film, credentials, or team setup. The ten-player world loads, X-ray has selectable layers, stress runs connected continuations with finite paired settings, and keyboard focus is visible. The final run had no page errors or console errors. At 1280×800 the page had no horizontal overflow; the canvas was 1244×486 CSS pixels. Reduced-motion mode remained usable. Emulating unavailable WebGL produced an overhead SVG and usable Run controls rather than a blank page.

The initial shell's unintended serif font and white-on-paper Save action were fixed by the visual owner. The renderer owner tightened camera framing, removed heavy flat blob shadows, gated expensive work while frozen, kept model-driven fallback, and moved the baseline camera inside the gym wall. The current initial image is cleaner and more legible than the first capture, but the small generic humanoids and broad similar arm poses still fall short of the user's requested exceptional basketball presentation.

First-value readiness measured 6.8 seconds in this dev-server/SwiftShader run. This is not a production load benchmark or a physical laptop frame-rate result. Three.js PMREM clipping and deprecated `PCFSoftShadowMap` warnings remain recorded. No real-coach usefulness or learning outcome study was conducted.

## Material regression: auto-pause is not exact

The configured stress point was 0.75 s; the UI stopped at 0.76 s. Stepping then reached 0.79 s rather than 0.78 s, and a subsequent edit snapped to 0.775 s. The likely source is the impure `setTime` updater in `DefenseLab.tsx`: it mutates `pauseAt.current` and calls `setPlaying(false)`. React Strict Mode can re-evaluate the updater after that mutation, so the second evaluation advances beyond the freeze boundary. Playback time calculation and pause detection must be pure, with side effects outside the state updater.

This caused the exact timestamp and subsequent expected-time assertions to cascade. The rerun displayed 1.48 s instead of the expected 1.40 s. The changed answer nevertheless displayed a concrete modeled tradeoff: weakside lift closes by 1.0 s; roller opens by 0.1 s. Do not conceal the pause bug by loosening the exact freeze assertion.

## Incomplete persistence/teaching assertions

Saving wrote one schema-valid collection with the correct answer name, custom low-man term `Anchor`, and a shallow-tag intervention. The save assertion failed because the intervention timestamp was 0.775 instead of 0.75; the runner then lacked its assigned `savedConfig` evidence variable. The saved record subsequently appeared after reload and Teach displayed its name and `D3 Anchor`, as the final screenshot shows. Exact restored-rule and regenerated teaching-responsibility checks were not completed, so these are not reported as fully passing.

One later Teach failure was a test-harness issue: Playwright's range fill rejected formatted `"1.40"` against `step=0.025` because of binary modulo arithmetic. The runner now generates the native dt multiple for range filling and explicitly seeks the stress point before independent X-ray/authoring checks, preventing the auto-pause defect from corrupting every later assertion. Those runner changes were saved after the last report and have not been rerun, because the parent requested a remodel/handoff.

The non-drag defender selection/nudge check was blocked downstream because the previous Teach step failed before returning to Lab. The root has added a native `Coach a defender` selector in Edit rules, then arrow/nudge controls in the player inspector. The updated runner should verify it after the remodeled flow is ready.

## Product critique to carry forward

VReps already offers custom reads, non-linear scenarios, checkpoints and 3D team rehearsal. CourtIQ's distinction must remain changed opposing opportunities under changed rules, exact causal history, and transparent spatial evidence. A prettier replay or role quiz is insufficient.

The first pause should happen before the opportunity has already been decided. An earlier 1.8 s pause produced nearly identical longest-window comparisons despite changed totals/timing. The root moved the stress point to 0.75 s and the analytical owner changed window feasibility to compare earliest defender influence arrival with the actual flight/gather horizon. The resulting shallow-tag comparison now changes the visible lift/roller durations without altering prior history. Preserve that useful behavior when rebuilding the UI.

Earlier code review also found chronological cue insertion, movement-end bounds, stale answer rules when changing counters, unsaved Teach draft loss, and mismatched renderer assumptions. Those were sent to owners and fixed. Future QA should still test backward scrub then edit, late movement then save, counter change using the current team answer, saved Teach versus a different unsaved draft, and imported/custom assumptions driving X-ray.

Keep assertions dynamic through the scenario's stress time/dt rather than hard-coded demo timings. Capture real browser motion and inspect screenshots again after the remodel. Retain explicit uncertainty: exact modeled geometry is evidence about the disclosed model; it is not a prediction that a high-school coverage will work.
