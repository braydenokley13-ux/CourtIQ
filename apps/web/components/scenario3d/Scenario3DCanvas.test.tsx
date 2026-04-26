/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function source(file: string) {
  return readFileSync(join(__dirname, file), 'utf-8')
}

describe('Scenario3DCanvas loading guarantees', () => {
  it('has a hard timeout so loading cannot remain forever', () => {
    const canvas = source('Scenario3DCanvas.tsx')
    expect(canvas).toMatch(/SCENE_LOAD_TIMEOUT_MS\s*=\s*3_000/)
    expect(canvas).toMatch(/setUseEmergencyScene\(true\)/)
    expect(canvas).toContain('Loaded simple 3D view')
  })

  it('renders a built-in default scene when scene data is missing', () => {
    const canvas = source('Scenario3DCanvas.tsx')
    expect(canvas).toMatch(/scene\s*\?\?\s*createDefaultScene\('default_3d_scene'\)/)
    expect(canvas).toContain("createDefaultScene('emergency_3d_scene')")
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
