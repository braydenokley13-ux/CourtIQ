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
  | { kind: 'ring'; id: string; at: Anchor; tone: Tone; radius?: number; pulse?: boolean; opacity?: number; /** Stretch along `rot` (radians, about +y): a defender pulled two ways. */ aspect?: number; rot?: number }
  | { kind: 'path'; id: string; points: Point2[]; tone: Tone; width?: number; arrow?: boolean; dashed?: boolean; opacity?: number; lift?: number; /** Draw-on duration in ms (animates from first appearance). */ grow?: number }
  | { kind: 'lane'; id: string; from: Anchor; to: Anchor; tone: Tone; width?: number; opacity?: number; /** Flight apex in metres: a glass corridor following the ball's arc. */ arc?: number; /** Fractions along the lane a defender could reach in time (cut out of the glass). */ cuts?: [number, number][]; /** Hatched, greyed: blocked. */ blocked?: boolean }
  | { kind: 'disc'; id: string; center: Anchor; radius: number; tone: Tone; opacity?: number; edge?: boolean }
  | { kind: 'tether'; id: string; from: Anchor; to: Anchor; tone: Tone; opacity?: number; width?: number; /** Chest-height duty string: height of both ends, droop and fraying. */ y?: number; sag?: number; fray?: boolean; /** 0..1 recent transfer: brightens and thickens. */ flash?: number }
  | { kind: 'wedge'; id: string; apex: Anchor; toward: Anchor; length: number; spread: number; tone: Tone; opacity?: number }
  /** Time-to-arrive map: isochrone bands of the fastest defender at every floor point. */
  | { kind: 'arrival'; id: string; sources: Anchor[]; accel: number; maxSpeed: number; react: number; contest: number; /** Ball clock: floor beyond this arrival time (nobody gets there) glows threat. */ ballTime?: number | null; opacity?: number }
  /** Vertical pin with a floor ring: where an alternate-world body stands. */
  | { kind: 'pin'; id: string; at: Anchor; tone: Tone; height?: number; radius?: number; opacity?: number }
  /** A counter drawn in time: head runs the route; outcome decides what remains. */
  | { kind: 'comet'; id: string; points: Point2[]; outcome: 'held' | 'exposed'; /** Run time in ms. */ run?: number; selected?: boolean }
  /** One-shot expanding impact at a point. */
  | { kind: 'flare'; id: string; at: Anchor; tone: Tone; radius?: number; /** ms */ duration?: number }

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
  /** Per-frame clock. While `playing`, the runtime calls these every animation frame instead of using `frame`/`ghost`,
   * so React need not re-render at display rate. `frame`/`ghost` stay the exact fallback whenever not playing. */
  live?: { frame(): WorldFrame; ghost?(): WorldFrame | null } | null
  editable: boolean
  tagGuide?: TagGuide | null
  /** Director composition overrides (Break staging, etc.). */
  rig?: { azimuth?: number; elevation?: number; fov?: number; minDistance?: number; rim?: boolean } | null
  /** Changes whenever a beat should kick the camera (hit-stop at the vulnerability). */
  impact?: number
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
  onStats?(stats: WorldStats): void
}

/** Debug-HUD / perf contract, emitted ~1 Hz while the world renders. Times in ms. */
export interface WorldStats {
  fps: number
  /** Effective renderer pixel ratio (render scale). */
  scale: number
  calls: number
  triangles: number
  /** Smoothed JS time per rendered frame inside the runtime tick (legacy name). */
  cpu: number
  /** Interval between consecutive rendered frames. */
  frameP50: number
  frameP95: number
  jsMs: number
  jsP95: number
  /** GPU time per frame from EXT_disjoint_timer_query_webgl2; null when the browser does not expose it. */
  gpuMs: number | null
  programs: number
  textures: number
  geometries: number
  tier: 'high' | 'balanced' | 'low'
  /** true = adaptive controller may change tier; false = user override. */
  auto: boolean
  software: boolean
  longTasks: number
  /** Last automatic or manual quality change, for the HUD. */
  change: string | null
}
