/**
 * V2-A — Premium Player Presence.
 *
 * Builds the visual primitives that make a player figure feel grounded
 * on the hardwood without inflating the per-frame cost: a radial-gradient
 * soft contact shadow and a subtle floor sheen ring.
 *
 * The pre-V2 contact shadow was a flat circle of `CONTACT_SHADOW_COLOR`
 * at 42% opacity. From a default broadcast camera that read as a hard
 * disk under each figure — silhouettes felt cut-and-pasted onto the
 * floor rather than placed on it. The radial-gradient replacement
 * fades from a darker centre to fully transparent at the rim, so the
 * shadow lands as ambient occlusion rather than a paint dot.
 *
 * Pure helpers — owns no THREE state across calls. Callers are
 * responsible for disposing the returned texture via
 * `disposeMaterialTextures` (the imperative scene's existing
 * traversal already handles `material.map`).
 *
 * Hard contract:
 *   - SSR-safe: every helper returns null on a non-DOM environment.
 *     Callers fall through to the legacy unlit material.
 *   - Pure / deterministic: same input parameters → byte-identical
 *     canvas pixels. The radial-gradient seed is fixed.
 *   - Cheap: a single canvas per scene, reused via the imperative
 *     scene's existing texture caches.
 */

import * as THREE from 'three'

export interface PlayerShadowOptions {
  /** Output canvas size (px). 128 is plenty — texture is mipmapped. */
  size?: number
  /** Centre alpha (0..1). Default 0.55 — slightly darker than the
   *  legacy 0.42 flat disk because the gradient now distributes the
   *  weight, leaving the rim transparent. */
  innerAlpha?: number
  /** Stop position where the gradient transitions (0..1). Smaller =
   *  tighter (sharper) shadow; larger = softer / more diffused. */
  midStop?: number
  /** Mid-stop alpha multiplier. */
  midAlphaScale?: number
  /** Hex color of the shadow ink. */
  ink?: string
}

const DEFAULT_OPTIONS: Required<PlayerShadowOptions> = {
  size: 128,
  innerAlpha: 0.55,
  midStop: 0.55,
  midAlphaScale: 0.45,
  ink: '#05070A',
}

/**
 * Builds a radial-gradient soft-shadow texture suitable for a
 * floor-locked plane under a player figure. The center is darkest
 * and fades to fully transparent at the rim. Returns null on SSR.
 *
 * Call sites pair the texture with a CircleGeometry slightly larger
 * than `PLAYER_RADIUS` so the shadow extends past the foot ring.
 */
export function buildPlayerShadowTexture(
  options: PlayerShadowOptions = {},
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const canvas = document.createElement('canvas')
  canvas.width = opts.size
  canvas.height = opts.size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const cx = opts.size / 2
  const cy = opts.size / 2
  const r = opts.size / 2

  ctx.clearRect(0, 0, opts.size, opts.size)

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  const ink = opts.ink
  grad.addColorStop(0, hexWithAlpha(ink, opts.innerAlpha))
  grad.addColorStop(
    opts.midStop,
    hexWithAlpha(ink, opts.innerAlpha * opts.midAlphaScale),
  )
  grad.addColorStop(1, hexWithAlpha(ink, 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, opts.size, opts.size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/**
 * Builds a soft "floor sheen" texture — a thin ring with a faint
 * highlight near the inner edge. Used as a secondary disc under user
 * players to read as a polished hardwood reflection without lighting
 * the shadow. Returns null on SSR.
 */
export interface PlayerSheenOptions {
  size?: number
  /** Tint of the sheen (warm hardwood reflection). */
  tint?: string
  /** Peak alpha (0..1). */
  peakAlpha?: number
}

const DEFAULT_SHEEN: Required<PlayerSheenOptions> = {
  size: 128,
  tint: '#FFE2A8',
  peakAlpha: 0.18,
}

export function buildPlayerSheenTexture(
  options: PlayerSheenOptions = {},
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const opts = { ...DEFAULT_SHEEN, ...options }
  const canvas = document.createElement('canvas')
  canvas.width = opts.size
  canvas.height = opts.size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const cx = opts.size / 2
  const cy = opts.size / 2
  const r = opts.size / 2

  ctx.clearRect(0, 0, opts.size, opts.size)

  // Inner ring: bright sheen around the foot circle, fading both
  // inward and outward so the highlight does not flatten the shadow.
  const grad = ctx.createRadialGradient(cx, cy, r * 0.32, cx, cy, r * 0.96)
  grad.addColorStop(0, hexWithAlpha(opts.tint, 0))
  grad.addColorStop(0.55, hexWithAlpha(opts.tint, opts.peakAlpha))
  grad.addColorStop(1, hexWithAlpha(opts.tint, 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, opts.size, opts.size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/**
 * Converts a `#RRGGBB` hex into an `rgba(r, g, b, a)` string. Lifts
 * the parsing into one place so a typo upstream returns a readable
 * fallback instead of a broken canvas.
 */
function hexWithAlpha(hex: string, alpha: number): string {
  const a = clamp01(alpha)
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(0, 0, 0, ${a.toFixed(3)})`
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
