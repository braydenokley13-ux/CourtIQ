'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import type { HTMLAttributes } from 'react'

// ─── Card ──────────────────────────────────────────────────────────────────────
// bg-1 background, radius 20px, hairline border.
// Per ARCHITECTURE.md §4.2: cards use radius 20.

type Padding = 'none' | 'sm' | 'md' | 'lg'
type Variant = 'default' | 'elevated' | 'ghost'

const paddingClass: Record<Padding, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-5',
}

const variantClass: Record<Variant, string> = {
  default:  'bg-bg-1 border-hairline',
  elevated: 'bg-bg-2 border-hairline-2',
  ghost:    'bg-transparent border-hairline',
}

interface CardBaseProps {
  padding?: Padding
  variant?: Variant
}

// Interactive card uses motion.div for tap feedback
interface InteractiveCardProps
  extends CardBaseProps,
    Omit<HTMLMotionProps<'div'>, 'children'> {
  interactive: true
  children?: React.ReactNode
}

// Static card is a plain div — no framer-motion overhead
interface StaticCardProps
  extends CardBaseProps,
    HTMLAttributes<HTMLDivElement> {
  interactive?: false
}

type CardProps = InteractiveCardProps | StaticCardProps

export function Card({
  padding = 'md',
  variant = 'default',
  interactive,
  children,
  className = '',
  ...props
}: CardProps) {
  const base = [
    'rounded-2xl border overflow-hidden',
    variantClass[variant],
    paddingClass[padding],
    interactive
      ? 'cursor-pointer transition-colors duration-[80ms] hover:bg-bg-2 hover:border-hairline-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (interactive) {
    return (
      <motion.div
        whileTap={{ scale: 0.992 }}
        transition={{ duration: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        className={base}
        tabIndex={0}
        role="button"
        {...(props as HTMLMotionProps<'div'>)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={base} {...(props as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  )
}
