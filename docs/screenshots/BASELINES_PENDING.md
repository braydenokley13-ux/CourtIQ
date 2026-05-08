# Visual baseline capture — pending

**Status:** the baseline + diff system landed in §3.1.14
(`scripts/screenshot-scenario.ts`), the gold-standard Pack 2
scenario `BDW-T2-01` is reachable via `/dev/scenario-preview`, and
the screenshot harness now waits on `data-replay-phase` DOM
selectors with a wall-clock fallback. A non-blocking CI job runs
the soft diff on every PR. **Actual baselines for Pack 1 + BDW-T2-01
have NOT been captured yet** because the first capture still
requires an interactive operator (see "Blockers in this session"
below).

## Blockers in this session

1. **`pnpm qa:auth` requires a headed Chromium window with a manual
   Supabase login.** The screenshot script's `--via train` path is
   gated on `.auth/courtiq-user.json`, which `qa:auth` produces by
   driving the user through `/login` with a real keyboard. That can't
   be automated from a sandboxed CI session.
2. **Local dev server.** Both surfaces (`/train`, `/dev/scenario-
   preview`) require `pnpm dev` to be running on `:3000`. Long-lived
   foreground servers are not available in the assistant sandbox.

The screenshot script itself was extended in this session (see commit
log) to add a `--via preview` option that does NOT need auth, so the
`/dev/scenario-preview` capture path works the moment a developer has
a local dev server running.

## Exact command sequence to capture the first baselines

Run from the repo root (`/home/user/CourtIQ`) on a workstation that
has Chromium installed via Playwright (`pnpm exec playwright install
chromium` once):

```sh
# 1. Start the dev server (leave running in another terminal).
pnpm dev

# 2. Once-per-machine: capture Supabase auth state for /train.
#    Headed Chromium opens — log in manually and the script saves
#    .auth/courtiq-user.json automatically.
pnpm qa:auth

# 3. Pack 1 baselines via /train (needs auth + LIVE seed).
pnpm qa:screenshot baseline --pack founder-v0
#    or for one scenario:
pnpm qa:screenshot baseline --id BDW-01

# 4. Pack 2 gold-standard baseline via /dev/scenario-preview
#    (no auth needed; renders any pack JSON, even DRAFT variants).
pnpm qa:screenshot baseline --id BDW-T2-01 --via preview
```

Outputs land at:

```
docs/screenshots/<id>/baseline/load.png
docs/screenshots/<id>/baseline/freeze.png
docs/screenshots/<id>/baseline/after.png
docs/screenshots/<id>/baseline/manifest.json   # records id, via, sha256
```

The `via` field in the manifest pins which surface produced the
baseline so the diff command picks the same one automatically.

## Subsequent diff runs (CI)

```sh
pnpm qa:screenshot diff --pack founder-v0
pnpm qa:screenshot diff --id BDW-T2-01 --via preview
```

Exit 0 = clean. Exit 1 fires on either (a) any phase-hash mismatch
or (b) any scenario without a committed baseline manifest. The
missing-baseline case is treated as a hard failure — a regression
gate cannot certify a scenario it never compared, so a silent pass
would let drift through CI undetected. Mismatches print both file
paths so a reviewer can open them side-by-side in the GitHub diff
UI; missing-baseline IDs are listed so the operator can re-run
`pnpm qa:screenshot baseline` against the exact set.

## CI integration (current — soft, non-blocking)

`.github/workflows/ci.yml` runs a separate
`visual-regression-pack2-bdw-t2-01` job on every PR:

1. installs deps + Playwright Chromium,
2. boots `pnpm --filter @courtiq/web dev` in the background,
3. waits on :3000,
4. runs `scripts/screenshot-scenario.ts diff --id BDW-T2-01 --via
   preview` with `ALLOW_MISSING_BASELINE=1`,
5. uploads `docs/screenshots/BDW-T2-01/` and the dev server log as a
   workflow artifact (14-day retention).

`continue-on-error: true` keeps the existing typecheck/lint/build
gate unaffected — the new job exercises the pipeline without
blocking merges. Once a few consecutive runs are green AND the first
real baseline is committed, the gate tightens (drop
`ALLOW_MISSING_BASELINE`).

