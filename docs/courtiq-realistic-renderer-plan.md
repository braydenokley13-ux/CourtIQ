# CourtIQ Realistic Renderer Rebuild Plan

## 1. Current State

The CourtIQ 3D scenario renderer currently produces primitive visuals:

- Flat, untextured court surface.
- Simple painted lines.
- Basic hoop geometry.
- Cylinder-shaped players.
- Sphere ball.
- Basic lighting with no shadows.
- No realistic gym surroundings.

Recent debugging revealed that the React Three Fiber (R3F) reconciler is **unreliable in this stack**:

- JSX scene children declared inside `<Canvas>` are sometimes silently dropped.
- `useFrame` is not consistently invoked.
- Mounting/unmounting can leave the scene blank.

Workaround commit `0c0ff48` introduced an imperative path that mutates the underlying `THREE.Scene` directly, bypassing the reconciler for critical visuals. This baseline currently paints, but visual fidelity is far below the target.

## 2. Architecture Constraints

These constraints are **non-negotiable** for every future packet:

- **No JSX scene composition** for court, hoop, players, ball, lighting, gym, or any other critical visual. R3F JSX children may be dropped without warning.
- **No `useFrame`** for animation, physics, camera updates, or any per-frame logic. It cannot be trusted to run.
- **All visual upgrades must be built imperatively** against the underlying `THREE.Scene`, `THREE.Camera`, and `THREE.WebGLRenderer`.
- **Animation must run from a parent `requestAnimationFrame` loop** managed outside the reconciler.
- **Cleanup is manual.** Every imperative mesh, geometry, material, and texture must be disposed when the scene unmounts.
- **Treat `<Canvas>` as a renderer host only**, not as a scene graph builder.

## 3. Product North Star

CourtIQ must feel like a **realistic, usable basketball training simulator**:

- Players, coaches, and analysts should immediately recognize the court.
- The hardwood, paint, lines, hoop, net, and players should look believable.
- Lighting and shadows should sell the gym environment.
- Camera modes should match how coaches actually study film.
- The renderer should remain stable on weaker devices.
- Every visual upgrade must serve training comprehension, not gimmicks.

## 4. Rebuild Principles

1. **Imperative-only.** All scene mutation goes through builder functions invoked once on mount.
2. **One packet at a time.** No bundling. No "while I'm in here." No drive-by refactors.
3. **Working baseline preserved.** Every packet must leave the renderer in a working, paintable state.
4. **Dispose everything.** No leaked geometry, materials, or textures.
5. **Cheap before fancy.** Use procedural materials, simple geometry, and tuned lighting before reaching for heavy assets.
6. **Readable from the default camera.** No upgrade is complete if the court becomes harder to read.
7. **Determinism preserved.** Scenario playback must remain reproducible across runs.

## 5. Execution Packet Rules

Every future Claude session working on this plan **must** follow these rules:

- Execute **ONLY ONE packet** per session.
- Commit that packet with the exact commit message specified.
- Push the commit to the remote.
- **Stop immediately** after reporting status. Do not start the next packet.
- Do not bundle packets, even if the next one looks small.
- Do not refactor outside the packet's stated scope.
- Do not add features outside the packet's stated scope.
- If a packet is blocked, stop and report the blocker rather than improvising.
- Report at the end: changed files, test results, commit hash, push status.

## 6. Packetized Roadmap

### Packet 0 — Renderer Safety Baseline

**Goal:** Confirm the imperative workaround still paints and create a stable baseline before visual upgrades.

**Files likely touched:**
- `Scenario3DCanvas.tsx`
- `imperativeScene.ts`

**Exact implementation tasks:**
- Inspect current `Scenario3DCanvas.tsx` and `imperativeScene.ts`.
- Add or verify a visible diagnostic marker if needed to confirm imperative path runs.
- Confirm `scene.children.length` is nonzero after mount.
- Confirm the parent `requestAnimationFrame` render loop is stable.
- Confirm no JSX scene composition is being used for critical visuals.
- Add comments explaining the imperative-only constraint at the top of both files.

**Acceptance criteria:**
- The scene paints reliably on mount.
- `scene.children` is verifiably nonzero.
- No JSX-defined critical meshes remain.
- Files contain explicit imperative-only comments.

**Test command(s):**
- `npm run build`
- `npm run lint`
- Manual: load a scenario and confirm visuals appear.

**Commit message:** `docs/renderer: document imperative safety baseline`

**Stop point:** Commit and push, then stop.

---

### Packet 1 — Renderer Configuration

