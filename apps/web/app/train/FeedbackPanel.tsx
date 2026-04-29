'use client'

import { motion } from 'framer-motion'

interface FeedbackPanelProps {
  isCorrect: boolean
  /** Headline shown at the top of the panel, e.g. "Great read!" / "So close." */
  headline: string
  /** One-line explanation of why this is the right answer. */
  whyText: string
  /** Optional praise or coaching micro-line under the headline. */
  microNote?: string
  /** True when a wrong-demo replay has finished and the best-read replay is queued. */
  hasReplay: boolean
  /** Triggers replay of the best-read demo. */
  onReplay: () => void
  /** Triggers a replay of the consequence (wrong demo) for context. */
  onShowMistake?: () => void
}

/**
 * Premium feedback card. Replaces the previous bordered panel with:
 *  - a header pill (icon + headline + confidence stripe)
 *  - a one-line "Why" body
 *  - dual replay CTAs ("Watch the right read" + optional "Show mistake")
 *
 * Sized for kid-readable scanning: short copy, big CTA, brand glow.
 */
export function FeedbackPanel({
  isCorrect,
  headline,
  whyText,
  microNote,
  hasReplay,
  onReplay,
  onShowMistake,
}: FeedbackPanelProps) {
  const accent = isCorrect ? 'var(--brand)' : 'var(--heat)'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className="ciq-shell-card relative overflow-hidden border-2 p-4"
      style={{ borderColor: accent }}
    >
      <div className="flex items-start gap-3">
        <motion.div
          aria-hidden
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.05, duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: isCorrect ? 'rgba(59,227,131,0.15)' : 'rgba(255,77,109,0.15)', color: accent }}
        >
          {isCorrect ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="8" x2="12" y2="13" />
              <circle cx="12" cy="17" r="0.5" fill="currentColor" />
            </svg>
          )}
        </motion.div>
        <div className="min-w-0 flex-1">
          <p
            className="font-display text-[18px] font-bold leading-tight"
            style={{ color: accent }}
          >
            {headline}
          </p>
          {microNote ? (
            <p className="mt-0.5 text-[12px] font-semibold text-text-dim">{microNote}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-hairline bg-bg-2 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[1.4px] text-text-mute">
          Why
        </p>
        <p className="mt-1 text-[13px] leading-snug text-text">{whyText}</p>
      </div>

      {hasReplay ? (
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={onReplay}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand/50 bg-brand/15 py-2.5 font-display text-[12px] font-bold uppercase tracking-[1.2px] text-brand transition-colors hover:bg-brand/25 active:scale-[0.99]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Watch the right read
          </button>
          {!isCorrect && onShowMistake ? (
            <button
              type="button"
              onClick={onShowMistake}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-hairline-2 bg-bg-2 py-2 font-display text-[11px] font-bold uppercase tracking-[1.1px] text-text-dim transition-colors hover:text-text active:scale-[0.99]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
              Show what I did
            </button>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  )
}
