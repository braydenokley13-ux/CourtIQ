# Saved answers and the executable team system

The Defense Lab runs without authentication, a database, film, tracking hardware or an AI service. Its first team-system boundary is a portable, versioned saved answer. The coach must be able to return to a question, reproduce the reasoning and teach the same answer.

## What an answer owns

An answer records the canonical problem and content version; the engine/model version; defensive rules and offensive intent; deterministic seed and explicit assumptions; chronological interventions; coach-facing name and notes; local aliases for stable role identities; and selected teaching role/checkpoints. It does not own renderer state, a proprietary avatar, a camera trajectory or an opaque precomputed movie.

The canonical teaching replay is generated through the same simulation entry point as the experiment. A time-specific intervention therefore retains the same history before its timestamp in Lab and Teach. Camera and responsibility emphasis are presentation choices over that replay. A custom name such as “basket protector” changes a displayed label, never the canonical low-man identity or engine logic.

Schema version, problem version and engine version serve different purposes. Schema version identifies the portable record format. Problem version identifies authored content and its reviewed counter/rotation graph. Engine version identifies the model producing a result. Loading a prior record under a different model must be explicit; never quietly reinterpret a saved result as if it were the original experiment. In this V1, unsupported imported versions are rejected with a readable explanation rather than automatically migrated.

## Local repository behavior

The browser repository persists to one namespaced localStorage key. It is local to the browser profile and origin, without cloud synchronization or staff sharing. The UI must say “Saved on this device,” provide export/import, and never imply an account backup.

The implemented boundary is `answers.ts`: `createAnswer` snapshots and validates inputs; `loadAnswers`, `saveAnswer`, `deleteAnswer` and `importAnswers` return `{ answers, persisted, error? }`; `exportAnswers` emits a versioned collection. Imported ID collisions receive a new identity and an “(imported)” suffix. The collection is capped at 100 answers and 2 MB; each config supports at most 64 chronological interventions. Import rejects unsupported engine/content/schema versions. The schema uses the same physical input bounds as the simulator, so a saved import cannot promise a replay the engine then refuses.

`persisted` describes whether the current collection is saved on the device; the caller must check `error` before announcing an operation succeeded. A rejected import may return the previously persisted collection with an error, while a valid import followed by quota failure returns new in-memory answers with an error. Default browser state is not retained in a shared server module.

Storage access is optional: SSR has no browser storage; private-mode policy, extension policy or quota may deny read/write. The repository keeps active answers in memory for the current page session and reports the durability failure. The coach can still run, compare, teach and export. It must not show a success toast claiming durable saving after a failed write. Export remains a normal JSON download initiated by the coach, without network work.

Import is an untrusted-data boundary. Validate a bounded document, supported schema/model/problem identifiers, exact config values, finite coordinates and time ranges, role IDs, aliases, and chronological intervention order before merging any records. A failed import leaves the existing collection intact. An ID collision must preserve both independent answers or deliberately replace the matching record through an explicit repository policy, never silently drop one. Coach prose is ordinary text; React must render it as text rather than HTML.

Export/import provides reviewable transfer and backup. It does not establish authorship, access control, roster privacy, cross-device synchronization or encrypted team collaboration. Those are later service requirements, not claims of local JSON storage.

## Growth behind this boundary

The next durable service can implement the same repository operations with program, season and answer revision ownership. Add permissions for coaches and read-only players; optimistic revisions for staff edits; audit history; explicit model/content migrations; and canonical shareable teaching references. Preserve client execution for low-latency experiments. Server storage must not become a dependency of every rerun.

A team system aggregates answers and rule variants around stable basketball concepts. Program terminology is a mapping over those concepts. Varsity, JV and freshman teams can inherit a program rule and override a reviewed variant; inheritance should retain provenance and allow a coach to understand which answer is currently taught. Do not force this hierarchy on the single-coach first visit.

Prep is a curated selection of existing problem/answer references for an upcoming opponent. Film later contributes a source observation or a start state attached to a problem. Tracking/learned behavior later contributes model adapters and calibrated uncertainty. Neither replaces canonical authored rules or becomes required to open the Lab.

## Content expansion gate

Each executable problem must declare stable identity/version, basketball-native roles, constraints, offensive action/read/counter graph, default defensive answers, explicit assumptions, stress points, teaching checkpoints, sources and coaching alternatives. It should reuse domain/world/analytical primitives and remain independent of the renderer. A problem is ready only after basketball review, causal/determinism checks, a contrasting answer that exposes a useful tradeoff, and visual teaching review.

Do not build a giant library interface before multiple reviewed problems exist. The long-term corpus is valuable because its problems interact and can be trusted, not because its count is large.

## Validation priorities

Persistence tests should cover a full answer round trip, reload through a fresh repository, time/geometry validation, malformed and unsupported imports, duplicate identity policy, storage-denied/quota failures and export when persistence fails. Engine tests own canonical replay equality, deterministic seed behavior and preservation of history; the repository stores the inputs and must not clone engine logic.

The current repository suite includes an exported/imported time-specific answer regenerated by the engine and compares the entire frame and decision history to the original run. This verifies canonical Teach input fidelity, not real-world predictive validity.

See [product-synthesis.md](./product-synthesis.md) for inspected competitive evidence and workflow hypotheses. Older repository specifications describe the previous player IQ product and remain historical context.
