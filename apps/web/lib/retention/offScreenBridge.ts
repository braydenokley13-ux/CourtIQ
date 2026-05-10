/**
 * Phase 7 (seed)
 * The Off-Screen Bridge — translating recognition to real basketball.
 *
 * Pure-data, deterministic module that produces at most ONE
 * "watch lens" per qualifying day (a single coaching sentence the
 * user takes into a real game) and ONE follow-up reflection
 * (a yes / not-yet question 1-3 days later).
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No DOM. No clocks. No analytics calls. No
 *     network. No Math.random. Same inputs → same outputs.
 *   - Restraint cap: 2 lenses per week. Never on a 0-rep day.
 *     Never the same day as a Living Brain user-facing observation
 *     (caller passes `brainSurfacedToday` to enforce).
 *   - Onboarding silence: below MIN_SESSIONS_FOR_BRIDGE the engine
 *     is silent.
 *   - Vocabulary is a small fixed table. No string templating, no
 *     generation, no per-user copy variation.
 *   - The bridge never reads or surfaces analytics. Reflection
 *     yes/no is recorded by the caller; this module just emits the
 *     prompt.
 *   - No video, no clips, no UGC, no notifications outside the app.
 *
 * Companion seed to:
 *   - apps/web/lib/pathways/livingBrain.ts (Phase 6)
 *
 * Consumers (none yet wired — landed file-only as the seed):
 *   - Home card slot: render `WatchLens.copy` line.
 *   - Reflection card: render `ReflectionPrompt.copy` + 2 buttons.
 *   - Daily snapshot job: call getWatchLens after Brain.
 *   - Routing: increment per-decoder `transferEvents` on yes.
 */

import type { DecoderTag, PathwayArchetype } from '../pathways/types'

// --- input shape -----------------------------------------------------------

/**
 * Compact per-decoder summary the bridge needs. Sourced from the
 * existing aggregates the Living Brain already builds — the bridge
 * does not add new instrumentation.
 */
export interface BridgeDecoderSignal {
  decoder: DecoderTag
  /** Reached the `recognizing` threshold within this many days. Null
   *  if not freshly recognized. */
  daysSinceFreshlyLearned: number | null
  /** Days since last rep. Drives dormant-recall. */
  daysSinceLastRep: number
  /** Trailing-window growth slope (Δaccuracy/day). Drives growth_check. */
  growthSlopePerDay: number | null
  /** Whether this decoder has crossed `recognizing` ever. Required
   *  for any lens to fire — real-game transfer demands prior synthetic
   *  recognition. */
  hasRecognized: boolean
}

export interface BridgeSnapshot {
  /** ISO date the snapshot was computed. */
  asOf: string
  /** ISO weekday — 0=Sun..6=Sat. */
  dayOfWeek: number
  /** Total session count to date. Drives onboarding silence. */
  totalSessions: number
  /** Did the user run at least one rep today? */
  repsToday: number
  /** Did the Living Brain surface a user-facing observation today? */
  brainSurfacedToday: boolean
  /** Per-decoder summaries. */
  decoders: ReadonlyArray<BridgeDecoderSignal>
  /** Earned archetype, if any. Drives `archetype_lean` lens framing. */
  earnedArchetype?: PathwayArchetype
  /** Optional season window (MM-DD inclusive ranges) the caller
   *  decides — bridge stays calendar-blind otherwise. */
  seasonWindow?: 'march_madness' | 'nba_finals' | 'none'
  /** User preference for which days they typically watch basketball. */
  preferredWatchDays: 'fri-sun' | 'any'
}

/** Caller-persisted history of bridge surfaces. Cooldowns are
 *  enforced via this — the bridge module never reads storage. */
export interface BridgeHistory {
  /** ISO date of last surface keyed by `${kind}:${decoder ?? 'any'}`. */
  lastSurfacedByKey: Readonly<Record<string, string>>
  /** Lenses surfaced this rolling 7d window. Caller GCs. */
  surfacedThisWeek: number
  /** Active lens awaiting reflection — { kind, decoder?, surfacedAt }.
   *  null when no reflection is pending. */
  pendingReflection: PendingReflection | null
}

export interface PendingReflection {
  kind: WatchLensKind
  decoder?: DecoderTag
  surfacedAt: string
}

export const EMPTY_BRIDGE_HISTORY: BridgeHistory = Object.freeze({
  lastSurfacedByKey: Object.freeze({}),
  surfacedThisWeek: 0,
  pendingReflection: null,
})

