'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import type { HTMLAttributes } from 'react'

type CardVariant = 'default' | 'elevated' | 'ghost'

interface BaseCardProps {
  variant?: CardVariant
  pad?: string
  className?: string
}

interface InteractiveCardProps extends BaseCardProps, HTMLMotionProps<'div'> {
  interactive: true
}

interface StaticCardProps extends BaseCardProps, HTMLAttributes<HTMLDivElement> {
  interactive?: false
}

type CardProps = InteractiveCardProps | StaticCardProps

function cardClasses(variant: CardVariant, pad: string, className: string) {
  const base = 'rounded-2xl border'
  const variants: Record<CardVariant, string> = {
    default: 'bg-bg-1 border-hairline',
    elevated: 'bg-bg-2 border-hairline-2',
    ghost: 'bg-transparent border-hairline',
  }
  return [base, variants[variant], pad, className].filter(Boolean).join(' ')
}

export function Card(props: CardProps) {
  const { variant = 'default', pad = 'p-4', className = '', interactive, children, ...rest } = props

  const cls = cardClasses(variant, pad, className)

  if (interactive) {
    return (
      <motion.div
        whileHover={{ backgroundColor: 'rgba(38,42,51,0.8)' }}
        whileTap={{ scale: 0.995 }}
        transition={{ duration: 0.1 }}
        className={cls}
        {...(rest as HTMLMotionProps<'div'>)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={cls} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  )
}
