/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { TeachingOverlayController } from './imperativeTeachingOverlay'
import type { Scene3D } from '@/lib/scenario3d/scene'

function buildScene(): Scene3D {
  return {
    id: 'teaching_label_test',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 18, z: 8 }, isUser: true },
      { id: 'pg', team: 'offense', role: 'ball_handler', start: { x: 0, z: 22 }, hasBall: true },
    ],
    ball: { start: { x: 0, z: 22 }, holderId: 'pg' },
    movements: [],
    answerDemo: [],
    wrongDemos: [],
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: null,
    synthetic: false,
  }
}

function makeController(): TeachingOverlayController {
  const root = new THREE.Group()
  const ctrl = new TeachingOverlayController(buildScene(), 'static', root, {
    heuristic: false,
  })
  ctrl.setVisible(true)
  return ctrl
}

function getLabelLayer(c: TeachingOverlayController): THREE.Group {
  const found = c.group.children.find(
    (child) => (child as THREE.Object3D).name === 'teaching-label-layer',
  ) as THREE.Group | undefined
  if (!found) throw new Error('teaching-label-layer missing')
  return found
}

function findSprite(g: THREE.Group): THREE.Sprite | null {
  let hit: THREE.Sprite | null = null
  g.traverse((obj) => {
    const s = obj as THREE.Sprite
    if (s.isSprite) hit = s
  })
  return hit
}

describe('FR-6 — teaching label API', () => {
  it('mounts no label by default', () => {
    const c = makeController()
    expect(c.hasTeachingLabel()).toBe(false)
    expect(findSprite(getLabelLayer(c))).toBeNull()
  })

  it('setTeachingLabel mounts a sprite at the supplied anchor', () => {
    const c = makeController()
    c.setTeachingLabel({
      text: 'Read the denial.',
      anchor: { x: 5, z: 12 },
      fadeDurationMs: 500,
    })
    expect(c.hasTeachingLabel()).toBe(true)
    const s = findSprite(getLabelLayer(c))
    expect(s).not.toBeNull()
    expect(s!.position.x).toBe(5)
    expect(s!.position.z).toBe(12)
  })

  it('label opacity ramps from 0 → target over fadeDurationMs', () => {
    const c = makeController()
    c.setTeachingLabel({
      text: 'Punish the help.',
      anchor: { x: 0, z: 18 },
      fadeDurationMs: 500,
    })
    // First tick stamps the fadeStartMs but does not advance opacity
    // beyond the start of the ramp.
    c.tick(1000)
    const s = findSprite(getLabelLayer(c))!
    const m = s.material as THREE.SpriteMaterial
    expect(m.opacity).toBe(0)
    // Halfway through fade — opacity is between 0 and 1.
    c.tick(1250)
    expect(m.opacity).toBeGreaterThan(0)
    expect(m.opacity).toBeLessThan(1)
    // After fade duration — opacity is pinned at target.
    c.tick(1700)
    expect(m.opacity).toBe(1)
  })

  it('clearTeachingLabel removes the sprite and disposes resources', () => {
    const c = makeController()
    c.setTeachingLabel({
      text: 'Read the closeout.',
      anchor: { x: 0, z: 0 },
      fadeDurationMs: 500,
    })
    expect(c.hasTeachingLabel()).toBe(true)
    c.clearTeachingLabel()
    expect(c.hasTeachingLabel()).toBe(false)
    expect(findSprite(getLabelLayer(c))).toBeNull()
  })

  it('repeated setTeachingLabel with identical text+anchor is a no-op', () => {
    const c = makeController()
    c.setTeachingLabel({
      text: 'Cut into empty space.',
      anchor: { x: 5, z: 10 },
      fadeDurationMs: 500,
    })
    c.tick(1000)
    c.tick(1300)
    const opacityMid = (findSprite(getLabelLayer(c))!.material as THREE.SpriteMaterial)
      .opacity
    // Same text + anchor again should not restart the fade.
    c.setTeachingLabel({
      text: 'Cut into empty space.',
      anchor: { x: 5, z: 10 },
      fadeDurationMs: 500,
    })
    c.tick(1310)
    const opacityAfter = (findSprite(getLabelLayer(c))!.material as THREE.SpriteMaterial)
      .opacity
    // Continued advancing the same fade rather than restarting from 0.
    expect(opacityAfter).toBeGreaterThanOrEqual(opacityMid)
  })

  it('setTeachingLabel with different text replaces the existing label', () => {
    const c = makeController()
    c.setTeachingLabel({
      text: 'Read the denial.',
      anchor: { x: 0, z: 0 },
      fadeDurationMs: 500,
    })
    const first = findSprite(getLabelLayer(c))!
    c.setTeachingLabel({
      text: 'Punish the help.',
      anchor: { x: 0, z: 0 },
      fadeDurationMs: 500,
    })
    const second = findSprite(getLabelLayer(c))!
    expect(second).not.toBe(first)
    expect(second.userData.text).toBe('Punish the help.')
  })

  it('setPhase("hidden") does not clear the teaching label', () => {
    // FR-6 contract: the label survives a phase flip so it can land
    // alongside the post-overlays during `done`.
    const c = makeController()
    c.setTeachingLabel({
      text: 'Read the denial.',
      anchor: { x: 0, z: 0 },
      fadeDurationMs: 500,
    })
    c.setPhase('hidden', 1000)
    expect(c.hasTeachingLabel()).toBe(true)
  })

  it('dispose() releases the teaching label', () => {
    const c = makeController()
    c.setTeachingLabel({
      text: 'Read the denial.',
      anchor: { x: 0, z: 0 },
      fadeDurationMs: 500,
    })
    c.dispose()
    expect(c.hasTeachingLabel()).toBe(false)
  })
})
