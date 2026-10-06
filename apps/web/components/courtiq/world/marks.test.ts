import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { frameAt, simulate } from '@courtiq/basketball/simulation'
import { sampleArrivalField } from '@courtiq/basketball/arrivalField'
import { LENSES, lensMarks } from '../lenses'
import { MARK_ORDER, MarkLayer } from './marks'
import type { Lens, Mark } from './types'

// MarkLayer builds canvas textures; a no-op 2D context is enough to build the scene graph without a GPU.
beforeAll(() => {
  const ctx = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    set fillStyle(_v: unknown) {},
  }
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  }
})

const config = createDefaultConfig(),
  result = simulate(config)

describe('analytical marks always draw above the environment', () => {
  const scene = () => new THREE.Scene()
  const sample: Mark[] = [
    { kind: 'ring', id: 'a', at: 'O1', tone: 'threat' },
    { kind: 'disc', id: 'b', center: 'D1', radius: 1, tone: 'defense', edge: true },
    {
      kind: 'path',
      id: 'c',
      points: [
        { x: 0, z: 4 },
        { x: 2, z: 6 },
      ],
      tone: 'warn',
      arrow: true,
    },
    { kind: 'wedge', id: 'd', apex: 'O1', toward: 'D1', length: 3, spread: 0.5, tone: 'neutral' },
    { kind: 'tether', id: 'e', from: 'D1', to: 'O2', tone: 'defense', y: 1.15 },
    { kind: 'lane', id: 'f', from: 'O1', to: 'O2', tone: 'good', arc: 2 },
    { kind: 'arrival', id: 'g', field: sampleArrivalField(frameAt(result, 1.6), config.assumptions), ballTime: 0.6 },
    { kind: 'pin', id: 'h', at: 'D2', tone: 'ghost' },
    { kind: 'flare', id: 'i', at: 'O3', tone: 'attack' },
    {
      kind: 'comet',
      id: 'j',
      points: [
        { x: 0, z: 4 },
        { x: 2, z: 6 },
      ],
      outcome: 'held',
    },
  ]
  it('every mesh carries its own renderOrder above the floor overlays, with depth writes off', () => {
    const layer = new MarkLayer(scene())
    layer.update(sample, frameAt(result, 1.6), 1000, 1, 1)
    const meshes = layer.meshes()
    expect(meshes.length).toBeGreaterThan(sample.length)
    for (const m of meshes) {
      expect(m.renderOrder, m.name || m.type).toBeGreaterThanOrEqual(MARK_ORDER.under)
      expect((m.material as THREE.Material).depthWrite).toBe(false)
    }
  })
  for (const lens of LENSES.filter((l) => l.id !== 'normal').map((l) => l.id as Lens)) {
    it(`${lens} lens produces drawable meshes`, () => {
      const layer = new MarkLayer(scene())
      const frame = frameAt(result, 1.6)
      layer.update(lensMarks(lens, frame, config.assumptions, null), frame, 1000, 1, 1)
      expect(layer.size).toBeGreaterThan(0)
      expect(layer.meshes().length).toBeGreaterThan(0)
      expect(layer.meshes().every((m) => m.renderOrder >= MARK_ORDER.under)).toBe(true)
    })
  }
  it('updates strings in place (no new geometry while players move)', () => {
    const layer = new MarkLayer(scene())
    const tether: Mark = { kind: 'tether', id: 'e', from: 'D1', to: 'O2', tone: 'defense', y: 1.15 }
    layer.update([tether], frameAt(result, 1.0), 0, 1, 1)
    const before = layer.meshes().map((m) => m.geometry)
    layer.update([tether], frameAt(result, 1.4), 16, 1, 1)
    expect(layer.meshes().map((m) => m.geometry)).toEqual(before)
  })

  it('renders domain arrival samples at their precision and releases the field texture', () => {
    const layer = new MarkLayer(scene())
    const field = {
      width: 2,
      height: 2,
      bounds: { minX: -7.62, maxX: 7.62, minZ: 0, maxZ: 14.326 },
      seconds: [0.25, 0.5, 1, 1.5],
    }
    layer.update([{ kind: 'arrival', id: 'field', field }], frameAt(result, 1), 1000, 1, 1)
    const material = layer.meshes()[0].material as THREE.ShaderMaterial
    const texture = material.uniforms.uArrival.value as THREE.DataTexture
    const bytes = texture.image.data as Uint8Array
    for (let index = 0; index < field.seconds.length; index++) {
      const decoded = ((bytes[index * 4] * 256 + bytes[index * 4 + 1]) / 65535) * 16
      expect(decoded).toBeCloseTo(field.seconds[index], 3)
    }
    expect(material.uniforms.uAccel).toBeUndefined()
    let disposed = false
    texture.addEventListener('dispose', () => {
      disposed = true
    })
    layer.update([], frameAt(result, 1), 1200, 1, 1)
    expect(disposed).toBe(true)
  })
})
