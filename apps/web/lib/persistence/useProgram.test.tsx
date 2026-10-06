// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { clone, emptySystem, LEGACY_SYSTEM_KEY, MAX_PROGRAM_BYTES } from '@courtiq/basketball/program'
import { programCodec } from './programCodec'
import { useProgram, type ProgramController, type ProgramMutationResult } from './useProgram'
import type { LoadResult, ProgramRepository, ProgramRepositoryFactory } from './programRepositoryPort'

let root: Root, node: HTMLDivElement, current: ProgramController
function Harness({ createRepository }: { createRepository?: ProgramRepositoryFactory }) {
  current = useProgram(createRepository)
  return <output role="status">{current.notice}</output>
}
async function settleUntil(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    if (predicate()) return
  }
  throw new Error('Hook did not settle')
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  Object.defineProperty(window, 'indexedDB', { value: new IDBFactory(), configurable: true })
  window.localStorage.clear()
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage = null
      postMessage() {}
      close() {}
    },
  )
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
})
afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function start(createRepository?: ProgramRepositoryFactory) {
  await act(async () => root.render(<Harness createRepository={createRepository} />))
  await settleUntil(() => current.status !== 'loading')
}

describe('program persistence UI controller', () => {
  it('rejects a capacity failure before staging a candidate and exports only the unchanged acknowledged program', async () => {
    await start()
    const before = clone(current.system),
      parse = programCodec.parse
    vi.spyOn(programCodec, 'parse').mockImplementation((value) => {
      if (value && typeof value === 'object' && 'program' in value && value.program === 'Over capacity')
        throw new Error(`This program exceeds the ${MAX_PROGRAM_BYTES / (1024 * 1024)} MiB portable program limit.`)
      return parse(value)
    })
    let result!: ProgramMutationResult
    await act(async () => {
      result = await current.mutate((program) => ({ ...program, program: 'Over capacity' }))
    })
    expect(result.ok).toBe(false)
    expect(result.program).toEqual(before)
    expect(current.system).toEqual(before)
    expect(current.hasPending).toBe(false)
    expect(current.status).toBe('ready')
    expect(node.textContent).toContain('128 MiB portable program limit')
    expect(programCodec.parseExport(current.exportText())).toEqual(before)
  })
  it('ignores a deferred focus read after a newer local commit and keeps the committed program visible and exportable', async () => {
    const original = { revision: 1, program: emptySystem('durable-program') }
    let durable = clone(original),
      resolveLoad!: (loaded: LoadResult) => void,
      reads = 0
    const adapter: ProgramRepository = {
      load: async () => {
        if (reads++ === 0) return { kind: 'ready', record: clone(original), notices: [] }
        return new Promise<LoadResult>((resolve) => {
          resolveLoad = resolve
        })
      },
      commit: async (program, expectedRevision) => {
        if (expectedRevision !== durable.revision) return { kind: 'conflict', record: clone(durable) }
        durable = { revision: durable.revision + 1, program: clone(program) }
        return { kind: 'saved', record: clone(durable) }
      },
      restore: async () => ({ kind: 'unavailable', reason: 'Unused restore' }),
      recoveryItems: async () => [],
      preserveRejectedImport: async () => {},
      close: vi.fn(),
    }
    await start(() => adapter)
    await act(async () => window.dispatchEvent(new Event('focus')))
    await act(async () => {
      expect((await current.mutate((program) => ({ ...program, program: 'New durable team' }))).ok).toBe(true)
    })
    expect(durable.revision).toBe(2)
    await act(async () => resolveLoad({ kind: 'ready', record: clone(original), notices: [] }))
    expect(current.status).toBe('ready')
    expect(current.system).toEqual(durable.program)
    expect(programCodec.parseExport(current.exportText())).toEqual(durable.program)
    expect(node.textContent).not.toContain('Device data could not be read')
  })

  it('handles an unexpected adapter read rejection and can retry without losing the session export', async () => {
    const load = vi.fn<ProgramRepository['load']>().mockRejectedValue(new TypeError('Broken stored value'))
    const adapter: ProgramRepository = {
      load,
      commit: async () => ({ kind: 'unavailable', reason: 'Unused commit' }),
      restore: async () => ({ kind: 'unavailable', reason: 'Unused restore' }),
      recoveryItems: async () => [],
      preserveRejectedImport: async () => {},
      close: vi.fn(),
    }
    await start(() => adapter)
    expect(current.status).toBe('unavailable')
    expect(node.textContent).toContain('Device data could not be read: Broken stored value')
    expect(() => programCodec.parseExport(current.exportText())).not.toThrow()
    const restored = emptySystem('readable-program')
    load.mockResolvedValue({ kind: 'ready', record: { revision: 1, program: restored }, notices: [] })
    await act(async () => current.retry())
    expect(current.status).toBe('ready')
    expect(current.system).toEqual(restored)
  })
  it('uses a substituted portable repository without touching native storage or copying lifecycle handling', async () => {
    const nativeOpen = vi.spyOn(window.indexedDB, 'open')
    let record = { revision: 4, program: emptySystem('other-adapter-program') }
    const adapter: ProgramRepository = {
      load: async () => ({ kind: 'ready', record, notices: [] }),
      commit: async (program, expectedRevision) => {
        if (expectedRevision !== record.revision) return { kind: 'conflict', record }
        record = { revision: record.revision + 1, program }
        return { kind: 'saved', record }
      },
      restore: async (program) => ({ kind: 'saved', record: { revision: record.revision + 1, program } }),
      recoveryItems: async () => [],
      preserveRejectedImport: async () => {},
      close: vi.fn(),
    }
    const factory = vi.fn(() => adapter)
    await start(factory)
    expect(current.system.id).toBe('other-adapter-program')
    await act(async () => {
      await current.mutate((program) => ({ ...program, program: 'Adapter team' }))
    })
    expect(current.system.program).toBe('Adapter team')
    expect(current.status).toBe('ready')
    expect(record.revision).toBe(5)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(nativeOpen).not.toHaveBeenCalled()
  })

  it('keeps a transaction-aborted session exportable and reports save failure until a durable retry commits', async () => {
    await start()
    const initialId = current.system.id,
      original = IDBObjectStore.prototype.put
    let requestSucceeded = false
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = original.call(this, value, key)
      if (this.name === 'programs') {
        const tx = this.transaction
        request.addEventListener('success', () => {
          requestSucceeded = true
          tx.abort()
        })
      }
      return request
    })
    let result!: ProgramMutationResult
    await act(async () => {
      result = await current.mutate((program) => ({ ...program, program: 'Unsaved team' }))
    })
    expect(requestSucceeded).toBe(true)
    expect(result.ok).toBe(false)
    expect(current.status).toBe('unpersisted')
    expect(current.hasPending).toBe(true)
    expect(node.textContent).toContain('Device save did not complete')
    expect(programCodec.parseExport(current.exportText())).toMatchObject({ id: initialId, program: 'Unsaved team' })
    spy.mockRestore()
    await act(async () => {
      await current.retry()
    })
    expect(current.status).toBe('ready')
    expect(current.hasPending).toBe(false)
    expect(current.system).toMatchObject({ id: initialId, program: 'Unsaved team' })
    expect(current.notice).toBeNull()
  })

  it('initializes from a valid backup when the only device source was malformed legacy JSON', async () => {
    const raw = '{ unreadable old answers'
    window.localStorage.setItem(LEGACY_SYSTEM_KEY, raw)
    await start()
    expect(current.status).toBe('blocked')
    const backup = { ...emptySystem('backup-id'), program: 'Restored backup' }
    let result!: ProgramMutationResult
    await act(async () => {
      result = await current.importText(programCodec.export(backup, '2026-10-06T00:00:00.000Z'))
    })
    expect(result.ok).toBe(true)
    expect(current.status).toBe('ready')
    expect(current.system).toEqual(backup)
    expect(window.localStorage.getItem(LEGACY_SYSTEM_KEY)).toBe(raw)
    const recovery = JSON.parse(await current.downloadRecovery())
    expect(recovery.records).toMatchObject([{ source: LEGACY_SYSTEM_KEY, raw }])
    await act(async () => {
      await current.retry()
    })
    expect(current.status).toBe('ready')
    expect(current.system).toEqual(backup)
  })

  it('publishes an accessible malformed-import error without replacing acknowledged data', async () => {
    await start()
    await act(async () => {
      await current.mutate((program) => ({ ...program, program: 'Keep this team' }))
    })
    const before = current.system
    await act(async () => {
      await current.importText('{ malformed import')
    })
    expect(current.system).toEqual(before)
    expect(node.querySelector('[role="status"]')?.textContent).toContain('Import did not change your program')
    expect(current.hasPending).toBe(false)
    expect(JSON.parse(await current.downloadRecovery()).records).toMatchObject([
      { source: 'import-file', raw: '{ malformed import' },
    ])
  })
})
