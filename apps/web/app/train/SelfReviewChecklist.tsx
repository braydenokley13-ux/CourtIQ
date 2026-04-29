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
 * Phase I — four-item self-review surfaced before "Next play". Each
 * item is a checkbox the user toggles to self-rate the rep. State is
 * intentionally local for v0 — Phase J / L decides whether the answers
 * weight mastery. The checklist component does not block "Next"; it is
 * a reflection prompt, not a gate.
 */
export function SelfReviewChecklist({
  scenarioId,
  items,
}: SelfReviewChecklistProps) {
  // Reset on scenario change so each rep starts fresh.
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [activeScenarioId, setActiveScenarioId] = useState(scenarioId)
  if (activeScenarioId !== scenarioId) {
    setActiveScenarioId(scenarioId)
    setChecked({})
  }

  const completed = Object.values(checked).filter(Boolean).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 rounded-2xl border-2 border-hairline-2 bg-bg-1 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
          Self-review
        </p>
        <span className="text-[11px] font-bold tabular-nums text-text-dim">
          {completed}/{items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item, idx) => {
          const isChecked = !!checked[idx]
          return (
            <li key={idx}>
              <button
                type="button"
                onClick={() =>
                  setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }))
                }
                className="flex w-full items-start gap-3 rounded-xl border border-hairline-2 bg-bg-2 p-3 text-left active:scale-[0.99]"
                aria-pressed={isChecked}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 text-[12px] font-bold ${
                    isChecked
                      ? 'border-brand bg-brand text-brand-ink'
                      : 'border-hairline-2 bg-bg-1 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span
                  className={`text-[13px] leading-snug ${
                    isChecked ? 'text-text' : 'text-text-dim'
                  }`}
                >
                  {item}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </motion.div>
  )
}
