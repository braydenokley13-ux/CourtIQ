import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import { disposeObject3D } from './dispose'
import { addArcLineSegments, buildTubeLine } from './primitives'
import type { BuilderResult } from './types'

const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#0050B4'
const HARDWOOD_FALLBACK_COLOR = '#9B6A38'

const FLOOR_LIFT = 0
const LINE_LIFT = 0.05
const LINE_RADIUS = 0.18
const ARC_SEGMENT_RADIUS = 0.14

const HARDWOOD_TEXTURE_WIDTH = 512
const HARDWOOD_TEXTURE_HEIGHT = 1024
const HARDWOOD_PLANK_COUNT = 9

/**
 * Builds the court surface: hardwood floor, painted key, court outline,
 * paint lines, three-point arc, and free-throw arc. Packet 4 will refine
 * paint/markings inside this same builder without touching the rest of
 * the scene graph.
 */
export function buildCourt(): BuilderResult {
  const group = new THREE.Group()
  group.name = 'court'

  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  const courtCenterZ = halfL / 2 - 0.5

  // Procedural hardwood. Generated lazily per build so each scene mount
  // owns its own texture and disposes it cleanly on unmount.
  const hardwoodTexture = generateHardwoodTexture()
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfL),
    new THREE.MeshStandardMaterial({
      map: hardwoodTexture ?? null,
      color: hardwoodTexture ? '#FFFFFF' : HARDWOOD_FALLBACK_COLOR,
      // Finished gym floor: low-but-not-zero specular sheen, no metal.
      roughness: 0.55,
      metalness: 0.0,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, FLOOR_LIFT, courtCenterZ)
  group.add(floor)

  // Paint sits 2cm above the floor — small enough that it reads as
  // painted-on, large enough to avoid z-fighting against the hardwood.
  const paint = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.paintWidthFt, COURT.freeThrowDistFt),
    new THREE.MeshBasicMaterial({ color: PAINT_COLOR, toneMapped: false }),
  )
  paint.rotation.x = -Math.PI / 2
  paint.position.set(0, FLOOR_LIFT + 0.02, COURT.freeThrowDistFt / 2)
  group.add(paint)

  const halfPaintW = COURT.paintWidthFt / 2
  const outlineSegments: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(-halfW, LINE_LIFT, 0), new THREE.Vector3(halfW, LINE_LIFT, 0)],
    [new THREE.Vector3(halfW, LINE_LIFT, 0), new THREE.Vector3(halfW, LINE_LIFT, halfL)],
    [new THREE.Vector3(halfW, LINE_LIFT, halfL), new THREE.Vector3(-halfW, LINE_LIFT, halfL)],
    [new THREE.Vector3(-halfW, LINE_LIFT, halfL), new THREE.Vector3(-halfW, LINE_LIFT, 0)],
    [
      new THREE.Vector3(-halfPaintW, LINE_LIFT, 0),
      new THREE.Vector3(-halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
    ],
    [
      new THREE.Vector3(halfPaintW, LINE_LIFT, 0),
      new THREE.Vector3(halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
    ],
    [
      new THREE.Vector3(-halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
      new THREE.Vector3(halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
    ],
  ]
  for (const [start, end] of outlineSegments) {
    group.add(buildTubeLine(start, end, LINE_RADIUS, LINE_COLOR))
  }

  // Three-point arc (around the rim) and free-throw arc.
  addArcLineSegments(
    group,
    COURT.threePointRadiusFt,
    Math.PI,
    LINE_LIFT,
    0,
    LINE_COLOR,
    ARC_SEGMENT_RADIUS,
  )
  addArcLineSegments(
    group,
    6,
    Math.PI,
    LINE_LIFT,
    COURT.freeThrowDistFt,
    LINE_COLOR,
    ARC_SEGMENT_RADIUS,
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
  let seed = 0x0C0FFEE5 >>> 0
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
