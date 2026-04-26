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
    expect(canvas).toMatch(/scene\s*\?\?\s*createDefaultScene\('default_3d_scene'\)/)
    // No timer-based emergency-scene swap.
    expect(canvas).not.toContain('useEmergencyScene')
    expect(canvas).not.toContain("createDefaultScene('emergency_3d_scene')")
    expect(canvas).not.toContain('Loaded simple 3D view')
    // No SCENE_LOAD_TIMEOUT timer at all.
    expect(canvas).not.toMatch(/SCENE_LOAD_TIMEOUT/)
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

  it('exposes a ?debug3d=1 self-test that always renders a hero scene', () => {
    const canvas = source('Scenario3DCanvas.tsx')
    expect(canvas).toContain('isDebug3D')
    expect(canvas).toContain('createDebugSelfTestScene')
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

  it('lifts each floor decal high enough to avoid z-fighting at typical camera distances', () => {
    const court = source('Court3D.tsx')
    // No more "0.001ft above the previous plane" stacks. Decals must lift
    // by a clearly distinguishable amount (≥ 0.02ft) so the depth buffer
    // never confuses adjacent layers.
    expect(court).toContain('Y_FLOOR = 0')
    expect(court).toMatch(/Y_PAINT\s*=\s*0\.0[2-9]/)
    expect(court).toMatch(/Y_LINES\s*=\s*0\.0[5-9]/)
  })

  it('draws court and movement lines with local Three primitives', () => {
    const line = source('LinePrimitive3D.tsx')
    expect(line).toMatch(/BufferGeometry/)
    expect(line).toMatch(/LineBasicMaterial/)
  })
})
