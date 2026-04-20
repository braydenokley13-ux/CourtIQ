import type { CSSProperties, HTMLAttributes } from 'react'

interface DotProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number
  color?: string
}

export function Dot({
  size = 6,
  color = '#3BE383',
  className = '',
  style,
  ...props
}: DotProps) {
  const inlineStyle: CSSProperties = {
    width: size,
    height: size,
    background: color,
    flexShrink: 0,
    ...style,
  }

  return (
    <span
      className={['inline-block rounded-full', className].filter(Boolean).join(' ')}
      style={inlineStyle}
      aria-hidden="true"
      {...props}
    />
  )
}
