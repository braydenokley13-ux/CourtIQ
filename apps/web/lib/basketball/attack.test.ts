import { expect, it, vi } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { attackAsync } from './attack'

const config = () => createDefaultConfig()

it('cancels before evaluation and between evaluations in the yielding fallback', async () => {
  const before = new AbortController()
  before.abort()
  await expect(attackAsync(config(), { signal: before.signal })).rejects.toMatchObject({ name: 'AbortError' })
  const during = new AbortController(),
    progress: number[] = []
  await expect(
    attackAsync(config(), {
      signal: during.signal,
      onProgress: (value) => {
        progress.push(value)
        during.abort()
      },
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(progress).toHaveLength(1)
})

it('terminates worker work on cancellation and ignores stale progress messages', async () => {
  const workers: FakeWorker[] = []
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null
    onerror = null
    terminate = vi.fn()
    postMessage = vi.fn()
    constructor() {
      workers.push(this)
    }
  }
  vi.stubGlobal('Worker', FakeWorker)
  try {
    const controller = new AbortController(),
      progress = vi.fn()
    const pending = attackAsync(config(), { signal: controller.signal, onProgress: progress })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    workers[0].onmessage?.({ data: { progress: 1 } })
    expect(progress).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('routes worker previews to the callback and suppresses them after cancel', async () => {
  const workers: FakeWorker[] = []
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null
    onerror = null
    terminate = vi.fn()
    postMessage = vi.fn()
    constructor() {
      workers.push(this)
    }
  }
  vi.stubGlobal('Worker', FakeWorker)
  try {
    const controller = new AbortController(),
      onCandidate = vi.fn()
    const pending = attackAsync(config(), { signal: controller.signal, onCandidate })
    const preview: import('@courtiq/basketball/attackCore').AttackPreview = {
      id: 'base',
      label: 'Their current offense',
      playerId: 'O1',
      points: [
        { x: 0, z: 9 },
        { x: 0, z: 8 },
      ],
      verdict: 'held',
      witnessAt: null,
      leadSeconds: null,
      replays: 1,
      selected: false,
      executionUnresolved: false,
    }
    workers[0].onmessage?.({ data: { candidate: preview } })
    expect(onCandidate).toHaveBeenCalledTimes(1)
    expect(onCandidate).toHaveBeenCalledWith(preview)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    workers[0].onmessage?.({ data: { candidate: { ...preview, selected: true } } })
    expect(onCandidate).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllGlobals()
  }
})
