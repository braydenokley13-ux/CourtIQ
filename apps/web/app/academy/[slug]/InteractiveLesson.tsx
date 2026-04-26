'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  parseLessonBlocks,
  LessonBlockView,
  type LessonBlock,
} from './LessonBody'

/**
 * Group lesson blocks into bite-sized "slides".
 *
 * Rules:
 *   - h2 always starts a new slide
 *   - quiz / reveal each get their own slide
 *   - takeaway always ends on its own slide
 *   - other blocks accumulate, but cap at ~3 per slide so the screen stays light
 */
function groupIntoSlides(blocks: LessonBlock[]): LessonBlock[][] {
  const slides: LessonBlock[][] = []
  let current: LessonBlock[] = []
  const flush = () => {
    if (current.length > 0) {
      slides.push(current)
      current = []
    }
  }

  for (const block of blocks) {
    if (block.type === 'h2' && current.length > 0) {
      flush()
    }
    if (block.type === 'quiz' || block.type === 'reveal' || block.type === 'takeaway') {
      flush()
      slides.push([block])
      continue
    }
    current.push(block)
    if (current.length >= 3 && (block.type === 'p' || block.type === 'ul' || block.type === 'ol')) {
      flush()
    }
  }
  flush()
  return slides
}

export function InteractiveLesson({
  markdown,
  practiceHref,
  practiceLabel,
  hasScenarios,
}: {
  markdown: string
  practiceHref: string
  practiceLabel: string
  hasScenarios: boolean
}) {
  const slides = useMemo(() => groupIntoSlides(parseLessonBlocks(markdown)), [markdown])
  const [idx, setIdx] = useState(0)
  const total = slides.length
  const isLast = idx >= total - 1
  const slide = slides[idx] ?? []
  const pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 100

  const next = () => {
    if (idx < total - 1) setIdx((v) => v + 1)
  }
  const prev = () => {
    if (idx > 0) setIdx((v) => v - 1)
  }

  return (
    <section className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="text-[12px] font-semibold uppercase tracking-[1px] text-text-dim disabled:opacity-30"
          aria-label="Previous slide"
        >
          Back
        </button>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg-2">
          <motion.div
            className="absolute inset-y-0 left-0 bg-brand"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-text-dim">
          {Math.min(idx + 1, total)} / {total}
        </span>
      </div>

      {/* Slide */}
      <div className="min-h-[280px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="space-y-4 rounded-2xl border border-hairline-2 bg-bg-1 p-5"
          >
            {slide.map((b, j) => (
              <LessonBlockView key={j} block={b} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CTA */}
      {!isLast ? (
        <button
          onClick={next}
          className="w-full rounded-xl bg-brand py-4 font-display text-[15px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm active:scale-[0.99]"
        >
          Next
        </button>
      ) : hasScenarios ? (
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-brand bg-brand/5 p-4 text-center">
            <p className="font-display text-lg font-bold text-text">You got this.</p>
            <p className="mt-1 text-sm text-text-dim">Now try it in practice.</p>
          </div>
          <Link
            href={practiceHref}
            className="block w-full rounded-xl bg-brand py-4 text-center font-display text-[15px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand active:scale-[0.99]"
          >
            {practiceLabel}
          </Link>
          <Link
            href="/academy"
            className="block w-full rounded-xl border border-hairline-2 bg-bg-2 py-3 text-center font-display text-[13px] font-semibold text-text-dim"
          >
            Back to lessons
          </Link>
        </div>
      ) : (
        <Link
          href="/academy"
          className="block w-full rounded-xl bg-brand py-4 text-center font-display text-[15px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand active:scale-[0.99]"
        >
          Done — back to Academy
        </Link>
      )}
    </section>
  )
}
