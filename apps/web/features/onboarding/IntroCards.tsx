'use client'

/**
 * V3 P2 — first-time intro card stack.
 *
 * A skippable, premium-feeling 5-card walkthrough that explains CourtIQ
 * in <60 seconds: what the product is, what a decoder is, what a Pathway
 * is, what the Film Room is, and how to start. Mounted inside a modal
 * sheet on /home for first-time players (attemptsCount === 0) and re-
 * openable from the home menu.
 *
 * Skip behavior: pressing the close button or "Skip walkthrough" sets
 * the localStorage flag immediately so a returning player never sees it
 * twice. The same flag is set on completion of the final card.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  INTRO_CARDS,
  INTRO_CARD_COUNT,
  INTRO_FRAME_COPY,
} from '@/lib/onboarding/introCopy'
import {
  clearIntroDismissal,
  dismissIntro,
  hasDismissedIntro,
  INTRO_DISMISS_KEY,
} from '@/lib/onboarding/dismissIntro'

const ease = [0.22, 1, 0.36, 1]

export {
  INTRO_DISMISS_KEY,
  clearIntroDismissal,
  dismissIntro,
  hasDismissedIntro,
}

export function IntroCardsModal({
  open,
  onClose,
  startHref,
}: {
  open: boolean
  onClose: () => void
  /** Where the final "Start Foundation" CTA links. */
  startHref: string
}) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setDirection(1)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (typeof document === 'undefined') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        advance()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        back()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step])

  function advance() {
    if (step < INTRO_CARD_COUNT - 1) {
      setDirection(1)
      setStep((s) => s + 1)
    }
  }

  function back() {
    if (step > 0) {
      setDirection(-1)
      setStep((s) => s - 1)
    }
  }

  function handleClose() {
    dismissIntro()
    onClose()
  }

  function handleFinish() {
    dismissIntro()
    onClose()
  }

  if (!open) return null

  const card = INTRO_CARDS[step]!
  const isFinal = step === INTRO_CARD_COUNT - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome walkthrough"
      data-testid="intro-cards-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg-0/80 backdrop-blur sm:items-center"
    >
      <motion.div
        key="intro-shell"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.36, ease }}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-hairline-2 bg-bg-1 px-5 pb-5 pt-7 sm:rounded-3xl"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label={INTRO_FRAME_COPY.closeLabel}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline-2 bg-bg-2 text-[14px] text-text-dim transition-colors hover:text-text"
        >
          <span aria-hidden>✕</span>
        </button>

        {/* Step dots */}
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {INTRO_CARDS.map((c, i) => (
            <span
              key={c.id}
              aria-hidden
              className="h-1 rounded-full transition-all"
              style={{
                width: i === step ? 22 : 8,
                background:
                  i === step
                    ? 'var(--brand)'
                    : i < step
                      ? 'rgba(59,227,131,0.45)'
                      : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>

        <div className="relative min-h-[280px]">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={card.id}
              custom={direction}
              initial={{ opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -24 }}
              transition={{ duration: 0.28, ease }}
              className="flex flex-col gap-3"
            >
              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-brand">
                {card.eyebrow}
              </p>
              <h2 className="font-display text-[24px] font-black leading-tight text-text">
                {card.title}
              </h2>
              <p className="text-[14px] leading-relaxed text-text-dim">
                {card.body}
              </p>
              {card.bullets && card.bullets.length > 0 ? (
                <ul className="mt-1 space-y-2 text-[13px] leading-snug text-text">
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* V3 P5/P7 — "skip into a rep" path on the first card.
                  Lets a player who already gets it bail out of reading
                  and feel the product immediately, which is the whole
                  point of the walkthrough. */}
              {card.id === 'welcome' ? (
                <Link
                  href={startHref}
                  onClick={handleFinish}
                  data-testid="intro-cards-jump-in"
                  className="mt-2 inline-flex items-center gap-1 self-start rounded-full border border-hairline-2 bg-bg-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[1.2px] text-text-dim transition-colors hover:text-text"
                >
                  Or jump straight to a rep →
                </Link>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer / nav */}
        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="rounded-xl border border-hairline-2 bg-bg-2 px-4 py-2.5 font-display text-[12px] font-semibold uppercase tracking-[0.3px] text-text-dim transition-colors hover:bg-bg-1 disabled:opacity-30"
          >
            {INTRO_FRAME_COPY.prevLabel}
          </button>
          <div className="flex-1" />
          {isFinal ? (
            <Link
              href={startHref}
              onClick={handleFinish}
              data-testid="intro-cards-start"
              className="ciq-press rounded-xl bg-brand px-5 py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm"
            >
              {card.ctaLabel ?? INTRO_FRAME_COPY.finalLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={advance}
              data-testid="intro-cards-next"
              className="ciq-press rounded-xl bg-brand px-5 py-2.5 font-display text-[13px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm"
            >
              {INTRO_FRAME_COPY.nextLabel}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="mt-3 block w-full text-center text-[11px] font-semibold uppercase tracking-[1.5px] text-text-mute transition-colors hover:text-text-dim"
        >
          {INTRO_FRAME_COPY.closeLabel}
        </button>
      </motion.div>
    </div>
  )
}
