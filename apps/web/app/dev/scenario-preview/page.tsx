import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ScenarioPreviewClient } from './ScenarioPreviewClient'
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

interface ScenarioRecord {
  id: string
  decoder_tag: string | null
  difficulty: number | null
  title: string | null
  prompt: string | null
  visible_cue: string | null
  best_read: string | null
  decoder_teaching_point: string | null
  explanation_md: string | null
  user_role: string | null
  concept_tags: string[]
  sub_concepts: string[]
  court_state: unknown
  scene: unknown
}

/**
 * Reads a single founder-v0 scenario JSON. Returns `null` if the
 * file is absent or malformed; the caller decides how to surface
 * that to the UI.
 */
async function readScenario(id: string): Promise<ScenarioRecord | null> {
  const packPath = path.resolve(
    process.cwd(),
    '..',
    '..',
    'packages',
    'db',
    'seed',
    'scenarios',
    'packs',
    'founder-v0',
    `${id}.json`,
  )
  let raw: string
  try {
    raw = await fs.readFile(packPath, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const records = Array.isArray(parsed) ? parsed : [parsed]
  const found = records.find(
    (r): r is Record<string, unknown> =>
      typeof r === 'object' && r !== null && (r as { id?: unknown }).id === id,
  )
  if (!found) return null
  return {
    id,
    decoder_tag:
      typeof found.decoder_tag === 'string' ? found.decoder_tag : null,
    difficulty:
      typeof found.difficulty === 'number' ? found.difficulty : null,
    title: typeof found.title === 'string' ? found.title : null,
    prompt: typeof found.prompt === 'string' ? found.prompt : null,
    visible_cue:
      typeof found.visible_cue === 'string' ? found.visible_cue : null,
    best_read: typeof found.best_read === 'string' ? found.best_read : null,
    decoder_teaching_point:
      typeof found.decoder_teaching_point === 'string'
        ? found.decoder_teaching_point
        : null,
    explanation_md:
      typeof found.explanation_md === 'string' ? found.explanation_md : null,
    user_role: typeof found.user_role === 'string' ? found.user_role : null,
    concept_tags: Array.isArray(found.concept_tags)
      ? (found.concept_tags as unknown[]).filter(
          (s): s is string => typeof s === 'string',
        )
      : [],
    sub_concepts: Array.isArray(found.sub_concepts)
      ? (found.sub_concepts as unknown[]).filter(
          (s): s is string => typeof s === 'string',
        )
      : [],
    court_state: found.court_state,
    scene: found.scene,
  }
}

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
  const rawScenario = params.scenario
  const requested =
    typeof rawScenario === 'string' && rawScenario.length > 0
      ? rawScenario
      : null
  const initialId =
    requested && QA_MATRIX_IDS.includes(requested)
      ? requested
      : QA_MATRIX_IDS[0]

  // Read every founder-v0 scenario once, server-side. This is fine —
  // the dev page is gated and there are only 20 entries. Pre-loading
  // all metadata avoids a per-click round-trip on the client and
  // keeps the selector snappy.
  const scenarios = await Promise.all(
    QA_MATRIX_IDS.map(async (id) => ({ id, record: await readScenario(id) })),
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
