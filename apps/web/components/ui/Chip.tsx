import type { HTMLAttributes, ReactNode } from 'react'

export type ChipVariant = 'brand' | 'iq' | 'xp' | 'heat' | 'info' | 'muted'

const variantClass: Record<ChipVariant, string> = {
  brand: 'text-brand   bg-brand/10   border-brand/25',
  iq:    'text-iq      bg-iq/10      border-iq/25',
  xp:    'text-xp      bg-xp/10      border-xp/25',
  heat:  'text-heat    bg-heat/10    border-heat/25',
  info:  'text-info    bg-info/10    border-info/25',
  muted: 'text-foreground-dim bg-white/[0.04] border-hairline',
}

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: ChipVariant
  size?: 'sm' | 'md'
}

export function Chip({
  children,
  variant = 'muted',
  size = 'sm',
  className = '',
  ...props
}: ChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border',
        'font-ui font-semibold uppercase tracking-[0.2px]',
        size === 'sm' ? 'px-[9px] py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        variantClass[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}
