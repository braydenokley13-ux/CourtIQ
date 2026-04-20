interface BallProps {
  x: number
  y: number
}

export function Ball({ x, y }: BallProps) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="9" fill="#FF8A3D" stroke="#2A1206" strokeWidth="1.5" />
      <path
        d="M -8 0 A 8 8 0 0 1 8 0 M 0 -8 A 8 8 0 0 1 0 8"
        stroke="#2A1206"
        strokeWidth="1"
        fill="none"
      />
    </g>
  )
}
