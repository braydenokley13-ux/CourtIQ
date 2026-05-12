/**
 * Landing route. Production traffic is redirected by middleware to
 * `/login`, `/onboarding`, or `/home`. The page below renders for the
 * narrow case where middleware is bypassed (local dev with Supabase
 * disabled, screenshot QA, or a future public-marketing flag).
 *
 * The page mirrors the 4-step Learn → Train → Test → Master spine the
 * home page and intro cards use, so a player who lands here without
 * being signed in sees the exact same journey story they'll see once
 * they're inside the product.
 */

import Link from 'next/link'
import { JOURNEY_STEPS } from '@/lib/journey/journeyStep'

export default function LandingPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg-0 text-text">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(59,227,131,0.12) 0%, transparent 70%)',
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-12">
        <header className="mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[2px] text-brand">
            CourtIQ
          </p>
          <h1 className="mt-3 font-display text-[40px] font-black leading-tight tracking-tight">
            Train basketball IQ — the reads pros make in real time.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-dim">
            Watch the play. Freeze at the read. Pick. CourtIQ scores
            your decision-making the same way a coach watches film —
            one rep at a time.
          </p>
        </header>

        <section aria-label="How CourtIQ works">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-text-dim">
            How it works
          </p>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2">
            {JOURNEY_STEPS.map((step, i) => (
              <li
                key={step.id}
                className="rounded-2xl border border-hairline-2 bg-bg-1 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 font-display text-[12px] font-black text-brand">
                    {i + 1}
                  </span>
                  <p className="font-display text-[16px] font-bold uppercase tracking-[0.5px] text-text">
                    {step.label}
                  </p>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-6 text-[13px] leading-relaxed text-text-mute">
          Four reads to start. About 25 minutes total in the Foundation
          Pathway. The first read is two taps from sign-up.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="ciq-press flex-1 rounded-xl bg-brand py-3.5 text-center font-display text-[14px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm"
          >
            Start training →
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-hairline-2 bg-bg-1 py-3.5 text-center font-display text-[13px] font-semibold text-text-dim transition-colors hover:text-text"
          >
            I have an account
          </Link>
        </div>
      </div>
    </main>
  )
}
