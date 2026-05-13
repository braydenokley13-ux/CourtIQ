/**
 * Landing route. Production traffic is redirected by middleware to
 * `/login`, `/onboarding`, or `/home`. The page below renders for the
 * narrow case where middleware is bypassed (local dev with Supabase
 * disabled, screenshot QA, or a future public-marketing flag).
 *
 * Six-year-old test: a kid lands here, knows in one glance what the
 * app does, and has exactly one obvious thing to tap to start. We
 * keep the journey spine but render it as three big emoji tiles
 * instead of jargon.
 */

import Link from 'next/link'

interface SimpleStep {
  emoji: string
  label: string
  body: string
}

const STEPS: readonly SimpleStep[] = [
  { emoji: '👀', label: 'Watch', body: 'A real play. It stops right before the big choice.' },
  { emoji: '👉', label: 'Pick', body: 'Tap what you would do — pass, cut, drive, shoot.' },
  { emoji: '✅', label: 'Learn', body: 'We tell you if you got it. Try the next one.' },
]

export default function LandingPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg-0 text-text">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(59,227,131,0.18) 0%, transparent 70%)',
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col justify-between px-5 py-10">
        <header className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-brand">
            CourtIQ
          </p>
          <h1 className="mt-6 font-display text-[44px] font-black leading-[1.05] tracking-tight sm:text-[56px]">
            Get smart at <span className="text-brand">basketball.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-text-dim sm:text-[17px]">
            Watch a real play. Tap what you would do. Find out
            if you got it. That&apos;s the whole app.
          </p>
        </header>

        <section aria-label="How it works" className="mt-10">
          <ol className="grid gap-3">
            {STEPS.map((step, i) => (
              <li
                key={step.label}
                className="flex items-center gap-4 rounded-2xl border border-hairline-2 bg-bg-1 p-4"
              >
                <span
                  aria-hidden
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-[32px]"
                >
                  {step.emoji}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[18px] font-black uppercase tracking-[0.5px] text-text">
                    <span className="text-brand">{i + 1}.</span> {step.label}
                  </p>
                  <p className="mt-0.5 text-[14px] leading-snug text-text-dim">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10">
          <Link
            href="/signup"
            className="ciq-press flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-5 text-center font-display text-[18px] font-black uppercase tracking-[1px] text-brand-ink shadow-brand-sm"
          >
            Play your first one
            <span aria-hidden>→</span>
          </Link>
          <p className="mt-3 text-center text-[13px] text-text-mute">
            Takes 2 taps. About 1 minute.
          </p>
          <p className="mt-5 text-center text-[13px] text-text-dim">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
