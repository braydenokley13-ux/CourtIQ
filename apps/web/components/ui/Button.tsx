'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { Icon, type IconName } from './Icon'

interface PrimaryButtonProps extends HTMLMotionProps<'button'> {
  children?: React.ReactNode
  loading?: boolean
  icon?: IconName
}

export function PrimaryButton({ children, loading, icon, disabled, className = '', ...rest }: PrimaryButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98, y: 1 }}
      transition={{ duration: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      disabled={disabled ?? loading}
      className={[
        'relative w-full h-[58px] rounded-xl',
        'font-display font-bold text-[17px] tracking-[0.3px] uppercase',
        'flex items-center justify-center gap-2.5',
        'transition-shadow duration-75',
        disabled || loading
          ? 'bg-bg-3 text-foreground-mute cursor-default'
          : 'bg-brand text-brand-ink shadow-brand cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <svg className="animate-spin" width={20} height={20} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5}/>
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"/>
        </svg>
      ) : (
        <>
          {children}
          {icon && <Icon name={icon} size={18} color="currentColor" strokeWidth={3} />}
        </>
      )}
    </motion.button>
  )
}

interface GhostButtonProps extends HTMLMotionProps<'button'> {
  children?: React.ReactNode
  iconLeft?: IconName
  iconRight?: IconName
}

export function GhostButton({ children, iconLeft, iconRight, className = '', ...rest }: GhostButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
      className={[
        'h-11 px-[18px] rounded-md',
        'font-ui font-semibold text-[14px] tracking-[0.1px]',
        'text-foreground border border-hairline-2 bg-transparent',
        'inline-flex items-center gap-2 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
        className,
      ].join(' ')}
      {...rest}
    >
      {iconLeft && <Icon name={iconLeft} size={16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={16} />}
    </motion.button>
  )
}