**Goal:** Configure renderer output for realistic visuals before changing geometry.

**Files likely touched:**
- `Scenario3DCanvas.tsx`
- Renderer initialization helper (if separated).

**Exact implementation tasks:**
- Configure `WebGLRenderer.shadowMap` (enabled, soft shadow type).
- Configure `outputColorSpace` to sRGB.
- Configure ACES tone mapping if supported by the installed three version.
- Configure pixel ratio safely (clamped to a sensible max, e.g. 2).
- Confirm resize behavior still works (canvas, camera aspect, renderer size).
- **Do not** rebuild geometry yet.

**Acceptance criteria:**
- Renderer reports shadows enabled.
- Color output is sRGB.
- Tone mapping configured.
- Resize remains correct.
- No geometry changes introduced.

**Test command(s):**
- `npm run build`
- Manual: resize window, confirm canvas adapts.

**Commit message:** `rendering: configure realistic renderer output`

**Stop point:** Commit and push, then stop.

---

### Packet 2 — Court Builder Skeleton

**Goal:** Refactor `imperativeScene.ts` into a clean builder structure without changing visuals too much.

**Files likely touched:**
- `imperativeScene.ts`
- New builder modules under a `scene/builders/` folder if appropriate.

**Exact implementation tasks:**
- Create builder functions: `buildCourt`, `buildHoop`, `buildLighting`, `buildGymShell`, `buildPlayers`.
- Keep existing visuals working (no visual regression).
- Add clear cleanup/dispose logic for each builder's outputs.
- Preserve current scenario data flow (no schema changes).

**Acceptance criteria:**
- Each builder is callable independently.
- Mount/unmount leaks no GPU resources (verifiable via logging).
- Scenario data flow unchanged.
- No visual regression vs Packet 1.

**Test command(s):**
- `npm run build`
- Manual: mount/unmount the scene, confirm clean disposal.

**Commit message:** `rendering: refactor imperative scene builder`

**Stop point:** Commit and push, then stop.

---

### Packet 3 — Procedural Hardwood Court

**Goal:** Upgrade only the court floor.

**Files likely touched:**
- `buildCourt` (in scene builders).

**Exact implementation tasks:**
- Add procedural hardwood material/texture (canvas-generated or procedural shader).
- Add plank variation (subtle color/grain variance).
- Add roughness/metalness settings appropriate for finished wood.
- Improve court dimensions if needed to match regulation proportions.
- Keep paint and lines functional.

**Acceptance criteria:**
- Floor visibly resembles hardwood.
- Plank variation is visible but not distracting.
- Lines and paint still render correctly.

**Test command(s):**
- `npm run build`
- Manual: load default scenario, confirm hardwood appearance.

**Commit message:** `rendering: add procedural hardwood court`

**Stop point:** Commit and push, then stop.

---

### Packet 4 — Court Paint and Lines

**Goal:** Make the painted court areas and lines realistic and crisp.

**Files likely touched:**
- `buildCourt` (paint and line logic).

**Exact implementation tasks:**
- Improve key/paint geometry (correct dimensions, proper color).
- Improve three-point arc, free throw circle, lane lines, baseline, sidelines.
- Ensure line thickness is consistent.
- Handle z-fighting (polygon offset or small y-offset stacking).
- Keep court readable from the default camera.

**Acceptance criteria:**
- All standard NBA/NCAA-style markings present.
- No z-fighting visible at any zoom.
- Lines look crisp at default camera distance.

**Test command(s):**
- `npm run build`
- Manual: orbit camera, confirm no shimmering or flicker on lines.

**Commit message:** `rendering: improve court paint and markings`

**Stop point:** Commit and push, then stop.

---

### Packet 5 — Lighting and Shadows

**Goal:** Add realistic gym lighting and real shadows.

**Files likely touched:**
- `buildLighting`.
- Mesh material/`castShadow`/`receiveShadow` flags across builders.

**Exact implementation tasks:**
- Add shadow-casting key light(s).
- Tune ambient/fill/key lights for balanced exposure.
- Enable shadow casting/receiving on players, hoop, ball, court.
- Avoid over-darkening the scene; verify mid-tones remain readable.

**Acceptance criteria:**
- Players cast visible shadows on the court.
- Court is well-lit and readable.
- No blown-out highlights or crushed shadows under default scenario.

**Test command(s):**
- `npm run build`
- Manual: confirm shadows are visible from default and orbit cameras.

**Commit message:** `rendering: add realistic lighting and shadows`

**Stop point:** Commit and push, then stop.

---

