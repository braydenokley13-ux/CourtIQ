# Renderer Performance + Fallback Verification

Packet I of the [Renderer Polish Plan](./courtiq-renderer-polish-plan-part2.md).
Verifies that the cumulative visual upgrades from Packets B–H did not break
performance, cleanup, fallback behavior, or runtime reliability.

The product goal — CourtIQ teaches users to read basketball — depends on a
renderer that does not stutter, leak, or silently fail. This packet does not
add visual features; it audits the surfaces that keep the renderer
trustworthy and applies one minimal safety fix.

---

## 1. What was checked

### 1.1 Performance / runtime surfaces
- `apps/web/components/scenario3d/Scenario3DCanvas.tsx` — top-level canvas,
  parent rAF loop, FPS guard, quality settings wiring, `RenderHeartbeat`
  belt-and-suspenders rAF loop, error/fallback state machine.
- `apps/web/components/scenario3d/imperativeScene.ts` — scene/gym/hoop/
  player/ball/realism-prop builders, camera + motion controllers,
  `disposeGroup` traversal.
- `apps/web/components/scenario3d/imperativeTeachingOverlay.ts` — Packet E
  overlay controller, owned disposables, `tick` early-out when hidden.
- `apps/web/lib/scenario3d/atmosphere.ts` — Packet 11 dust motes (high tier
  only) including the canvas-generated `alphaMap` lifecycle.
- `apps/web/lib/scenario3d/quality.ts` — tier resolver (low / medium / high),
  DPR clamp, antialias gate, FPS guard enable flag.
- `apps/web/lib/scenario3d/feature.ts` — `hasWebGL` detection, URL flags
  (`?camera=`, `?simple=`, `?debug3d=`, `?emergency=`, `?orbit=`,
  `?autofit=`, `?quality=`).
- `apps/web/components/scenario3d/Scenario3DErrorBoundary.tsx` — React error
  boundary, retry that remounts canvas under a new key.
- `apps/web/components/court/*` — 2D fallback, reachable via the
  `Scenario3DCanvas` `fallback` prop on the `/train` page.

### 1.2 Behaviors verified
- WebGL feature detection.
- Imperative scene / camera / motion / overlay / dust-mote build failure
  paths.
- WebGL context-lost handler.
- React error boundary scope and retry.
- Disposal of geometry, materials, and CanvasTextures across builders.
- Parent `requestAnimationFrame` loop lifecycle.
- Quality tier auto-resolve + URL override + runtime FPS-guard downgrade.

---

## 2. Findings

### 2.1 Passed

