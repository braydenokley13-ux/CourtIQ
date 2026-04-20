export interface PlayerData {
  id: string
  x: number
  y: number
  hasBall?: boolean
  label?: string
  role?: string
  highlight?: boolean
  ghost?: boolean
  glow?: boolean
  /** Override team color */
  color?: string
}

export interface BallLocation {
  x: number
  y: number
}

export interface MotionCue {
  from: [number, number]
  to: [number, number]
  color?: string
  dashed?: boolean
  /** Offset {x, y} for the quadratic bezier control point midpoint */
  curve?: { x?: number; y?: number }
  sw?: number
}

export interface DefenderOrientation {
  x: number
  y: number
}

export interface CourtState {
  offense: PlayerData[]
  defense: PlayerData[]
  ball_location: BallLocation
  defender_orientation?: DefenderOrientation
  motion_cues?: MotionCue[]
}

export interface FlashData {
  x: number
  y: number
  color?: string
}