### Packet 6 — Hoop System

**Goal:** Upgrade only the basket area.

**Files likely touched:**
- `buildHoop`.

**Exact implementation tasks:**
- Add glass backboard (transparent material with subtle tint).
- Add realistic rim (proper radius, orange material).
- Add support/padding (stanchion, pole, padding).
- Add hanging net mesh (segmented strands).
- Ensure scale and placement match court dimensions.

**Acceptance criteria:**
- Backboard is transparent and visibly glass-like.
- Rim sits at correct height and position.
- Net hangs from rim and is visible.
- Stanchion/support is present.

**Test command(s):**
- `npm run build`
- Manual: zoom on hoop, confirm believability.

**Commit message:** `rendering: upgrade hoop and net geometry`

**Stop point:** Commit and push, then stop.

---

### Packet 7 — Gym Environment

**Goal:** Add believable gym context without clutter.

**Files likely touched:**
- `buildGymShell`.

**Exact implementation tasks:**
- Add walls (simple boxed shell with appropriate scale).
- Add ceiling depth or rafters if feasible.
- Add subtle background structure (bleachers hint, sideline darkening).
- Tune environment color/lighting balance with the lighting from Packet 5.
- Ensure camera still frames the court correctly.

**Acceptance criteria:**
- Court no longer floats in void.
- Gym shell does not obscure the court at default camera.
- Lighting still reads well with the new shell.

**Test command(s):**
- `npm run build`
- Manual: orbit camera, confirm gym context.

**Commit message:** `rendering: add realistic gym environment`

**Stop point:** Commit and push, then stop.

---

### Packet 8 — Player Geometry

**Goal:** Replace cylinder players with readable humanoid athletes.

**Files likely touched:**
- `buildPlayers`.

**Exact implementation tasks:**
- Create a lightweight humanoid player builder.
- Add torso, head, arms, legs, shoes.
- Add offense/defense uniforms (color-coded).
- Add facing direction (player rotation).
- Add selected-player highlight if existing data supports it.

**Acceptance criteria:**
- Players visibly humanoid, not cylinders.
- Offense vs defense distinguishable at a glance.
- Facing direction matches scenario data.
- Selection highlight works (if data exists).

**Test command(s):**
- `npm run build`
- Manual: load scenario with multiple players, confirm readability.

**Commit message:** `rendering: add humanoid player geometry`

**Stop point:** Commit and push, then stop.

---

### Packet 9 — Basketball Upgrade

**Goal:** Upgrade the ball only.

**Files likely touched:**
- Ball builder (within players or its own builder).

**Exact implementation tasks:**
- Correct ball size to regulation proportions relative to court.
- Add basketball material/texture or procedural seams.
- Ensure ball visibility from all cameras.
- Keep existing ball positioning logic intact.

**Acceptance criteria:**
- Ball is visibly a basketball, not a generic sphere.
- Ball remains visible at all camera modes.
- Ball positioning logic unchanged.

**Test command(s):**
- `npm run build`
- Manual: confirm ball appearance and positioning.

**Commit message:** `rendering: upgrade basketball geometry`

**Stop point:** Commit and push, then stop.

---

### Packet 10 — Camera Modes

**Goal:** Add usable camera modes.

**Files likely touched:**
- Camera management module.
- `Scenario3DCanvas.tsx`.

**Exact implementation tasks:**
- Add broadcast camera (sideline, slightly elevated).
- Add tactical camera (top-down or near-top-down).
- Add follow camera (tracks ball or selected player).
- Add replay camera (cinematic angle).
- Add smooth transitions between modes.
- Preserve current auto-fit behavior as a default.

**Acceptance criteria:**
- All four modes selectable.
- Transitions are smooth (no snapping).
- Auto-fit still works.

**Test command(s):**
- `npm run build`
- Manual: cycle through camera modes, confirm transitions.

**Commit message:** `rendering: add camera modes`

**Stop point:** Commit and push, then stop.

---

### Packet 11 — Imperative Animation

**Goal:** Improve motion without JSX/`useFrame`.

**Files likely touched:**
- Animation/playback module.

**Exact implementation tasks:**
- Use parent `requestAnimationFrame` loop only.
- Add eased interpolation between scenario keyframes.
- Add ball arc on passes.
- Add acceleration/deceleration to player motion.
- Keep deterministic scenario playback (same input → same output).

**Acceptance criteria:**
- No `useFrame` introduced.
- Easing visible in player and ball motion.
- Pass arcs render correctly.
- Determinism preserved.