| Check | Status | Notes |
| --- | --- | --- |
| `hasWebGL()` is wrapped in try/catch and returns `false` on any throw | PASS | `lib/scenario3d/feature.ts:9` |
| Canvas mount probe sets `mode = supported ? '3d' : 'fallback'` | PASS | `Scenario3DCanvas.tsx:246` |
| Imperative scene build is wrapped in try/catch → fallback | PASS | `Scenario3DCanvas.tsx:507` |
| Renderer `onCreated` is wrapped in try/catch → fallback | PASS | `Scenario3DCanvas.tsx:914` |
| `webglcontextlost` listener flips to fallback with a runtime error | PASS | `Scenario3DCanvas.tsx:845` |
| `Scenario3DErrorBoundary` catches React-tree throws | PASS | `Scenario3DErrorBoundary.tsx:31`; rendered around `Scenario3DCanvas` in `Scenario3DView.tsx:103` |
| Error boundary remounts canvas under a fresh key on retry | PASS | `Scenario3DErrorBoundary.tsx:81` |
| 2D fallback receives `court_state` and renders the legacy court | PASS | `app/train/page.tsx:329` → `components/court/Court.tsx` |
| `FallbackBadge` distinguishes "no-webgl" vs "runtime-error" | PASS | `Scenario3DCanvas.tsx:1118` |
| `disposeGroup` walks descendants and disposes geometry + material | PASS | `imperativeScene.ts:282` |
| `disposeMaterialTextures` covers `map / bumpMap / normalMap / roughnessMap / metalnessMap / alphaMap / emissiveMap / aoMap / envMap` | PASS | `imperativeScene.ts:305` |
| Basketball surface CanvasTexture sits on `material.map` (covered by slot walk) | PASS | `imperativeScene.ts:2683` |
| Scoreboard face CanvasTexture sits on `material.map` | PASS | `imperativeScene.ts:2021` |
| Center-court mark CanvasTexture sits on `material.map` | PASS | `imperativeScene.ts:2123` |
| Wall-vignette CanvasTexture sits on `material.map` | PASS | `imperativeScene.ts:1853` |
| Teaching-overlay label sprites' CanvasTextures sit on SpriteMaterial.map AND are tracked in `disposables[]` | PASS | `imperativeTeachingOverlay.ts:505`, `:515` |
| TeachingOverlayController removes its group from root before disposing tracked items, preventing double-walk by `disposeGroup` | PASS | `imperativeTeachingOverlay.ts:133` |
| DustMotes alphaMap is owned by the controller and disposed via `dust.dispose()` (not relying on Material.dispose() cascade) | PASS | `lib/scenario3d/atmosphere.ts:120`; cleanup at `Scenario3DCanvas.tsx:626` |
| DustMotes points are removed from parent before `disposeGroup` walks the root, preventing double dispose | PASS | `Scenario3DCanvas.tsx:628` |
| Parent rAF loop cancels its `rafId` on cleanup | PASS | `Scenario3DCanvas.tsx:464` |
| `RenderHeartbeat` rAF loop cancels on unmount | PASS | `Scenario3DCanvas.tsx:1283` |
| Scene-rebuild `useEffect` polls a single rAF until refs ready, cancels on cleanup | PASS | `Scenario3DCanvas.tsx:618` |
| Camera, motion, overlay, dust refs are all reset to `null` on cleanup | PASS | `Scenario3DCanvas.tsx:651` |
| Overlay `tick()` early-returns when `group.visible === false` (toggling Paths off stops the cost) | PASS | `imperativeTeachingOverlay.ts:113` |
| Quality tier resolves on mount, honors `?quality=` URL override over prop | PASS | `Scenario3DCanvas.tsx:266` |
| Runtime FPS guard downgrades `high → medium → low` only once per window with cooldown, never below `low` | PASS | `Scenario3DCanvas.tsx:316`; `quality.ts:53` (`fpsGuardEnabled` off at `low`) |
| FPS guard pushes new `setPixelRatio` into the live renderer without remount | PASS | `Scenario3DCanvas.tsx:283` |
| Dust motes only built on `tier === 'high'`, so medium/low devices skip the cost | PASS | `Scenario3DCanvas.tsx:590` |
| Camera shake offset only applies when `tier !== 'low'` | PASS | `Scenario3DCanvas.tsx:371` |

### 2.2 Fixed in this packet

**Camera/motion controller setup was not inside a try/catch.** The
`buildBasketballGroup` build was already guarded — a throw flips to the 2D
fallback before anything reaches the scene graph. But `fitCameraToScene`,
`new CameraController(...)`, and `new MotionController(...)` ran outside
that guard. A failure there would have left a partially-mounted scene
visible to the user with no framing or animation.

Fix: widened the try/catch in `Scenario3DCanvas.tsx` so a throw during
post-add setup tears the partial mount back down (`threeScene.remove`,
`disposeGroup(result.root)`, null the controller refs), surfaces the
error to the `FallbackBadge`, and routes the user to the 2D court.
This matches the existing handling for the build itself — the user
never sees a silent broken canvas.

`Scenario3DCanvas.tsx:520`–`:590`.

### 2.3 Known limitations / non-blocking observations

