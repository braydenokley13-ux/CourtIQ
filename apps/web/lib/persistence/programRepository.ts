import {
  LEGACY_ANSWERS_KEY,
  LEGACY_SYSTEM_KEY,
  UnsupportedProgramSchemaError,
  clone,
  decodeLegacySource,
  emptySystem,
  mergeImport,
  planImport,
  type ImportIdentities,
  type ProgramCodec,
  type ProgramKnowledge,
  type ProgramRecord,
} from '@courtiq/basketball/program'
import type { CommitResult, LoadResult, ProgramRepository, RecoveryItem } from './programRepositoryPort'
export type { CommitResult, LoadResult, RecoveryItem } from './programRepositoryPort'

const DB_NAME = 'courtiq-program'
const ROOT_KEY = 'active'
const STORES = ['programs', 'recovery', 'meta'] as const
interface LastGood {
  id: 'last-good'
  kind: 'last-good'
  record: ProgramRecord
}
interface Receipt {
  id: string
  sources: string[]
}
interface MigrationReceipt {
  key: string
  raw: string
}
export interface RepositoryOptions {
  indexedDB: IDBFactory | null
  legacyStorage?: Pick<Storage, 'getItem'> | null
  codec: ProgramCodec
  newId(): string
  now(): string
  databaseName?: string
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Device storage is unavailable.'
}
function recoveryRoot(value: unknown): { raw: string; exact: boolean } {
  try {
    const raw = JSON.stringify(value, function (key, item: unknown) {
      const original: unknown = this[key]
      if (
        (original !== null &&
          typeof original === 'object' &&
          !Array.isArray(original) &&
          Object.getPrototypeOf(original) !== Object.prototype &&
          Object.getPrototypeOf(original) !== null) ||
        (typeof item === 'number' && !Number.isFinite(item)) ||
        !['object', 'number', 'string', 'boolean'].includes(typeof item)
      )
        throw new Error('Stored value contains non-JSON data.')
      return item
    })
    if (typeof raw !== 'string') throw new Error('Stored value is not representable as JSON.')
    return { raw, exact: true }
  } catch (error) {
    // JSON cannot retain a cyclic structured clone. Keep the original in place and export an explicit diagnostic.
    return {
      raw: JSON.stringify({
        format: 'courtiq-device-recovery-diagnostic',
        originalKeptOnDevice: true,
        reason: message(error).slice(0, 1000),
      }),
      exact: false,
    }
  }
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Device storage request failed.'))
  })
}
function complete(tx: IDBTransaction): Promise<void> {
  const result = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Device storage transaction was aborted.'))
    tx.onerror = () => {
      /* abort/complete is authoritative; a request success is not a commit */
    }
  })
  // A request can fail before its owner awaits the transaction. Retain its rejection for the await.
  void result.catch(() => {})
  return result
}

/** One adapter instance per application. There is no module-global browser/session cache. */
export class IndexedDBProgramRepository implements ProgramRepository {
  private database: IDBDatabase | null = null
  private opening: Promise<IDBDatabase> | null = null
  private sourcesChecked = false
  private sourcesUnreadable = false
  private blockedLegacy: MigrationReceipt[] = []
  private emptyProgramId: string | null = null
  constructor(private readonly options: RepositoryOptions) {}

