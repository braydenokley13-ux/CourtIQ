'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LEGACY_ANSWERS_KEY,
  LEGACY_SYSTEM_KEY,
  checkBytes,
  decodeLegacySource,
  emptySystem,
  importIntoEmpty,
  mergeImport,
  planImport,
  type ImportIdentities,
  type ProgramKnowledge,
  type ProgramRecord,
} from '@courtiq/basketball/program'
import { IndexedDBProgramRepository } from './programRepository'
import type { LoadResult, ProgramRepository, ProgramRepositoryFactory } from './programRepositoryPort'
import { programCodec } from './programCodec'

export function newProgramId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
type Command = (program: ProgramKnowledge) => ProgramKnowledge
export interface ProgramMutationResult {
  ok: boolean
  program: ProgramKnowledge
  reason?: string
}
type State = {
  system: ProgramKnowledge
  status: 'loading' | 'ready' | 'unpersisted' | 'blocked' | 'unavailable'
  busy: boolean
  notice: string | null
  raw: string | null
  lastGood: ProgramRecord | null
}
async function loadRepository(repo: ProgramRepository): Promise<LoadResult> {
  try {
    return await repo.load()
  } catch (error) {
    return {
      kind: 'unavailable',
      reason: `Device data could not be read: ${error instanceof Error ? error.message : 'unexpected storage failure'}. Export this session before leaving.`,
      notices: [],
    }
  }
}

