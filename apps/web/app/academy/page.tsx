'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DEFAULT_CONCEPTS = [
  { slug: 'spacing_fundamentals', count: 12 },
  { slug: 'help_defense_basics', count: 10 },
  { slug: 'closeouts', count: 9 },
  { slug: 'transition_stop_ball', count: 8 },
  { slug: 'low_man_rotation', count: 7 },
]

export default function AcademyPage() {
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setAuthed(true)
    }

    checkAuth()
  }, [])

  if (!authed) {
    return <main className="p-6 text-text-dim">Loading Academy…</main>
  }

  return (
    <main className="min-h-dvh bg-bg-0 p-6 text-text">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[1.5px] text-text-dim">IQ Academy</p>
          <h1 className="font-display text-3xl font-bold">Build core decision-making concepts</h1>
          <p className="text-sm text-text-dim">
            Start with these high-impact concepts, then reinforce them in your 5-scenario sessions.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DEFAULT_CONCEPTS.map(({ slug, count }) => (
            <div key={slug} className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
              <p className="text-xs uppercase tracking-wide text-text-dim">Concept</p>
              <p className="mt-1 text-base font-semibold">{slug.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-sm text-text-dim">{count} practice reps available</p>
            </div>
          ))}
        </div>

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
