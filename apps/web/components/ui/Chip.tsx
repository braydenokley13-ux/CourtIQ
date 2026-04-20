import type { HTMLAttributes } from 'react'

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string
  dot?: string
}

export function Chip({ children, color, dot, className = '', style, ...rest }: ChipProps) {
  return (
    <span
      style={color ? { color, borderColor: `${color}33`, ...style } : style}
      className={[
        'inline-flex items-center gap-1.5',
        'px-[9px] py-1 rounded-full',
        'bg-white/[0.04] border border-hairline',
        'font-ui text-[11px] font-semibold tracking-[0.2px] uppercase',
        !color ? 'text-foreground-dim' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {dot && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: dot }}
        />
      )}
      {children}
    </span>
  )
}