**Test command(s):**
- `npm run build`
- Manual: replay same scenario twice, confirm identical motion.

**Commit message:** `rendering: add imperative motion system`

**Stop point:** Commit and push, then stop.

---

### Packet 12 — Premium Overlay

**Goal:** Improve user-facing controls and readability.

**Files likely touched:**
- Overlay/UI components surrounding the canvas.

**Exact implementation tasks:**
- Add scenario chip (current scenario name/badge).
- Add replay controls (play/pause/scrub/restart).
- Add speed selector (0.5x, 1x, 2x).
- Add camera selector (broadcast/tactical/follow/replay).
- Add path toggle (show/hide motion paths).
- Hide debug UI by default.

**Acceptance criteria:**
- All controls functional.
- Debug UI not visible by default.
- Overlay does not obscure the court.

**Test command(s):**
- `npm run build`
- Manual: exercise each control.

**Commit message:** `ui: add premium training replay overlay`

**Stop point:** Commit and push, then stop.

---

### Packet 13 — Performance Guardrails

**Goal:** Make renderer reliable on weaker devices.

**Files likely touched:**
- Renderer init.
- Builders with quality-tier branching.

**Exact implementation tasks:**
- Add quality modes (low/medium/high).
- Add FPS guard (auto-downgrade if sustained low FPS).
- Add low-tier fallback (simpler materials, no shadows on low).
- Audit dispose/cleanup across all builders.
- Prevent blank screen failure (fallback if WebGL init fails).

**Acceptance criteria:**
- Quality mode selectable.
- FPS guard verifiable in dev mode.
- Low tier renders without shadows and at acceptable FPS.
- No blank screen on init failure (visible error state).

**Test command(s):**
- `npm run build`
- Manual: force low tier, confirm reduced fidelity but stable render.

**Commit message:** `rendering: add performance guardrails`

**Stop point:** Commit and push, then stop.

---

### Packet 14 — Polish Pass

**Goal:** Add subtle premium details only after core system works.

**Files likely touched:**
- Animation, lighting, or atmosphere modules.

**Exact implementation tasks:**
- Add slow-motion polish (smooth ramp on key plays).
- Add subtle camera shake on impactful events.
- Add dust motes / light atmosphere if cheap to render.
- Add optional ambience hooks (audio/visual) if appropriate.
- Avoid gimmicks or anything that hurts comprehension.

**Acceptance criteria:**
- Polish features togglable.
- No FPS regression at high tier.
- Court readability unchanged.

**Test command(s):**
- `npm run build`
- Manual: confirm polish reads as subtle, not distracting.

**Commit message:** `rendering: add premium polish pass`

**Stop point:** Commit and push, then stop.

---

## 7. Testing Strategy

For every packet:

- **Build:** `npm run build` must succeed.
- **Lint/typecheck:** `npm run lint` (or equivalent) must succeed.
- **Manual smoke test:** Load the default scenario, confirm:
  - Scene paints.
  - `scene.children.length` is nonzero.
  - No console errors related to renderer or three.
  - Resize works.
  - Mount/unmount leaves no leaked GPU resources (check via dev tools / logging).
- **Determinism check (Packet 11+):** Replay the same scenario twice and confirm identical motion.
- **Cross-camera check (Packet 6+):** Verify the visual upgrade reads well from default and at least one alternate camera.

## 8. Risk Management

- **R3F regression risk:** If a packet accidentally reintroduces JSX scene children or `useFrame`, the visuals may silently disappear. Every packet's review must check for these.
- **GPU leak risk:** Imperative scene mutation makes leaks easy. Every builder must own its dispose path.
- **Visual regression risk:** Each packet must leave the scene visually intact or improved relative to the previous packet. Never ship a half-finished packet.
- **Scope creep risk:** The single-packet rule exists because bundling has historically caused this stack to break. Resist combining packets even when they look related.
- **Determinism risk:** Animation changes (Packet 11) must not introduce nondeterminism. Use fixed timesteps or deterministic interpolation.
- **Performance cliff risk:** Shadows, transparency, and complex geometry can tank FPS on weaker devices. Packet 13 is non-optional.

## 9. Future Session Prompt Template

When starting a future session to execute a packet, use this exact prompt:

> "Read `docs/courtiq-realistic-renderer-plan.md`. Execute ONLY Packet X. Do not start the next packet. Commit and push when complete. Stop after reporting changed files, test results, commit hash, and push status."

Replace `X` with the packet number for that session. The session must not deviate from the packet's stated tasks, must not bundle work, and must stop after pushing.
