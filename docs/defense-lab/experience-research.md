# Defense Lab: experience research and adversarial acceptance

Research date: 2026-10-05. Scope: independent visual directions 4 and 5, player teaching, accessibility, performance, and acceptance criteria. This is a decision brief, not a claim of coach interviews or empirical product validation.

## What the inspected artifacts establish

The supplied SEAM III HTML is valuable as engineering evidence: a deterministic ten-player world, time-indexed interventions, a separate renderer, camera orbit/zoom, projected selectable player labels, context-loss handling, responsibility exchanges, and paired assumption worlds. Its dense dark shell, very small labels, seven disconnected action buttons, and inspector-heavy composition do not meet the requested product standard. Preserve the causal experiment; rebuild its presentation and discovery.

The current CourtIQ repository already contains Three.js/R3F, Playwright, a public QA route, procedural athletes, and an attributed CC0 humanoid mesh. Its existing middleware constructs a Supabase client before deciding whether a public non-dev route needs authentication. A new public Lab must bypass that construction before any environment-dependent work. Zero film, zero login, and zero database connection are essential for the first experiment.

The bundled mannequin is a 65-bone CC0 Quaternius asset. Attribution documents acknowledge its generic source and lack of basketball-native embedded animation. The imported animation clips derive from shield/ninja movement. They are legally useful, but their names or existence do not establish exceptional basketball movement. Inspect animation at the stress point, catching, defensive slide, and close camera; never describe it as motion capture or game-quality just because a skinned mesh loads.

## Five visual directions compared

| Direction | Composition | Strength | Failure to prevent | Adopt |
| --- | --- | --- | --- | --- |
| 1. Editorial sports science | Warm white page, court as a full-width figure, sparse typeset conclusion | Coach confidence and readable tradeoffs | A polished report that lacks manipulation | Typography, restrained color, evidence language |
| 2. Premium broadcast technology | Broadcast court and discreet lower-third stress-point explanation | Immediate basketball recognition | TV spectacle and persistent HUD clutter | Intentional camera preset and focused instant replay |
| 3. Spatial engineering lab | Court with editing affordances, measured paths, contextual rule controls | Makes causality and intervention tangible | CAD jargon and overloaded geometry | Frozen-time edit marker and one X-ray layer at a time |
| 4. Sports-game-quality world | Live court occupies the canvas; controls surface near selected role; replay transport anchors the floor | The coach feels inside a living model | Decorative arena, unreliable click targets, cinematic camera obstructing weakside spacing | Responsiveness, body language, spatial selection, physical light/materials |
| 5. Coaching rehearsal stage | A premium practice gym with a director's cue strip; the possession unfolds in short scenes, selected defenders get spotlighted | Unconventional, teaches the causal story without dashboards | A scripted lesson masquerading as interactive opposition | Stress-point checkpoints, role isolation, cue/action/consequence |

### Direction 4: playable practice gym

Use a believable high-school practice venue rather than an NBA stadium. Natural maple, muted charcoal court trim, soft overhead light, convincing rim/backboard scale, and white-versus-ink uniforms give enough contrast without neon. Make the shell warm white. Reserve orange for the coach's next action and a second accent for defensive responsibility. Arena detail is useful only when it gives scale and depth; it must not compete with the weakside lift.

The resting state is a purposeful broadcast camera showing all ten bodies. A selected defender gets one subtle floor ring and an HTML role label. A compact role control appears beside the court, not over the passing lane. Playback can be cinematic within basketball-readable limits: slow at the stress point; never swing the camera unexpectedly. Explicit player POV is valuable for teaching, but should not be default because it hides the responsibility conflict the coach is diagnosing.

Mouse affordances: drag empty floor to orbit; scroll to zoom; explicit camera presets; select a player to reveal responsibility; drag a selected defender only while frozen. Every camera movement must remain reversible in one click. Every drag must have a control-based alternative. Game-quality means low latency, readable state, contact/stance/movement quality, and believable ball attachment; it does not mean bloom, crowd particles, music, or scoreboard furniture.

### Direction 5: coaching rehearsal stage

Treat the possession as a rehearsal whose actors react to changed coaching rules. The court remains the stage; the time strip has only meaningful cues: screen, tag, lift, skip, recovery. Selecting a cue freezes that instant and states one concrete question, such as “Who owns the lift after the low man tags?” The answer appears spatially through the responsible defender's path and reachable area.

The coach works in a repeated sentence: “When [basketball cue], [role] [responsibility].” Advanced values live behind that sentence. A comparison uses a ghost of the previous answer at the same instant, plus two basketball consequences. This format feels like a practice instruction, not a settings panel.

The most unconventional useful element is the “rehearse your role” transformation: same world and same saved answer, fewer controls, selected defender in focus, three read checkpoints. It is stronger than a separate teaching dashboard because it shows what changed when the coach changed the rules. No XP, streak, score, or roster management is needed to teach this one answer.

### Recommended synthesis

Choose the warm editorial shell, the playable gym's physical world, the rehearsal stage's checkpoint strip, and the engineering lab's causal edit/ghost affordance. Main desktop composition: shallow masthead, one concise problem heading, court using roughly three quarters of horizontal space, a narrow basketball answer rail, and one replay/action strip. The court should remain the largest uninterrupted surface. Keep consequences in one readable narrative area rather than metric cards.

