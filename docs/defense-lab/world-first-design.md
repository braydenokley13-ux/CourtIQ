# CourtIQ world-first design decision

This replaces the composition budget in `design-directions.md`. It responds to the raised product bar, the inspected 1280×800 initial QA image, the current component, and primary-source interaction research. Recommendations are design judgments, not empirical usability findings. No production code is changed in this document.

## Decision

Make the gym the application. Use a 48 px masthead and one continuous world below it. All coaching surfaces emerge inside that world. The default camera, not a surrounding layout, establishes hierarchy. No reserved title band, bottom answer deck, permanent inspector, result-card grid, or seven-button offense menu.

The existing screen does not fail merely because its court is too small. Its camera makes a miniature gym object; tiny bodies, nearly equal light values, a high oblique angle, large ceiling/wall triangles, and a cropped foreground make the world feel like a dollhouse. Enlarging that exact image would preserve the problem. Lower and tighten the default view until the athletes have recognizable stance and weight, the action occupies the central two-thirds, and the rear gym is a restrained background. Keep enough weakside floor visible to understand two simultaneous threats. Overhead remains one deliberate alternate, not the default.

## Research that changed the decision

These primary sources were searched and opened or verified through indexed official documentation on 2026-10-05. The Shapr3D page includes moving UI examples; its GIF could not be decoded by the web reader. The Vizrt product hero image was opened. This is not a claim that the products themselves were interactively tested.

