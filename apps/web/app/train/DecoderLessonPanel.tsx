'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

interface DecoderLessonPanelProps {
  /** Decoder display name, e.g. "The Backdoor Window". */
  decoderName: string
  /** One-line teaching point reused as the academy lesson's takeaway. */
  teachingPoint: string
  /** Optional hand-off framing line, e.g. "Read the defender, not the spot." */
  lessonConnection?: string
  /** module_slug — drives the "Open lesson" CTA href. */
  lessonSlug: string
}

/**
 * Decoder hand-off card surfaced after the best-read replay. Names the
 * decoder, restates the one-sentence teaching point in headline form,
 * and routes the user into the matching academy module.
 *
 * Visual: dark card with a brand stripe + decoder badge so it reads as
 * "you just learned this" instead of "here is more reading." Pure
 * presentation — the train page owns when it mounts.
 */
export function DecoderLessonPanel({
  decoderName,
  teachingPoint,
  lessonConnection,
  lessonSlug,
}: DecoderLessonPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative overflow-hidden rounded-2xl border-2 border-brand/40 bg-gradient-to-br from-brand/10 via-bg-1 to-bg-1 p-4"
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-brand"
      />
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/20 text-brand"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
            Decoder unlocked
          </p>
          <p className="font-display text-[16px] font-bold leading-tight text-text">
            {decoderName}
          </p>
          {lessonConnection ? (
            <p className="text-[13px] font-semibold leading-snug text-text">
              {lessonConnection}
            </p>
          ) : null}
          <p className="text-[12px] leading-snug text-text-dim">{teachingPoint}</p>
        </div>
      </div>
      <Link
        href={`/academy/${lessonSlug}`}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-hairline-2 bg-bg-2 py-2.5 text-center font-display text-[12px] font-bold uppercase tracking-[1.2px] text-text transition-colors hover:bg-bg-3 active:scale-[0.99]"
      >
        See the full move
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </Link>
    </motion.div>
  )
}