  private open(): Promise<IDBDatabase> {
    if (this.database) return Promise.resolve(this.database)
    if (this.opening) return this.opening
    const factory = this.options.indexedDB
    if (!factory) return Promise.reject(new Error('Device storage is unavailable. Export your session before leaving.'))
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false
      const req = factory.open(this.options.databaseName ?? DB_NAME, 1)
      req.onupgradeneeded = () => {
        for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name)
      }
      req.onblocked = () => {
        settled = true
        reject(new Error('Close other CourtIQ tabs to finish upgrading device storage. Your session is preserved.'))
      }
      req.onerror = () => {
        settled = true
        reject(req.error ?? new Error('Device storage could not be opened.'))
      }
      req.onsuccess = () => {
        if (settled) {
          req.result.close()
          return
        }
        this.database = req.result
        this.database.onversionchange = () => {
          this.database?.close()
          this.database = null
        }
        resolve(this.database)
      }
    }).finally(() => {
      this.opening = null
    })
    this.opening = opening
    return opening
  }
  close() {
    this.database?.close()
    this.database = null
  }

  private validateRecord(value: unknown): ProgramRecord {
    if (
      !value ||
      typeof value !== 'object' ||
      !('revision' in value) ||
      !('program' in value) ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 1
    )
      throw new Error('The stored program envelope is damaged. The original has not been replaced.')
    return { revision: Number(value.revision), program: this.options.codec.parse(value.program) }
  }
  private async read(): Promise<{ root: unknown; lastGood: unknown; receipts: Receipt[] }> {
    const db = await this.open(),
      tx = db.transaction([...STORES], 'readonly'),
      done = complete(tx)
    const values = await Promise.all([
      request(tx.objectStore('programs').get(ROOT_KEY)),
      request(tx.objectStore('recovery').get('last-good')),
      request(tx.objectStore('meta').getAll()),
    ])
    await done
    return { root: values[0], lastGood: values[1], receipts: values[2] as Receipt[] }
  }
  private quarantine(source: string, raw: string, reason: string): RecoveryItem {
    return { id: this.options.newId(), kind: 'quarantine', source, raw, reason, at: this.options.now() }
  }

  async load(attempt = 0): Promise<LoadResult> {
    let existing: Awaited<ReturnType<IndexedDBProgramRepository['read']>>
    try {
      existing = await this.read()
    } catch (error) {
      return { kind: 'unavailable', reason: message(error), notices: [] }
    }
    let record: ProgramRecord | null = null
    if (existing.root !== undefined) {
      try {
        record = this.validateRecord(existing.root)
      } catch (error) {
        const captured = recoveryRoot(existing.root)
        const reason =
          error instanceof UnsupportedProgramSchemaError
            ? error.message
            : `Stored program needs recovery: ${message(error)}`
        const raw = captured.raw
        let lastGood: ProgramRecord | undefined
        try {
          if (existing.lastGood && typeof existing.lastGood === 'object' && 'record' in existing.lastGood)
            lastGood = this.validateRecord(existing.lastGood.record)
        } catch {
          /* preserve both originals */
        }
        const notices: string[] = []
        try {
          await this.preserve([
            this.quarantine(captured.exact ? 'current-program' : 'non-json-device-data', raw, reason),
          ])
        } catch {
          notices.push('The original remains in place; download it before changing device storage.')
        }
        return {
          kind: 'blocked',
          reason: captured.exact
            ? reason
            : `${reason} The original contains non-JSON data and remains on this device. JSON restore cannot safely replace it.`,
          raw,
          rootRaw: raw,
          ...(lastGood ? { lastGood } : {}),
          notices,
        }
      }
    }
    const sources: MigrationReceipt[] = [],
      rejected: RecoveryItem[] = [],
      notices: string[] = []
    this.blockedLegacy = []
    try {
      if (this.options.legacyStorage)
        for (const key of [LEGACY_SYSTEM_KEY, LEGACY_ANSWERS_KEY]) {
          const raw = this.options.legacyStorage.getItem(key)
          if (raw && !existing.receipts.some((r) => r.id === `migration:${key}` && r.sources.includes(raw)))
            sources.push({ key, raw })
        }
      this.sourcesChecked = true
      this.sourcesUnreadable = false
    } catch {
      this.sourcesChecked = true
      this.sourcesUnreadable = !record
      if (!record)
        return {
          kind: 'unavailable',
          reason:
            'Earlier device answers could not be read. They have not been replaced; retry storage or export this session.',
          notices,
        }
      notices.push('Earlier device answers could not be checked; the current program is available.')
    }
    let candidate = record?.program ?? emptySystem((this.emptyProgramId ??= this.options.newId()))
    const receipts: MigrationReceipt[] = []
    for (const source of sources) {
      try {
        const incoming = this.options.codec.parse(decodeLegacySource(source.key, source.raw, candidate.id))
        if (!record && receipts.length === 0 && source.key === LEGACY_SYSTEM_KEY) candidate = incoming
        else {
          const plan = planImport(candidate, incoming)
          const identities: ImportIdentities = { entries: Object.create(null), versions: Object.create(null) }
          for (const id of plan.copyEntryIds) identities.entries[id] = this.options.newId()
          for (const id of plan.copyVersionIds) identities.versions[id] = this.options.newId()
          candidate = mergeImport(candidate, incoming, identities, this.options.codec)
        }
        receipts.push(source)
      } catch (error) {
        const reason = `Earlier answers need recovery: ${message(error)}`
        rejected.push(this.quarantine(source.key, source.raw, reason))
        this.blockedLegacy.push(source)
        notices.push(reason)
      }
    }
    if (receipts.length) {
      const written = await this.write(
        candidate,
        record?.revision ?? null,
        [...receipts, ...this.blockedLegacy],
        rejected,
      )
      if (written.kind === 'saved')
        return {
          kind: 'ready',
          record: written.record,
          notices: [...notices, 'Earlier saved answers were preserved and migrated on this device.'],
        }
      if (written.kind === 'conflict' && attempt < 3) return this.load(attempt + 1)
      return {
        kind: 'unavailable',
        reason: `Migration has not committed: ${'reason' in written ? written.reason : 'device changed'}. Original sources remain unchanged.`,
        notices,
      }
    }
    if (rejected.length) {
      try {
        await this.preserve(rejected)
      } catch {
        notices.push('Raw originals remain in the earlier storage keys; recovery could not be copied.')
      }
      if (!record)
        return {
          kind: 'blocked',
          reason: notices[0]!,
          raw: rejected.map((r) => r.raw).join('\n'),
          rootRaw: null,
          notices,
        }
    }
    return record ? { kind: 'ready', record, notices } : { kind: 'empty', program: candidate, notices }
  }

  async commit(next: ProgramKnowledge, expectedRevision: number | null): Promise<CommitResult> {
    if (!this.sourcesChecked) {
      const loaded = await this.load()
      if (loaded.kind === 'blocked' || loaded.kind === 'unavailable')
        return { kind: loaded.kind, reason: loaded.reason }
    }
    if (this.sourcesUnreadable && expectedRevision === null)
      return {
        kind: 'blocked',
        reason:
          'Earlier device answers could not be read. Retry storage before saving a new device program; export this session to keep it.',
      }
    if (this.blockedLegacy.length && expectedRevision === null)
      return {
        kind: 'blocked',
        reason:
          'Earlier device answers need recovery. Import a backup explicitly before replacing this device program.',
      }
    return this.write(next, expectedRevision, [], [])
  }

  private async write(
    next: ProgramKnowledge,
    expectedRevision: number | null,
    receipts: MigrationReceipt[],
    quarantines: RecoveryItem[],
  ): Promise<CommitResult> {
    let validated: ProgramKnowledge
    try {
      validated = this.options.codec.parse(next)
    } catch (error) {
      return { kind: 'invalid', reason: message(error) }
    }
    let tx: IDBTransaction | undefined, done: Promise<void> | undefined
    try {
      const db = await this.open()
      tx = db.transaction([...STORES], 'readwrite')
      done = complete(tx)
      const stored = await request(tx.objectStore('programs').get(ROOT_KEY))
      let current: ProgramRecord | null = null
      if (stored !== undefined) {
        try {
          current = this.validateRecord(stored)
        } catch (error) {
          tx.abort()
          await done.catch(() => {})
          return { kind: 'blocked', reason: message(error) }
        }
      }
      if ((current?.revision ?? null) !== expectedRevision) {
        tx.abort()
        await done.catch(() => {})
        return { kind: 'conflict', record: current }
      }
      const recovery = tx.objectStore('recovery')
      const preserved = (await request(recovery.getAll())) as (RecoveryItem | LastGood)[]
      for (const item of quarantines)
        if (!preserved.some((r) => r.kind === 'quarantine' && r.source === item.source && r.raw === item.raw)) {
          if (preserved.length >= 50)
            throw new Error('Recovery storage is full. Export preserved originals before adding more.')
          recovery.put(item, item.id)
          preserved.push(item)
        }
      for (const receipt of receipts) {
        const store = tx.objectStore('meta'),
          key = `migration:${receipt.key}`
        const old = (await request(store.get(key))) as Receipt | undefined
        const sources = old?.sources ?? []
        if (!sources.includes(receipt.raw)) sources.push(receipt.raw)
        if (sources.length > 16) throw new Error('The migration history is full. Original sources remain unchanged.')
        store.put({ id: key, sources }, key)
      }
      if (current) recovery.put({ id: 'last-good', kind: 'last-good', record: current } satisfies LastGood, 'last-good')
      const record = { revision: (current?.revision ?? 0) + 1, program: validated }
      tx.objectStore('programs').put(record, ROOT_KEY)
      await done
      return { kind: 'saved', record: clone(record) }
    } catch (error) {
      try {
        tx?.abort()
      } catch {
        /* already complete or aborted */
      }
      await done?.catch(() => {})
      return {
        kind: 'unavailable',
        reason: `Device save did not complete: ${message(error)} Export this session before leaving.`,
      }
    }
  }

  private async preserve(items: RecoveryItem[]): Promise<void> {
    const db = await this.open(),
      tx = db.transaction('recovery', 'readwrite'),
      done = complete(tx),
      store = tx.objectStore('recovery')
    try {
      const old = (await request(store.getAll())) as (RecoveryItem | LastGood)[]
      for (const item of items)
        if (!old.some((r) => r.kind === 'quarantine' && r.source === item.source && r.raw === item.raw)) {
          if (old.length >= 50) throw new Error('Recovery storage is full; the original has been kept in place.')
          store.put(item, item.id)
          old.push(item)
        }
      await done
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* already aborted */
      }
      await done.catch(() => {})
      throw error
    }
  }
  async recoveryItems(): Promise<RecoveryItem[]> {
    const db = await this.open(),
      tx = db.transaction('recovery', 'readonly'),
      done = complete(tx)
    const records = (await request(tx.objectStore('recovery').getAll())) as (RecoveryItem | LastGood)[]
    await done
    return records.filter((r): r is RecoveryItem => r.kind === 'quarantine')
  }
  async preserveRejectedImport(raw: string, reason: string): Promise<void> {
    await this.preserve([this.quarantine('import-file', raw, reason)])
  }

  /** Explicit restore is the only operation allowed to replace a damaged/future root. */
  async restore(next: ProgramKnowledge, expectedRaw: string | null): Promise<CommitResult> {
    let tx: IDBTransaction | undefined, done: Promise<void> | undefined
    try {
      const program = this.options.codec.parse(next),
        db = await this.open()
      tx = db.transaction([...STORES], 'readwrite')
      done = complete(tx)
      const root = await request(tx.objectStore('programs').get(ROOT_KEY))
      const captured = root === undefined ? null : recoveryRoot(root)
      if (captured && !captured.exact) {
        tx.abort()
        await done.catch(() => {})
        return {
          kind: 'blocked',
          reason:
            'The original contains non-JSON data and remains on this device. JSON restore cannot safely replace it.',
        }
      }
      if ((captured?.raw ?? null) !== expectedRaw) {
        tx.abort()
        await done.catch(() => {})
        return { kind: 'blocked', reason: 'Device data changed. Reload recovery before restoring.' }
      }
      const store = tx.objectStore('recovery'),
        old = (await request(store.getAll())) as (RecoveryItem | LastGood)[]
      const raw = captured?.raw ?? null
      if (
        raw !== null &&
        !old.some((r) => r.kind === 'quarantine' && r.source === 'current-program' && r.raw === raw)
      ) {
        if (old.length >= 50) throw new Error('Export recovery records before restoring; recovery storage is full.')
        const item = this.quarantine('current-program', raw, 'Original retained before explicit restore')
        store.put(item, item.id)
      }
      for (const source of this.blockedLegacy) {
        if (!old.some((r) => r.kind === 'quarantine' && r.source === source.key && r.raw === source.raw)) {
          if (old.length >= 50) throw new Error('Export recovery records before restoring; recovery storage is full.')
          const item = this.quarantine(
            source.key,
            source.raw,
            'Earlier original retained before explicit backup import',
          )
          store.put(item, item.id)
          old.push(item)
        }
        const meta = tx.objectStore('meta'),
          key = `migration:${source.key}`
        const receipt = (await request(meta.get(key))) as Receipt | undefined
        const sources = receipt?.sources ?? []
        if (!sources.includes(source.raw)) sources.push(source.raw)
        if (sources.length > 16) throw new Error('The migration history is full. Original sources remain unchanged.')
        meta.put({ id: key, sources }, key)
      }
      const revision =
        typeof root?.revision === 'number' && Number.isSafeInteger(root.revision) && root.revision >= 1
          ? root.revision + 1
          : 1
      const record = { revision, program }
      tx.objectStore('programs').put(record, ROOT_KEY)
      await done
      this.sourcesUnreadable = false
      this.blockedLegacy = []
      return { kind: 'saved', record }
    } catch (error) {
      try {
        tx?.abort()
      } catch {
        /* already aborted */
      }
      await done?.catch(() => {})
      return { kind: 'unavailable', reason: message(error) }
    }
  }
}

export { DB_NAME as PROGRAM_DATABASE_NAME }
