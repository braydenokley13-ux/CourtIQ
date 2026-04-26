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
