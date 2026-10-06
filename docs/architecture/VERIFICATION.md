# Foundation verification

Verification date: 2026-10-06. Migration baseline: merged main `1eb6a3309aa5934136f42b1c02ebdf52934848f1`. Architecture branch: `feat/courtiq-foundation`.

## Integrated gates

All commands use actual Node **22.23.3** and pinned pnpm **9.15.0**.

| Check | Observed result |
| --- | --- |
| Frozen install, including an offline repeat | Passed; four workspace projects, lockfile unchanged |
| `pnpm content:check` | Passed; authored hero and baseline execution validate; committed manifest matches materialization |
| `pnpm boundaries:check` | Passed; no outward basketball dependencies, domain-to-infrastructure imports, kernel-to-content imports or renderer-to-persistence imports |
| `pnpm typecheck` | Passed; pure package excludes Node/DOM ambient types and uses strict unused/return checks |
| `pnpm lint` | Passed with zero warnings |
| `pnpm test` | **588 passed**, 39 files, zero skipped: 428 pure basketball/program tests and 160 browser-adapter/UI/rendering tests |
| No-backend production build | Passed; Next 15.5.15, local fonts, no remote service or database mutation |
| No-backend production boot | Passed; `/` returned 200 and `/api/health` returned process liveness |
| Athlete asset validator | Passed under Node 22; skinning/clips/foot/envelope/loop checks; existing GLB bytes unchanged |

For the build and boot, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were removed from the process environment. No real `.env` files were present. Internal review routes were disabled for production boot. The build first materialized local content, then compiled the pure package and Next application.

## Basketball and persistence evidence

The frozen merged-main engine and migrated engine were compared on five coverages × six counters: **30 cases and 6,990 committed frames**. Player positions differed by at most `4.17e-15` metres, velocities by `2.70e-14` metres/second and ball positions by `7.03e-15` metres. Possession phases, owners, receivers, selected reads, read times, read nodes and analytical verdicts agree. This preserves the hero while moving its formulas into authored content.

Default-on coverage gates check actual obligations, trajectories, reactive reads and tag tradeoffs over three seeds. The native baseline-drive fixture varies its own helper rules and formation; renamed hero/baseline IDs preserve physical behavior. Deterministic replay, serialization, independent forks and unchanged branch prefixes are tested. Recorded policy rails, capability-aware arrival samples and separate comparison assumptions have regression coverage.

Native IndexedDB tests cover transaction-complete acknowledgement, abort rollback, same-revision concurrency, migration/ledger/quarantine atomicity, legacy-only recovery, unreadable legacy storage, unsupported root schemas, non-JSON corruption and clear/restore. Controller tests cover failed-save session export/retry, malformed imports, stale reads/editor capture, backwards-in-time edits, repository substitution without native storage and pinned Teach rosters. Program tests preserve transitive incoming lineage, divergent-import references, unsupported executable/recipe JSON, evidence graph/time identities and locale-independent value identity. Native editing requires exact recompilation equivalence.

A 24-version history containing frozen hero inputs and one frozen Break per version exceeds the former 8 MiB limit, round-trips compact and historical pretty JSON, and retains exact evidence and lineage. Durable validation and portable import/export now share a 128 MiB compact allowance. Measured version growth predicts roughly 678 ordinary or 268 one-Break versions across entries; these are byte-capacity estimates, not a maximum-size performance or browser-quota test.

## Browser, reviews and deployment

The final rebuilt production-browser golden path is in progress. The browser script exercises root and `/lab`, retired-route 404s, Run, X-Ray, rule changes, Break/fix/rebreak, Compare, versioned Save, Teach, terminology, reload, reopen, export, malformed import, clear/restore and Library-to-Lab execution. It records screenshots, console/asset failures and unexpected backend requests. Software GL proves functionality; it does not establish hardware frame rate.

Independent Astra implementation review reproduced and rechecked fixes for corrupt-root recovery, stale save authorization, unavailable schemas/recipes, cyclic and expanding action graphs, nonfinite execution, authoring/IR mismatch, moved-player starts, hero formula drift, read/launch ownership, evidence identity and backwards edits. Its final probes have no unresolved BLOCKER/HIGH findings.

The mandatory fresh hostile Sol review independently verified fixes for three HIGH defects: unavailable editing provenance, lost imported descendant ancestry and aggregate replay/text/query amplification. Six MEDIUM corrections cover inherited identifier collisions, stale refreshes, non-JSON recovery, first-launch availability, locale-dependent fingerprints and phantom/out-of-duration evidence. Astra's additional HIGH capacity finding and root's capability-aware impossibility correction were independently rechecked. Its focused suite contains 104 unique passing tests; no BLOCKER or HIGH remains. This certification is scoped to source and bounded probes; real deployment/browser gates remain separate.

Vercel project `court-iq` (`prj_LcJ2sCHu6Lp9uk2CKWlIPWih6d6V`) now uses Node 22, Next.js, a frozen install and plain `pnpm build`, with output `apps/web/.next`. The old database deletion/schema-push/seed pipeline and crons are removed. Exact migration preview and production deployment identities and browser results will be recorded after inspection. The deleted Supabase project has not been recreated or replaced.

The 12 retired deployment values were overwritten with harmless markers and removed from production. A fresh non-decrypting inventory shows **only `ENABLE_EXPERIMENTAL_COREPACK` in production**, zero hidden production variables, and none of the five database/Supabase names. The connector exposes no environment DELETE, and Vercel rejects empty targets and renaming/retyping sensitive records. Consequently eight inert sensitive records remain in preview and four renamed inert records remain in development. Their values are no longer credentials; deleting the remaining metadata requires an environment DELETE capability. No credential value was decrypted or reported.

## Limits

The model is a bounded half-court possession system with authored assumptions and analytical uncertainty. Break searches its declared alternatives. One-origin browser storage requires export/import to move knowledge; cloud synchronization is not implemented. Physical school-laptop GPU performance, coach acceptance and model calibration remain direct product-validation work.
