import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { simulate, frameAt } from '@courtiq/basketball/simulation'
import { createGhostWorld } from './ghost'

describe('comparison bodies use the other experiment assumptions', () => {
  it('changes body envelopes with the ghost model, independently of presentation quality', () => {
    const config = createDefaultConfig(),
      frame = frameAt(simulate(config), 0)
    const other = {
      ...frame,
      players: frame.players.map((player) => (player.team === 'defense' ? { ...player, x: player.x + 1 } : player)),
    }
    const ghost = createGhostWorld(),
      low = createGhostWorld(6, [8, 6])
    ghost.update(frame, other, 0, { ...config.assumptions, bodyRadius: 0.2 })
    const narrow = new THREE.Matrix4()
    ghost.shafts.getMatrixAt(0, narrow)
    ghost.update(frame, other, 0, { ...config.assumptions, bodyRadius: 0.4 })
    low.update(frame, other, 0, { ...config.assumptions, bodyRadius: 0.4 })
    const wide = new THREE.Matrix4(),
      lowMatrix = new THREE.Matrix4()
    ghost.shafts.getMatrixAt(0, wide)
    low.shafts.getMatrixAt(0, lowMatrix)
    const narrowScale = new THREE.Vector3(),
      wideScale = new THREE.Vector3()
    narrow.decompose(new THREE.Vector3(), new THREE.Quaternion(), narrowScale)
    wide.decompose(new THREE.Vector3(), new THREE.Quaternion(), wideScale)
    expect(wideScale.x).toBeGreaterThan(narrowScale.x * 1.9)
    expect(lowMatrix).toEqual(wide)
    expect(ghost.shafts.count).toBeGreaterThan(0)
  })

  it('does not manufacture ghost bodies when the other experiment assumptions are missing', () => {
    const config = createDefaultConfig(),
      frame = frameAt(simulate(config), 0)
    const ghost = createGhostWorld()
    expect(ghost.update(frame, frame, 0)).toBe(false)
    expect(ghost.root.visible).toBe(false)
  })
})