Path to full coverage:

- **Phase 1 (today)** — operator-driven baselines committed to
  `docs/screenshots/`, diffs run locally before promotion. Soft CI
  job exercises the install→boot→diff chain on every PR.
- **Phase 2** — flip the CI job to strict (`ALLOW_MISSING_BASELINE`
  unset) once `BDW-T2-01` baseline is committed.
- **Phase 3** — expand to the gold-standard pack of ~5 scenarios.
- **Phase 4** — add the `/train` diff once an ephemeral Supabase test
  account is provisioned in the workflow.

## Phase D — operational hardening punch list

These are the residual fragility points after the Replay-1
productionization pass; ranked by capture-time risk.

1. **`replayMode='intro'` "after" frame is degenerate on the preview
   surface.** The controller stays at `'frozen'` indefinitely when no
   choice is picked, so `after.png` and `freeze.png` will be
   byte-identical for `--via preview` baselines. The DOM phase signal
   keeps this stable (no flake), but the captured "after" frame
   doesn't actually exercise the post-freeze answer surface. Either
   (a) introduce a `?autoPick=…` query param on `/dev/scenario-preview`
   so the harness can drive a consequence/replay leg, or (b) drop
   `after` from preview-surface baselines and only capture it via
   `/train` once auth is wired. Recommended: (a) — keeps the matrix
   uniform.
2. **`/train` surface still lacks `data-replay-phase`.** Only
   `/dev/scenario-preview` was retrofit. The `--via train` path falls
   straight to wall-clock waits. Pack 1 founder-v0 baselines will
   inherit the original determinism risk until the same one-line
   plumb is added to the train page.
3. **No screenshot pixel-level diff yet.** Hash mismatch is binary
   (different / not different). The reviewer has to open both PNGs
   side-by-side in GitHub's image diff UI, which is fine for one
   scenario but doesn't scale to a Pack 2-wide matrix. A
   `pixelmatch`-style overlay that highlights the changed regions
   would dramatically reduce review fatigue. Out of scope for this
   pass; tracked as a Phase E review-UX blocker below.
4. **Browser rendering variability across runners.** GitHub Actions'
   `ubuntu-latest` updates roll forward and can change Chromium's
   GPU path (swiftshader version, font fallback). The deterministic
   basketball texture and seeded animation tracks neutralize most of
   the renderer's own randomness, but ANY change in the underlying
   GL stack will diff every baseline. Mitigation: pin
   `runs-on: ubuntu-22.04` and pin the Playwright version in
   `package.json` (currently `^1.59.1`). Recommend tightening to
   `~1.59.1` in a follow-up.
5. **DPR + viewport are pinned in code (1440×900 @ 1.0)** — good. But
   `fullPage: true` re-paginates around the dev panel on the right.
   The right column has a poll-driven `decisionLog` that updates every
   500 ms; if the screenshot lands mid-update the hash drifts. The
   `data-replay-phase` wait helps but doesn't fully eliminate this —
   the captured frame is whatever the React render queue had at the
   moment the screenshot fired. Mitigation candidates: (a) hide the
   left/right columns under a `?bare=1` query param for visual
   regression captures, or (b) use Playwright's `clip:` to restrict
   the screenshot to the canvas wrapper. (b) is simpler, recommended.
6. **Dev server boot in CI is slow and unmeasured.** Next's first
   compile of `/dev/scenario-preview` is the long pole; my port-poll
   loop only proves the listener is up, not that the route compiled.
   The script's own `goto({ waitUntil: 'domcontentloaded',
   timeout: 60_000 })` covers the route compile, but if Next's first
   compile exceeds 60 s the screenshot will fail with a generic
   timeout. Mitigation: add a single warm-up `curl
   http://localhost:3000/dev/scenario-preview\?id=BDW-T2-01` to the
   workflow before the screenshot step.
7. **`networkidle` waitForLoadState is brittle.** The page polls
   render metadata every 500 ms; `networkidle` may never fire on a
   surface with a periodic XHR. The harness already wraps it in a
   `.catch()` so a miss is a warn, not a fail — but if `networkidle`
   never fires, we're back to relying on the DOM phase signal alone.
   This is currently fine; flag it if the soft CI run shows
   `network did not idle` in logs.

