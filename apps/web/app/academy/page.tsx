import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AcademyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let loadError: string | null = null
  let liveScenarios: Array<{ concept_tags: string[] }> = []
  try {
    liveScenarios = await prisma.scenario.findMany({
      where: { status: 'LIVE' },
      select: { concept_tags: true },
      orderBy: [{ difficulty: 'asc' }, { updated_at: 'desc' }],
      take: 60,
    })
  } catch (error) {
    loadError = 'We couldn’t load the Academy catalog right now.'
    console.error('[academy/page] failed to load scenarios', error)
  }

  const conceptMap = new Map<string, number>()
  for (const scenario of liveScenarios) {
    for (const concept of scenario.concept_tags) {
      conceptMap.set(concept, (conceptMap.get(concept) ?? 0) + 1)
    }
  }

  const concepts = [...conceptMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)

  return (
    <main className="min-h-dvh bg-bg-0 p-6 text-text">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[1.5px] text-text-dim">IQ Academy</p>
          <h1 className="font-display text-3xl font-bold">Build core decision-making concepts</h1>
          <p className="text-sm text-text-dim">
            Practice starts in Scenario sessions. These are the most-covered concepts in your current curriculum set.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {concepts.length ? concepts.map(([concept, count]) => (
            <div key={concept} className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
              <p className="text-xs uppercase tracking-wide text-text-dim">Concept</p>
              <p className="mt-1 text-base font-semibold">{concept.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-sm text-text-dim">{count} live scenario{count === 1 ? '' : 's'}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4 sm:col-span-2">
              <p className="text-sm text-text-dim">No live curriculum yet. Seed scenarios to populate Academy modules.</p>
            </div>
          )}
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
            <p className="text-sm text-heat">{loadError}</p>
            <p className="mt-1 text-xs text-text-dim">You can still start a training session below.</p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Link href="/train" className="rounded-xl bg-brand px-4 py-3 text-sm font-bold text-black">
            Start 5-Scenario Session
          </Link>
          <Link href="/home" className="rounded-xl bg-bg-2 px-4 py-3 text-sm font-semibold">
            Back Home
          </Link>
        </div>
      </div>
    </main>
  )
}
