// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { parseLabConfig } from '@courtiq/basketball/execution'
import { useLab, type Lab } from './useLab'

let node: HTMLDivElement, root: Root, current: Lab
function Harness() {
  current = useLab()
  return null
}
beforeEach(async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
  await act(async () => root.render(<Harness />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
  vi.unstubAllGlobals()
})

describe('Lab editing at prior moments', () => {
  it('can scrub backwards and add an earlier rule without crashing replay or changing earlier frames', async () => {
    const before = current.result.frames.filter((frame) => frame.t < 1)
    await act(async () => current.change({ tag: false }, 'Later rule', { from: 2 }))
    await act(async () => current.change({ bigDepth: 4 }, 'Earlier rule', { from: 1 }))
    expect(current.config.interventions.map((cue) => cue.at)).toEqual([1, 2])
    expect(() => parseLabConfig(current.config)).not.toThrow()
    expect(current.result.frames.filter((frame) => frame.t < 1)).toEqual(before)
  })

  it('can move a player at an earlier time after a later rule adjustment', async () => {
    await act(async () => current.change({ tag: false }, 'Later rule', { from: 2 }))
    await act(async () => current.seek(1))
    await act(async () => current.moveDefender('D4', { x: -2, z: 3 }))
    expect(current.config.interventions.map((cue) => [cue.kind, cue.at])).toEqual([
      ['move', 1],
      ['answer', 2],
    ])
    expect(current.result.frames.length).toBeGreaterThan(1)
    expect(() => parseLabConfig(current.config)).not.toThrow()
  })

  it('normalizes externally edited cues and preserves author order at the same time', async () => {
    const config = createDefaultConfig()
    config.interventions = [
      { id: 'later', at: 2, kind: 'answer', patch: { tag: false } },
      { id: 'earlier-first', at: 1, kind: 'answer', patch: { bigDepth: 3 } },
      { id: 'earlier-second', at: 1, kind: 'answer', patch: { bigDepth: 4 } },
    ]
    await act(async () => current.setConfig(config))
    expect(current.config.interventions.map((cue) => cue.id)).toEqual(['earlier-first', 'earlier-second', 'later'])
    expect(current.result.frames.find((frame) => frame.t >= 1)?.answer.bigDepth).toBe(4)
  })
})