## Phase E — scale readiness review (75 Pack 2 scenarios)

"What breaks first if CourtIQ scales the visual regression matrix to
75 scenarios?" — ranked by impact, near-term first.

1. **CI runtime cost.** The current single-scenario CI job is
   ~3-5 min (install + Chromium + boot + 3 phases × wait + diff).
   75 scenarios at the same cadence is ~1 hour per PR — unacceptable
   on shared GitHub-hosted runners. Mitigation in priority order:
   (a) capture all 3 phases in ONE browser context per scenario
   (already done) but reuse the SAME browser across scenarios within
   one job — the script does this; (b) parallelize across scenarios
   via a workflow matrix at ~10 shards × 8 scenarios; (c) restrict
   the gate to "scenarios touched in this PR" via a path-aware diff.
   Block at: ~30 scenarios is the sweet-spot ceiling for a single
   serial job; at 75 a matrix is mandatory.
2. **Baseline storage in `docs/screenshots/`.** Three full-page PNGs
   per scenario at 1440×900 ≈ 600-900 KB each ⇒ 2-3 MB per scenario
   ⇒ ~150-225 MB across the matrix. Git is the wrong store for that
   at scale (clone time, LFS quota). Mitigation: keep `manifest.json`
   in git (the SHA-256 IS the gate) and store the PNGs in Git LFS
   from scenario #25 onward. Even better: drop the PNGs from git
   entirely and let the soft-fail CI job upload them as an artifact
   on diff — reviewers fetch the artifact when needed. Block at:
   ~20-30 scenarios before clone/PR-checkout pain dominates.
3. **Diff review UX.** Today a hash mismatch prints two file paths
   the reviewer opens by hand. At 75 scenarios with a renderer-wide
   change this is unworkable. Mitigation: add a per-mismatch diff
   PNG using `pixelmatch` and bundle the diff PNGs into the workflow
   artifact so the PR comment can link directly to the visual diff.
   Block at: any pack-wide renderer change.
4. **Flaky-render risk** scales linearly. Each scenario inherits the
   `replayMode='intro'` "after" degeneracy and the dev-panel render
   churn. Phase D fixes #1 and #5 above before scaling beyond ~5-10
   scenarios.
5. **Scenario author friction.** Today an author who tweaks a
   scenario's seed timing has to (a) start dev server, (b) auth, (c)
   re-run baseline, (d) eyeball the new PNG, (e) commit. That's
   ~5 minutes per scenario × frequent revisions. Mitigation: a
   `pnpm qa:preview:baseline:rebake -- --id <id>` script that does
   (a)-(c) headless and stages the result; pair with a one-shot
   "git rebake summary" comment on the PR.
6. **Merge conflict risk on `manifest.json`.** Two PRs touching the
   same scenario will both rewrite the per-phase `sha256` hashes,
   producing a merge conflict that's hand-resolved by re-running the
   baseline. The dropped `capturedAt` (commit 780967f) helps but
   doesn't eliminate this. Mitigation: store one manifest PER
   scenario (already done) so conflicts only fire when two PRs touch
   the same scenario; consider a CODEOWNERS rule on
   `docs/screenshots/<id>/baseline/` so the scenario author owns
   conflict resolution.
7. **Branch ergonomics.** A scenario author who commits a baseline
   PNG to a branch then rebases sees the PNG re-stage on every
   rebase if anyone else touched the same file. Mitigation: same as
   #2 — move PNGs out of the main repo or behind LFS.
8. **PR review pain.** GitHub's image diff UI works well at 1-3
   PNGs per PR; at 30+ it's slow and visually overwhelming. Pair
   the pixelmatch overlay (#3) with a per-PR "visual regression
   summary" comment that lists only the scenarios that drifted —
   reviewers look at the diff PNG, not the original.
9. **Visual review fatigue.** Reviewers who see "75 baselines
   updated" stop clicking. The summary comment must say WHY each
   diff is expected (e.g. "renderer change in commit X affected 12
   scenarios — same texture seed, same animation tracks, only the
   camera framing changed"). Without that context every renderer
   PR rubber-stamps. Block at: any deliberate renderer change post
   ~30 scenarios.
