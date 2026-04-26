/**
 * Coordinate helpers for the 3D scenario engine.
 *
 * Court coordinate system (in feet):
 *   - origin (0, 0) is the center of the rim
 *   - +x  : toward the right sideline
 *   - +z  : away from the rim toward half-court
 *   - y   : height above the floor
 *
 * Half-court is 50 ft wide x 47 ft long, so x ∈ [-25, 25], z ∈ [0, 47].
 *
 * Legacy 2D viewbox is 500 x 470 px with the rim at (250, 52) and the
 * half-court line at y = 450. Anything authored as a 2D `court_state` can be
 * projected into court feet through `projectLegacyPoint`.
 */

export const COURT = {
  halfWidthFt: 25,
  halfLengthFt: 47,
  rimHeightFt: 10,
  threePointRadiusFt: 23.75,
  paintWidthFt: 16,
  paintLengthFt: 19,
  freeThrowDistFt: 15,
} as const

export const LEGACY_VIEWBOX = {
  width: 500,
  height: 470,
  rimX: 250,
  rimY: 52,
  baselineY: 20,
  halfCourtY: 450,
} as const

const PX_PER_FT_X = (LEGACY_VIEWBOX.width - 40) / (COURT.halfWidthFt * 2)
const PX_PER_FT_Z = (LEGACY_VIEWBOX.halfCourtY - LEGACY_VIEWBOX.rimY) / COURT.halfLengthFt

export interface CourtPoint {
  x: number
  z: number
}

export function projectLegacyPoint(px: number, py: number): CourtPoint {
  return {
    x: (px - LEGACY_VIEWBOX.rimX) / PX_PER_FT_X,
    z: (py - LEGACY_VIEWBOX.rimY) / PX_PER_FT_Z,
  }
}

export function unprojectLegacyPoint(point: CourtPoint): { x: number; y: number } {
  return {
    x: point.x * PX_PER_FT_X + LEGACY_VIEWBOX.rimX,
    y: point.z * PX_PER_FT_Z + LEGACY_VIEWBOX.rimY,
  }
}

export function clampToCourt(point: CourtPoint): CourtPoint {
  return {
    x: clamp(point.x, -COURT.halfWidthFt, COURT.halfWidthFt),
    z: clamp(point.z, 0, COURT.halfLengthFt),
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
