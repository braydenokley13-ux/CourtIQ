'use client'

/**
 * Phase 10 P1 — opening-beat card.
 *
 * Renders the `OpeningBeat` from the Phase 9 session planner. Pure
 * presentational; the parent decides when to mount it and when to
 * unmount on hold-end. We do NOT auto-dismiss after `holdMs` here:
 * the parent owns that state so the same component can be used for
 * tap-to-dismiss, gated-by-canvas-ready, or pure timer flows without
 * a behavior switch in this file.
 *
 * Visual restraint: no progress bar, no decoder pill, no IQ chip.
 * `quietChrome` flips the card to the cold-start variant — bigger
 * line, no eyebrow, no sub.
 */

import type { OpeningBeat } from '@/lib/pathways/sessionComposition'

export interface SessionOpeningCardProps {
  beat: OpeningBeat
  /** Optional eyebrow (e.g. chapter title). Suppressed when
   *  `beat.quietChrome` is true. */
  eyebrow?: string | null
  /** Optional ID for tests / a11y. */
  testId?: string
}

export function SessionOpeningCard({
  beat,
  eyebrow,
  testId = 'session-opening-card',
}: SessionOpeningCardProps) {
  const showEyebrow = !beat.quietChrome && eyebrow && eyebrow.length > 0
  const showSub = !beat.quietChrome && beat.sub && beat.sub.length > 0
  return (
    <div
      data-testid={testId}
      data-quiet={beat.quietChrome ? 'true' : 'false'}
      className={
        beat.quietChrome
          ? 'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center'
          : 'flex flex-col gap-2 px-4 py-6'
      }
    >
      {showEyebrow ? (
        <p className="text-[10px] font-bold uppercase tracking-[1.8px] text-brand/80">
          {eyebrow}
        </p>
      ) : null}
      <p
        className={
          beat.quietChrome
            ? 'text-[18px] font-semibold leading-snug text-text'
            : 'text-[15px] font-semibold leading-snug text-text'
        }
      >
        {beat.headline}
      </p>
      {showSub ? <p className="text-[13px] leading-snug text-text-dim">{beat.sub}</p> : null}
    </div>
  )
}
