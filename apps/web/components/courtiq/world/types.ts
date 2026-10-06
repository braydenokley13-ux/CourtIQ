import type { PlayerId, Point2, WorldFrame } from '@/lib/defense-lab/types'
import type { TagGuide } from '@/lib/defense-lab/tagGuide'

/** The renderer draws basketball state plus generic world-anchored marks.
 * It never decides basketball: lenses, moments and comparisons are computed
 * by the domain layer and arrive here as marks. */
export type Lens = 'normal' | 'ownership' | 'reach' | 'passing' | 'space'
export type CameraMode = 'director' | 'free' | 'overhead' | 'baseline' | 'player'
export type Tone = 'threat' | 'good' | 'defense' | 'offense' | 'neutral' | 'ghost' | 'attack' | 'focus' | 'warn'
export type Anchor = PlayerId | Point2

export type Mark =
  | { kind: 'ring'; id: string; at: Anchor; tone: Tone; radius?: number; pulse?: boolean; opacity?: number }
  | { kind: 'path'; id: string; points: Point2[]; tone: Tone; width?: number; arrow?: boolean; dashed?: boolean; opacity?: number; lift?: number }
  | { kind: 'lane'; id: string; from: Anchor; to: Anchor; tone: Tone; width?: number; opacity?: number }
  | { kind: 'disc'; id: string; center: Anchor; radius: number; tone: Tone; opacity?: number; edge?: boolean }
  | { kind: 'tether'; id: string; from: Anchor; to: Anchor; tone: Tone; opacity?: number; width?: number }
  | { kind: 'wedge'; id: string; apex: Anchor; toward: Anchor; length: number; spread: number; tone: Tone; opacity?: number }

export interface WorldScene {
  frame: WorldFrame
  /** Alternate world at the same clock: a previous answer or a candidate fix. */
  ghost?: WorldFrame | null
  marks: Mark[]
  lens: Lens
  /** Players (and implicitly the ball) the director camera must frame. */
  focus: PlayerId[]
  camera: CameraMode
  pov?: PlayerId | null
  selectedId: PlayerId | null
  hoverId?: PlayerId | null
  /** When present, all other athletes recede (teaching, a single role). */
  highlight?: PlayerId[] | null
  playing: boolean
  editable: boolean
  tagGuide?: TagGuide | null
  /** Screen-space safe area (px) occupied by UI; the director composes the
   * basketball inside the remaining region instead of under the panels. */
  inset?: { left?: number; right?: number; top?: number; bottom?: number }
}

export interface WorldCallbacks {
  onSelect?(id: PlayerId | null, screen: { x: number; y: number } | null): void
  onHover?(id: PlayerId | null): void
  onMove?(id: PlayerId, target: Point2): void
  onTagDepth?(depth: number, final: boolean): void
  onCameraMode?(mode: CameraMode): void
  onReady?(info: { webgl: boolean; software: boolean }): void
  onStats?(stats: { fps: number; scale: number; calls: number; triangles: number }): void
}
