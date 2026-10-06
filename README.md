# CourtIQ

**Lab → Our System → Teach → Library.** A local-first basketball strategy product for programs. The hero problem is High P&R → low-man help → weakside lift / skip.

There is no database, account or service credential requirement. Basketball executes locally; accepted program knowledge survives reload in IndexedDB and travels through JSON export/import.

## Run

Use Node 22 and pnpm 9.15:

```bash
pnpm install --frozen-lockfile
pnpm content:check
pnpm --filter @courtiq/web dev
```

Open `http://localhost:3000`. `/lab` is an alias for the same product.

Build and serve production locally:

```bash
pnpm build
pnpm --filter @courtiq/web start
```

The build validates/materializes Git-authored executable content before compilation. It does not contact or mutate a database. Local fonts and assets require no remote font service.

## Use

Choose a situation and answer, run the reactive opponent, inspect X-Ray, change a rule and compare. Break My Defense searches bounded basketball alternatives and shows the executable vulnerability. Save commits an accepted version to Our System; Teach uses that exact version. Choose plain, coach or precise terminology. Export program knowledge before clearing this device or moving to another browser; Import restores it.

Legacy local answers remain available for retest and recovery. Storage failure is visible and an uncommitted candidate can be exported. Browser storage is origin-specific; cloud sync is a future adapter.

Program history and compact JSON backups share a 128 MiB limit; history is never silently trimmed. Browser storage quota and performance still depend on the device. Exact inputs and immutable version identities allow future paging or content deduplication within the persistence adapter.

## Verify

```bash
pnpm content:check
pnpm boundaries:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# Against the production server with Chromium installed:
BASE_URL=http://localhost:3000 node scripts/verify-foundation.mjs
```

[Architecture](ARCHITECTURE.md) describes executable basketball, simulation, rendering, program knowledge and replaceable infrastructure. [Verification](docs/architecture/VERIFICATION.md) records actual gates and remaining limits. The retired player-training product is preserved in Git history.

The current Three.js world, adaptive quality, authored athletes and gym assets remain. [Asset rights](apps/web/public/athlete/LAB-HUMAN.md), [equipment pipeline](scripts/environment/README.md) and [performance protocol](docs/rendering/performance-protocol.md) describe their provenance and verification. Athlete animation is presentation; domain body/ball geometry determines simulation evidence.
