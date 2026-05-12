'use client'

/**
 * 4-step "Where am I" visual for the home page.
 *
 * Renders the Learn → Train → Test → Master spine as a single row of
 * pills with a connecting line. The current step is brand-coloured,
 * completed steps fade into a muted-brand state, and upcoming steps
 * stay neutral. A single coaching headline sits below the row so the
 * player never has to guess what "current" means.
 */

import { JOURNEY_STEPS, type JourneyState } from '@/lib/journey/journeyStep'

interface JourneyMapProps {
  state: JourneyState
}

export function JourneyMap({ state }: JourneyMapProps) {
  return (
    <div
      data-testid="home-journey-map"
      className="rounded-2xl border border-[#1F2937] bg-[#0E1B16] p-4"
    >
      <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#9CA3AF]">
        Your Journey
      </p>

      <ol className="mt-3 flex items-stretch gap-1" aria-label="Your CourtIQ journey">
        {JOURNEY_STEPS.map((step, i) => {
          const status = state.status[step.id]
          const isCurrent = status === 'current'
          const isDone = status === 'done'

          const pillBg = isCurrent
            ? 'bg-[#3BE383] text-[#09111E]'
            : isDone
              ? 'bg-[#3BE383]/15 text-[#3BE383]'
              : 'bg-[#111827] text-[#6B7280]'

          const numberBg = isCurrent
            ? 'bg-[#09111E] text-[#3BE383]'
            : isDone
              ? 'bg-[#3BE383]/20 text-[#3BE383]'
              : 'bg-[#1F2937] text-[#6B7280]'

          return (
            <li key={step.id} className="flex flex-1 flex-col items-stretch">
              <div
                className={[
                  'flex items-center gap-1.5 rounded-full px-2 py-1.5 transition-colors',
                  pillBg,
                  isCurrent ? 'shadow-[0_0_0_2px_rgba(59,227,131,0.35)]' : '',
                ].join(' ')}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={[
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black tabular-nums',
                    numberBg,
                  ].join(' ')}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span className="truncate font-display text-[11px] font-bold uppercase tracking-[1px]">
                  {step.label}
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="mt-3 font-display text-[14px] font-bold leading-snug text-[#F9FAFB]">
        {state.headline}
      </p>
      <p className="mt-0.5 text-[12px] leading-snug text-[#9CA3AF]">{state.sub}</p>
    </div>
  )
}
