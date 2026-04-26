import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listModulesForUser, type ModuleState } from '@/lib/services/academyService'

export const dynamic = 'force-dynamic'

const STATE_COPY: Record<ModuleState, { label: string; tone: string; emoji: string }> = {
  locked: { label: 'Locked', tone: 'text-text-mute', emoji: '🔒' },
  new: { label: 'New', tone: 'text-iq', emoji: '⭐' },
  in_progress: { label: 'In progress', tone: 'text-iq', emoji: '🟢' },
  mastered: { label: 'Done', tone: 'text-brand', emoji: '✅' },
}

export default async function AcademyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const modules = await listModulesForUser(user.id)
  const masteredCount = modules.filter((m) => m.state === 'mastered').length
  const inProgress = modules.find((m) => m.state === 'in_progress')
  const nextNew = modules.find((m) => m.state === 'new')
  const featured = inProgress ?? nextNew

  return (
    <main className="min-h-dvh bg-bg-0 p-5 text-text">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="space-y-1">
          <Link href="/home" className="text-[11px] uppercase tracking-[1.5px] text-text-dim hover:text-text">
            ← Home
          </Link>
          <h1 className="mt-2 font-display text-[28px] font-bold">Lessons</h1>
          <p className="text-sm text-text-dim">
            Short reads that teach you how to read the game. Finish a lesson to unlock the next one.
          </p>
          {modules.length > 0 && (
            <p className="text-[12px] font-semibold text-brand">
              {masteredCount} of {modules.length} done
            </p>
          )}
        </header>

        {modules.length === 0 ? (
          <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
            <p className="text-sm text-text-dim">
              No lessons yet. Run{' '}
              <code className="rounded bg-bg-2 px-1.5 py-0.5">pnpm seed:lessons</code> to load them.
            </p>
          </div>
        ) : (
          <>
            {/* Continue / start card */}
            {featured && (
              <Link
                href={`/academy/${featured.slug}`}
                className="block rounded-3xl border-2 border-brand bg-gradient-to-br from-bg-1 to-bg-2 p-5 shadow-brand-sm active:scale-[0.99]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">
                  {featured.state === 'in_progress' ? 'Pick up where you left off' : 'Start here'}
                </p>
                <p className="mt-2 font-display text-[20px] font-bold leading-tight text-text">
                  {featured.title}
                </p>
                <p className="mt-1 text-[13px] text-text-dim">
                  {featured.scenario_count} {featured.scenario_count === 1 ? 'play' : 'plays'} to try
                  {featured.attempts > 0
                    ? ` · ${Math.round(featured.rolling_accuracy * 100)}% so far`
                    : ''}
                </p>
                <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-display text-sm font-bold uppercase tracking-[0.5px] text-brand-ink">
                  {featured.state === 'in_progress' ? 'Continue' : 'Start lesson'}
                  <span aria-hidden>→</span>
                </div>
              </Link>
            )}

            {/* All lessons */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
                All lessons
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {modules.map((mod) => {
                  const copy = STATE_COPY[mod.state]
                  const accuracyPct = Math.round(mod.rolling_accuracy * 100)
                  const locked = mod.state === 'locked'
                  const isMastered = mod.state === 'mastered'
                  const progressPct = isMastered ? 100 : mod.attempts > 0 ? Math.min(100, accuracyPct) : 0
                  const card = (
                    <div
                      className={`relative flex h-full flex-col gap-3 rounded-2xl border-2 bg-bg-1 p-4 transition-colors ${
                        locked
                          ? 'border-hairline-2 opacity-60'
                          : isMastered
                            ? 'border-brand/40'
                            : 'border-hairline-2 hover:border-hairline'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
                        <span className="text-text-dim">Lesson {mod.order}</span>
                        <span className={`flex items-center gap-1 ${copy.tone}`}>
                          <span aria-hidden>{copy.emoji}</span>
                          {copy.label}
                        </span>
                      </div>
                      <div>
                        <p className="font-display text-[15px] font-semibold leading-snug text-text">
                          {mod.title}
                        </p>
                        <p className="mt-1 text-[12px] text-text-dim">
                          {mod.scenario_count} {mod.scenario_count === 1 ? 'play' : 'plays'}
                          {mod.attempts > 0 ? ` · ${accuracyPct}% right` : ''}
                        </p>
                      </div>
                      {!locked ? (
                        <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-bg-2">
                          <div
                            className="h-full bg-brand transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      ) : (
                        <p className="mt-auto text-[11px] text-text-mute">
                          Finish {mod.prerequisite_slugs.join(', ')} to unlock
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
            </div>
          </>
        )}

        {/* Bottom actions */}
        <div className="flex gap-2 pt-2">
          <Link
            href="/train"
            className="flex-1 rounded-xl bg-brand py-3 text-center font-display text-sm font-bold uppercase tracking-[0.5px] text-brand-ink"
          >
            Quick 5 plays
          </Link>
          <Link
            href="/home"
            className="rounded-xl bg-bg-2 px-5 py-3 font-display text-[13px] font-semibold text-text-dim"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  )
}
