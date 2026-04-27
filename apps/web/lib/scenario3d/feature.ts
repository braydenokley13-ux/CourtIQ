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
 * True unless the page is loaded with `?emergency=0`. The emergency scene
 * is a visibility-guaranteed primitive scene (giant gray floor, big red
 * cube, big blue sphere, hardcoded camera, bright lights, gray background)
 * used to prove the WebGL render pipeline is reaching the camera. While
 * the rebuild is in flight we default it ON so the user can never see a
 * black box; pass `?emergency=0` to disable.
 */
export function isEmergencyScene(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return new URLSearchParams(window.location.search).get('emergency') !== '0'
  } catch {
    return true
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
