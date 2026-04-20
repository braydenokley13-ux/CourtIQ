import type { Transition, Variants } from 'framer-motion'

/**
 * ciq-fadein — base fade for page elements, overlays, and reveals.
 * 120ms, snappy cubic-bezier per ARCHITECTURE.md §4.2.
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.12, ease: [0.2, 0.8, 0.2, 1] } },
  exit:   { opacity: 0, transition: { duration: 0.10, ease: [0.2, 0.8, 0.2, 1] } },
}

/**
 * ciq-slideup — bottom sheet, feedback tray, toast.
 * 280ms, matches the prototype FeedbackTray animation.
 */
export const slideUp: Variants = {
  hidden: { y: 24, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] } },
  exit:   { y: 16, opacity: 0, transition: { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] } },
}

/**
 * ciq-pop — XP/IQ delta chips, badge awards, correct-answer celebrations.
 * Spring with slight overshoot; never bouncy per product tone.
 */
export const pop: Variants = {
  hidden: { scale: 0.6, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 500, damping: 24, mass: 0.8 },
  },
  exit: { scale: 0.8, opacity: 0, transition: { duration: 0.10, ease: [0.2, 0.8, 0.2, 1] } },
}

/**
 * ciq-pulse — active module ring, streak flame halo, YOU-player glow ring.
 * Expands outward and fades; loops continuously.
 */
export const pulse: Variants = {
  idle: { opacity: 0, scale: 1 },
  active: {
    opacity: [0.6, 0.2, 0],
    scale: [1, 1.15, 1.3],
    transition: {
      duration: 1.8,
      ease: 'easeOut',
      repeat: Infinity,
      repeatType: 'loop' as const,
    },
  },
}

/**
 * Progress bar fill — 500ms cubic-bezier per ARCHITECTURE.md §4.2.
 * Pass as `transition` prop to a `motion.div` animating its width.
 */
export const progressFill: Transition = {
  duration: 0.5,
  ease: [0.2, 0.8, 0.2, 1],
}

/**
 * Tap press — 80ms micro-interaction for all interactive surfaces.
 * Spread onto motion elements: `{...tapPress}`.
 */
export const tapPress = {
  whileTap: { scale: 0.97 as const },
  transition: { duration: 0.08, ease: [0.2, 0.8, 0.2, 1] },
} as const
