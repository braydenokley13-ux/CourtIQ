import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { createBaselineExecution } from '@courtiq/basketball/problems/baselineDrive'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { canonicalStringify, QUERY_VERSION } from '@courtiq/basketball/execution'
import {
  acceptAnswer,
  emptySystem,
  LEGACY_ANSWERS_KEY,
  LEGACY_SYSTEM_KEY,
  type ProgramKnowledge,
  type ProgramRecord,
} from '@courtiq/basketball/program'
import { programCodec } from './programCodec'
import { IndexedDBProgramRepository, PROGRAM_DATABASE_NAME } from './programRepository'

const at = '2026-10-06T00:00:00.000Z'
const repositories: IndexedDBProgramRepository[] = []
afterEach(() => {
  for (const repo of repositories.splice(0)) repo.close()
  vi.restoreAllMocks()
})
function repo(
  factory: IDBFactory,
  values: Record<string, string> = {},
  overrides: Partial<ConstructorParameters<typeof IndexedDBProgramRepository>[0]> = {},
) {
  let id = 0
  const repository = new IndexedDBProgramRepository({
    indexedDB: factory,
    legacyStorage: { getItem: (key) => values[key] ?? null },
    codec: programCodec,
    newId: () => `generated-${++id}`,
    now: () => at,
    ...overrides,
  })
  repositories.push(repository)
  return repository
}
function accepted(): ProgramKnowledge {
  const input = createBaselineExecution()
  return acceptAnswer(emptySystem('program-1'), {
    entryId: 'baseline-answer',
    versionId: 'version-1',
    at,
    name: 'Baseline',
    situationId: input.content.id,
    scope: 'varsity',
    when: 'Baseline drive',
    snapshot: { kind: 'executable', input },
    presetIds: [],
    note: '',
    accepts: [],
    knownBreaks: [],
    evidence: {
      state: 'recorded',
      inputFingerprint: canonicalStringify(input),
      engineVersion: input.engineVersion,
      content: input.content,
      queryVersion: QUERY_VERSION,
    },
  }).program
}
function legacySystem() {
  return JSON.stringify({
    schema: 1,
    program: 'Original team',
    register: 'program',
    terms: { drop: 'Blue' },
    entries: [
      {
        id: 'original-entry',
        situationId: 'high-pnr-middle',
        name: 'Blue',
        presetIds: ['drop'],
        scope: 'varsity',
        when: 'Middle screen',
        versions: [
          { v: 1, savedAt: at, config: createDefaultConfig(), note: 'Original note', accepts: [], knownBreaks: [] },
        ],
      },
    ],
  })
}
function legacyAnswers() {
  return JSON.stringify({
    format: 'courtiq-defense-lab-answers',
    schemaVersion: 1,
    answers: [
      {
        schemaVersion: 1,
        id: 'old-answer',
        name: 'Old answer',
        createdAt: at,
        updatedAt: at,
        problemVersion: 'original-problem',
        engineVersion: 'original-engine',
        config: createDefaultConfig(),
        terminology: { 'low-man': 'Anchor' },
        teaching: { role: 'low-man', checkpointTimes: [0.3, 1], cue: 'Hold corner' },
        notes: 'Preserved answer',
      },
    ],
  })
}
async function rawStore(factory: IDBFactory, store: string, key: IDBValidKey, value?: unknown): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(PROGRAM_DATABASE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const tx = db.transaction(store, value === undefined ? 'readonly' : 'readwrite')
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
  const request = value === undefined ? tx.objectStore(store).get(key) : tx.objectStore(store).put(value, key)
  const result = await new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await done
  db.close()
  return result
}
function abortRootWrite() {
  const original = IDBObjectStore.prototype.put
  let successfulRequest = false
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const request = original.call(this, value, key)
    if (this.name === 'programs' && key === 'active') {
      const tx = this.transaction
      request.addEventListener('success', () => {
        successfulRequest = true
        tx.abort()
      })
    }
    return request
  })
  return { spy, requestSucceeded: () => successfulRequest }
}

