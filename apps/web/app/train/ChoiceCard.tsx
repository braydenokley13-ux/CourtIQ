'use client'

import { motion } from 'framer-motion'

export type ChoiceState = 'idle' | 'selected' | 'correct' | 'wrong' | 'reveal-correct' | 'dimmed'

/**
 * Compute the visual state of an answer card from the user's pick and
 * the server feedback. Pure function — co-located with ChoiceCard so
 * the state machine is visible alongside the styling.
 */
export function deriveChoiceState(input: {
  choiceId: string
  selected: string | null
  feedback: { is_correct: boolean; correct_choice_id: string } | null
  submitting: boolean
}): ChoiceState {
  const { choiceId, selected, feedback, submitting } = input
  if (!feedback) {
    if (submitting && selected === choiceId) return 'selected'
    return 'idle'
  }
  if (feedback.is_correct && selected === choiceId) return 'correct'
  if (!feedback.is_correct && selected === choiceId) return 'wrong'
  if (feedback.correct_choice_id === choiceId) return 'reveal-correct'
  return 'dimmed'
}

interface ChoiceCardProps {
  letter: string
  label: string
  state: ChoiceState
  disabled: boolean
  onSelect: () => void
}

/**
 * Premium answer card. Replaces the previous bordered button with a
 * tappable card that ranks each option with a clear letter pill, scans
 * faster, and uses confidence colors after submit:
 *
 *  - idle: neutral chrome, hover/tap states
 *  - selected: brand ring while submitting
 *  - correct: green ring + check, "Best read" tag
 *  - wrong: red ring + ✕ glyph, dimmed copy
 *  - reveal-correct: green ring on the correct option after a wrong pick
 *  - dimmed: grayed out non-picked options after submit
 */
export function ChoiceCard({
  letter,
  label,
  state,
  disabled,
  onSelect,
}: ChoiceCardProps) {
  const showCheck = state === 'correct' || state === 'reveal-correct'
  const showCross = state === 'wrong'
  const showBestTag = state === 'correct' || state === 'reveal-correct'

  const styles = STATE_STYLES[state]

  return (
    <motion.button
      type="button"
      onClick={() => onSelect()}
      disabled={disabled}
      whileHover={!disabled ? { y: -1 } : undefined}
      whileTap={!disabled ? { scale: 0.985 } : undefined}
      transition={{ duration: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
      className={[
        'group relative w-full overflow-hidden rounded-2xl border-2 px-3.5 py-3 text-left transition-colors',
        styles.shell,
        disabled && state === 'idle' ? 'cursor-default' : '',
      ].join(' ')}
      aria-label={`Option ${letter}: ${label}`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={[
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl font-display text-[14px] font-bold transition-colors',
            styles.pill,
          ].join(' ')}
        >
          {showCheck ? '✓' : showCross ? '✕' : letter}
        </span>
        <span
          className={[
            'flex-1 text-[14px] font-semibold leading-snug transition-colors',
            styles.label,
          ].join(' ')}
        >
          {label}
        </span>
        {showBestTag ? (
          <span className="flex-shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-brand">
            Best read
          </span>
        ) : null}
      </div>
      {state === 'correct' || state === 'reveal-correct' ? (
        <motion.div
          aria-hidden
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-brand"
        />
      ) : null}
    </motion.button>
  )
}

const STATE_STYLES: Record<
  ChoiceState,
  { shell: string; pill: string; label: string }
> = {
  idle: {
    shell:
      'border-hairline-2 bg-bg-1 hover:border-brand/40 hover:bg-bg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
    pill: 'bg-bg-2 text-text-dim group-hover:bg-brand/15 group-hover:text-brand',
    label: 'text-text',
  },
  selected: {
    shell: 'border-brand bg-brand/10',
    pill: 'bg-brand text-brand-ink',
    label: 'text-text',
  },
  correct: {
    shell: 'border-brand bg-brand/10 shadow-brand-sm',
    pill: 'bg-brand text-brand-ink',
    label: 'text-text',
  },
  wrong: {
    shell: 'border-heat bg-heat/10',
    pill: 'bg-heat text-white',
    label: 'text-text',
  },
  'reveal-correct': {
    shell: 'border-brand bg-brand/10 shadow-brand-sm',
    pill: 'bg-brand text-brand-ink',
    label: 'text-text',
  },
  dimmed: {
    shell: 'border-hairline bg-bg-1 opacity-55',
    pill: 'bg-bg-2 text-text-mute',
    label: 'text-text-dim',
  },
}
