# 3D Athlete Rendering — Reliability Reference

Operator-facing reference for the CourtIQ 3D athlete pipeline. Covers
where assets live, how flags resolve, what each fallback path means,
and how to debug rendering when something looks wrong.

Companion docs:
- `docs/qa/production-glb-loading.md` — env-var gate history (P3.3A
  → P3.3F).
- `docs/qa/courtiq/phase-o-glb-athlete.md` — GLB renderer architecture.

## Asset locations

GLB files ship inside `apps/web/public/`. Anything under that folder
is served by Next.js at the same path under the site root.

| File | Disk path | Production URL |
| --- | --- | --- |
| Athlete model | `apps/web/public/athlete/mannequin.glb` | `/athlete/mannequin.glb` |
| Closeout clip | `apps/web/public/athlete/clips/closeout.glb` | `/athlete/clips/closeout.glb` |
| Back-cut clip | `apps/web/public/athlete/clips/back_cut.glb` | `/athlete/clips/back_cut.glb` |

URLs are absolute and rooted at `/athlete/...`. Relative paths break
under nested route URLs (`/train/...` → `/train/athlete/...` 404s).
`productionGlbAssetGate.test.ts` and `mannequinAssetIntegration.test.ts`
lock both the URL string and the bundled bytes.

## Local + production verification

### Local
```bash
pnpm dev
# verify the assets are served from public/
curl -I http://localhost:3000/athlete/mannequin.glb
curl -I http://localhost:3000/athlete/clips/closeout.glb
curl -I http://localhost:3000/athlete/clips/back_cut.glb
```

Each must return `HTTP/1.1 200`.

### Production
Open `https://court-iq-plum.vercel.app/dev/glb-debug` for the full
diagnostic readout:

- `NEXT_PUBLIC_USE_*` flag values (server + client bundle)
- runtime gate booleans (`isGlbAthletePreviewActive()` etc.)
- HEAD probes per asset URL with content-type + bytes
- loader cold-load result

Or use `/train?debugGlb=1` to see the in-canvas badge with the same
data (see "Debug overlay" below).

## URL flags

All four flags are **client-side only** and read from
`window.location.search` after hydration. They never need a deploy
toggle.

| URL param | Effect |
| --- | --- |
| `?forceGlb=1` | Force every figure to attempt the GLB path. Bypass the env-var gate. Render a magenta proxy ONLY when GLB build cannot produce a figure (cache cold + load failed, asset missing, or build threw). Auto-enables the debug overlay. |
| `?debugGlb=1` | Mount the GLB debug overlay (asset URLs / loader status / per-figure decision log) and emit `[GLB_DEBUG]` console breadcrumbs. Synonym: `?glbDebug=1`. |
| `?glbDebug=1` | Historical alias of `?debugGlb=1`. Continues to work. |
| `?simple=0` | Switch to the JSX scenario tree (legacy escape hatch — usually leave default). |

`forceGlb=1` is **not** the same as flipping the env var: it changes
runtime selection but never changes a deploy. Magenta on a forceGlb
URL means "the GLB asset could not be produced *now*" — it is a
diagnostic state, not a default.

## Fallback hierarchy

`buildPlayerFigure` (`imperativeScene.ts`) walks this ladder in order:

1. **GLB athlete** + retargeted bespoke clip — when `gate-on` and
   the asset cache is warm.
2. **GLB athlete idle/static** — same as (1) but if any animation
   clip attachment throws, the base mesh still renders. Idle clip
   plays when present; otherwise the figure stays in bind pose.
   Console emits `[glbAthlete] failed to attach …` for the
   misbehaving clip. Locked by `glbAthleteClipIsolation.test.ts`.
3. **Skinned athlete** — Phase M experimental rig. Off by default.
4. **Premium procedural** — Phase J builder. Currently default-on
   (`USE_PREMIUM_ATHLETE = true`).
5. **Phase F procedural** — guaranteed last resort. Hand-built mesh,
   no skeleton, no rig.
6. **Magenta marker** — only when `forceGlb=1` AND the GLB path
   could not produce a figure. Appears at the same player footprint
   as a procedural figure so framing / camera collisions are
   unaffected.
7. **2D fallback** — `WebGL` not available, or scene build crashed.

Magenta is **not** a render mode. It is a diagnostic surfaced only
under `forceGlb=1`. Production users without the URL param will
never see it.

## Debug overlay

Set on (any of) `?forceGlb=1`, `?debugGlb=1`, `?glbDebug=1`, or
`window.__COURTIQ_GLB_DEBUG__ = true` from devtools. Mounted as a
fixed-position panel at the bottom-left of the canvas.

