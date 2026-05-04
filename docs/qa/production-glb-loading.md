# Production GLB Asset Loading QA (P3.3A → P3.3C)

**Status:** P3.3C — third pass on the production GLB asset loading
fix. P3.3A wired up the env-var opt-in surface, P3.3B replaced the
dynamic `process.env[name]` access with static-literal reads, and
P3.3C removed the surrounding `typeof process === 'undefined'` guard
that was *still* causing the prod opt-in to be a silent no-op even
after both prior passes landed. P3.3 LIVE promotion stays paused
until the QA checklist passes.

## P3.3C — what was *still* broken after P3.3B

Even after P3.3B made the `process.env.NEXT_PUBLIC_*` access static,
production *still* rendered procedural figures with the env vars set.
Root cause:

The body of each env-flag reader had the shape:

```ts
function readGlbAthletePreviewEnvFlag(): boolean {
  if (typeof process === 'undefined') return false
  return process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW === '1'
}
```

Webpack's `DefinePlugin` rewrites the static
`process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW` member expression
into a string literal at build time, so the second line is safe in
the browser bundle (it becomes `return "1" === '1'`). But
`DefinePlugin` does **not** touch the bare `typeof process` operator
on the first line. In a production browser bundle where `process`
is not defined as a runtime global, the guard returns `'undefined'`
and the function short-circuits to `false` BEFORE the inlined
literal is ever evaluated — silently turning the env-var prod
opt-in back into a no-op even though Vercel inlined `'1'` into the
bundle correctly.

### What P3.3C changed

- **`apps/web/components/scenario3d/imperativeScene.ts`** — removed
  the `if (typeof process === 'undefined') return false` guard from
  all three env-flag readers (`readGlbAthletePreviewEnvFlag`,
  `readImportedCloseoutEnvFlag`, `readImportedBackCutEnvFlag`).
  Each body is now a single static `===` against the literal `'1'`.
  After DefinePlugin runs, the browser bundle has no runtime
  reference to `process` at all in those readers; SSR / Node tests
  always have `process` defined, so the unguarded read is also
  safe there.
- **`apps/web/components/scenario3d/productionGlbAssetGate.test.ts`**
  — added a regression test that scans `imperativeScene.ts` and
  fails if any of the three readers grows a `typeof process` /
  `typeof window` guard around the static env read. Locks the fix
  in so a future "defensive" refactor cannot reintroduce the
  silent-no-op.

---

## Background — what was broken

The procedural fallback (Phase F figure) renders correctly in
production, so scenarios looked "loaded" but visibly wrong: no GLB
athletes, no imported closeout / back-cut animation. The cause was
a stack of three things, all defaulting safe:

1. **Runtime gate explicitly off in prod.** `isGlbAthletePreviewActive()`
   in `apps/web/components/scenario3d/imperativeScene.ts` short-
   circuited to `false` whenever `process.env.NODE_ENV === 'production'`,
   so the GLB build path was never even attempted in prod.