describe('native device program repository', () => {
  it('migrates both historical raw sources once, preserves keys, and commits one authoritative aggregate', async () => {
    const factory = new IDBFactory(),
      values = { [LEGACY_SYSTEM_KEY]: legacySystem(), [LEGACY_ANSWERS_KEY]: legacyAnswers() },
      repository = repo(factory, values)
    const first = await repository.load()
    expect(first.kind).toBe('ready')
    if (first.kind !== 'ready') throw new Error('Expected migration')
    expect(first.record.revision).toBe(1)
    expect(first.record.program.entries.map((entry) => entry.id)).toEqual([
      'original-entry',
      'legacy-answer:old-answer',
    ])
    expect(first.record.program.program).toBe('Original team')
    expect(first.record.program.entries[1]?.versions[0]?.snapshot).toMatchObject({
      kind: 'legacy-unverified',
      engineVersion: 'original-engine',
      problemVersion: 'original-problem',
    })
    const reloaded = await repo(factory, values).load()
    expect(reloaded).toMatchObject({ kind: 'ready', record: first.record })
    expect(values[LEGACY_SYSTEM_KEY]).toBe(legacySystem())
    expect(values[LEGACY_ANSWERS_KEY]).toBe(legacyAnswers())
    expect(await rawStore(factory, 'meta', `migration:${LEGACY_SYSTEM_KEY}`)).toMatchObject({
      sources: [values[LEGACY_SYSTEM_KEY]],
    })
  })

  it('quarantines a malformed source while atomically migrating the independently valid source', async () => {
    const factory = new IDBFactory(),
      raw = '{ malformed earlier answers',
      repository = repo(factory, { [LEGACY_SYSTEM_KEY]: raw, [LEGACY_ANSWERS_KEY]: legacyAnswers() })
    const loaded = await repository.load()
    expect(loaded).toMatchObject({
      kind: 'ready',
      record: { revision: 1, program: { entries: [{ id: 'legacy-answer:old-answer' }] } },
    })
    expect(await repository.recoveryItems()).toMatchObject([{ source: LEGACY_SYSTEM_KEY, raw }])
    expect(await rawStore(factory, 'meta', `migration:${LEGACY_SYSTEM_KEY}`)).toMatchObject({ sources: [raw] })
    const again = await repository.load()
    expect(again).toMatchObject({ kind: 'ready', record: { revision: 1 }, notices: [] })
  })

  it('recovers corrupt legacy-only storage using an explicit null-root backup restore and retains originals', async () => {
    const factory = new IDBFactory(),
      raw = '{ corrupt legacy',
      values = { [LEGACY_SYSTEM_KEY]: raw },
      repository = repo(factory, values)
    const loaded = await repository.load()
    expect(loaded).toMatchObject({ kind: 'blocked', rootRaw: null, raw })
    expect(await repository.commit(emptySystem('silent-empty-reset'), null)).toMatchObject({ kind: 'blocked' })
    const restored = await repository.restore(
      accepted(),
      loaded.kind === 'blocked' ? loaded.rootRaw : 'incorrect-token',
    )
    expect(restored.kind).toBe('saved')
    repository.close()
    expect(await repo(factory, values).load()).toMatchObject({
      kind: 'ready',
      record: { revision: 1, program: accepted() },
      notices: [],
    })
    expect(values[LEGACY_SYSTEM_KEY]).toBe(raw)
    expect(await repository.recoveryItems()).toMatchObject([{ source: LEGACY_SYSTEM_KEY, raw }])
  })

  it('does not initialize an empty root when earlier storage could not be read', async () => {
    const factory = new IDBFactory(),
      repository = repo(
        factory,
        {},
        {
          legacyStorage: {
            getItem() {
              throw new Error('Storage denied')
            },
          },
        },
      )
    expect(await repository.load()).toMatchObject({ kind: 'unavailable' })
    expect(await repository.commit(accepted(), null)).toMatchObject({ kind: 'blocked' })
    expect(await rawStore(factory, 'programs', 'active')).toBeUndefined()
  })

  it('compares revision inside the transaction so independent tabs cannot overwrite one another', async () => {
    const factory = new IDBFactory(),
      a = repo(factory),
      b = repo(factory)
    await Promise.all([a.load(), b.load()])
    const results = await Promise.all([
      a.commit({ ...accepted(), program: 'A' }, null),
      b.commit({ ...accepted(), program: 'B' }, null),
    ])
    expect(results.map((result) => result.kind).sort()).toEqual(['conflict', 'saved'])
    const winner = results.find(
      (result): result is Extract<typeof result, { kind: 'saved' }> => result.kind === 'saved',
    )!
    const reload = await a.load()
    expect(reload).toMatchObject({ kind: 'ready', record: winner.record })
    expect(await b.commit({ ...winner.record.program, program: 'Stale write' }, null)).toMatchObject({
      kind: 'conflict',
      record: winner.record,
    })
  })

  it('acknowledges only transaction completion and rolls back root and last-good after a successful request then abort', async () => {
    const factory = new IDBFactory(),
      repository = repo(factory)
    await repository.load()
    const initial = await repository.commit(accepted(), null)
    if (initial.kind !== 'saved') throw new Error('Expected initial save')
    const abort = abortRootWrite(),
      result = await repository.commit(
        { ...initial.record.program, program: 'Aborted change' },
        initial.record.revision,
      )
    expect(abort.requestSucceeded()).toBe(true)
    expect(result.kind).toBe('unavailable')
    abort.spy.mockRestore()
    expect(await repository.load()).toMatchObject({ kind: 'ready', record: initial.record })
    expect(await rawStore(factory, 'recovery', 'last-good')).toBeUndefined()
  })

  it('rolls back migration root, receipts and quarantine together if the transaction aborts', async () => {
    const factory = new IDBFactory(),
      values = { [LEGACY_SYSTEM_KEY]: legacySystem(), [LEGACY_ANSWERS_KEY]: '{ corrupted answers' },
      repository = repo(factory, values),
      abort = abortRootWrite()
    expect(await repository.load()).toMatchObject({ kind: 'unavailable' })
    expect(abort.requestSucceeded()).toBe(true)
    abort.spy.mockRestore()
    expect(await rawStore(factory, 'programs', 'active')).toBeUndefined()
    expect(await rawStore(factory, 'meta', `migration:${LEGACY_SYSTEM_KEY}`)).toBeUndefined()
    expect(await rawStore(factory, 'meta', `migration:${LEGACY_ANSWERS_KEY}`)).toBeUndefined()
    expect(await repository.recoveryItems()).toEqual([])
    expect(await repository.load()).toMatchObject({ kind: 'ready', record: { revision: 1 } })
  })

  it('blocks a damaged or future program root, retains last-good, and restores only the exact reviewed root', async () => {
    const factory = new IDBFactory(),
      repository = repo(factory)
    await repository.load()
    const initial = await repository.commit(accepted(), null)
    if (initial.kind !== 'saved') throw new Error('Expected save')
    await repository.commit({ ...initial.record.program, program: 'Latest program' }, initial.record.revision)
    const bad = { revision: 3, program: { schema: 999, unsupported: true } }
    await rawStore(factory, 'programs', 'active', bad)
    const loaded = await repository.load()
    expect(loaded).toMatchObject({ kind: 'blocked', rootRaw: JSON.stringify(bad), lastGood: initial.record })
    expect(await repository.commit(accepted(), 3)).toMatchObject({ kind: 'blocked' })
    expect(await repository.restore(accepted(), '{wrong original}')).toMatchObject({ kind: 'blocked' })
    expect(await rawStore(factory, 'programs', 'active')).toEqual(bad)
    expect(await repository.restore(initial.record.program, JSON.stringify(bad))).toMatchObject({
      kind: 'saved',
      record: { revision: 4, program: initial.record.program },
    })
    expect(await repository.recoveryItems()).toMatchObject([{ source: 'current-program', raw: JSON.stringify(bad) }])
  })

  it('returns explicit blocked recovery for a cyclic structured-clone root and keeps the non-JSON original in place', async () => {
    const factory = new IDBFactory(),
      repository = repo(factory)
    await repository.load()
    const initial = await repository.commit(accepted(), null)
    if (initial.kind !== 'saved') throw new Error('Expected save')
    await repository.commit({ ...accepted(), program: 'Latest saved team' }, initial.record.revision)
    const damaged: { revision: number; program: { schema: number; cycle?: unknown } } = {
      revision: 3,
      program: { schema: 2 },
    }
    damaged.program.cycle = damaged
    await rawStore(factory, 'programs', 'active', damaged)
    const loaded = await repository.load()
    expect(loaded).toMatchObject({ kind: 'blocked', lastGood: initial.record })
    if (loaded.kind !== 'blocked') throw new Error('Expected blocked recovery')
    expect(loaded.reason).toContain('non-JSON data')
    expect(JSON.parse(loaded.raw)).toMatchObject({
      format: 'courtiq-device-recovery-diagnostic',
      originalKeptOnDevice: true,
    })
    expect(await repository.recoveryItems()).toMatchObject([{ source: 'non-json-device-data', raw: loaded.raw }])
    expect(await repository.restore(initial.record.program, loaded.rootRaw)).toMatchObject({ kind: 'blocked' })
    const original = (await rawStore(factory, 'programs', 'active')) as typeof damaged
    expect(original.revision).toBe(3)
    expect(original.program.cycle).toBe(original)
    expect(await repository.commit(accepted(), 3)).toMatchObject({ kind: 'blocked' })
    expect(await repository.load()).toMatchObject({ kind: 'blocked', raw: loaded.raw })
  })

  it('returns unavailable for unsupported device storage while leaving a portable candidate valid', async () => {
    const repository = repo(new IDBFactory(), {}, { indexedDB: null })
    expect(await repository.load()).toMatchObject({ kind: 'unavailable' })
    expect(await repository.commit(accepted(), null)).toMatchObject({ kind: 'unavailable' })
    expect(programCodec.parseExport(programCodec.export(accepted(), at))).toEqual(accepted())
  })

  it('round-trips portable data after an explicit clear and a fresh repository instance', async () => {
    const factory = new IDBFactory(),
      repository = repo(factory)
    await repository.load()
    const saved = await repository.commit(accepted(), null)
    if (saved.kind !== 'saved') throw new Error('Expected save')
    const text = programCodec.export(saved.record.program, at)
    const cleared = await repository.commit(emptySystem('cleared'), saved.record.revision)
    if (cleared.kind !== 'saved') throw new Error('Expected clear')
    repository.close()
    const fresh = repo(factory),
      loaded = await fresh.load()
    if (loaded.kind !== 'ready') throw new Error('Expected cleared root')
    expect(loaded.record.program.entries).toEqual([])
    expect(await fresh.commit(programCodec.parseExport(text), loaded.record.revision)).toMatchObject({
      kind: 'saved',
      record: { program: accepted() },
    })
    expect(await rawStore(factory, 'recovery', 'last-good')).toMatchObject({
      record: { program: cleared.record.program },
    } satisfies Partial<{ record: Partial<ProgramRecord> }>)
  })
})
