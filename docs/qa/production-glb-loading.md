# Production GLB Asset Loading QA (P3.3A)

**Status:** P3.3A — production GLB asset loading fix. Pauses P3.3 LIVE
promotion of founder scenarios until production renders the
license-clean GLB athletes and the imported animation clips
(closeout / back-cut), matching local `/dev/scene-preview?glb=1`
behavior.

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
