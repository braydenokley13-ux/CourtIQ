'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

interface SelfReviewChecklistProps {
  /** Stable scenario id; resets internal state when the scenario advances. */
  scenarioId: string
  /** 2–6 items per scenario (Section 7.12). Stored client-side for v0. */
  items: readonly string[]
}

/**
 * Self-review surfaced before "Next play". Each item is a checkbox
 * the user toggles to self-rate the rep. State is intentionally local
 * for v0. The checklist is reflection, not a gate — "Next" stays
 * enabled regardless.
 *
 * Visuals upgraded to feel like a quick scoreboard: count chip in the
 * header, brand-tinted checks, soft strike-through on completed
 * lines. Items animate in one-by-one so kids see them appear instead
 * of getting hit with a wall of text.
 */
export function SelfReviewChecklist({
  scenarioId,
  items,
}: SelfReviewChecklistProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [activeScenarioId, setActiveScenarioId] = useState(scenarioId)
  if (activeScenarioId !== scenarioId) {
    setActiveScenarioId(scenarioId)
    setChecked({})
  }

  const completed = Object.values(checked).filter(Boolean).length
  const allDone = completed === items.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className="space-y-3 rounded-2xl border border-hairline-2 bg-bg-1 p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-text-dim">
            Your check-in
          </p>
          <p className="font-display text-[14px] font-bold leading-tight text-text">
            Did you see it?
          </p>
        </div>
        <span
          className={[
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums transition-colors',
            allDone
              ? 'bg-brand/15 text-brand'
              : 'bg-bg-2 text-text-dim',
          ].join(' ')}
        >
          {completed}/{items.length}
          {allDone ? <span aria-hidden>✓</span> : null}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, idx) => {
          const isChecked = !!checked[idx]
          return (
            <motion.li
              key={idx}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + idx * 0.06, duration: 0.25 }}
            >
              <button
                type="button"
                onClick={() =>
                  setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }))
                }
                className={[
                  'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors active:scale-[0.99]',
                  isChecked
                    ? 'border-brand/40 bg-brand/5'
                    : 'border-hairline-2 bg-bg-2 hover:border-hairline',
                ].join(' ')}
                aria-pressed={isChecked}
              >
                <span
                  aria-hidden
                  className={[
                    'mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 text-[12px] font-bold transition-colors',
                    isChecked
                      ? 'border-brand bg-brand text-brand-ink'
                      : 'border-hairline-2 bg-bg-1 text-transparent',
                  ].join(' ')}
                >
                  ✓
                </span>
                <span
                  className={[
                    'text-[13px] leading-snug transition-colors',
                    isChecked ? 'text-text' : 'text-text-dim',
                  ].join(' ')}
                >
                  {item}
                </span>
              </button>
            </motion.li>
          )
        })}
      </ul>
    </motion.div>
  )
}
