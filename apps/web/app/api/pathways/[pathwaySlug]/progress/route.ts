/**
 * GET /api/pathways/:pathwaySlug/progress (PTH-1).
 *
 * Returns the user's PathwayProgressSummary for the given pathway. The
 * home page CTA card uses this to surface progress % and the
 * recommended-next CTA without doing the derivation client-side.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPathwayProgress } from '@/lib/pathways/progressService'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pathwaySlug: string }> },
) {
  const { pathwaySlug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await getPathwayProgress(user.id, pathwaySlug)
  if (!summary) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  return NextResponse.json(summary)
}