// --- output shape ----------------------------------------------------------

export type WatchLensKind =
  | 'freshly_learned'
  | 'growth_check'
  | 'archetype_lean'
  | 'dormant_recall'
  | 'season_lens'

export interface WatchLens {
  kind: WatchLensKind
  decoder?: DecoderTag
  /** Plain-English coach copy. ≤ 12 words. No numbers. */
  copy: string
}

export interface ReflectionPrompt {
  kind: WatchLensKind
  decoder?: DecoderTag
  /** Plain-English yes/not-yet question. */
  copy: string
}

// --- thresholds + cooldowns ------------------------------------------------

export const MIN_SESSIONS_FOR_BRIDGE = 6
export const MAX_LENSES_PER_WEEK = 2

/** Days between a lens and its reflection prompt. The bridge lets a
 *  weekend or two of basketball-watching pass before asking. */
export const REFLECTION_MIN_DAYS = 1
export const REFLECTION_MAX_DAYS = 4

/** Per-kind cooldown days. */
export const LENS_COOLDOWN_DAYS: Record<WatchLensKind, number> = {
  freshly_learned: 14,
  growth_check: 21,
  archetype_lean: 30,
  dormant_recall: 14,
  season_lens: 7,
}

const FRESHLY_LEARNED_WINDOW_DAYS = 7
const GROWTH_SLOPE_THRESHOLD = 0.012
const DORMANT_DAYS_THRESHOLD = 14

// --- copy vocabulary -------------------------------------------------------

const FRESHLY_LEARNED_COPY: Partial<Record<DecoderTag, string>> = {
  BACKDOOR_WINDOW: 'Watch the denial defender’s eyes tonight.',
  EMPTY_SPACE_CUT: 'Watch help defenders turn their hips tonight.',
  SKIP_THE_ROTATION: 'Watch for two defenders pulled to one side.',
  ADVANTAGE_OR_RESET: 'Watch closeout speed in one game tonight.',
}

const GROWTH_CHECK_COPY: Partial<Record<DecoderTag, string>> = {
  BACKDOOR_WINDOW: 'See if you can spot a backdoor in a real game.',
  EMPTY_SPACE_CUT: 'Catch one help-rotation cut this weekend.',
  SKIP_THE_ROTATION: 'See a skip pass land tonight if you can.',
  ADVANTAGE_OR_RESET: 'Spot one bad closeout in a real game.',
}

const DORMANT_RECALL_COPY: Partial<Record<DecoderTag, string>> = {
  BACKDOOR_WINDOW: 'Backdoor windows — see one tonight if you can.',
  EMPTY_SPACE_CUT: 'Empty-space cuts — see one tonight if you can.',
  SKIP_THE_ROTATION: 'Skip passes — see one tonight if you can.',
  ADVANTAGE_OR_RESET: 'Closeouts — watch one quality tonight.',
}

const ARCHETYPE_LEAN_COPY: Record<PathwayArchetype, string> = {
  'cutter': 'Cutters notice denial first. Watch eye direction.',
  'connector': 'Connectors notice when help leaves the corner.',
  'attacker': 'Attackers read closeout speed. Watch one tonight.',
  'floor-general': 'Watch the weak side. Floor generals read it.',
  'off-ball-weapon': 'Off-ball shooters watch closeout cushion.',
  'help-defender-punisher': 'Watch help defenders turn — punish their commit.',
  'ball-watcher': '', // never surfaces
}

const SEASON_LENS_COPY: Record<NonNullable<BridgeSnapshot['seasonWindow']>, string> = {
  march_madness: 'Tournament weekend — watch one help rotation per game.',
  nba_finals: 'Finals tonight — watch closeout balance every possession.',
  none: '',
}

const FRESHLY_LEARNED_REFLECTION: Partial<Record<DecoderTag, string>> = {
  BACKDOOR_WINDOW: 'Did you spot one denial last time you watched?',
  EMPTY_SPACE_CUT: 'Catch a help defender turn this weekend?',
  SKIP_THE_ROTATION: 'See a skip pass land?',
  ADVANTAGE_OR_RESET: 'Notice closeout balance in a real game?',
}

const GROWTH_CHECK_REFLECTION: Partial<Record<DecoderTag, string>> = {
  BACKDOOR_WINDOW: 'Catch a backdoor window in a real game?',
  EMPTY_SPACE_CUT: 'Catch a help-rotation cut this weekend?',
  SKIP_THE_ROTATION: 'See a skip pass go for a shot?',
  ADVANTAGE_OR_RESET: 'Spot one bad closeout?',
}

