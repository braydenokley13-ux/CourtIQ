import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ScenarioPreviewClient } from './ScenarioPreviewClient'
import {
  listAllPackIds,
  readScenario,
  resolveRequestedId,
} from './_packReader'
import { QA_MATRIX_IDS } from '@/lib/scenario3d/qaMatrix'

export const dynamic = 'force-dynamic'

/**
 * FR-1 — `/dev/scenario-preview` Film-Room QA route.
 *
 * Sister to `/dev/scene-preview` (the Phase F0 screenshot harness).
 * Where that surface renders ONE scenario for Playwright capture,
 * this surface lets a developer pick any of the 20 founder-v0
 * scenarios in < 5 s and inspect both the seed metadata and the
 * live renderer state side-by-side.
 *
 * URL contract (Pack 2 §3.1.13)
 * -----------------------------
 * Stable, deterministic, reproducible-by-paste:
 *
 *   /dev/scenario-preview?id=BDW-01     ← canonical (Pack 2)
 *   /dev/scenario-preview?scenario=BDW-01  ← back-compat alias
 *   /dev/scenario-preview                ← falls back to QA_MATRIX_IDS[0]
 *
 * The `id` parameter is the canonical Pack 2 form and matches the
 * scenario id used by every other surface (DB, seeder, telemetry).
 * The legacy `scenario` parameter is preserved so existing links from
 * Slack / Notion / PRs keep working; it has lower precedence than
 * `id` when both are present.
 *
 * Determinism guarantees
 * ----------------------
 *   - No DB read. The page reads JSON files from
 *     packages/db/seed/scenarios/packs/founder-v0/ at request time;
 *     same git SHA → same scenario data.
 *   - No randomness in scenario selection. An invalid / unknown id
 *     falls back to `QA_MATRIX_IDS[0]` (currently `BDW-01`); this is
 *     intentionally silent so a typo doesn't 404 a QA session, but
 *     the chosen id is always reflected in the rendered selector,
 *     so QA can confirm what they're looking at.
 *   - Server-side preload of all 20 scenarios so the client selector
 *     never round-trips for metadata. Same payload every render.
 *
 * Gating:
 *   - In `NODE_ENV !== 'production'` always served.
 *   - In production, served only when
 *     `ENABLE_DEV_ROUTES === '1'`. We do NOT add a second admin
 *     gate here — the same env-flag posture as `/dev/scene-preview`,
 *     so an operator who flips the flag in a non-prod deploy gets
 *     the route, and a leaked production deploy still 404s.
 *
 * Read-only with respect to the renderer: the page reaches into
 * existing exports (`_getPlayerFigureDecisionLog`, the gate readers,
 * the env-flag inspectors) but does not modify any renderer
 * behavior. A scenario chosen here renders through the same
 * `Scenario3DView` that ships in `/train`.
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ScenarioPreviewPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_DEV_ROUTES !== '1'
  ) {
    notFound()
  }

  const params = await searchParams
  // Pack 2 §3.1.13 — `?id=` is the canonical form. `?scenario=` stays
  // as a back-compat alias so existing share links keep working.
  // Precedence: `id` wins when both are present (canonical > legacy).
  const rawId = params.id
  const rawScenario = params.scenario
  const requested =
    typeof rawId === 'string' && rawId.length > 0
      ? rawId
      : typeof rawScenario === 'string' && rawScenario.length > 0
        ? rawScenario
        : null

  // Pack 2 §3.1.4 — the preview now resolves ids across BOTH the
  // founder-v0 QA matrix and the materialized template-v1 pack so
  // /dev/scenario-preview?id=BDW-T2-01 lands on the gold-standard
  // Pack 2 scenario instead of silently falling back to BDW-01.
  // QA_MATRIX_IDS still drives the preferred selector ordering and
  // the default landing scenario.
  const allIds = await listAllPackIds()
  const initialId = resolveRequestedId({
    requested,
    knownIds: allIds,
    defaultId: QA_MATRIX_IDS[0]!,
  })

  // Read every available scenario once, server-side. The dev page is
  // gated and the union of founder-v0 + templates-v1 is small. Pre-
  // loading avoids a per-click round-trip on the client.
  // Selector ordering: QA_MATRIX_IDS first (Pack 1, the matrix that
  // operators learn by heart), then any extra ids exposed by the
  // template-v1 pack so a Pack 2 scenario is always reachable from
  // the dropdown.
  const orderedIds = [
    ...QA_MATRIX_IDS,
    ...allIds.filter((id) => !QA_MATRIX_IDS.includes(id)),
  ]
  const scenarios = await Promise.all(
    orderedIds.map(async (id) => ({ id, record: await readScenario(id) })),
  )

  // FR-2 Packet 1 — emit a `<link rel="preload">` for the bundled
  // mannequin GLB on the QA route so the browser starts the asset
  // fetch alongside the document. Mirrors `app/train/layout.tsx` so
  // every founder-v0 scenario rendered through this surface gets the
  // same cold-cache mitigation that ships in `/train`. Gated on the
  // canonical env var so a build with the GLB flag off never adds
  // the 1.4 MB preload.
  const glbPreloadEnabled =
    process.env.NEXT_PUBLIC_USE_GLB_ATHLETE_PREVIEW === '1'

  return (
    <Suspense>
      {glbPreloadEnabled ? (
        <link
          rel="preload"
          href="/athlete/mannequin.glb"
          as="fetch"
          type="model/gltf-binary"
          crossOrigin="anonymous"
        />
      ) : null}
      <ScenarioPreviewClient
        initialScenarioId={initialId}
        scenarios={scenarios.flatMap((s) =>
          s.record ? [s.record] : [],
        )}
      />
    </Suspense>
  )
}