/** Owns the current device record and pending commands. The Lab draft is independent. */
export function useProgram(createRepository?: ProgramRepositoryFactory) {
  const [state, setState] = useState<State>(() => ({
    system: emptySystem('loading-program'),
    status: 'loading',
    busy: false,
    notice: null,
    raw: null,
    lastGood: null,
  }))
  const repository = useRef<ProgramRepository | null>(null)
  const acknowledged = useRef<{ revision: number | null; program: ProgramKnowledge }>({
    revision: null,
    program: state.system,
  })
  const pending = useRef<Command[]>([])
  const candidate = useRef<ProgramKnowledge | null>(null)
  const blockedRoot = useRef<string | null>(null)
  const status = useRef<State['status']>('loading')
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const channel = useRef<BroadcastChannel | null>(null)
  const mounted = useRef(false)
  const loadGeneration = useRef(0)

  const showLoad = useCallback((loaded: LoadResult) => {
    if (!mounted.current) return
    if (loaded.kind === 'ready' || loaded.kind === 'empty') {
      const record = loaded.kind === 'ready' ? loaded.record : { revision: null, program: loaded.program }
      if (
        acknowledged.current.revision !== null &&
        (record.revision === null || record.revision < acknowledged.current.revision)
      )
        return
      blockedRoot.current = null
      acknowledged.current = record
      status.current = pending.current.length ? 'unpersisted' : 'ready'
      setState((s) => ({
        ...s,
        system: pending.current.length && candidate.current ? candidate.current : record.program,
        status: status.current,
        notice: pending.current.length
          ? 'Unsaved session changes remain available for export. Review and retry to save them.'
          : loaded.notices.join(' ') || null,
        raw: null,
        lastGood: null,
      }))
    } else {
      blockedRoot.current = loaded.kind === 'blocked' ? loaded.rootRaw : null
      status.current = loaded.kind
      setState((s) => ({
        ...s,
        status: loaded.kind,
        notice: loaded.reason,
        raw: loaded.kind === 'blocked' ? loaded.raw : null,
        lastGood: loaded.kind === 'blocked' ? (loaded.lastGood ?? null) : null,
      }))
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const repo = createRepository
      ? createRepository()
      : (() => {
          let legacyStorage: Pick<Storage, 'getItem'> | null
          try {
            legacyStorage = window.localStorage
          } catch {
            legacyStorage = {
              getItem() {
                throw new Error('Earlier storage is unavailable.')
              },
            }
          }
          let idb: IDBFactory | null
          try {
            idb = window.indexedDB ?? null
          } catch {
            idb = null
          }
          return new IndexedDBProgramRepository({
            indexedDB: idb,
            legacyStorage,
            codec: programCodec,
            newId: newProgramId,
            now: () => new Date().toISOString(),
          })
        })()
    repository.current = repo
    const load = () => {
      const generation = ++loadGeneration.current
      void loadRepository(repo).then((loaded) => {
        if (repository.current === repo && generation === loadGeneration.current) showLoad(loaded)
      })
    }
    load()
    const refresh = () => {
      if (!pending.current.length) load()
    }
    let broadcast: BroadcastChannel | null = null
    try {
      broadcast = new BroadcastChannel('courtiq-program')
      broadcast.onmessage = refresh
      channel.current = broadcast
    } catch {
      /* focus refresh supplies the same invalidation hint */
    }
    window.addEventListener('focus', refresh)
    return () => {
      mounted.current = false
      window.removeEventListener('focus', refresh)
      broadcast?.close()
      if (channel.current === broadcast) channel.current = null
      repo.close()
      if (repository.current === repo) repository.current = null
    }
  }, [showLoad, createRepository])

  const runPending = useCallback(async (): Promise<ProgramMutationResult> => {
    loadGeneration.current++
    const repo = repository.current
    let next = acknowledged.current.program
    try {
      for (const command of pending.current) next = command(next)
      next = programCodec.parse(next)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The proposed program change is invalid.'
      if (mounted.current) setState((s) => ({ ...s, busy: false, notice: reason }))
      return { ok: false, program: candidate.current ?? next, reason }
    }
    candidate.current = next
    if (mounted.current) setState((s) => ({ ...s, system: next, busy: true }))
    if (!repo || status.current === 'loading' || status.current === 'blocked') {
      const reason =
        status.current === 'blocked'
          ? 'This session is unsaved. Recover or import device data, or export the session before leaving.'
          : 'Device storage is not ready. Export this session or retry saving.'
      status.current = status.current === 'blocked' ? 'blocked' : 'unpersisted'
      if (mounted.current)
        setState((s) => ({ ...s, system: next, status: status.current, busy: false, notice: reason }))
      return { ok: false, program: next, reason }
    }
    const result = await repo.commit(next, acknowledged.current.revision)
    if (result.kind === 'saved') {
      acknowledged.current = result.record
      pending.current = []
      candidate.current = null
      status.current = 'ready'
      if (mounted.current)
        setState((s) => ({ ...s, system: result.record.program, status: 'ready', busy: false, notice: null }))
      try {
        channel.current?.postMessage({ revision: result.record.revision })
      } catch {
        /* transaction correctness is independent of broadcasting */
      }
      return { ok: true, program: result.record.program }
    }
    let reason: string
    if (result.kind === 'conflict') {
      if (result.record) acknowledged.current = result.record
      else acknowledged.current = { revision: null, program: emptySystem(newProgramId()) }
      reason =
        'The program changed in another tab. Your unsaved session is preserved for export; review the latest answer before retrying.'
    } else reason = result.reason
    status.current = result.kind === 'blocked' ? 'blocked' : 'unpersisted'
    if (mounted.current) setState((s) => ({ ...s, status: status.current, busy: false, notice: reason }))
    return { ok: false, program: next, reason }
  }, [])

  const applyCommand = useCallback(
    async (command: Command): Promise<ProgramMutationResult> => {
      try {
        programCodec.parse(command(candidate.current ?? acknowledged.current.program))
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'This change is invalid.'
        if (mounted.current) setState((s) => ({ ...s, notice: reason }))
        return { ok: false, program: candidate.current ?? acknowledged.current.program, reason }
      }
      pending.current.push(command)
      return runPending()
    },
    [runPending],
  )

  const mutate = useCallback(
    (command: Command): Promise<ProgramMutationResult> => {
      const task = queue.current.then(() => applyCommand(command))
      queue.current = task.catch(() => {})
      return task
    },
    [applyCommand],
  )

  const retry = useCallback(async () => {
    const task = queue.current.then(async () => {
      const repo = repository.current
      if (!repo) return
      const generation = ++loadGeneration.current,
        loaded = await loadRepository(repo)
      if (repository.current !== repo) return
      if (generation === loadGeneration.current) showLoad(loaded)
      if (pending.current.length) await runPending()
    })
    queue.current = task.catch(() => {})
    await task
  }, [runPending, showLoad])

  const exportText = useCallback(
    () =>
      programCodec.export(
        candidate.current ??
          (status.current === 'blocked' && state.lastGood ? state.lastGood.program : acknowledged.current.program),
        new Date().toISOString(),
      ),
    [state.lastGood],
  )

  const importText = useCallback(
    async (text: string): Promise<ProgramMutationResult> => {
      let incoming: ProgramKnowledge
      try {
        checkBytes(text)
        const outer = JSON.parse(text)
        incoming =
          outer?.format === 'courtiq-program'
            ? programCodec.parseExport(text)
            : programCodec.parse(
                decodeLegacySource(
                  outer?.format === 'courtiq-defense-lab-answers' ? LEGACY_ANSWERS_KEY : LEGACY_SYSTEM_KEY,
                  text,
                  newProgramId(),
                ),
              )
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'This is not supported CourtIQ JSON.'
        await repository.current?.preserveRejectedImport(text, reason).catch(() => {})
        setState((s) => ({ ...s, notice: `Import did not change your program: ${reason}`, raw: text }))
        return { ok: false, program: candidate.current ?? acknowledged.current.program, reason }
      }
      const identities: ImportIdentities = { entries: Object.create(null), versions: Object.create(null) }
      const importCommand: Command = (current) => {
        if (!current.entries.length) return importIntoEmpty(current, incoming, programCodec)
        const plan = planImport(current, incoming)
        for (const id of plan.copyEntryIds) identities.entries[id] ??= newProgramId()
        for (const id of plan.copyVersionIds) identities.versions[id] ??= newProgramId()
        return mergeImport(current, incoming, identities, programCodec)
      }
      const task = queue.current.then(async (): Promise<ProgramMutationResult> => {
        if (status.current !== 'blocked') return applyCommand(importCommand)
        loadGeneration.current++
        const next = importCommand(candidate.current ?? acknowledged.current.program)
        setState((s) => ({ ...s, busy: true }))
        // Raw legacy sources are recovery evidence, not an IndexedDB envelope.
        const restored = await repository.current?.restore(next, blockedRoot.current)
        if (restored?.kind === 'saved') {
          acknowledged.current = restored.record
          candidate.current = null
          pending.current = []
          status.current = 'ready'
          blockedRoot.current = null
          setState((s) => ({
            ...s,
            system: restored.record.program,
            status: 'ready',
            busy: false,
            notice: 'Imported program restored. The previous raw device data is preserved for recovery.',
            raw: null,
            lastGood: null,
          }))
          try {
            channel.current?.postMessage({ revision: restored.record.revision })
          } catch {
            /* invalidation is a hint */
          }
          return { ok: true, program: restored.record.program }
        }
        const reason = restored && 'reason' in restored ? restored.reason : 'Recovery did not complete.'
        setState((s) => ({ ...s, busy: false, notice: reason }))
        return { ok: false, program: candidate.current ?? acknowledged.current.program, reason }
      })
      queue.current = task.catch(() => {})
      return task
    },
    [applyCommand],
  )

  const restoreLastGood = useCallback(async () => {
    const lastGood = state.lastGood
    if (!lastGood) return
    const task = queue.current.then(async () => {
      if (!blockedRoot.current || !repository.current || pending.current.length) return
      loadGeneration.current++
      setState((s) => ({ ...s, busy: true }))
      const result = await repository.current.restore(lastGood.program, blockedRoot.current)
      if (result.kind === 'saved') {
        acknowledged.current = result.record
        pending.current = []
        candidate.current = null
        status.current = 'ready'
        blockedRoot.current = null
        setState((s) => ({
          ...s,
          system: result.record.program,
          status: 'ready',
          busy: false,
          notice: 'The last saved program was restored. The original is preserved for recovery.',
          raw: null,
          lastGood: null,
        }))
        try {
          channel.current?.postMessage({ revision: result.record.revision })
        } catch {
          /* invalidation is a hint */
        }
      } else
        setState((s) => ({
          ...s,
          busy: false,
          notice: 'reason' in result ? result.reason : 'Device changed; reload recovery.',
        }))
    })
    queue.current = task.catch(() => {})
    await task
  }, [state.lastGood])

  const clear = useCallback(() => {
    const id = newProgramId()
    return mutate(() => emptySystem(id))
  }, [mutate])
  const discardPending = useCallback(() => {
    pending.current = []
    candidate.current = null
    if (status.current !== 'blocked' && status.current !== 'unavailable') status.current = 'ready'
    setState((s) => ({
      ...s,
      system: acknowledged.current.program,
      status: status.current,
      notice: 'Using the latest device program. Unsaved session changes were discarded.',
    }))
  }, [])
  const downloadRecovery = useCallback(async () => {
    const records = await repository.current?.recoveryItems().catch(() => [])
    return JSON.stringify(
      { format: 'courtiq-recovery', original: state.raw, lastGood: state.lastGood, records: records ?? [] },
      null,
      2,
    )
  }, [state.raw, state.lastGood])

  return {
    ...state,
    mutate,
    retry,
    exportText,
    importText,
    restoreLastGood,
    clear,
    discardPending,
    downloadRecovery,
    hasPending: pending.current.length > 0,
  }
}
export type ProgramController = ReturnType<typeof useProgram>
