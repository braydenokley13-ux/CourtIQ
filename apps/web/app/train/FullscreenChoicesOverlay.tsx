'use client'

import { motion } from 'framer-motion'
import { ChoiceCard, deriveChoiceState } from './ChoiceCard'

/**
 * V1 UX completion — fullscreen-mode choice cards.
 *
 * Reuses the same `ChoiceCard` component the page-layout copy uses so
 * the visual contract stays single-sourced; only the surrounding
 * layout differs:
 *   - Page layout (non-fullscreen): vertically stacked cards rendered
 *     below the canvas. Owned by `app/train/page.tsx`.
 *   - Fullscreen layout (this component): a horizontal card row mounted
 *     INSIDE the fullscreen target via Scenario3DView's
 *     `renderFullscreenOverlay` slot. The user can read the play and
 *     pick without exiting fullscreen, which was the main V1 UX gap
 *     flagged in the stabilization report.
 *
 * `null` props (no current scenario, choices not yet ready) collapse
 * to a `null` render so the overlay slot stays empty when there is
 * nothing to ask.
 */

export interface FullscreenChoicesOverlayProps {
  /** Authoring order (sorted) for the active scenario's choices. */
  choices: ReadonlyArray<{ id: string; label: string }>
  /** Locally-tracked picked choice id (mirrors page state). */
  selected: string | null
  /** Server feedback once the answer is submitted. */
  feedback:
    | {
        is_correct: boolean
        correct_choice_id: string
      }
    | null
  /** True while the submit fetch is in flight. */
  submitting: boolean
  /** True once the question is unblocked (decoder freeze fired or
   *  legacy scenario has no freeze gate). */
  questionReady: boolean
  /** Pick handler — same shape as the in-page copy. */
  onSelect: (choiceId: string) => void
  /** Optional prompt copy. Surfaced as a small headline above the
   *  choice row so the question stays visible inside fullscreen even
   *  without the page-layout prompt block. */
  prompt?: string
}

export function FullscreenChoicesOverlay({
  choices,
  selected,
  feedback,
  submitting,
  questionReady,
  onSelect,
  prompt,
}: FullscreenChoicesOverlayProps) {
  // Pre-freeze: nothing to ask yet. Keep the overlay empty so the
  // canvas plays through unobstructed. The same gate the page layout
  // uses (`questionReady`) is reapplied here.
  if (!questionReady) return null
  if (choices.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      data-fullscreen-choices="1"
      className="rounded-2xl border border-white/10 bg-bg-0/85 p-3 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.75)] backdrop-blur-md"
    >
      {prompt ? (
        <p className="mb-2 text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-text-dim">
          {prompt}
        </p>
      ) : null}
      <div
        role="group"
        aria-label="Choices"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {choices.map((choice, index) => {
          const letter = String.fromCharCode(65 + index)
          const state = deriveChoiceState({
            choiceId: choice.id,
            selected,
            feedback,
            submitting,
          })
          return (
            <ChoiceCard
              key={choice.id}
              letter={letter}
              label={choice.label}
              state={state}
              disabled={!!feedback || submitting}
              onSelect={() => onSelect(choice.id)}
            />
          )
        })}
      </div>
    </motion.div>
  )
}
