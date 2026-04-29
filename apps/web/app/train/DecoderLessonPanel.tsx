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
 * Phase I — slide-in panel surfaced after the best-read replay for
 * decoder scenarios. Closes the read by naming the decoder, restating
 * the teaching point, and routing the user into the matching academy
 * module via "Open lesson". Pure presentation; the train page owns
 * when it mounts (after `replaying` finishes).
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
      transition={{ duration: 0.25 }}
      className="space-y-3 rounded-2xl border-2 border-brand/40 bg-bg-1 p-4"
    >
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">
          Decoder · {decoderName}
        </p>
        {lessonConnection ? (
          <p className="font-display text-[16px] font-semibold leading-snug text-text">
            {lessonConnection}
          </p>
        ) : null}
        <p className="text-sm text-text-dim">{teachingPoint}</p>
      </div>
      <Link
        href={`/academy/${lessonSlug}`}
        className="block w-full rounded-xl border border-hairline-2 bg-bg-2 py-2.5 text-center font-display text-[12px] font-bold uppercase tracking-[1px] text-text active:scale-[0.99]"
      >
        Open lesson →
      </Link>
    </motion.div>
  )
}
