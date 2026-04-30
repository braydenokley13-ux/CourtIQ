import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ScenePreviewClient } from './ScenePreviewClient'

export const dynamic = 'force-dynamic'

/**
 * Phase F0 — dev-only QA preview route. Renders the BDW-01 scene
 * (or any scenario from the founder-v0 pack) without going through
 * the Supabase auth flow so Playwright screenshot harnesses can
 * capture the 3D canvas in CI / local QA.
 *
 * Refuses to render in production builds so this route cannot leak
 * private user data or weaken auth posture. The middleware also
 * lists `/dev` as a public path so the unauthenticated screenshot
 * worker can reach it locally.
 *
 * Query params:
 *   ?scenario=BDW-01   pick the scenario id from the founder pack
 *                      (defaults to BDW-01 — the Phase F target).
 *   ?fullscreen=1      auto-click the fullscreen control once the
 *                      canvas renders. Used by the screenshot harness
 *                      so the same page captures both default and
 *                      fullscreen layouts.
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ScenePreviewPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_ROUTES !== '1') {
    notFound()
  }

  const params = await searchParams
  const rawScenario = params.scenario
  const scenarioId =
    typeof rawScenario === 'string' && rawScenario.length > 0 ? rawScenario : 'BDW-01'
  if (!/^[A-Z]{2,5}-\d{2,3}$/.test(scenarioId)) {
    notFound()
  }
  const fullscreen = params.fullscreen === '1'

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
    `${scenarioId}.json`,
  )
  let raw: string
  try {
    raw = await fs.readFile(packPath, 'utf8')
  } catch {
    notFound()
  }

  type ScenarioJson = {
    id: string
    prompt: string
    court_state: unknown
    concept_tags?: string[]
    user_role?: string
    scene?: unknown
    decoder_tag?: string | null
  }
  const records = JSON.parse(raw) as ScenarioJson[]
  const scenario = records.find((r) => r.id === scenarioId)
  if (!scenario) {
    notFound()
  }

  return (
    <Suspense>
      <ScenePreviewClient
        scenario={{
          id: scenario.id,
          prompt: scenario.prompt,
          court_state: scenario.court_state,
          concept_tags: scenario.concept_tags ?? [],
          user_role: scenario.user_role,
          scene: scenario.scene,
          decoder_tag: scenario.decoder_tag ?? null,
        }}
        fullscreen={fullscreen}
      />
    </Suspense>
  )
}
