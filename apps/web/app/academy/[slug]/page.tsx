import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getModuleBySlug, type ModuleState } from '@/lib/services/academyService'
import { LessonBody } from './LessonBody'

export const dynamic = 'force-dynamic'

const STATE_COPY: Record<ModuleState, { label: string; tone: string }> = {
  locked: { label: 'Locked', tone: 'text-text-mute' },
  new: { label: 'Start here', tone: 'text-text-dim' },
  in_progress: { label: 'In progress', tone: 'text-iq' },
  mastered: { label: 'Mastered', tone: 'text-brand' },
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mod = await getModuleBySlug(slug, user.id)
  if (!mod) notFound()

  const copy = STATE_COPY[mod.state]
  const accuracyPct = Math.round(mod.rolling_accuracy * 100)
  const locked = mod.state === 'locked'
  const practiceHref = `/train?concept=${encodeURIComponent(mod.concept_id)}`

  return (
    <main className="min-h-dvh bg-bg-0 p-6 text-text">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href="/academy" className="text-xs uppercase tracking-[1.5px] text-text-dim hover:text-text">
          ← Academy
        </Link>

        <header className="space-y-2">
          <p className={`text-xs uppercase tracking-[1.5px] ${copy.tone}`}>
            Module {mod.order} · {copy.label}
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight">{mod.title}</h1>
          <p className="text-sm text-text-dim">
            {mod.scenario_count} scenario{mod.scenario_count === 1 ? '' : 's'}
            {mod.attempts > 0 ? ` · ${accuracyPct}% rolling accuracy across ${mod.attempts} attempts` : ''}
          </p>
        </header>

        {locked ? (
          <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
            <p className="text-sm text-text-dim">
              This module unlocks once you master:{' '}
              <span className="font-semibold text-text">{mod.prerequisite_slugs.join(', ')}</span>.
            </p>
          </div>
        ) : null}

        {mod.lesson ? (
          <article className="rounded-2xl border border-hairline-2 bg-bg-1 p-5">
            <LessonBody markdown={mod.lesson.body_md} />
          </article>
        ) : (
          <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
            <p className="text-sm text-text-dim">No written lesson yet — jump straight into the scenarios.</p>
          </div>
        )}

        {!locked && mod.scenario_count > 0 && (
          <div className="sticky bottom-4 flex gap-2">
            <Link
              href={practiceHref}
              className="flex-1 rounded-xl bg-brand py-3 text-center font-display text-[14px] font-bold uppercase tracking-[0.3px] text-brand-ink"
            >
              Practice {mod.scenario_count} scenario{mod.scenario_count === 1 ? '' : 's'}
            </Link>
            <Link
              href="/academy"
              className="rounded-xl border border-hairline bg-bg-2 px-5 py-3 font-display text-[13px] font-semibold text-foreground-dim"
            >
              Back
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
