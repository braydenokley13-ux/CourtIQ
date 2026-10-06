# Preserved git stash (do not drop casually)

`stash@{0}` — "WIP on claude/happy-mayer-xgfe3w: 3a8f1cb" — was created by an engine worker on 2026-10-06 that ran `git stash` to benchmark the original engine. Every file was restored from it immediately; the working tree at that moment was newer than the stash and was kept. It is preserved per founder instruction.

Base: `3a8f1cb` (Merge PR #173, the first strategy-lab build).

Contents (16 files, intermediate states of work that has since been committed in later forms):

| File | What the stash holds |
| --- | --- |
| apps/web/app/page.tsx | First switch of `/` to the new CourtIQ app shell |
| apps/web/components/defense-lab/labEnvironment.ts | Early version of the relit gym (later superseded) |
| apps/web/lib/defense-lab/{analytics,attackCore,defensivePolicy,scenario,simulation,types}.ts | First engine fidelity pass (capability/big depth) mid-edit |
| apps/web/next.config.ts, .gitignore | `NEXT_DIST_DIR` support and `.next-*` ignore |
| apps/web/tsconfig.json | Next dev auto-edit adding `.next-*/types` (intentionally never committed) |
| apps/web/public/athlete/*.glb, lab-athlete-build.json | An intermediate athlete export |
| scripts/athlete/build_studio_athlete.py, source/lab-athlete-studio.blend | Intermediate bpy 5.2 port |

Nothing in the stash is ahead of the branch: each item was either restored into the tree and later committed in an improved form, or is a dev-server artifact. Inspect with `git stash show -p stash@{0} -- <path>`. Rule for all workers: never run `git stash`, `checkout` (except `apps/web/tsconfig.json`), or `reset` while others edit the shared tree.
