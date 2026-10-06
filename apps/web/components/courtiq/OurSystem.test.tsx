// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createBaselineExecution } from '@courtiq/basketball/problems/baselineDrive'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { compileExperiment } from '@courtiq/basketball/simulation'
import { canonicalStringify, QUERY_VERSION } from '@courtiq/basketball/execution'
import {
  acceptAnswer,
  clone,
  emptySystem,
  fingerprint,
  MAX_PROGRAM_BYTES,
  type ProgramKnowledge,
} from '@courtiq/basketball/program'
import { programCodec } from '@/lib/persistence/programCodec'
import { IndexedDBProgramRepository } from '@/lib/persistence/programRepository'
import { useProgram, type ProgramController } from '@/lib/persistence/useProgram'
import OurSystem from './OurSystem'

vi.mock('./MiniCourt', () => ({ default: () => <output aria-label="Saved replay preview" /> }))
const at = '2026-10-06T00:00:00.000Z'
let root: Root, node: HTMLDivElement, current: ProgramController, factory: IDBFactory
const onOpen = vi.fn(),
  onTeach = vi.fn()
function Harness() {
  current = useProgram()
  return (
    <OurSystem
      system={current.system}
      persistence={current}
      voice={{ register: 'plain' }}
      onOpen={onOpen}
      onTeach={onTeach}
      onSolve={vi.fn()}
      onTerm={vi.fn()}
      onProgram={vi.fn()}
      onDefault={vi.fn()}
    />
  )
}
async function settleUntil(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    if (predicate()) return
  }
  throw new Error('Saved program UI did not settle')
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  factory = new IDBFactory()
  Object.defineProperty(window, 'indexedDB', { value: factory, configurable: true })
  window.localStorage.clear()
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage = null
      postMessage() {}
      close() {}
    },
  )
  onOpen.mockClear()
  onTeach.mockClear()
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
})
afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
  vi.unstubAllGlobals()
})
function saved(kind: 'available' | 'archived' | 'unrelated'): ProgramKnowledge {
  const recipe = createDefaultConfig(),
    input = kind === 'unrelated' ? createBaselineExecution() : compileExperiment(recipe),
    storedRecipe = kind === 'archived' ? { ...recipe, problemId: 'archived-authoring-family' } : recipe
  return programCodec.parse(
    acceptAnswer(emptySystem('imported-program'), {
      entryId: 'imported-answer',
      versionId: 'accepted-v1',
      at,
      name: 'Accepted replay',
      situationId: input.content.id,
      scope: 'varsity',
      when: 'Saved situation',
      presetIds: [],
      snapshot: { kind: 'executable', input, recipe: storedRecipe },
      note: '',
      accepts: [],
      knownBreaks: [],
      evidence: {
        state: 'recorded',
        configFingerprint: fingerprint(storedRecipe),
        inputFingerprint: canonicalStringify(input),
        engineVersion: input.engineVersion,
        content: input.content,
        queryVersion: QUERY_VERSION,
      },
    }).program,
  )
}
function button(label: string) {
  const found = [...node.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

describe('saved replay and Lab authoring availability', () => {
  it('rejects an oversized file before reading or importing it and reports the actual shared capacity', async () => {
    await act(async () => root.render(<Harness />))
    await settleUntil(() => current.status === 'ready')
    const before = clone(current.system),
      read = vi.fn(async () => '{}'),
      file = new File(['{}'], 'oversized-program.json', { type: 'application/json' }),
      input = node.querySelector<HTMLInputElement>('[aria-label="Import CourtIQ program JSON"]')!
    Object.defineProperty(file, 'size', { value: MAX_PROGRAM_BYTES + 1 })
    Object.defineProperty(file, 'text', { value: read })
    Object.defineProperty(input, 'files', { value: [file] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(read).not.toHaveBeenCalled()
    expect(node.querySelector('[role="status"]')?.textContent).toContain('exceeds the 128 MiB limit')
    expect(current.system).toEqual(before)
    expect(current.hasPending).toBe(false)
  })
  it.each(['archived', 'unrelated'] as const)(
    'preserves a durable %s recipe while disabling Lab editing and keeping exact replay teaching available',
    async (kind) => {
      const program = saved(kind)
      await act(async () => root.render(<Harness />))
      await settleUntil(() => current.status === 'ready')
      await act(async () => {
        expect((await current.importText(programCodec.export(program, at))).ok).toBe(true)
      })
      expect(current.status).toBe('ready')
      expect(current.hasPending).toBe(false)
      expect(button('Open in Lab').disabled).toBe(true)
      expect(button('Teach this').disabled).toBe(false)
      await act(async () => {
        button('Open in Lab').click()
        button('Teach this').click()
      })
      expect(onOpen).not.toHaveBeenCalled()
      expect(onTeach).toHaveBeenCalledWith(program.entries[0])
      expect(node.textContent).toContain('Its editing recipe cannot reproduce these inputs')
      expect(programCodec.parseExport(current.exportText())).toEqual(program)

      const reopened = new IndexedDBProgramRepository({
        indexedDB: factory,
        legacyStorage: null,
        codec: programCodec,
        newId: () => 'unused-id',
        now: () => at,
      })
      try {
        expect(await reopened.load()).toMatchObject({ kind: 'ready', record: { revision: 1, program } })
        expect(await reopened.recoveryItems()).toEqual([])
      } finally {
        reopened.close()
      }
    },
  )

  it('opens an available recipe that reproduces its accepted input', async () => {
    const program = saved('available')
    await act(async () => root.render(<Harness />))
    await settleUntil(() => current.status === 'ready')
    await act(async () => {
      await current.importText(programCodec.export(program, at))
    })
    expect(button('Open in Lab').disabled).toBe(false)
    await act(async () => button('Open in Lab').click())
    expect(onOpen).toHaveBeenCalledWith(program.entries[0])
  })
})
