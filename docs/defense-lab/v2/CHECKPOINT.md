# CourtIQ v2 checkpoint — parallel sprint

Branch `claude/happy-mayer-xgfe3w`. Every pushed commit was verified in an isolated worktree (typecheck + `vitest run lib/defense-lab components/courtiq`) by `scripts/qa-local/safe-push.sh` (local helper, gitignored).

## Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| **A. Real coach usability** | **OPEN — needs a human.** Product prepared; agent proxies only. | `COACH-TEST.md` protocol; proxy walks `critique/coach-usability.md`, `critique/coach-proxy-2.md` |
| **B. Core coverages are real** | Drop / Switch / Blitz / ICE behaviorally distinct; Hedge hidden. Coverage gate 54/57 (remaining: hedge-only and one timing-tuning assertion, deliberately not forced). | `coverage-spec.md`, `lib/defense-lab/coverageGate.test.ts` (`COVERAGE_GATE=1`), `lib/defense-lab/engineHonesty.test.ts` |
| **C. Normal-laptop performance** | Instrumented and tiered; **real-GPU FPS unvalidated** (workspace has only software GL). | `perf/README.md`, `scripts/perf/bench.mjs --gpu`, in-app `/?bench`, `/?debug` HUD |
| **D. Complete golden path** | **Passed** on the integrated build: choose → run → why → fix → compare → break → fix vs counter → break again → save → teach → Our System → reload (persisted) → reopen. No console errors. | `scripts/qa-local/golden2.mjs` (local), screenshots summarized below |
| **E. Reusable engine proof** | Simulator: yes — baseline drive → drift/weakside rotation as 108 lines of content + 7 generic engine lines. Coach surface: not yet (P&R-bound UI, answer vocabulary, attack domain). | `reusability.md`, `lib/defense-lab/problems/baselineDrive*.ts` |

## What changed this sprint (high level)

**Basketball engine** — continuous reads (the offense takes what the defense gives); per-player capability and personnel; drop depth matters; pass latch keeps closeouts alive; counters are first-read constraints and create defensive obligations; per-coverage POA / big / low-man / backside policies; finish type (layup / pull-up / catch-and-shoot), realized vs best-case arrival, deterministic robustness ("3 of 8 slightly different tries"). Hedge hidden until distinct.

**Explanation layer** — one cause sentence naming who did what, spoken times in Simple words, numbers on demand; fixes named by who moves and what they give up; Compare built from per-player divergence so headline/body/bars agree; Simple words / Coaching terms / Our words (program-level, persistent; the team's own coverage name everywhere).

**World** — athletes v4 (one draw call each, foot-lock IK, athletic stance, faces, tiers, meshopt); relit navy gym with high/balanced/low; director camera frames the problem inside a UI safe area; working Overhead / Baseline / His-eyes; X-Ray as duty strings, arrival map and glass corridors; hologram compare ghosts with distance pins; Break Mode volleys counters from behind the defense and freezes on the vulnerability.

**Product** — four surfaces (Lab, Our System, Teach, Library); Save asks only name / who / when and stores the exact executable config, accepted tradeoff, known breaks and version history; Teach plays the saved answer one player at a time with read checkpoints; Full control holds rules (with "fired at / never fired"), personnel, offense, model and timed cues.

## Known weaknesses (honest list)
- Real-coach gate not run. Real-GPU frame rate not measured. Chromebook-class untested.
- Athletes: close-range artifacts (thigh specks at shorts hem, faint seam number), no cloth motion, simple faces.
- Coverage gate: hedge assertions and a first-pass-timing spread assertion remain failing by design; ICE on a middle screen is a "force away" approximation.
- Switch mismatch shows on the handler and roller, but the post-seal layup can be marginal; drop's headline problem reproduces in only 3/8 jittered runs (shown to the coach).
- Second problem is engine-only; the UI is still P&R-specific.
- First Compare shows a one-time ~5 s stall under software GL (cause not pinned).

See `critique/final-adversarial.md` for the independent end-of-sprint attack.
