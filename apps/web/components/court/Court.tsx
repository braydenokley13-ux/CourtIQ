import { Arrow } from './Arrow'
import { Ball } from './Ball'
import { Player } from './Player'
import type { CourtState, FlashData } from './types'

interface CourtProps {
  width?: number
  height?: number
  courtState: CourtState
  /** ID of the "you" player in the offense array */
  you?: string
  flash?: FlashData
  lineColor?: string
}

const VB_W = 500
const VB_H = 470

export function Court({
  width = 340,
  height = 320,
  courtState,
  you,
  flash,
  lineColor = 'rgba(255,255,255,0.55)',
}: CourtProps) {
  const { offense, defense, ball_location, motion_cues = [] } = courtState

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="ciq-courtGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14171E" />
          <stop offset="100%" stopColor="#0A0B0E" />
        </linearGradient>
        <radialGradient id="ciq-hoopGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(255,138,61,0.35)" />
          <stop offset="100%" stopColor="rgba(255,138,61,0)" />
        </radialGradient>
        <pattern id="ciq-woodGrain" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="url(#ciq-courtGrad)" />
          <line x1="0" y1="7" x2="14" y2="7" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Court surface */}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#ciq-woodGrain)" />

      {/* Outer boundary */}
      <rect
        x="20" y="20"
        width={VB_W - 40} height={VB_H - 40}
        fill="none"
        stroke={lineColor}
        strokeWidth="2.5"
      />

      {/* Three-point line */}
      <path
        d="M 58 20 L 58 160 A 220 220 0 0 0 442 160 L 442 20"
        fill="none"
        stroke={lineColor}
        strokeWidth="2.5"
      />

      {/* Paint / lane */}
      <rect
        x="170" y="20"
        width="160" height="190"
        fill="rgba(59,227,131,0.04)"
        stroke={lineColor}
        strokeWidth="2.5"
      />

      {/* Free-throw arc (solid top half) */}
      <path d="M 170 210 A 80 80 0 0 0 330 210" fill="none" stroke={lineColor} strokeWidth="2.5" />
      {/* Free-throw arc (dashed bottom half) */}
      <path
        d="M 170 210 A 80 80 0 0 1 330 210"
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeDasharray="6 6"
      />

      {/* Restricted area */}
      <path d="M 210 50 A 40 40 0 0 0 290 50" fill="none" stroke={lineColor} strokeWidth="1.5" />

      {/* Backboard */}
      <line x1="222" y1="40" x2="278" y2="40" stroke={lineColor} strokeWidth="3" />

      {/* Rim */}
      <circle cx="250" cy="52" r="10" fill="none" stroke="#FF8A3D" strokeWidth="2" />
      <circle cx="250" cy="52" r="28" fill="url(#ciq-hoopGlow)" />

      {/* Half-court line */}
      <line
        x1="20" y1={VB_H - 20}
        x2={VB_W - 20} y2={VB_H - 20}
        stroke={lineColor}
        strokeWidth="2.5"
      />
      <circle
        cx="250" cy={VB_H - 20}
        r="60"
        fill="none"
        stroke={lineColor}
        strokeWidth="2"
        strokeDasharray="4 4"
      />

      {/* Lane hash marks */}
      {[70, 110, 150].map((y) => (
        <g key={y}>
          <line x1="165" y1={y} x2="175" y2={y} stroke={lineColor} strokeWidth="2" />
          <line x1="325" y1={y} x2="335" y2={y} stroke={lineColor} strokeWidth="2" />
        </g>
      ))}

      {/* Motion cues / arrows */}
      {motion_cues.map((cue, i) => (
        <Arrow key={i} uid={`mc-${i}`} {...cue} />
      ))}

      {/* Flash ring */}
      {flash && (
        <circle
          cx={flash.x}
          cy={flash.y}
          r="30"
          fill="none"
          stroke={flash.color ?? '#3BE383'}
          strokeWidth="2"
          opacity="0.6"
        >
          <animate attributeName="r" from="22" to="40" dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.8" to="0" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Offense players */}
      {offense.map((p) => (
        <Player
          key={p.id}
          team={p.id === you ? 'you' : 'off'}
          {...p}
        />
      ))}

      {/* Defense players */}
      {defense.map((p) => (
        <Player key={p.id} team="def" {...p} />
      ))}

      {/* Ball */}
      <Ball x={ball_location.x} y={ball_location.y} />
    </svg>
  )
}
