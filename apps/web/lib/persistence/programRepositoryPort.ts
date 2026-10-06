import type { ProgramKnowledge, ProgramRecord } from '@courtiq/basketball/program'

export interface RecoveryItem {
  id: string
  kind: 'quarantine'
  source: string
  raw: string
  reason: string
  at: string
}
export type CommitResult =
  | { kind: 'saved'; record: ProgramRecord }
  | { kind: 'conflict'; record: ProgramRecord | null }
  | { kind: 'blocked' | 'unavailable' | 'invalid'; reason: string }
export type LoadResult =
  | { kind: 'ready'; record: ProgramRecord; notices: string[] }
  | { kind: 'empty'; program: ProgramKnowledge; notices: string[] }
  | {
      kind: 'blocked'
      reason: string
      raw: string
      rootRaw: string | null
      lastGood?: ProgramRecord
      notices: string[]
    }
  | { kind: 'unavailable'; reason: string; notices: string[] }

/** Portable lifecycle contract. Commit success means the adapter's durable write completed. */
export interface ProgramRepository {
  load(): Promise<LoadResult>
  commit(next: ProgramKnowledge, expectedRevision: number | null): Promise<CommitResult>
  restore(next: ProgramKnowledge, expectedRaw: string | null): Promise<CommitResult>
  recoveryItems(): Promise<RecoveryItem[]>
  preserveRejectedImport(raw: string, reason: string): Promise<void>
  close(): void
}

/** Supply one stable factory at the application composition boundary. */
export type ProgramRepositoryFactory = () => ProgramRepository
