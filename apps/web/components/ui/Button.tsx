'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { Icon, type IconName } from './Icon'

// ─── Primary Button ────────────────────────────────────────────────────────────
// 58px tall, radius 18px, brand background, Space Grotesk uppercase.
// Per ARCHITECTURE.md §4.2: primary button uses radius 18, brand bg.

interface PrimaryButtonProps extends HTMLMotionProps<'button'> {
  icon?: IconName
  loading?: boolean
  fullWidth?: boolean
}

export function PrimaryButton({
  icon,
  loading = false,
  fullWidth = true,
  disabled,
  children,
  className = '',
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled ?? loading

  return (
    <motion.button
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.98, y: 1 }}
      transition={{ duration: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      className={[
        'relative flex items-center justify-center gap-2.5',
        'h-[58px] rounded-xl',
        'font-display text-[17px] font-bold uppercase tracking-[0.3px]',
        'select-none transition-shadow duration-[80ms]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
        isDisabled
          ? 'cursor-not-allowed bg-bg-3 text-foreground-mute'
          : 'cursor-pointer bg-brand text-brand-ink shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_-2px_0_rgba(0,0,0,0.15)_inset,0_8px_24px_-8px_rgba(59,227,131,0.5)]',
        fullWidth ? 'w-full' : 'px-8',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink"
          aria-label="Loading"
        />
      ) : (
        <>
          {children}
          {icon && (
            <Icon name={icon} size={18} color="currentColor" strokeWidth={3} />
          )}
        </>
      )}
    </motion.button>
  )
}

// ─── Ghost Button ──────────────────────────────────────────────────────────────
// 44px tall, radius 12px, transparent with hairline border.

interface GhostButtonProps extends HTMLMotionProps<'button'> {
  icon?: IconName
  iconPosition?: 'left' | 'right'
}

export function GhostButton({
  icon,
  iconPosition = 'left',
  disabled,
  children,
  className = '',
  ...props
}: GhostButtonProps) {
  return (
    <motion.button
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      className={[
        'inline-flex items-center justify-center gap-2',
        'h-11 rounded-md border border-hairline-2 px-[18px]',
        'bg-transparent font-ui text-sm font-semibold tracking-[0.1px] text-foreground',
        'select-none transition-colors duration-[80ms]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : 'cursor-pointer hover:bg-bg-2 hover:border-hairline-2',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <Icon name={icon} size={16} color="currentColor" />
      )}
      {children}
      {icon && iconPosition === 'right' && (
        <Icon name={icon} size={16} color="currentColor" />
      )}
    </motion.button>
  )
}