Panel contents:

- Render mode summary (`GLB` / `procedural` / `mixed` /
  `proxy-error`) and forceGlb flag.
- Env values (client bundle), runtime gate booleans, computed pick.
- Figures summary: per-figure decisions folded by `pick:reason`.
- Asset URLs / status: HEAD probe result, content-type, bytes per
  asset.
- Loader detail: mesh / skinned-mesh / bone / material counts,
  material names, embedded clip names from the parsed athlete GLB.
- Per-figure decision list: ordered, color-coded (`glb` green,
  `force-glb-marker` magenta, everything else amber).
- Magenta-marker explanation banner when any figure is in
  `force-glb-marker` state, with the underlying GLB failure
  reason.

The overlay is **only** mounted under one of the gates above. Normal
production traffic does not pay any cost (no asset probes, no
intervals, no console writes).

## `[GLB_DEBUG]` console channel

`glbDebugLog(message, data?)` (`GlbDebugBadge.tsx`) emits to
`console.info` with the prefix `[GLB_DEBUG] …` and is silent unless
the badge gate is on. Used for breadcrumbs of asset URL attempts,
fetch results, loader success/failure, mesh / skinned-mesh / bone
counts, intent / clip decisions, fallback / proxy decisions, and
per-player render path.

Grep example:
```
[GLB_DEBUG] kicking athlete GLB load { url: '/athlete/mannequin.glb', reason: 'forceGlb-url' }
[GLB_DEBUG] athlete GLB load resolved { ok: true, url: '/athlete/mannequin.glb' }
[GLB_DEBUG] per-figure decisions { totalFigures: 6, decisions: [...], gateOn: false, forceGlb: true, cacheReady: true }
```

## Testing the four QA paths

| URL | Expected |
| --- | --- |
| `/train` | 3D court, procedural figures (env gate off in production today). No debug panel. |
| `/train?debugGlb=1` | Procedural figures + bottom-left badge with full diagnostic readout. No magenta. |
| `/train?forceGlb=1` | First scene mounts may briefly show magenta if the asset cache is cold; once `loadGlbAthleteAsset` resolves the scene rebuilds and shows real GLB athletes. Debug badge auto-mounts. |
| `/train?forceGlb=1&debugGlb=1` | Same as above. The badge surfaces the per-figure decision log: cold-cache reason on first build, `glb:gate-on-cache-warm` after the rebuild. If anything stays magenta, the badge's marker banner shows the exact failure reason. |

## Hard error breadcrumbs

Two grep-able lines in the browser console:

- `[CourtIQ GLB ERROR] Renderer selected procedural despite GLB ready`
  — fires when the env gate is on, the loader cache is warm, but
  some figure still landed on procedural. Indicates a mismatch
  between the gate and the figure builder (cache instance drift,
  per-figure throw inside `cloneSkinned` / material apply).
- `[CourtIQ GLB ERROR] forceGlb=1 active but GLB build failed for some figures (magenta marker rendered)`
  — fires when forceGlb is set and the magenta marker rendered for
  any figure. Includes the underlying GLB failure reason
  (`glb-cache-cold`, `glb-threw`, `glb-not-browser`,
  `glb-returned-null`) and a hint about whether the next rebuild
  should fix it.

Both lines are emitted from `Scenario3DCanvas.tsx`'s scene-build
effect after the figures mount.

## Test surface

Files locking the rendering reliability contract:

- `productionGlbAssetGate.test.ts` — public URLs + env-var gate
- `mannequinAssetIntegration.test.ts` — bundled `mannequin.glb`
  parses, contains required bones / skinned mesh / geometry attrs
- `closeoutAssetIntegration.test.ts`, `backCutAssetIntegration.test.ts`
  — bundled clip bytes + root-motion strip
- `playerFigureDecisionLog.test.ts` — per-figure decision shape +
  cold→warm rebuild
- `forceGlbLoadTrigger.test.ts` — forceGlb cold→warm contract,
  marker only when GLB null, real GLB after cache warms
- `glbAthleteClipIsolation.test.ts` — clip-attachment failure does
  not demote base figure
- `forceGlbDiagnostics.test.ts` — debugGlb / forceGlb URL aliases,
  `[GLB_DEBUG]` log gating, `summariseGlbAssetDetail`
- `glbDebugBadge.test.ts` — `computeGlbDebugPick` decision shape
- `glbAthlete.test.ts`, `glbAthleteEndToEndDeterminism.test.ts` —
  figure construction and replay determinism

If you change anything in the renderer pipeline, run all of them:
```
pnpm --filter web test -- scenario3d
```
