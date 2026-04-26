import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listModulesForUser, type ModuleState } from '@/lib/services/academyService'

export const dynamic = 'force-dynamic'

const STATE_COPY: Record<ModuleState, { label: string; tone: string }> = {
  locked: { label: 'Locked', tone: 'text-text-mute' },
  new: { label: 'Start here', tone: 'text-text-dim' },
  in_progress: { label: 'In progress', tone: 'text-iq' },
  mastered: { label: 'Mastered', tone: 'text-brand' },
}

export default async function AcademyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const modules = await listModulesForUser(user.id)

  return (
    <main className="min-h-dvh bg-bg-0 p-6 text-text">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[1.5px] text-text-dim">IQ Academy</p>
          <h1 className="font-display text-3xl font-bold">Pick a module</h1>
          <p className="text-sm text-text-dim">
            Each module is a short read followed by scenarios that train it. Master one to unlock what&apos;s next.
          </p>
        </header>

        {modules.length === 0 ? (
          <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
            <p className="text-sm text-text-dim">
              No modules loaded yet. Run <code className="rounded bg-bg-2 px-1.5 py-0.5">pnpm seed:lessons</code> to populate the curriculum.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modules.map((mod) => {
              const copy = STATE_COPY[mod.state]
              const accuracyPct = Math.round(mod.rolling_accuracy * 100)
              const locked = mod.state === 'locked'
              const card = (
                <div
                  className={`flex h-full flex-col gap-3 rounded-2xl border bg-bg-1 p-4 transition-colors ${
                    locked ? 'border-hairline-2 opacity-60' : 'border-hairline-2 hover:border-hairline'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
                    <span className="text-text-dim">Module {mod.order}</span>
                    <span className={copy.tone}>{copy.label}</span>
                  </div>
                  <div>
                    <p className="font-display text-base font-semibold leading-snug">{mod.title}</p>
                    <p className="mt-1 text-xs text-text-dim">
                      {mod.scenario_count} scenario{mod.scenario_count === 1 ? '' : 's'}
                      {mod.attempts > 0 ? ` · ${accuracyPct}% rolling` : ''}
                    </p>
                  </div>
                  {!locked && (
                    <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-bg-2">
                      <div
                        className="h-full bg-brand transition-all"
                        style={{ width: `${Math.min(100, accuracyPct)}%` }}
                      />
                    </div>
                  )}
                  {locked && (
                    <p className="mt-auto text-[11px] text-text-mute">
                      Master {mod.prerequisite_slugs.join(', ')} to unlock
                    </p>
                  )}
                </div>
              )
              return locked ? (
                <div key={mod.slug}>{card}</div>
              ) : (
                <Link key={mod.slug} href={`/academy/${mod.slug}`} className="block">
                  {card}
                </Link>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Link href="/train" className="rounded-xl bg-brand px-4 py-3 text-sm font-bold text-black">
            Quick 5-Scenario Session
          </Link>
          <Link href="/home" className="rounded-xl bg-bg-2 px-4 py-3 text-sm font-semibold">
            Back Home
          </Link>
        </div>
      </div>
    </main>
  )
}
