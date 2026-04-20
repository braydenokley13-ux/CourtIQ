import type { MotionCue } from './types'

let _idCounter = 0

interface ArrowProps extends MotionCue {
  /** Stable ID to avoid marker id collisions in the same SVG */
  uid?: string
}

export function Arrow({ from, to, color = '#3BE383', dashed = false, curve, sw = 2.5, uid }: ArrowProps) {
  const id = uid ?? `ciq-arrow-${_idCounter++}`
  let d: string
  if (curve) {
    const mx = (from[0] + to[0]) / 2 + (curve.x ?? 0)
    const my = (from[1] + to[1]) / 2 + (curve.y ?? 0)
    d = `M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`
  } else {
    d = `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`
  }

  return (
    <g>
      <defs>
        <marker
          id={id}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={dashed ? '6 5' : undefined}
        strokeLinecap="round"
        markerEnd={`url(#${id})`}
      />
    </g>
  )
}
