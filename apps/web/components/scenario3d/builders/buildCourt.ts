import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import { disposeObject3D } from './dispose'
import {
  buildArcRing,
  buildFilledRect,
  buildStripe,
  createFlatDecalMaterial,
} from './primitives'
import type { BuilderResult } from './types'

const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#1656A8'
const RESTRICTED_COLOR = '#FFFFFF'
const HARDWOOD_FALLBACK_COLOR = '#9B6A38'

// Real NBA court line width is 2 in. We render slightly thicker so the
// markings stay crisp at default-camera distance without aliasing.
const LINE_THICKNESS_FT = 0.22
const HALF_COURT_THICKNESS_FT = 0.22

// Layered y-lifts. Polygon offset on the materials handles the depth-buffer
// fight; the y-lifts give a tiny amount of physical clearance so even a
// renderer with disabled polygon offset still composites layers cleanly.
const FLOOR_LIFT = 0
const PAINT_LIFT = 0.01
const LINE_LIFT = 0.02
const ARC_LIFT = 0.022
const HASH_LIFT = 0.024

const HARDWOOD_TEXTURE_WIDTH = 512
const HARDWOOD_TEXTURE_HEIGHT = 1024
const HARDWOOD_PLANK_COUNT = 9

// NBA-style court geometry, expressed in court feet.
//   - Paint runs from baseline (z = 0) to FT line (z = freeThrowDistFt = 15)
//   - Free-throw circle radius is 6 ft, centered on the FT line
//   - Restricted area arc is 4 ft from the rim (rim sits at the origin)
//   - Three-point arc is 23.75 ft from the rim, with straight 22-ft corner
//     extensions running from baseline to where the arc meets them
//   - Lane "block" hash marks live on the lane lines; lowest block is 7 ft
//     from baseline, then 3 ft spacing up the lane
const FREE_THROW_CIRCLE_RADIUS = 6
const RESTRICTED_AREA_RADIUS = 4
const CORNER_THREE_X = 22
const CENTER_CIRCLE_RADIUS = 6
const LANE_BLOCK_LENGTHS_FT = [1, 2, 2, 2] // first block thicker, rest standard
const LANE_BLOCK_FIRST_OFFSET_FT = 7
const LANE_BLOCK_GAP_FT = 1
const LANE_BLOCK_TICK_HEIGHT_FT = 0.55

/**
 * Builds the court surface: hardwood floor, painted key, full set of
 * NBA-style markings (sidelines, baseline, half-court line, lane lines,
 * lane blocks, FT circle, restricted-area arc, three-point line, center
 * circle). Lines are flat polygon-offset decals stacked above the floor
 * to keep the hardwood from Packet 3 visible underneath while preventing
 * z-fighting at any camera angle.
 */
