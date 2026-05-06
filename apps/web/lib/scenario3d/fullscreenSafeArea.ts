/**
 * V2-E — Fullscreen Safe-Area UI Insets.
 *
 * Pure data layer that decides where chrome chips (concept tag, replay
 * badge, camera selector, transport pill, fullscreen interaction
 * overlay) should sit relative to the canvas edge so the layout reads
 * as intentional at every aspect ratio, including phones with notches
 * and home indicators.
 *
 * The pre-V2 PremiumOverlay computed insets inline:
 *   - inset = isFullscreen ? '24px' : '12px'
 *   - bottomInset = isFullscreen ? '38px' : '12px'
 *
 * On a 21:9 ultrawide that put the concept chip uncomfortably close
 * to the corner; on a portrait phone it pushed the camera selector
 * past the safe area on iOS Safari. This module owns the per-aspect
 * choice so the overlay can stay declarative while the policy stays
 * unit-tested.
 *
 * Pure function — no DOM, no THREE. Same input → same output.
 */

export interface FullscreenChromeInsets {
  /** Left/right safe-area inset (px) for top-corner chips. */
  cornerSideInsetPx: number
  /** Top safe-area inset (px) for top-corner chips. */
  cornerTopInsetPx: number
  /** Bottom inset (px) for the transport pill. */
  transportBottomInsetPx: number
  /** Bottom inset (px) for the fullscreen interaction overlay
   *  (the choice cards in /train). Always larger than the transport
   *  inset so the overlay never overlaps the pill. */
  interactionBottomInsetPx: number
  /** Maximum width (px) for the interaction overlay. Wider canvases
   *  cap further so a 21:9 monitor does not stretch a row of choice
   *  cards into a marathon. */
  interactionMaxWidthPx: number
}

/** Defaults used when the helper has no aspect signal (SSR, etc.). */
const FALLBACK_INSETS: FullscreenChromeInsets = Object.freeze({
  cornerSideInsetPx: 24,
  cornerTopInsetPx: 24,
  transportBottomInsetPx: 38,
  interactionBottomInsetPx: 96,
  interactionMaxWidthPx: 1100,
})

const NON_FULLSCREEN_INSETS: FullscreenChromeInsets = Object.freeze({
  cornerSideInsetPx: 12,
  cornerTopInsetPx: 12,
  transportBottomInsetPx: 12,
  interactionBottomInsetPx: 78,
  interactionMaxWidthPx: 1100,
})

export interface ResolveInsetsInput {
  isFullscreen: boolean
  /** Canvas width in CSS pixels. */
  widthPx: number
  /** Canvas height in CSS pixels. */
  heightPx: number
  /** Whether the parent is rendering an interaction overlay (e.g.
   *  /train choice cards) inside the fullscreen viewport. When true
   *  the transport bottom inset is held steady but the interaction
   *  overlay gets pulled in. */
  hasInteractionOverlay: boolean
}

/**
 * Returns the chrome insets the PremiumOverlay should apply for the
 * given canvas size. The aspect-aware tiers mirror
 * `composeFullscreenFraming` so there's a single mental model:
 *
 *   - portrait (aspect < 0.7)        → tighter side insets (16px),
 *                                       larger top/bottom safe area
 *                                       so iPhone notch + home
 *                                       indicator do not crowd chrome.
 *   - mobile landscape (0.7..1.5)    → balanced 20/20/32 insets.
 *   - desktop 16:9 (1.5..1.95)       → standard 24/24/38 insets.
 *   - ultrawide (≥1.95)              → larger side insets (44px) so
 *                                       chips don't kiss the bezel
 *                                       on 21:9 monitors. Interaction
 *                                       overlay caps narrower (960px)
 *                                       so the row is digestible.
 */
export function resolveFullscreenChromeInsets(
  input: ResolveInsetsInput,
): FullscreenChromeInsets {
  if (!input.isFullscreen) {
    if (input.hasInteractionOverlay) {
      return {
        ...NON_FULLSCREEN_INSETS,
        interactionBottomInsetPx: 96,
      }
    }
    return NON_FULLSCREEN_INSETS
  }

  const width = Number.isFinite(input.widthPx) ? input.widthPx : 0
  const height = Number.isFinite(input.heightPx) ? input.heightPx : 0
  if (width <= 0 || height <= 0) return FALLBACK_INSETS

  const aspect = width / height

  if (aspect < 0.7) {
    return {
      cornerSideInsetPx: 16,
      cornerTopInsetPx: 32,
      transportBottomInsetPx: 44,
      interactionBottomInsetPx: 110,
      interactionMaxWidthPx: 540,
    }
  }
  if (aspect < 1.5) {
    return {
      cornerSideInsetPx: 20,
      cornerTopInsetPx: 20,
      transportBottomInsetPx: 32,
      interactionBottomInsetPx: 92,
      interactionMaxWidthPx: 760,
    }
  }
  if (aspect < 1.95) {
    return {
      cornerSideInsetPx: 24,
      cornerTopInsetPx: 24,
      transportBottomInsetPx: 38,
      interactionBottomInsetPx: 96,
      interactionMaxWidthPx: 1100,
    }
  }
  // ultrawide
  return {
    cornerSideInsetPx: 44,
    cornerTopInsetPx: 28,
    transportBottomInsetPx: 42,
    interactionBottomInsetPx: 100,
    interactionMaxWidthPx: 960,
  }
}

/**
 * Convenience: convert a CSS-pixel inset into the matching CSS
 * `calc(env(safe-area-inset-*) + Npx)` string the renderer feeds
 * the layout. Centralises the env() invocation so a future tweak
 * (e.g. adding `safe-area-inset-left` to corner chips) lands in
 * one place.
 */
export function pxToSafeAreaCss(
  px: number,
  side: 'top' | 'bottom' | 'left' | 'right',
): string {
  const safeNum = Number.isFinite(px) ? Math.max(0, px) : 0
  const envName = `safe-area-inset-${side}`
  return `calc(env(${envName}, 0px) + ${safeNum}px)`
}
