/**
 * Local boss/mixed challenge progress (PTH-3).
 *
 * Pathways v1 derives every number from existing tables. PTH-3 adds
 * boss + mixed-read challenges, which need a *light* form of pass/fail
 * memory so the summary page can render the right copy and the
 * pathway detail page can show a "Cleared" tag without a schema
 * migration. We persist that memory in localStorage, keyed by
 * pathway/chapter/mode/challenge slug. Cross-device persistence and
 * BossChallengeAttempt rows land in PTH-4+.
 *
 * The module is dependency-free and safe to import from server
 * components — every read/write is gated on `typeof window`.
 */

import type { PathwayTrainingMode } from './types'

const STORAGE_KEY = 'courtiq.pathways.challengeProgress.v1'

/** Strict subset of training modes we persist. */
export type ChallengeMode = Extract<PathwayTrainingMode, 'boss-challenge' | 'mixed-reads'>

export interface ChallengeKey {
  pathwaySlug: string
  chapterSlug: string
  mode: ChallengeMode
  /** Boss slug for boss challenges, node slug for mixed-reads. */
  challengeSlug: string
}

export interface ChallengeAttempt extends ChallengeKey {
  attemptedAt: string
  /** v1 approximation: correct count from /api/session/.../complete.
   *  PTH-4 will replace this with `bestCount` once we persist boss
   *  attempts server-side. */
  bestCount: number
  total: number
  passed: boolean
  scenarioIds: string[]
}

type StorageShape = {
  version: 1
  attempts: Record<string, ChallengeAttempt>
}

function emptyState(): StorageShape {
  return { version: 1, attempts: {} }
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const s = window.localStorage
    // Probe — Safari private mode throws on write rather than read.
    const probeKey = `${STORAGE_KEY}.__probe`
    s.setItem(probeKey, '1')
    s.removeItem(probeKey)
    return s
  } catch {
    return null
  }
}

function readAll(): StorageShape {
  const storage = safeStorage()
  if (!storage) return emptyState()
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return emptyState()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      (parsed as { version: unknown }).version === 1 &&
      'attempts' in parsed &&
      typeof (parsed as { attempts: unknown }).attempts === 'object' &&
      (parsed as { attempts: unknown }).attempts !== null
    ) {
      return parsed as StorageShape
    }
    return emptyState()
  } catch {
    return emptyState()
  }
}

function writeAll(state: StorageShape): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota exceeded / private mode — silently no-op. Boss/mixed
    // results are advisory, not authoritative.
  }
}

/** Build the storage key. Exported so tests can pin it. */
export function challengeStorageKey(key: ChallengeKey): string {
  return `${key.pathwaySlug}|${key.chapterSlug}|${key.mode}|${key.challengeSlug}`
}

/** Compute pass/fail given a recorded attempt and an optional pass
 *  ratio (0..1). Falls back to "any correct" when no ratio is given. */
export function isPassingAttempt(
  bestCount: number,
  total: number,
  passRatio: number | null | undefined,
): boolean {
  if (total <= 0) return false
  if (passRatio == null) return bestCount > 0
  return bestCount / total >= passRatio
}

export interface RecordAttemptInput extends ChallengeKey {
  bestCount: number
  total: number
  scenarioIds: readonly string[]
  /** Pass ratio from the boss/mixed config (0..1). */
  passRatio?: number | null
  /** Override `attemptedAt`; defaults to now. Tests use this. */
  attemptedAt?: string
}

/** Record a boss/mixed result. Keeps the *best* attempt per challenge
 *  key — a passing run never gets demoted by a later miss, and an
 *  improved score replaces a worse passing run. */
export function recordChallengeAttempt(input: RecordAttemptInput): ChallengeAttempt {
  const passed = isPassingAttempt(input.bestCount, input.total, input.passRatio ?? null)
  const next: ChallengeAttempt = {
    pathwaySlug: input.pathwaySlug,
    chapterSlug: input.chapterSlug,
    mode: input.mode,
    challengeSlug: input.challengeSlug,
    bestCount: input.bestCount,
    total: input.total,
    passed,
    scenarioIds: [...input.scenarioIds],
    attemptedAt: input.attemptedAt ?? new Date().toISOString(),
  }
  const all = readAll()
  const key = challengeStorageKey(next)
  const prev = all.attempts[key]
  // Keep best of: previously-passed run > current attempt's bestCount
  // (so a slip-up doesn't erase a clear). Otherwise overwrite.
  if (prev && prev.passed && prev.bestCount >= next.bestCount && !passed) {
    return prev
  }
  if (prev && prev.bestCount > next.bestCount && prev.passed === passed) {
    return prev
  }
  all.attempts[key] = next
  writeAll(all)
  return next
}

/** Read the latest recorded attempt for a challenge, or null when
 *  nothing has been stored (or storage is unavailable). */
export function getChallengeAttempt(key: ChallengeKey): ChallengeAttempt | null {
  const all = readAll()
  return all.attempts[challengeStorageKey(key)] ?? null
}

/** Convenience: did the user pass this challenge at least once? */
export function hasClearedChallenge(key: ChallengeKey): boolean {
  return getChallengeAttempt(key)?.passed === true
}

/** Wipe stored attempts. Exposed for tests + future "reset progress"
 *  affordances. */
export function clearAllChallengeAttempts(): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
