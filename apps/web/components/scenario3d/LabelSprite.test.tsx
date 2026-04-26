/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { LabelSprite } from './LabelSprite'

describe('LabelSprite', () => {
  it('exists as a function component (no async font loader)', () => {
    expect(typeof LabelSprite).toBe('function')
  })

  it('does not import drei <Text>, so no troika font fetch is required', () => {
    const source = readFileSync(join(__dirname, 'LabelSprite.tsx'), 'utf-8')
    expect(source).not.toMatch(/from '@react-three\/drei'/)
    expect(source).toMatch(/CanvasTexture/)
  })

  it('does not fetch fonts during PlayerMarker3D rendering (no drei <Text>)', () => {
    const source = readFileSync(join(__dirname, 'PlayerMarker3D.tsx'), 'utf-8')
    expect(source).not.toMatch(/import\s+\{[^}]*\bText\b[^}]*\}\s+from\s+'@react-three\/drei'/)
  })

  it('three.CanvasTexture is constructible without async work', () => {
    // Smoke test: prove the underlying primitive is synchronous.
    const stub = { width: 1, height: 1 } as unknown as HTMLCanvasElement
    const tex = new THREE.CanvasTexture(stub)
    expect(tex).toBeInstanceOf(THREE.CanvasTexture)
  })
})
