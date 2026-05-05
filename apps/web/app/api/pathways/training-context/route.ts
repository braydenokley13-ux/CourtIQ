/**
 * GET /api/pathways/training-context (PTH-2).
 *
 * Resolves a Pathway training context from query params and returns
 * the ResolvedPathwayTrainingContext shape that /train uses to:
 *   - know which scenarioIds to send to /api/session/start;
 *   - render the Pathway context strip at the top of the page;
 *   - thread pathway/chapter/node back to /train/summary.
 *
 * Query params:
 *   pathway      — pathway slug (required to opt into the resolver)
 *   chapter      — chapter slug (optional)
 *   node         — skill-node slug (optional)
 *   scenarioIds  — CSV of scenario IDs (optional; explicit pin)
 *
 * Returns the resolved context (with `error` set on soft failures
 * like coming-soon pathways or unknown chapter slugs) so the client
 * can decide whether to start the session, show a warning, or fall
 * through to plain weighted training.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePathwayTrainingContextWithProgress } from '@/lib/pathways/trainingContext'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const pathwaySlug = url.searchParams.get('pathway')
  const chapterSlug = url.searchParams.get('chapter')
  const nodeSlug = url.searchParams.get('node')
  const scenarioIdsCsv = url.searchParams.get('scenarioIds')
  const mode = url.searchParams.get('mode')

  // Without a pathway slug there's nothing to resolve. Returning
  // `context: null` lets the client cleanly fall back to weighted
  // training without special-casing 404s.
  if (!pathwaySlug) {
    return NextResponse.json({ context: null })
  }

  const context = await resolvePathwayTrainingContextWithProgress(user.id, {
    pathwaySlug,
    chapterSlug,
    nodeSlug,
    scenarioIdsCsv,
    mode,
  })

  return NextResponse.json({ context })
}
