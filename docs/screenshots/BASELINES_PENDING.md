# Visual baseline capture — pending

**Status:** the baseline + diff system landed in §3.1.14
(`scripts/screenshot-scenario.ts`), and the gold-standard Pack 2
scenario `BDW-T2-01` is now reachable via `/dev/scenario-preview`.
Actual baselines for Pack 1 + BDW-T2-01 have NOT been captured yet
because both blockers below require an interactive operator.

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

## Why this isn't in CI today

The capture step needs a live dev server + a logged-in browser
context, neither of which CI provides yet. The plan is:

- **Phase 1** (now) — operator-driven baselines committed to
  `docs/screenshots/`, diffs run locally before promotion.
- **Phase 2** — wire `pnpm qa:screenshot diff --via preview` into a
  preview-environment GitHub Action (no auth needed for the preview
  path; founder-v0 falls back to a seeded dev DB).
- **Phase 3** — add the `/train` diff once an ephemeral Supabase test
  account is provisioned in the workflow.
