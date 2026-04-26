/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(file: string) {
  return readFileSync(join(__dirname, file), 'utf-8')
}

describe('Scenario3DCanvas rendering guarantees', () => {
  it('renders the actual scene as the primary path, not a synthetic substitute', () => {
    const canvas = source('Scenario3DCanvas.tsx')
    // The visible scene resolves to the caller-supplied scene, falling back
    // to the built-in default ONLY when the caller passes nothing in.
    expect(canvas).toMatch(/scene\s*\?\?\s*createDefaultScene\('default_3d_scene'\)/)
    // No timer-based emergency-scene swap.
    expect(canvas).not.toContain('useEmergencyScene')
    expect(canvas).not.toContain("createDefaultScene('emergency_3d_scene')")
    expect(canvas).not.toContain('Loaded simple 3D view')
  })

  it('falls back only when WebGL is unavailable or the GL context is lost', () => {
    const canvas = source('Scenario3DCanvas.tsx')
    expect(canvas).toContain("setMode(supported ? '3d' : 'fallback')")
    expect(canvas).toContain('webglcontextlost')
    expect(canvas).toMatch(/setMode\('fallback'\)/)
  })

  it('uses canvas mount as the proof of life, not a useFrame ready signal', () => {
    const canvas = source('Scenario3DCanvas.tsx')
    expect(canvas).toContain('setCanvasMounted(true)')
    expect(canvas).not.toContain('SceneReadySignal')
  })

  it('keeps the baseline 3D path free of async asset loaders', () => {
    const combined = [
      source('Scenario3DCanvas.tsx'),
      source('Court3D.tsx'),
      source('MovementPath3D.tsx'),
      source('PlayerMarker3D.tsx'),
      source('BallMarker3D.tsx'),
      source('LabelSprite.tsx'),
    ].join('\n')

    expect(combined).not.toMatch(/useProgress|useTexture|useGLTF|useLoader|useFont/)
    expect(combined).not.toMatch(/from '@react-three\/drei'/)
  })

  it('draws court and movement lines with local Three primitives', () => {
    const line = source('LinePrimitive3D.tsx')
    expect(line).toMatch(/BufferGeometry/)
    expect(line).toMatch(/LineBasicMaterial/)
  })
})
