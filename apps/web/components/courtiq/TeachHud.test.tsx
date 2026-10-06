// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBaselineExecution } from '@courtiq/basketball/problems/baselineDrive'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { replayExecution, simulate } from '@courtiq/basketball/simulation'
import { contentHash } from '@courtiq/basketball/execution'
import { emptySystem } from '@courtiq/basketball/program'
import type { ExecutionTrace, WorldFrame } from '@courtiq/basketball/types'
import { TeachHud, teachFocus } from './CourtIQApp'

vi.mock('./world/CourtWorld', () => ({ default: () => null }))
let root: Root, node: HTMLDivElement
beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
})
afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
})
function props(result: ExecutionTrace): ComponentProps<typeof TeachHud> {
  return {
    teach: { entry: null, version: null, result, player: null, view: 'team', step: 0 },
    setTeach: vi.fn(),
    voice: { register: 'plain' },
    frame: result.frames[0]!,
    checkpoints: [],
    playing: false,
    setPlaying: vi.fn(),
    t: 0,
    setT: vi.fn(),
    system: emptySystem('test-program'),
    onPickEntry: vi.fn(),
    hasLab: true,
    onGoLab: vi.fn(),
  }
}

describe('teaching the pinned execution roster', () => {
  it('preserves the hero defensive order and coaching labels', async () => {
    const presentation = props(simulate(createDefaultConfig()))
    await act(async () => root.render(<TeachHud {...presentation} />))
    const players = [...node.querySelectorAll<HTMLButtonElement>('[data-player-id]')]
    expect(players.map((button) => button.dataset.playerId)).toEqual(['D1', 'D5', 'D3', 'D4', 'D2'])
    expect(players[0]?.textContent).toBe('Ball defender')
  })

  it('selects the real baseline defenders in number order with their authored roles', async () => {
    const presentation = props(replayExecution(createBaselineExecution()))
    await act(async () => root.render(<TeachHud {...presentation} />))
    const players = [...node.querySelectorAll<HTMLButtonElement>('[data-player-id]')]
    expect(players.map((button) => button.dataset.playerId)).toEqual([
      'chaser-1',
      'spacer-guard-2',
      'wing-helper-3',
      'spacer-guard-4',
      'rim-helper-5',
    ])
    expect(players.map((button) => button.textContent)).toEqual([
      'Chaser',
      'Strong Guard',
      'Wing Helper',
      'Weak Guard',
      'Rim Helper',
    ])
    expect(node.querySelector('[data-player-id="D1"]')).toBeNull()
    await act(async () => players[4]!.click())
    const update = vi.mocked(presentation.setTeach).mock.calls[0]![0]
    expect(update(presentation.teach)).toMatchObject({ player: 'rim-helper-5', step: 0 })
    expect(presentation.setT).toHaveBeenCalledWith(0)
    expect(presentation.setPlaying).toHaveBeenCalledWith(false)
  })

  it('uses an authored role when an imported player shares a hero ID', async () => {
    const input = createBaselineExecution()
    input.program.players.find((player) => player.id === 'chaser-1')!.id = 'D1'
    input.program.roles.chaser = 'D1'
    input.content.hash = contentHash(input.program)
    await act(async () => root.render(<TeachHud {...props(replayExecution(input))} />))
    expect(node.querySelector('[data-player-id="D1"]')?.textContent).toBe('Chaser')
  })

  it('focuses only actual replay players, including offensive context when the ball is in flight', () => {
    const frame = replayExecution(createBaselineExecution()).frames[0]!
    const selected = 'rim-helper-5',
      focus = teachFocus(frame, selected)
    expect(focus).toContain(selected)
    expect(focus).toContain(frame.ball.owner)
    expect(focus.every((id) => frame.players.some((player) => player.id === id))).toBe(true)
    expect(focus).not.toContain('O1')
    expect(focus).not.toContain('O5')
    const flight: WorldFrame = { ...frame, ball: { ...frame.ball, owner: null }, responsibilities: [] }
    const context = teachFocus(flight, selected)
    expect(context.some((id) => flight.players.some((player) => player.id === id && player.team === 'offense'))).toBe(
      true,
    )
    expect(teachFocus(frame, 'missing-defender')).toEqual([])
  })
})
