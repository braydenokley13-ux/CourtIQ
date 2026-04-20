interface DotProps {
  size?: number
  color?: string
  className?: string
}

export function Dot({ size = 6, color = '#3BE383', className = '' }: DotProps) {
  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: color }}
    />
  )
}