2. **No production opt-in surface.** The window-global dev override
   (`__COURTIQ_GLB_ATHLETE_PREVIEW_DEV_OVERRIDE__`) is intentionally
   prod-locked for security. There was no other way to flip the
   gate on in prod without flipping the source-level
   `USE_GLB_ATHLETE_PREVIEW = false` const, which is defended by
   `runtimeFlagOverride.test.ts` ("if this drifts, the production
   default is gone").
3. **Middleware ran on `.glb` requests.** The Next.js middleware
   matcher excluded `svg|png|jpg|jpeg|gif|webp` but not `.glb`
   (or the `/athlete/` prefix), so every GLB request hit the
   Supabase auth refresh — slower and, if Supabase is unreachable
   or the env vars are missing, can 5xx instead of returning the
   bytes.

## P3.3B — what was *still* broken after P3.3A

Even with the env vars set in Vercel and a redeploy completed, prod
QA still showed procedural figures. Two further root causes:

1. **Dynamic `process.env` access — webpack `DefinePlugin` cannot
   inline it.** P3.3A introduced a `readProdEnvFlag(name)` helper
   that did `process.env?.[name] === '1'`. `DefinePlugin` only
   replaces *static* member expressions (`process.env.NEXT_PUBLIC_X`).
   A dynamic computed-property access is left untouched in the
   bundle, and the production browser bundle has an empty
   `process.env` stub at runtime, so the lookup always returned
   `undefined`. The gate was permanently off in production no
   matter what Vercel had configured.

2. **Cold-cache first scene was never upgraded.** The imperative
   scene-build (`Scenario3DCanvas` line ~710) is synchronous;
   `buildGlbAthletePreview()` returns `null` while the GLB cache
   is cold and the figure-builder falls through to the procedural
   Phase F figure. The async `loadGlbAthleteAsset()` resolves a
   moment later but only triggered a renderer resize — never a
   scene rebuild — so the very first scenario after navigation
   stayed procedural until the user advanced to the next scene.

### What P3.3B changed

- **`apps/web/components/scenario3d/imperativeScene.ts`** — replaced
  the parametric `readProdEnvFlag(name)` with three static-literal
  readers (one per env var). Each reader is a single
  `process.env.NEXT_PUBLIC_X === '1'` comparison, which `DefinePlugin`
  inlines at build time so the value actually reaches the browser.
- **`apps/web/components/scenario3d/Scenario3DCanvas.tsx`** — added a
  `glbCacheReadyTick` state that is bumped exactly once per canvas
  mount when `loadGlbAthleteAsset()` resolves with a populated cache
  entry. The scene-build effect now lists this as a dep so it
  rebuilds, swapping the procedural cold-cache fallback for the
  GLB mannequin without churning subsequent scene transitions
  (which already find the cache warm).
- **`apps/web/app/dev/glb-debug/`** — new production-safe debug
  surface at `/dev/glb-debug` that reports:
  - `NEXT_PUBLIC_*` flag values as the *client bundle* sees them
    (proof that DefinePlugin inlined them correctly),
  - the same flags as the *server* injected at build time,
  - each runtime gate boolean (`isGlbAthletePreviewActive` etc.),
  - HTTP HEAD probe results for each `/athlete/...` GLB URL,
  - whether `loadGlbAthleteAsset()` resolved with a cache entry,
  - and `NEXT_PUBLIC_COMMIT_SHA` so QA can confirm the deployed
    build actually contains the P3.3B fix.
  Page lives under `/dev/`, which the middleware already routes
  around the Supabase auth refresh, so it is reachable in
  production without an account. Only `NEXT_PUBLIC_*` values are
  rendered — they are public by definition (inlined into the
  client bundle).
- **`apps/web/components/scenario3d/productionGlbAssetGate.test.ts`**
  — added a regression test that scans `imperativeScene.ts` and
  forbids any further `process.env?.[name]` / `process.env[name]`
  dynamic access patterns. The next-time refactor cannot
  reintroduce the P3.3A regression.

## What changed in P3.3A

Smallest possible fix; preserves deterministic playback.

- **`apps/web/components/scenario3d/imperativeScene.ts`** — the
  three runtime gates (`isGlbAthletePreviewActive`,
  `isImportedCloseoutClipActive`, `isImportedBackCutClipActive`)
  now also honor build-time `NEXT_PUBLIC_*` env vars. The vars are
  checked **before** the prod short-circuit so production can opt
  in explicitly. The window-global dev override remains prod-
  locked.
- **`apps/web/next.config.ts`** — explicitly threads the three
  `NEXT_PUBLIC_*` vars into the build so they are inlined in both
  server and client bundles.
- **`apps/web/middleware.ts`** — matcher excludes the `/athlete/`
  prefix and a broader set of binary extensions (`glb`, `gltf`,
  `bin`, `hdr`, `ktx2`, `wasm`, `woff`, `woff2`, etc.) so static
  asset requests bypass Supabase entirely.
- **`.env.example`** — documents the three new env vars.
- **Tests** — `productionGlbAssetGate.test.ts` locks the env-var
  surface and the `/athlete/...` URL shapes;
  `middlewareMatcher.test.ts` locks the middleware exclusion
  contract.
- **Source defaults are unchanged.** `USE_GLB_ATHLETE_PREVIEW`,
  `USE_IMPORTED_CLOSEOUT_CLIP`, `USE_IMPORTED_BACK_CUT_CLIP` all
  remain `false` at module level. The deterministic-playback
  baselines (`glbAthleteEndToEndDeterminism.test.ts`,
  `replayDeterminism.test.ts`) and the `runtimeFlagOverride.test.ts`
  defense-in-depth assertions are unaffected.

## How to enable GLB rendering in production

The feature is fully wired but defaults off. To turn it on for the
prod deployment:

1. Open the Vercel project **Settings → Environment Variables**.
2. Add the following variables to the **Production** environment
   (set the value to the literal string `1`):
   - `NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW = 1`
   - `NEXT_PUBLIC_USE_IMPORTED_CLOSEOUT_CLIP = 1`
   - `NEXT_PUBLIC_USE_IMPORTED_BACK_CUT_CLIP = 1`
3. Redeploy (or trigger a fresh build — `NEXT_PUBLIC_*` is inlined
   at build time, so a redeploy is required for the change to take
   effect).
4. Run the QA checklist below.

To disable, delete the env vars (or set them to anything other
than `'1'` — the gate accepts only the literal string `'1'`) and
redeploy.

## Production QA checklist

Run this once after the env vars land. Capture browser DevTools
screenshots of each pass / fail.

### `/dev/glb-debug` (do this first)

- [ ] Open `https://<prod-host>/dev/glb-debug` in production.
- [ ] Confirm the **Build / commit** section shows the expected
      `NEXT_PUBLIC_COMMIT_SHA` (matches the deployed commit on the
      Vercel dashboard) and `NODE_ENV: production`.
- [ ] Confirm the three rows in **Env flags (client bundle)** all
      show the literal `"1"`. If any show `""`, the build did not
      inline them — re-check Vercel env-var scope (must be
      Production), then redeploy.
- [ ] Confirm the three rows in **Runtime gates** all show `true`.
- [ ] Confirm each row in **Asset HEAD probes** shows `200`.
- [ ] Confirm **Loader cold-load result** shows `cache populated`.

If `/dev/glb-debug` reports green across all sections, the
remaining `/train` checks are the contract verification. If
anything shows red there, fix it before opening `/train`.

### Asset network

- [ ] Open `/train` in production while signed in.
- [ ] Open DevTools → Network, filter by `glb`.
- [ ] Confirm `GET /athlete/mannequin.glb` returns **200** with
      `Content-Type: model/gltf-binary` (or `application/octet-
      stream` — both are acceptable for `.glb`).
- [ ] Confirm `GET /athlete/clips/closeout.glb` returns **200**.
- [ ] Confirm `GET /athlete/clips/back_cut.glb` returns **200** when
      a BDW scenario plays (the back-cut clip is fetched lazily on
      first BACK_CUT intent).
- [ ] Confirm none of the three return **404**, **401**, or **5xx**.
- [ ] Confirm the requests are NOT routed through any auth refresh —
      the `Set-Cookie` header should be absent on the GLB responses
      (proof that the middleware is bypassing them).

### Renderer

- [ ] Confirm the procedural emergency fallback ring (Phase F low-
      poly figure) is **not** visible. The GLB athlete should mount
      after the cold-load handoff completes (typically <1s on a
      warm cache).
- [ ] **BDW-01 (`/train` with `?concept=backdoor_window` or via the
      academy module).** Confirm the GLB body of `o4` plays the
      `back_cut.glb` clip during the answer-demo replay. The cut
      should read as a knee drive + arm swing, not a blocky slide.
- [ ] **AOR-01.** Confirm the GLB defender (`x2`) plays the
      `closeout.glb` clip on its closeout. The pose should land
      "short and under control" at the freeze.
- [ ] **ESC-01.** Confirm the GLB user figure cuts on the answer
      demo and that `c4` wrongDemo shows two GLB bodies with ~2 ft
      separation (no body interpenetration).
- [ ] **SKR-01.** Confirm the GLB shooter (`o4`) is in a
      catch-and-shoot pose at the moment the skip pass arrives.
- [ ] Confirm zero unhandled promise rejections in the console.
- [ ] Confirm zero `THREE` warnings about NaN bone transforms.
- [ ] Confirm the WebGL emergency fallback (`Scenario3DErrorBoundary`)
      is not triggered — the boundary surfaces a static fallback
      message; if you see it, the renderer is not mounting at all
      and GLB is the symptom, not the cause.

### Mobile + viewport

- [ ] iPhone-class viewport (375×812): GLB athletes still render
      and fit; cue still reads at thumb scale.
- [ ] 1440×900 desktop: GLB athletes render and the freeze frame
      reads.

### Rollback

If any of the above fails:

1. Delete (or unset) the three `NEXT_PUBLIC_USE_*` env vars in
   Vercel and redeploy. Production reverts to procedural figures
   instantly — no code change needed.
2. File an issue describing which scenario failed, the failing
   asset / network row, and the console output.
3. Do **not** promote the founder scenarios further until the
   issue is resolved.

## Common failure modes (debugging guide)

| Symptom | Likely cause | Fix |
|---|---|---|
| GLB requests return **401** with `WWW-Authenticate` | Middleware matcher still catching the route | Confirm `apps/web/middleware.ts` matcher excludes `/athlete/` and `glb` |
| GLB requests return **404** | Asset missing from `apps/web/public/athlete/...` or build did not include it | `ls apps/web/public/athlete/clips/` locally; redeploy if file is missing |
| GLB requests return **200** but figure is still procedural | Env vars not inlined — was the build run after setting the vars? | Trigger a fresh Vercel deploy; `NEXT_PUBLIC_*` is build-time |
| GLB requests return **200**, env vars set in Vercel, but `/dev/glb-debug` still shows `""` for client-bundle flags | Build cache is serving a pre-P3.3B bundle | Trigger a clean Vercel redeploy (no cache) so the new static-read pattern lands in the browser bundle |
| `/dev/glb-debug` shows runtime gates `true` but the very first `/train` scenario still renders procedural for ~1s, then upgrades | Expected behavior on a cold CDN cache (1.4 MB asset has to land before the rebuild trigger fires) | None required — the P3.3B `glbCacheReadyTick` rebuild swaps to GLB on cold-load completion |
| Console shows `Failed to parse` on a GLB response | MIME type or partial response | Confirm `Content-Length` matches the file size on disk; check Vercel CDN cache |
| Renderer mounts but freezes | Three.js GLTFLoader async failure | Open the scenario3d error boundary; check console for `THREE.GLTFLoader: ...` errors. Falls back to procedural automatically |
| Dev preview works but prod does not | Env var set on Preview but not Production environment | Check Vercel **Production** scope of the env var |

## Resume P3.3 LIVE promotion?

P3.3A is **complete** when:

- [ ] All four founder scenarios (BDW-01, AOR-01, ESC-01, SKR-01)
      pass the renderer checklist above.
- [ ] All `pnpm typecheck`, `pnpm lint`, `pnpm test`, and
      `pnpm --filter @courtiq/web build` are green.
- [ ] Network panel shows zero 404 / 401 / 5xx for GLB requests.

Only then resume the P3.3 LIVE promotion flow per
`docs/qa/founder-scenario-promotion-checklist.md`.

## Related files

- `apps/web/app/dev/glb-debug/` — production-safe `/dev/glb-debug`
  readout (P3.3B).
- `apps/web/components/scenario3d/Scenario3DCanvas.tsx` — cold-load
  rebuild trigger (`glbCacheReadyTick`, P3.3B).
- `apps/web/components/scenario3d/imperativeScene.ts` —
  `isGlbAthletePreviewActive` and the env-var keys.
- `apps/web/components/scenario3d/glbAthlete.ts` — `GLB_ATHLETE_ASSET_URL`,
  `GLB_IMPORTED_CLOSEOUT_CLIP_URL`, `GLB_IMPORTED_BACK_CUT_CLIP_URL`.
- `apps/web/middleware.ts` — matcher with the `/athlete/` exclusion.
- `apps/web/next.config.ts` — `NEXT_PUBLIC_*` env-var passthrough.
- `apps/web/components/scenario3d/productionGlbAssetGate.test.ts` —
  asset URL + env-var locks.
- `apps/web/lib/middlewareMatcher.test.ts` — middleware-matcher lock.
- `.env.example` — env-var documentation surface.
