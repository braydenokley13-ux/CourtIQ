/**
 * Feature-detection helpers for the 3D scenario engine.
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

export function is3DDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_3D === '1'
}
