'use client'

import type { Variants, Transition } from 'framer-motion'

const ease = [0.2, 0.8, 0.2, 1] as const

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.12, ease },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.08, ease },
  },
}

export const slideUp: Variants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.28, ease },
  },
  exit: {
    y: 16,
    opacity: 0,
    transition: { duration: 0.16, ease },
  },
}

export const pop: Variants = {
  hidden: { scale: 0.6, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 500, damping: 24, mass: 0.8 },
  },
  exit: {
    scale: 0.8,
    opacity: 0,
    transition: { duration: 0.12, ease },
  },
}

export const pulse: Variants = {
  idle: { opacity: 0, scale: 1 },
  active: {
    opacity: [0.6, 0.2, 0],
    scale: [1, 1.15, 1.3],
    transition: {
      duration: 1.8,
      ease: 'easeOut',
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
}

export const progressFill: Transition = {
  duration: 0.5,
  ease,
}

export const tapPress = {
  whileTap: { scale: 0.97 },
  transition: { duration: 0.08, ease },
} as const

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.08,
    },
  },
}