| Reference | Verified behavior | CourtIQ decision | Explicit rejection |
|---|---|---|---|
| [Shapr3D adaptive interface](https://support.shapr3d.com/hc/en-us/articles/7873882619548-Adaptive-user-interface) | Selected geometry determines recommended tools; a body selection activates movement and a gizmo. | Select a defender first; show only that role's basketball decisions. A floor target communicates movement. | A permanent inspector listing every rule or software transformation coordinates. |
| [Fusion marking menus](https://help.autodesk.com/cloudhelp/ENU/Fusion-GetStarted/files/GUID-6514ABC1-CB75-4F0B-AB0E-316FAD36BA93.htm) | Commands vary with workspace and current context. | Three or four short contextual actions near the selected player. | A large radial menu with long basketball sentences; it obscures teammates and makes labels hard to scan. |
| [Viz Libero](https://www.vizrt.com/products/viz-libero/) and [Teams](https://www.vizrt.com/products/viz-libero-teams/) | On-field graphics, virtual movement, 3D analysis and telestration expose events spatially. | Passing volumes, recovery paths and responsibility handoffs belong on the court and at the relevant moment. | Broadcast lower-thirds occupying the whole bottom quarter, or graphics used only as spectacle. |
| [F1 Insights / AWS](https://aws.amazon.com/sports/f1/) | Named graphics explain concrete race decisions; Battle Forecast connects pace and distance to a time-to-threat. | One readable consequence: defender arrival versus passing window, connected to actual places. | An all-purpose defense score or telemetry wall. |
| [Unreal immersive viewport](https://dev.epicgames.com/documentation/en-us/unreal-engine/viewport-options?application_version=4.27) | Immersive mode gives the viewport the editor window. | World-first is the default product state; inspection tools are temporary. | Copying the rest of the editor: object trees, tab stacks, property columns. |
| [Blender viewport overlays](https://docs.blender.org/manual/en/3.6/editors/3dview/display/overlays.html) | Overlays are separately toggleable from the rendered world. | Independent analytical skeleton and presentation athlete; X-ray is one legible layer at a time. | Always-on wireframe/skeleton clutter. |
| [ParaView temporal data](https://docs.paraview.org/en/v5.13.0/UsersGuide/animation.html) | Time-varying datasets have explicit time controls and timestep navigation. | Scrub deterministic world state; mark decisions, interventions and earliest break on the same causal timeline. | A keyframe editor that asks the coach to animate the result. |

The repeated pattern is **a stable world with tools contingent on selection and task**. The final composition is not an average of each reference's shell.

## Five materially different compositions, resolved

| Direction | Actual composition | Best use | Decision |
|---|---|---|---|
| Editorial sports science | Upper-third explanation, large rectangular court, two-column before/after article below | Exportable evidence | Reject as Lab. It turns the world into an illustration and reproduces the current failure. |
| Broadcast replay | Edge-to-edge game camera, lower-third event headline, camera cuts, chapter transport | Teach and guided witness replay | Borrow natural cinematography only. Default replay controls suggest watching a movie. |
| Spatial CAD | Orthographic halfcourt object on paper, slim tool rail, selection inspector, constraint handles | Precise geometry inspection | Borrow selection and target grammar. Reject default object-on-paper and property inspector. |
| Sports-game practice gym | Eye-level physical gym, minimal HUD, athletes prominent, pause produces contextual coaching choices | Main Lab world | Adopt physical setting and direct pause/edit/rerun loop. Avoid player-rating/game-score HUD. |
| Walkable strategy room | Coach on sideline, a life-size frozen possession, court-projected time and responsibility marks; decisions appear beside athletes | Signature CourtIQ identity | Adopt as the distinguishing layer on the practice gym. Do not require first-person navigation to accomplish work. |

Final: **a physical practice gym with selection-first coaching and court-projected evidence**. The unfamiliar part is how clearly the coach can touch a basketball responsibility, not an unfamiliar control scheme.

## 1280 × 800 implementable composition

- Masthead: y 0–48, warm opaque white; brand left, Lab / Teach center, Our answers right. No breadcrumbs or second product label row.
- Canvas: x 0–1280, y 48–800; no inset frame, rounded court rectangle, or border.
- Problem: top-left x 24, y 72; tiny category, 22–24 px problem name, one-line current answer. Width at most 370 px. This floats over quiet background, not live weakside action. A subtle local opaque paper plate is acceptable only if necessary for contrast.
- View tools: upper-right, single 36–40 px camera control and X-ray. The camera menu contains all alternatives. Do not show four camera pills permanently.
- Experiment dock: centered x approximately 290–990, bottom 20 px; 52–60 px high. `Build our answer` / `Run` / `Break my defense` / `Save · Teach`. Run is the strongest filled action. Break is a confident outlined action until the coach enters attack mode. No summary cards inside the dock.
- Timeline: above the dock, max-width 760 px, 30–38 px high, visually supported by the floor. Time/event ticks, play/freeze, and an accessible range input. It remains a screen-plane interaction for reliable hit targets; call it court-integrated, not physically projected unless it really is. The graphics layer may project chapter markers on floor as redundant context.
- At rest: no selected player popover, no results panel. One short invitation beside the answer: `Select a defender to coach them.` Dismiss after first selection.
- Keep 60–70% of image free of chrome. More importantly, keep the ten-player action, selected player, ball and relevant floor volumes unobstructed.

## Anchored coaching controls

`LabWorld` should report the selected body's projected screen coordinates or an anchor element. Projection is view-dependent and updated during camera motion. The DOM popover is approximately 260 px wide with a 12 px gutter from the selection's projected body envelope. Place it right unless that would cross the safe right edge; then left. Clamp vertically between 110 px and the timeline minus 16 px. Draw a thin leader to the body/foot ring when clamping separates it. Never cover the selected athlete. Hide stale anchors if the body is behind the camera; return to a compact edge token with `Show player`.

Example selection:

```text
LOW MAN · #3                                  ×
Tag the roller, then recover to the lift.

Tag        Shallow   Deep   Stay home
Release    Big recovers   On the skip

↗ Show me on court        Type a coaching cue
From 1.42 s ▾                          Run change →
```

This is a compact reading order, not six cards. Two distinct controls are enough. Show only options implemented in the engine. A generic cue must not be offered if it only maps to an unrelated fixed route.

Scope dropdown: `From this moment` / `From the start`. Switching scope is explicit. Frozen athlete stays at its actual position. Dragging sets a visible future target, with a dashed travel path and `Get here` floor mark; resumed movement obeys the engine. A small intervention tick on the timeline distinguishes authored cue from preexisting history. Undo removes the instruction and restores the prior computed result.

`Show me` sequence: freeze → drag the low man's target → choose a release cue → Run change. Clicking a teammate changes selection; clicking empty floor dismisses controls. Escape exits editing. Arrow nudges and semantic tag choices duplicate drag capability.

Typed authoring uses a constrained, visible contract. Examples are clickable: `Tag shallow, recover on the skip`; `Stay home`; `X-out earlier`. Parse into a human-readable preview of the executable rule before applying. Unsupported input produces one specific clarification or explains the supported rule types. Never show an AI success state for text that did not alter behavior.

## First 45 seconds

0–5: loaded high P&R, current answer in one line: `Drop · Over · Low man tags · X-out`. Coach presses Run.

5–12: possession plays, slows or pauses at its computed first meaningful read. Lift threat is spatially marked. One anchored sentence describes the consequence.

12–22: coach selects highlighted low man. Changes Deep to Shallow; sees target/depth change and `From this moment`.

22–32: Run change. Prior path briefly appears as a neutral ghost, with one concrete delta beside the affected threat.

32–45: coach presses Break my defense. Search selects a counter chain and loads the witness. Coach sees which basketball change exposed their revised rule and can fix it.

No setup wizard, configuration tree, named project, or mandatory natural-language input.

## Break my defense: a spatial witness, not a report

While probing, retain live world with small edge progress text. Stop at the earliest materially exposed continuation. The offense chain is a short breadcrumb above timeline: `High screen → Shallow tag → Lift → Skip`. The winning attack must be the actual loaded simulation/config, not a label over the original playback.

At the witness frame show exactly three things: (1) the threatened receiver and passing window volume, (2) responsible defender and recovery path/reach, (3) one anchored sentence tying them together. Example: `Lift has 0.58 s before #4 can affect it.` Use this number only when the engine computes that specific interval. Otherwise use structural language. A second line explains the minimal counter: `The lift starts earlier while the low man is still tagging.`

Show `See it develop` / `Coach #3` / `Try another probe` in a compact witness strip. `Why?` opens assumptions/evidence. Search details, complete candidate lists and timing tables are secondary. Bounded search exhaustion reads `No break found in these probes`, never `Defense solved`.

When a coach changes the rule, label the prior witness as previous until retested; do not leave a BREAKS badge implying the revised rule was already evaluated.

## Compare, X-ray and Teach

Compare defaults to the same court and time, with one prior-answer ghost and the changed path/target. Show only two threat labels if they communicate the tradeoff: `Lift closes sooner` and `Roll opens longer`. A/B hold or toggle switches complete world state. Dual-world split is an optional explicit mode on wide screens, never two tiny courts beside a metric dashboard. Camera and time synchronize.

X-ray initially reveals the most relevant layer to the current witness. Its small menu offers responsibility / passing window / recovery. Colors have meaning: teal defense, muted amber offense, vermilion exposed window, neutral gray previous answer. No neon or ground halo around every player. Solid assignment line, dashed future recovery, transparent pass volume are enough. Opaque athlete silhouettes remain legible.

Teach clears experiment controls and retains one role sentence, pause/checkpoints, and camera. The saved answer is the source of truth. The coach's unsaved experimental changes do not silently become the teaching artifact.

## Visual acceptance tests and failure thresholds

Reject the implementation if fullscreen is simply the existing dollhouse camera stretched; if a title or answer panel still reserves vertical layout; if Break opens a center modal that hides the witness; if selected-player controls open a permanent far-right inspector; if the only difference after changing tag is text; if a typed cue is acknowledged without an executable change; if compare cannot identify which spatial responsibility changed.

Inspect screenshots at initial world, frozen stress, selected low man, demonstrated target, Break witness, compared change and Teach. At 1280 px width verify no overlay crosses the ball/selected body. At 900 px use a bottom selected-role sheet above a collapsed one-row experiment dock; do not reduce all labels to microtype. Avoid claiming mobile parity. Prefer reducing controls to a menu over shrinking hit targets below 36 px.

Physical quality is part of acceptance: identifiable skin/uniform materials, athletes large enough to read stance, believable cast/contact shadows, maple with restrained variation, a hoop with physical structure, and a naturally lit gym. Analytical clarity must survive X-ray off. No amount of attractive HTML can compensate for tiny frozen mannequins on an overexposed court.

## Independent implementation review, first rebuilt captures

Inspected actual rendered `qa-raised/01-full-world.png`, `02-run-freeze.png`, and `failure-3.png` after reviewing the rewritten `DefenseLab.tsx`, CSS and anchor rendering. These are first-iteration findings, not a final approval. `/tmp/raised-first.png` was a loading frame and was explicitly excluded as rendering evidence.

**Passed direction:** the court now fills the window below the header; title/answer deck no longer reserve layout bands. The closer camera makes bodies and floor materially more readable. The practice-gym composition is credible as an interaction foundation. Source confirms Break loads the selected counter configuration and seeks to its witness; Compare uses a world ghost rather than forcing the old report modal.

**Highest-impact repairs identified:**

1. Current screenshot athlete clothing has pronounced flared waist and shoulder silhouettes, with repeated upright forward-reaching poses. This remains far from the user's physical reference. Clean clothing/anatomical silhouette and plausible defensive stance outrank additional textures or UI polish. New anatomy asset work is in progress separately.
2. Selection placement originally always used `x + 36` followed by right-edge clamping. This places a rightmost athlete underneath its card. Choose the left side when space is insufficient; use measured card height for vertical bounds and attach the leader to the proper edge.
3. Movement target ring originally disappeared at pointer release. Preserve the committed instruction as a floor target and future travel line while the frozen athlete stays at its actual location.
4. Stale attack state suppressed the witness but fell through to `No supported opening found`. Use `Answer changed — attack again` until retested.
5. Generic `font: inherit` on `.lab button` had higher specificity than individual font-size classes and caused oversized overlapping timeline captions. After resolving specificity, neighboring Screen/Tag events still need collision handling: selected event caption only, grouped nearby markers, or a second label row. Do not solve this with unreadable type.
6. Frozen insight exposed the internal slug `tag-and-read`. Use a basketball sentence. Prefer pausing at a meaningful computed decision rather than the fixed 0.75 s checkpoint if no decision exists yet.
7. The inspected first comparison showed three `0.0 → 0.0 s` metrics and no perceptible spatial change. This cannot demonstrate the promised tradeoff. Require a meaningful paired experiment at the relevant moment; when none exists, explain that directly instead of presenting an empty comparison ribbon.
8. The welcome card repeats the problem/answer hierarchy. Replace it with a small first-use instruction. The large COURTIQ floor logo competes with the action; reduce its scale and emphasis.

World dominance is now achieved in the initial capture. Exceptional physical quality and spatially evident causal value are still open acceptance gates. Selected-card and Break witness captures must also be inspected before final approval.

**Selected/Break follow-up:** `03-selected-shallow.png` confirms an actual projected body/foot leader and coherent Low man Tag/Release choices. The card nevertheless covers the paint and other actors; select placement from candidate positions against projected player bounds, or compress the card toward 300 px height. `failure-6.png` confirms the Break worker's selected possession is visible with an evidence panel and causal chain. QA separately found an exact-time/frame mismatch in this capture; it must not be used as final evidence of witness consistency. Composition passes world dominance, but the exposed threat should dominate the overlays: emphasize the witness window and its defender's recovery path, demote covered options, explain the actual screen-angle change rather than its parameter name, and collapse the full chain behind a replay action. This would make the proof spatial rather than mainly textual.