const DORMANT_RECALL_REFLECTION: Partial<Record<DecoderTag, string>> = {
  BACKDOOR_WINDOW: 'See a backdoor read in a real game?',
  EMPTY_SPACE_CUT: 'Catch an empty-space cut?',
  SKIP_THE_ROTATION: 'See a skip pass tonight?',
  ADVANTAGE_OR_RESET: 'Spot a closeout you’d attack?',
}

const ARCHETYPE_LEAN_REFLECTION: Record<PathwayArchetype, string> = {
  'cutter': 'Notice denial reads this week?',
  'connector': 'Notice the help corner this week?',
  'attacker': 'Spot a closeout you’d have attacked?',
  'floor-general': 'Read the weak side this week?',
  'off-ball-weapon': 'Catch a closeout cushion you liked?',
  'help-defender-punisher': 'Punish the helper in your head this week?',
  'ball-watcher': '',
}

const SEASON_LENS_REFLECTION = 'Catch a read this weekend?'

// --- helpers ---------------------------------------------------------------

function lensKey(kind: WatchLensKind, decoder?: DecoderTag): string {
  return `${kind}:${decoder ?? 'any'}`
}

function daysBetween(asOfIso: string, lastIso: string): number {
  const a = Date.parse(asOfIso)
  const b = Date.parse(lastIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity
  return Math.floor((a - b) / (24 * 60 * 60 * 1000))
}

function cooldownActive(
  history: BridgeHistory,
  kind: WatchLensKind,
  decoder: DecoderTag | undefined,
  asOf: string,
): boolean {
  const last = history.lastSurfacedByKey[lensKey(kind, decoder)]
  if (!last) return false
  return daysBetween(asOf, last) < LENS_COOLDOWN_DAYS[kind]
}

function isWatchDay(snapshot: BridgeSnapshot): boolean {
  if (snapshot.preferredWatchDays === 'any') return true
  // 0=Sun, 5=Fri, 6=Sat
  return (
    snapshot.dayOfWeek === 0 ||
    snapshot.dayOfWeek === 5 ||
    snapshot.dayOfWeek === 6
  )
}

// --- public API ------------------------------------------------------------

/**
 * Returns the watch lens to surface today, or null. Pure: same
 * inputs → same output.
 *
 * Resolution order (first match wins):
 *   1. season_lens          (calendar-driven, 7d cooldown)
 *   2. archetype_lean       (only if archetype earned)
 *   3. freshly_learned      (decoder reached recognizing within 7d)
 *   4. growth_check         (sustained slope on a recognized decoder)
 *   5. dormant_recall       (recognized decoder dormant 14+d)
 *
 * Returns null when:
 *   - totalSessions < MIN_SESSIONS_FOR_BRIDGE
 *   - repsToday === 0
 *   - brainSurfacedToday === true
 *   - !isWatchDay(snapshot)
 *   - surfacedThisWeek >= MAX_LENSES_PER_WEEK
 *   - no candidate qualifies / all candidates on cooldown
 */
export function getWatchLens(
  snapshot: BridgeSnapshot,
  history: BridgeHistory,
): WatchLens | null {
  if (snapshot.totalSessions < MIN_SESSIONS_FOR_BRIDGE) return null
  if (snapshot.repsToday <= 0) return null
  if (snapshot.brainSurfacedToday) return null
  if (!isWatchDay(snapshot)) return null
  if (history.surfacedThisWeek >= MAX_LENSES_PER_WEEK) return null

  // 1. season_lens
  if (snapshot.seasonWindow && snapshot.seasonWindow !== 'none') {
    if (!cooldownActive(history, 'season_lens', undefined, snapshot.asOf)) {
      const copy = SEASON_LENS_COPY[snapshot.seasonWindow]
      if (copy) return { kind: 'season_lens', copy }
    }
  }

  // 2. archetype_lean
  if (
    snapshot.earnedArchetype &&
    snapshot.earnedArchetype !== 'ball-watcher' &&
    !cooldownActive(history, 'archetype_lean', undefined, snapshot.asOf)
  ) {
    const copy = ARCHETYPE_LEAN_COPY[snapshot.earnedArchetype]
    if (copy) return { kind: 'archetype_lean', copy }
  }

  // 3. freshly_learned — most recent qualifying decoder.
  const fresh = snapshot.decoders
    .filter(
      (d) =>
        d.hasRecognized &&
        d.daysSinceFreshlyLearned !== null &&
        d.daysSinceFreshlyLearned <= FRESHLY_LEARNED_WINDOW_DAYS &&
        !cooldownActive(history, 'freshly_learned', d.decoder, snapshot.asOf),
    )
    .sort((a, b) => (a.daysSinceFreshlyLearned ?? 999) - (b.daysSinceFreshlyLearned ?? 999))
  if (fresh[0]) {
    const copy = FRESHLY_LEARNED_COPY[fresh[0].decoder]
    // Pack 2 — TODO(pack-2): emit once copy is authored.
    if (copy) return { kind: 'freshly_learned', decoder: fresh[0].decoder, copy }
  }

  // 4. growth_check — strongest qualifying slope.
  const growth = snapshot.decoders
    .filter(
      (d) =>
        d.hasRecognized &&
        d.growthSlopePerDay !== null &&
        d.growthSlopePerDay >= GROWTH_SLOPE_THRESHOLD &&
        !cooldownActive(history, 'growth_check', d.decoder, snapshot.asOf),
    )
    .sort((a, b) => (b.growthSlopePerDay ?? 0) - (a.growthSlopePerDay ?? 0))
  if (growth[0]) {
    const copy = GROWTH_CHECK_COPY[growth[0].decoder]
    if (copy) return { kind: 'growth_check', decoder: growth[0].decoder, copy }
  }

  // 5. dormant_recall — longest dormant qualifying decoder.
  const dormant = snapshot.decoders
    .filter(
      (d) =>
        d.hasRecognized &&
        d.daysSinceLastRep >= DORMANT_DAYS_THRESHOLD &&
        !cooldownActive(history, 'dormant_recall', d.decoder, snapshot.asOf),
    )
    .sort((a, b) => b.daysSinceLastRep - a.daysSinceLastRep)
  if (dormant[0]) {
    const copy = DORMANT_RECALL_COPY[dormant[0].decoder]
    if (copy) return { kind: 'dormant_recall', decoder: dormant[0].decoder, copy }
  }

  return null
}

/**
 * Returns the reflection prompt the bridge should ask today, or
 * null. The prompt fires REFLECTION_MIN_DAYS to REFLECTION_MAX_DAYS
 * after the lens was surfaced. After that window the prompt expires
 * silently — the bridge does not nag.
 *
 * Returns null when:
 *   - history.pendingReflection is null
 *   - asOf < surfacedAt + REFLECTION_MIN_DAYS
 *   - asOf > surfacedAt + REFLECTION_MAX_DAYS
 *   - the lens kind has no reflection (season_lens may, may not)
 */
export function getReflectionPrompt(
  pending: PendingReflection | null,
  asOf: string,
  earnedArchetype?: PathwayArchetype,
): ReflectionPrompt | null {
  if (!pending) return null
  const days = daysBetween(asOf, pending.surfacedAt)
  if (days < REFLECTION_MIN_DAYS || days > REFLECTION_MAX_DAYS) return null

  switch (pending.kind) {
    case 'freshly_learned': {
      if (!pending.decoder) return null
      const copy = FRESHLY_LEARNED_REFLECTION[pending.decoder]
      if (!copy) return null // Pack 2 — TODO(pack-2): author reflection copy
      return { kind: pending.kind, decoder: pending.decoder, copy }
    }
    case 'growth_check': {
      if (!pending.decoder) return null
      const copy = GROWTH_CHECK_REFLECTION[pending.decoder]
      if (!copy) return null
      return { kind: pending.kind, decoder: pending.decoder, copy }
    }
    case 'dormant_recall': {
      if (!pending.decoder) return null
      const copy = DORMANT_RECALL_REFLECTION[pending.decoder]
      if (!copy) return null
      return { kind: pending.kind, decoder: pending.decoder, copy }
    }
    case 'archetype_lean':
      if (!earnedArchetype || earnedArchetype === 'ball-watcher') return null
      return {
        kind: pending.kind,
        copy: ARCHETYPE_LEAN_REFLECTION[earnedArchetype],
      }
    case 'season_lens':
      return { kind: pending.kind, copy: SEASON_LENS_REFLECTION }
    default:
      return null
  }
}

/** Test/debug helper — returns the lens-key the persistence layer
 *  uses, exported so tests + storage stay in sync. */
export function _lensKeyForTest(kind: WatchLensKind, decoder?: DecoderTag): string {
  return lensKey(kind, decoder)
}
