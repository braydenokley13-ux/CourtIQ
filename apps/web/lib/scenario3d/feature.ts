/**
 * Feature-detection helpers for the 3D scenario engine.
 *
 * 3D is the default training experience — there is no kill switch. We only
 * fall back to the 2D court when WebGL is genuinely unavailable on the
 * device (e.g. very old browsers, hardware acceleration disabled).
 */

export function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    return !!gl
  } catch {
    return false
  }
}

/**
 * True when the page is loaded with `?debug3d=1`. Used by the 3D engine to
 * render the visual self-test scene (5+5 players, ball, replay) regardless
 * of the supplied scenario, so we can debug rendering issues without
 * scenarios loading.
 */
export function isDebug3D(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('debug3d') === '1'
  } catch {
    return false
  }
}

/**
 * True when the page is loaded with `?emergency=1`. The emergency scene
 * is a visibility-guaranteed primitive scene (giant gray floor, big red
 * cube, big blue sphere, hardcoded camera, bright lights) used as a
 * fallback diagnostic when the basketball scene is invisible. Phase 3
 * switched this from default-on to opt-in: by default we now render the
 * BasketballScene3D directly, since it has been proven visible.
 */
export function isEmergencyScene(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('emergency') === '1'
  } catch {
    return false
  }
}

/**
 * True when the page is loaded with `?orbit=1`. Adds drei's OrbitControls
 * inside the canvas so the camera can be moved manually for debugging.
 */
export function isOrbitDebug(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('orbit') === '1'
  } catch {
    return false
  }
}

/**
 * True unless the page is loaded with `?simple=0`. When true, the canvas
 * uses the dependency-light BasketballScene3D (cylinders + sphere ball +
 * tube court lines) instead of the layered Court3D + ScenarioScene3D
 * stack. This keeps visibility guaranteed while we layer realism back on.
 */
export function isSimpleScene(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return new URLSearchParams(window.location.search).get('simple') !== '0'
  } catch {
    return true
  }
}

/**
 * True unless the page is loaded with `?autofit=0`. When true, the canvas
 * computes a Box3 over the scene's player + ball positions and aims the
 * camera at the box, sized to fit the canvas. This makes the renderer
 * coordinate-scale agnostic — whatever the scene authors used as units,
 * the camera will frame it.
 */
export function isAutoFitCamera(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return new URLSearchParams(window.location.search).get('autofit') !== '0'
  } catch {
    return true
  }
}