1. **Three render drivers run concurrently in production**: R3F's default
   `frameloop="always"` scheduler, the parent-level rAF in
   `Scenario3DCanvas`, and the in-canvas `RenderHeartbeat` rAF all call
   `gl.render(scene, camera)`. This is documented in the source as a
   deliberate belt-and-suspenders trade-off after a class of black-canvas
   bugs where R3F's reconciler silently dropped Canvas children. Removing
   the redundant loops is intentionally **out of scope for Packet I** — it
   risks reintroducing the original blank-canvas regression and would
   require a wider refactor than the packet authorizes.
2. **2D fallback content uses the legacy `court_state`, not `Scene3D`.**
   This is pre-existing and is the contract the `/train` page already
   passes (`app/train/page.tsx:329`). A future packet could thread the
   richer scene metadata into the 2D component, but it is not a
   reliability issue today.
3. **`makeSoftCircleTexture()` SSR fallback returns a `THREE.DataTexture`.**
   The dust-mote builder only runs from a client-side `useEffect`, so the
   SSR branch is unreachable in production. Tests that import the module
   on the server still construct cleanly.
4. **No automated browser perf measurement available in this sandbox.**
   No Playwright/Puppeteer/Chromium binary is present, so target FPS
   (60 desktop / ≥30 mid-tier mobile), 5-reload memory growth, and
   silent-blank-screen detection were verified by code reading and the
   manual operator protocol from
   [`docs/renderer-baseline.md`](./renderer-baseline.md). Operator
   verification is required before signing the packet off in production.

---

## 3. Acceptance criteria

| Criterion | Status |
| --- | --- |
| No obvious memory leaks in disposal paths | PASS — all geometry/material/CanvasTexture sources covered by either `disposeGroup` slot walk, `TeachingOverlayController.dispose()`, or `DustMotes.dispose()`. |
| Texture disposal covers canvas-generated textures | PASS — basketball, scoreboard, center-court mark, wall vignette, dust alpha, label sprites all reachable. |
| Overlay controller cleans up correctly | PASS — `TeachingOverlayController.dispose()` removes group from root, frees every tracked disposable, clears animated arrays, idempotent. |
| rAF loop cannot duplicate or survive unmount | PASS — both rAF loops cancel on cleanup; React StrictMode double-mount cleans up between effects so no duplicate. |
| WebGL/scene failure does not leave a silent blank screen if fixable in scope | PASS — fixed: post-add init failure now flips to fallback with a visible badge instead of leaving an unframed scene. |
| Performance/fallback report committed | PASS — this document. |
| Existing tests remain green or failures documented | See §4. |

---

## 4. Test results

Run from the repo root:

```bash
pnpm --filter @courtiq/web test -- src/components/scenario3d
pnpm --filter @courtiq/web lint
pnpm --filter @courtiq/web typecheck
```

Results captured in the Packet I commit message and operator log. Repo-wide
pre-existing failures, if any, are flagged in the commit body so they can be
distinguished from regressions introduced by this packet.

---

## 5. Operator follow-up

To sign this packet off in production:

1. Open the evaluation scenario from `docs/renderer-baseline.md` (`/train`,
   `cutting_relocation_01`, difficulty 4) on the desktop reference rig.
2. Confirm canvas FPS ≥ 60 sustained (DevTools → Rendering → "Frame
   Rendering Stats").
3. Reload the scenario five times back-to-back. Confirm DevTools heap
   snapshot delta stays bounded (no monotonic growth).
4. On a mid-tier mobile rig (or Chrome's mobile emulation with
   `?quality=low`), confirm canvas FPS ≥ 30 sustained.
5. Toggle the Paths overlay on/off twice, then reload — confirm no console
   errors.
6. With DevTools open, run `chrome://gpu` and force a context loss
   (`gl.getExtension('WEBGL_lose_context').loseContext()` from the console
   on the live canvas). Confirm the canvas swaps to the 2D fallback with
   the "3D unavailable" badge.

If any of the above fails, file a follow-up under "Packet I —
post-merge regression" and do not advance to Packet J.
