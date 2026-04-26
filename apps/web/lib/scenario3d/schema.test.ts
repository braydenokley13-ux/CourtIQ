import { describe, expect, it } from 'vitest'
import { sceneSchema } from './schema'

const baseScene = {
  type: 'demo',
  players: [
    {
      id: 'user',
      team: 'offense' as const,
      role: 'wing',
      label: 'You',
      start: { x: -18, z: 8 },
      isUser: true,
    },
    {
      id: 'pg',
      team: 'offense' as const,
      role: 'ball_handler',
      start: { x: 0, z: 22 },
      hasBall: true,
    },
  ],
  ball: { start: { x: 0, z: 22 }, holderId: 'pg' },
  movements: [
    { id: 'cut', playerId: 'user', kind: 'cut' as const, to: { x: 0, z: 4 } },
  ],
  answerDemo: [
    { id: 'pass', playerId: 'ball', kind: 'pass' as const, to: { x: 0, z: 4 } },
  ],
}

describe('sceneSchema', () => {
  it('accepts a well-formed scene', () => {
    const result = sceneSchema.safeParse(baseScene)
    expect(result.success).toBe(true)
  })

  it('rejects two players marked isUser', () => {
    const bad = {
      ...baseScene,
      players: baseScene.players.map((p) => ({ ...p, isUser: true })),
    }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects duplicate player ids', () => {
    const bad = {
      ...baseScene,
      players: [baseScene.players[0]!, { ...baseScene.players[1]!, id: 'user' }],
    }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects movement targets that do not exist', () => {
    const bad = {
      ...baseScene,
      movements: [{ id: 'x', playerId: 'ghost', kind: 'cut' as const, to: { x: 0, z: 0 } }],
    }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('accepts "ball" as a movement target even though no player has that id', () => {
    const ok = {
      ...baseScene,
      movements: [{ id: 'pass', playerId: 'ball', kind: 'pass' as const, to: { x: 0, z: 4 } }],
    }
    const result = sceneSchema.safeParse(ok)
    expect(result.success).toBe(true)
  })

  it('rejects ball.holderId that does not match a player', () => {
    const bad = { ...baseScene, ball: { ...baseScene.ball, holderId: 'mystery' } }
    const result = sceneSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('applies defaults for court and camera', () => {
    const minimal = {
      players: [{ id: 'a', team: 'offense', role: 'r', start: { x: 0, z: 0 } }],
      ball: { start: { x: 0, z: 0 } },
    }
    const result = sceneSchema.parse(minimal)
    expect(result.court).toBe('half')
    expect(result.camera).toBe('teaching_angle')
  })
})
