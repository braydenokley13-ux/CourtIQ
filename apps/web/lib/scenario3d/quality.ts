/**
 * Performance / quality tiers for the imperative 3D renderer.
 *
 * The renderer ships in 'auto' mode by default — `detectAutoTier()` reads
 * the device's hardwareConcurrency, deviceMemory, and screen size to pick
 * a sensible starting tier. The runtime FPS guard in Scenario3DCanvas can
 * then auto-degrade from a higher tier if sustained low FPS is detected.
 *
 * Callers (Scenario3DCanvas, Scenario3DView) treat the resolved
 * QualitySettings as the single source of truth for DPR clamp,
 * antialiasing, and shadow gating.
 */

export type QualityTier = 'low' | 'medium' | 'high'
export type QualityMode = 'auto' | QualityTier

export interface QualitySettings {
  /** Resolved tier — never 'auto'. */
  tier: QualityTier
  /** Upper-bound for THREE.WebGLRenderer.setPixelRatio. */
  maxPixelRatio: number
  /** Whether the WebGL context should request antialiasing. */
  antialias: boolean
  /**
   * Whether shadow casting/receiving should be enabled. The current
   * imperative renderer does not enable WebGLRenderer.shadowMap, so this
   * flag is forward-compatible: a future packet that turns shadows on
   * will already honor the tier gate without further wiring.
   */
  shadowsEnabled: boolean
  /**
   * Whether the runtime FPS guard should run. Disabled at the lowest
   * tier so we never auto-degrade below 'low' — there is no lower tier
   * to fall back to and the cost of measuring is wasted.
   */
  fpsGuardEnabled: boolean
}

/** Cap the device pixel ratio per tier. Keeps very-high-DPR phones from
 *  rendering at 4x cost on low tier when the GPU cannot keep up. */
const MAX_PIXEL_RATIO: Record<QualityTier, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
}

export function settingsForTier(tier: QualityTier): QualitySettings {
  return {
    tier,
    maxPixelRatio: MAX_PIXEL_RATIO[tier],
    antialias: tier !== 'low',
    shadowsEnabled: tier === 'high',
    fpsGuardEnabled: tier !== 'low',
  }
}

/**
 * Picks a starting tier based on conservative device signals. SSR-safe:
 * always returns 'medium' on the server so hydration matches the
 * pessimistic-but-functional default. The first client-side resolve
 * call replaces it with a real measurement.
 */
export function detectAutoTier(): QualityTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'medium'
  }

  const cores =
    typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4
  // deviceMemory is non-standard but widely available on Chrome/Edge.
  // Reported in GiB, rounded down to one of 0.25/0.5/1/2/4/8.
  const memory =
    typeof (navigator as unknown as { deviceMemory?: number }).deviceMemory ===
    'number'
      ? (navigator as unknown as { deviceMemory?: number }).deviceMemory!
      : 4
  const dpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1
  const isCoarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  const isMobileUA =
    typeof navigator.userAgent === 'string' &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

  // Low tier: very small core/memory budgets, or known mobile with
  // either of those signals. Preserves visual fidelity on any device
  // that can actually afford it.
  if (cores <= 2 || memory <= 1) return 'low'
  if ((isMobileUA || isCoarsePointer) && (cores <= 4 || memory <= 2)) return 'low'

  // High tier: roomy core+memory budget AND not a mobile-class device.
  // The DPR clamp protects us from a 3x retina hit on the medium tier,
  // but the high tier explicitly opts back into the full 2x DPR.
  if (cores >= 8 && memory >= 8 && !isMobileUA) return 'high'
  if (cores >= 6 && memory >= 4 && !isCoarsePointer && dpr <= 2) return 'high'

  return 'medium'
}

/** Resolves an explicit mode (or 'auto') to a concrete QualitySettings. */
export function resolveQualitySettings(mode: QualityMode): QualitySettings {
  const tier = mode === 'auto' ? detectAutoTier() : mode
  return settingsForTier(tier)
}

/**
 * Reads the `?quality=` query param. Returns null when absent or invalid
 * so callers can distinguish "no override" from "explicitly auto".
 */
export function getQualityModeFromUrl(): QualityMode | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = new URLSearchParams(window.location.search).get('quality')
    if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'auto') {
      return raw
    }
    return null
  } catch {
    return null
  }
}