Three activities suffice: Lab, Compare, Teach. The initial Lab should have a useful Drop/Over/Tag/X-out answer preloaded. Run is available immediately. Ask the coach's preferences by changing basketball-native controls in context; do not gate the court behind a wizard. Coverage and offensive continuation must materially change the model, not only the labels.

## Player teaching experience

Save an answer before teaching it, preserving coverage rules, terminology, scenario id/version, and interventions. Teach uses that saved revision rather than whatever unsaved draft is on screen. A selected defensive role receives a short “if / then” instruction and a visible responsibility target. Keep other players present enough to retain spacing context.

Three useful checkpoints for this slice:

1. Screen contact: the POA chooses over; the big contains the ball without abandoning roller protection.
2. Tag/lift: low man recognizes the roller while the backside defender recognizes both weakside threats.
3. Skip/recovery: first backside rotation and responsibility exchange become visible; the selected player states the next owner rather than chasing the ball.

Rehearsal questions should ask about responsibility, not pretend to predict a made shot. A wrong answer receives the relevant cue and a rerun from that checkpoint. Keyboard-accessible checkpoint buttons, slower playback, overhead camera, and selected-role POV all use the same engine. An exportable role teaching sheet or local JSON answer is useful; accounts and distribution are later work.

## Accessibility decisions grounded in standards

WCAG 2.2 identifies dragging alternatives and minimum pointer targets as AA requirements. For every defender drag, provide click-select plus directional nudges or coordinates with clear units. For orbit, provide camera presets. For scrub, provide a labeled native range and frame-step buttons. Aim at 36–44 CSS pixel controls in the dense desktop shell, above the 24-pixel minimum baseline and easier to use in a gym. [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Preserve visible focus, native button/select/range semantics, and names matching visible labels. Represent Holds/Thin/Breaks with words and icons or shape as well as color. Use text explanations for every analytical layer because a WebGL canvas alone is not a semantic teaching surface. Keep focus stable after rerun. Announce saved-answer success, stress completion, and material result changes with a restrained live region; do not announce each frame.

Reduced-motion mode should remove nonessential automatic camera travel and decorative pulses. Playback is user initiated, with pause and stepping available. Fit the tool rail at 1280×800 and test 200% zoom/keyboard navigation. A narrow-screen fallback may prioritize a static overhead world and teaching text rather than compress every desktop control. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Performance and fallback decisions

Freeze should stop continuous expensive renders. Official R3F guidance recommends demand rendering for resting scenes, explicitly invalidating camera/model mutations; it also supports resource reuse, shared asset caching, instancing, adaptive resolution, and progressive asset loading. Adopt the principles even if the final renderer is imperative Three.js. [R3F performance guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance).

Separate deterministic model samples from render frames. Do not run analytics in the animation loop. Recompute a small experiment immediately after a rule change; larger counter/assumption sweeps should yield or use a worker. Reuse skinned geometry, materials, court assets, and labels. Start with device pixel ratio capped at a sensible value, one primary shadow source, and a restrained environment. Quality reduction may change shadows/resolution but must never change model evidence.

Acceptance measurements: time from selecting a new rule to ready rerun; frame interval distribution during playback; no repeated asset load on rerun; no sustained rendering while frozen; controls remain responsive during stress tests. Browser headless software rendering is evidence of correctness, not evidence that a real laptop sustains 60 fps. Record it explicitly.

WebGL unsupported/context lost must produce a useful overhead fallback and explanation, while preserving answer state, time, and analysis. A blank canvas is a failure. Missing humanoid assets should fall back to clear procedural basketball bodies, not block the Lab. If the fallback is visually less strong, label its status accurately.

## Adversarial product critique and rejection tests

VReps already publicly markets coach-authored 3D plays, reads, non-linear scenarios, counters, spacing/timing, checkpoints, and team rehearsal. Those features by themselves cannot distinguish CourtIQ. Its current product material explicitly offers custom reads and decisions. [VReps product page](https://vreps.tech/en).

The vertical slice fails as a strategy lab if any of these hold:

- Two coverages produce identical routes and available passing opportunities.
- The offensive counter is a separate canned animation selected independently of defensive evidence.
- X-ray draws arrows that never correspond to computed positions/timing/reach.
- A shallow tag “improves the defense” without the roller becoming more available under paired assumptions.
- An edit at 1.2 seconds changes any already-played position before 1.2 seconds.
- Stress classifications are constants, or “Breaks” is a basketball outcome prediction without a defined criterion.
- Teach reveals only a generic replay, without the saved team's rule and selected role.
- Save success is only a toast and the answer vanishes on reload.
- First value requires a login, film upload, server credentials, or team roster.
- Renderer code owns branch/rule logic, making the second problem a copy/paste rewrite.

The useful distinction is executable opposition plus counterfactual evidence: the coach changes one defensive rule, the connected offense finds a changed opportunity, exact modeled geometry exposes the tradeoff, and paired replay shows why. It is still a bounded authored model, not an autonomous basketball intelligence. The UI must show assumptions and separate geometric evidence from tactical judgment.

Independent QA must exercise the complete golden loop, reload the saved answer, verify teaching checkpoints, capture desktop/alternate-camera/X-ray/comparison screenshots, collect browser console/page errors, test keyboard/reduced-motion/fallback behavior, and inspect actual motion. Reject defects that block a real coach's first useful experiment; do not merely add them to a roadmap.
