import type { PlayerData } from './types'

interface PlayerProps extends PlayerData {
  team: 'off' | 'def' | 'you'
}

export function Player({ x, y, team, label, glow, highlight, ghost, color }: PlayerProps) {
  const fill = color ?? (team === 'off' ? '#3BE383' : team === 'you' ? '#FFD60A' : '#FF4D6D')
  const ink = team === 'off' ? '#021810' : team === 'you' ? '#1A1400' : '#fff'

  return (
    <g transform={`translate(${x} ${y})`} opacity={ghost ? 0.35 : 1}>
      {glow && (
        <circle r="26" fill={fill} opacity="0.2">
          <animate attributeName="r" from="20" to="32" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.35" to="0" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      {highlight && (
        <circle r="20" fill="none" stroke={fill} strokeWidth="2" strokeDasharray="3 3">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      <circle
        r="15"
        fill={fill}
        stroke={ghost ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.4)'}
        strokeWidth="1.5"
        strokeDasharray={ghost ? '3 3' : undefined}
      />
      {label && (
        <text
          y="5"
          textAnchor="middle"
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight="700"
          fontSize="14"
          fill={ink}
        >
          {label}
        </text>
      )}
    </g>
  )
}
