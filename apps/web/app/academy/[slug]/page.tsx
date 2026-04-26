import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getModuleBySlug, type ModuleState } from '@/lib/services/academyService'
import { InteractiveLesson } from './InteractiveLesson'

export const dynamic = 'force-dynamic'

const STATE_COPY: Record<ModuleState, { label: string; tone: string }> = {
  locked: { label: 'Locked', tone: 'text-text-mute' },
  new: { label: 'Start here', tone: 'text-text-dim' },
  in_progress: { label: 'Keep going', tone: 'text-iq' },
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
  const practiceLabel =
    mod.scenario_count > 0
      ? `Practice ${mod.scenario_count} ${mod.scenario_count === 1 ? 'play' : 'plays'}`
      : 'Practice'

  return (
    <main className="min-h-dvh bg-bg-0 p-5 text-text">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href="/academy" className="text-xs uppercase tracking-[1.5px] text-text-dim hover:text-text">
          ← Lessons
        </Link>

        <header className="space-y-2">
          <p className={`text-xs uppercase tracking-[1.5px] ${copy.tone}`}>
            Lesson {mod.order} · {copy.label}
          </p>
          <h1 className="font-display text-[28px] font-bold leading-tight">{mod.title}</h1>
          <p className="text-sm text-text-dim">
            {mod.scenario_count > 0
              ? `${mod.scenario_count} ${mod.scenario_count === 1 ? 'play' : 'plays'} after the lesson`
              : 'Read through the lesson'}
            {mod.attempts > 0 ? ` · ${accuracyPct}% so far` : ''}
          </p>
        </header>

        {locked ? (
          <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
            <p className="text-sm text-text-dim">
              Finish{' '}
              <span className="font-semibold text-text">
                {mod.prerequisite_slugs.join(', ')}
              </span>{' '}
              to unlock this lesson.
            </p>
            <Link
              href="/academy"
              className="mt-3 inline-flex rounded-xl bg-bg-2 px-4 py-2 text-xs font-semibold text-text"
            >
              Pick another lesson
            </Link>
          </div>
        ) : null}

        {!locked && mod.lesson ? (
          <InteractiveLesson
            markdown={mod.lesson.body_md}
            practiceHref={practiceHref}
            practiceLabel={practiceLabel}
            hasScenarios={mod.scenario_count > 0}
          />
        ) : !locked ? (
          <div className="space-y-3 rounded-2xl border border-hairline-2 bg-bg-1 p-4">
            <p className="text-sm text-text-dim">No written lesson yet — jump straight into the plays.</p>
            {mod.scenario_count > 0 && (
              <Link
                href={practiceHref}
                className="block w-full rounded-xl bg-brand py-3 text-center font-display text-[14px] font-bold uppercase tracking-[0.3px] text-brand-ink"
              >
                {practiceLabel}
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </main>
  )
}