export function buildCourt(): BuilderResult {
  const group = new THREE.Group()
  group.name = 'court'

  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  const halfPaintW = COURT.paintWidthFt / 2
  const ftLineZ = COURT.freeThrowDistFt
  const courtCenterZ = halfL / 2 - 0.5

  // ---- Hardwood floor (Packet 3 — preserved) ---------------------------
  const hardwoodTexture = generateHardwoodTexture()
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfL),
    new THREE.MeshStandardMaterial({
      map: hardwoodTexture ?? null,
      color: hardwoodTexture ? '#FFFFFF' : HARDWOOD_FALLBACK_COLOR,
      roughness: 0.55,
      metalness: 0.0,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, FLOOR_LIFT, courtCenterZ)
  // Hardwood is the primary shadow-catching surface — players, hoop,
  // and ball shadows from Packet 5 land here.
  floor.receiveShadow = true
  group.add(floor)

  // ---- Painted key + restricted-area fill ------------------------------
  // Solid lay-down so the lane reads as a painted area, not as four
  // disconnected lane lines. Painted with a matte standard material so
  // shadows from players in the lane render correctly on the paint;
  // a MeshBasicMaterial would ignore the shadow pass entirely.
  const paintMaterial = new THREE.MeshStandardMaterial({
    color: PAINT_COLOR,
    roughness: 0.85,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const paintMesh = buildFilledRect(
    COURT.paintWidthFt,
    ftLineZ,
    0,
    PAINT_LIFT,
    ftLineZ / 2,
    paintMaterial,
  )
  paintMesh.receiveShadow = true
  group.add(paintMesh)

  // Shared white-line material; reused across every line/arc so the
  // GPU only carries a single decal pipeline state for the markings.
  const lineMaterial = createFlatDecalMaterial({
    color: LINE_COLOR,
    polygonOffsetUnits: -4,
  })
  // Slightly stronger offset for arcs that sit above the paint, so they
  // don't z-fight with the lane fill at grazing angles.
  const arcOverPaintMaterial = createFlatDecalMaterial({
    color: LINE_COLOR,
    polygonOffsetUnits: -8,
  })
  const restrictedMaterial = createFlatDecalMaterial({
    color: RESTRICTED_COLOR,
    polygonOffsetUnits: -10,
  })

  // ---- Court outline (sidelines + baseline + half-court) --------------
  // Baseline at z = 0; sidelines at x = ±halfW from baseline to half-court;
  // half-court line at z = halfL. Stripes are PlaneGeometry rectangles
  // rotated to lie flat on the hardwood.
  const outlineSegments: Array<[THREE.Vector3, THREE.Vector3, number]> = [
    // Baseline
    [
      new THREE.Vector3(-halfW, LINE_LIFT, 0),
      new THREE.Vector3(halfW, LINE_LIFT, 0),
      LINE_THICKNESS_FT,
    ],
    // Sidelines
    [
      new THREE.Vector3(-halfW, LINE_LIFT, 0),
      new THREE.Vector3(-halfW, LINE_LIFT, halfL),
      LINE_THICKNESS_FT,
    ],
    [
      new THREE.Vector3(halfW, LINE_LIFT, 0),
      new THREE.Vector3(halfW, LINE_LIFT, halfL),
      LINE_THICKNESS_FT,
    ],
    // Half-court line (this is a half-court render, so the half-court
    // line lives at the far end z = halfL).
    [
      new THREE.Vector3(-halfW, LINE_LIFT, halfL),
      new THREE.Vector3(halfW, LINE_LIFT, halfL),
      HALF_COURT_THICKNESS_FT,
    ],
  ]
  for (const [start, end, thickness] of outlineSegments) {
    group.add(buildStripe(start, end, thickness, lineMaterial))
  }

  // ---- Lane lines + free-throw line (the rectangle around the paint) --
  const laneSegments: Array<[THREE.Vector3, THREE.Vector3]> = [
    [
      new THREE.Vector3(-halfPaintW, LINE_LIFT, 0),
      new THREE.Vector3(-halfPaintW, LINE_LIFT, ftLineZ),
    ],
    [
      new THREE.Vector3(halfPaintW, LINE_LIFT, 0),
      new THREE.Vector3(halfPaintW, LINE_LIFT, ftLineZ),
    ],
    [
      new THREE.Vector3(-halfPaintW, LINE_LIFT, ftLineZ),
      new THREE.Vector3(halfPaintW, LINE_LIFT, ftLineZ),
    ],
  ]
  for (const [start, end] of laneSegments) {
    group.add(buildStripe(start, end, LINE_THICKNESS_FT, lineMaterial))
  }

  // ---- Lane block hash marks ------------------------------------------
  // Short ticks projecting outward from the lane lines, where players
  // line up for free throws. Built symmetrically on both sides of the
  // paint, marching from the baseline toward the FT line.
  let cursor = LANE_BLOCK_FIRST_OFFSET_FT
  for (const blockLen of LANE_BLOCK_LENGTHS_FT) {
    const z0 = cursor
    const z1 = cursor + blockLen
    if (z1 > ftLineZ - 0.1) break
    // Outward tick on each lane line — short stripes perpendicular to z.
    const tickZ = (z0 + z1) / 2
    const tickW = LANE_BLOCK_TICK_HEIGHT_FT
    // Left lane line ticks (point to -x).
    group.add(
      buildStripe(
        new THREE.Vector3(-halfPaintW - tickW / 2, HASH_LIFT, tickZ),
        new THREE.Vector3(-halfPaintW + tickW / 2, HASH_LIFT, tickZ),
        LINE_THICKNESS_FT,
        lineMaterial,
      ),
    )
    // Right lane line ticks (point to +x).
    group.add(
      buildStripe(
        new THREE.Vector3(halfPaintW - tickW / 2, HASH_LIFT, tickZ),
        new THREE.Vector3(halfPaintW + tickW / 2, HASH_LIFT, tickZ),
        LINE_THICKNESS_FT,
        lineMaterial,
      ),
    )
    cursor = z1 + LANE_BLOCK_GAP_FT
  }

  // ---- Restricted area arc (4 ft semicircle around the rim) -----------
  // RingGeometry's thetaStart is CCW from its local +X axis. After the
  // -PI/2 X-rotation that lays the ring flat on the floor, local +Y
  // points to world -Z, so the half-plane "world z > centerZ" (i.e. the
  // open side of every basketball arc) lives in local y < 0, which is
  // theta ∈ [π, 2π].
  group.add(
    buildArcRing({
      radiusFt: RESTRICTED_AREA_RADIUS,
      thicknessFt: LINE_THICKNESS_FT,
      thetaStart: Math.PI,
      thetaLength: Math.PI,
      centerX: 0,
      y: ARC_LIFT,
      centerZ: 0,
      material: restrictedMaterial,
    }),
  )

  // ---- Free-throw circle (around FT line) -----------------------------
  // Solid half on the FT-line / top side (z > ftLineZ, away from baseline),
  // dashed half on the paint side (z < ftLineZ). Dashes built as discrete
  // arc-ring segments so the count and gap stay deterministic across runs.
  group.add(
    buildArcRing({
      radiusFt: FREE_THROW_CIRCLE_RADIUS,
      thicknessFt: LINE_THICKNESS_FT,
      thetaStart: Math.PI,
      thetaLength: Math.PI,
      centerX: 0,
      y: ARC_LIFT,
      centerZ: ftLineZ,
      material: lineMaterial,
    }),
  )
  const dashCount = 8
  const dashGap = 0.4 // gap fraction (0..1) between dashes on the inside half
  const sweepPerDash = (Math.PI * (1 - dashGap)) / dashCount
  const gapPerDash = (Math.PI * dashGap) / dashCount
  for (let i = 0; i < dashCount; i++) {
    // Inside-paint half lives in local y > 0, i.e. theta ∈ [0, π].
    const start = gapPerDash / 2 + i * (sweepPerDash + gapPerDash)
    group.add(
      buildArcRing({
        radiusFt: FREE_THROW_CIRCLE_RADIUS,
        thicknessFt: LINE_THICKNESS_FT,
        thetaStart: start,
        thetaLength: sweepPerDash,
        centerX: 0,
        y: ARC_LIFT,
        centerZ: ftLineZ,
        material: arcOverPaintMaterial,
      }),
    )
  }

  // ---- Three-point line: corner straights + arc -----------------------
  // The corner-3 lines are parallel to the sidelines at x = ±22, running
  // from baseline up to where they meet the 23.75-ft arc. That meeting
  // point is z = sqrt(r^2 - 22^2) ≈ 8.95 ft from the baseline.
  const cornerMeetZ = Math.sqrt(
    Math.max(0, COURT.threePointRadiusFt ** 2 - CORNER_THREE_X ** 2),
  )
  group.add(
    buildStripe(
      new THREE.Vector3(-CORNER_THREE_X, LINE_LIFT, 0),
      new THREE.Vector3(-CORNER_THREE_X, LINE_LIFT, cornerMeetZ),
      LINE_THICKNESS_FT,
      lineMaterial,
    ),
  )
  group.add(
    buildStripe(
      new THREE.Vector3(CORNER_THREE_X, LINE_LIFT, 0),
      new THREE.Vector3(CORNER_THREE_X, LINE_LIFT, cornerMeetZ),
      LINE_THICKNESS_FT,
      lineMaterial,
    ),
  )

  // Arc swept symmetrically across +z. After the -PI/2 X rotation that
  // lays the ring flat, local +Y maps to world -Z, so a court point
  // (worldX, worldZ) corresponds to local (worldX, -worldZ). The corner
  // meet on the right is world (+CORNER_THREE_X, +cornerMeetZ), which
  // sits at local angle atan2(-cornerMeetZ, CORNER_THREE_X) = -arcEndAngle.
  // The left meet is at angle arcEndAngle - π. Sweeping CCW from left to
  // right gives a clean front-of-court arc.
  const arcEndAngle = Math.atan2(cornerMeetZ, CORNER_THREE_X)
  const threePtThetaStart = arcEndAngle - Math.PI
  const threePtThetaLength = Math.PI - 2 * arcEndAngle
  group.add(
    buildArcRing({
      radiusFt: COURT.threePointRadiusFt,
      thicknessFt: LINE_THICKNESS_FT,
      thetaStart: threePtThetaStart,
      thetaLength: threePtThetaLength,
      centerX: 0,
      y: ARC_LIFT,
      centerZ: 0,
      material: lineMaterial,
      segments: 128,
    }),
  )

  // ---- Center circle (visible half on the half-court line) ------------
  // Only the half closer to us (z < halfL) belongs to this half-court.
  // World z < centerZ corresponds to local y > 0, i.e. theta ∈ [0, π].
  group.add(
    buildArcRing({
      radiusFt: CENTER_CIRCLE_RADIUS,
      thicknessFt: LINE_THICKNESS_FT,
      thetaStart: 0,
      thetaLength: Math.PI,
      centerX: 0,
      y: ARC_LIFT,
      centerZ: halfL,
      material: lineMaterial,
      segments: 96,
    }),
  )

  return {
    object: group,
    dispose: () => {
      // Texture isn't reached by disposeObject3D's geometry/material
      // walk, so release it explicitly first.
      if (hardwoodTexture) hardwoodTexture.dispose()
      disposeObject3D(group)
    },
  }
}

/**
 * Generates a procedural hardwood plank texture into a 2D canvas and
 * wraps it as a CanvasTexture. Deterministic via a seeded LCG so the
 * floor looks identical across reloads / runs (scenario playback must
 * stay reproducible). Returns null when running without a DOM (e.g.
 * SSR import-time eval); the caller falls back to a flat color.
 */
function generateHardwoodTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = HARDWOOD_TEXTURE_WIDTH
  canvas.height = HARDWOOD_TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Seeded LCG (deterministic, no Math.random).
  let seed = 0x0c0ffee5 >>> 0
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  // Base color wash so the lightest planks still feel like wood.
  ctx.fillStyle = '#85562A'
  ctx.fillRect(0, 0, HARDWOOD_TEXTURE_WIDTH, HARDWOOD_TEXTURE_HEIGHT)

  const plankCount = HARDWOOD_PLANK_COUNT
  const plankWidth = HARDWOOD_TEXTURE_WIDTH / plankCount

  for (let i = 0; i < plankCount; i++) {
    const x = i * plankWidth

    // Per-plank base color with subtle variation — keep saturation
    // similar so neighboring planks don't look like different species.
    const r = Math.round(150 + (rand() - 0.5) * 28)
    const g = Math.round(96 + (rand() - 0.5) * 22)
    const b = Math.round(50 + (rand() - 0.5) * 18)
    ctx.fillStyle = `rgb(${clamp8(r)}, ${clamp8(g)}, ${clamp8(b)})`
    ctx.fillRect(x, 0, plankWidth, HARDWOOD_TEXTURE_HEIGHT)

    // Plank seam (thin dark line at the right edge of every plank).
    ctx.fillStyle = 'rgba(28, 18, 8, 0.7)'
    ctx.fillRect(x + plankWidth - 1.4, 0, 1.4, HARDWOOD_TEXTURE_HEIGHT)

    // Grain: many faint vertical strokes per plank with slight bezier
    // curvature for a natural feel.
    const grainCount = 22 + Math.floor(rand() * 14)
    for (let s = 0; s < grainCount; s++) {
      const gx = x + rand() * plankWidth
      const gy0 = rand() * HARDWOOD_TEXTURE_HEIGHT
      const gLen = 60 + rand() * 260
      const gy1 = gy0 + gLen
      const alpha = 0.05 + rand() * 0.1
      ctx.strokeStyle = `rgba(60, 36, 16, ${alpha.toFixed(3)})`
      ctx.lineWidth = 0.5 + rand() * 0.9
      ctx.beginPath()
      ctx.moveTo(gx, gy0)
      ctx.bezierCurveTo(
        gx + (rand() - 0.5) * 4,
        gy0 + gLen * 0.3,
        gx + (rand() - 0.5) * 4,
        gy0 + gLen * 0.7,
        gx + (rand() - 0.5) * 2,
        gy1,
      )
      ctx.stroke()
    }

    // Occasional knot (skip plenty of planks so it doesn't get busy).
    if (rand() < 0.55) {
      const kx = x + rand() * plankWidth
      const ky = rand() * HARDWOOD_TEXTURE_HEIGHT
      const kr = 1.6 + rand() * 2.8
      ctx.fillStyle = `rgba(34, 20, 8, ${(0.45 + rand() * 0.25).toFixed(3)})`
      ctx.beginPath()
      ctx.ellipse(kx, ky, kr, kr * (1 + rand() * 0.6), 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Subtle sheen across the long axis so the floor doesn't feel flat
  // — finished gym hardwood typically has a soft varnish gradient.
  const sheen = ctx.createLinearGradient(0, 0, 0, HARDWOOD_TEXTURE_HEIGHT)
  sheen.addColorStop(0, 'rgba(255, 220, 180, 0.07)')
  sheen.addColorStop(0.5, 'rgba(255, 200, 140, 0)')
  sheen.addColorStop(1, 'rgba(255, 220, 180, 0.07)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, HARDWOOD_TEXTURE_WIDTH, HARDWOOD_TEXTURE_HEIGHT)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  // Texture covers the entire floor exactly once — no tiling means no
  // seams repeating across the half-court.
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  // Anisotropy is clamped by the renderer to its supported max; 8 is a
  // good default for grazing-angle floor reads.
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, v))
}
