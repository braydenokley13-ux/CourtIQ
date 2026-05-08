/**
 * Phase 9 — Spine glue layer.
 *
 * Pure functions that turn DB row shapes into the spine module input
 * shapes. Promoted out of `scenarioService.ts` so the routing rewrite
 * has a stable, tested seam between Prisma and the pure spine
 * composers.
 *
 * No I/O, no Prisma client imports. Callers hydrate the inputs from
 * Prisma and feed them in.
 */
import type { DecoderTag, Scenario, ScenarioChoice } from '@prisma/client'
import {
  type AdaptiveAttempt,
  type DecoderConfidence,
  type NextProbe,
  computeDecoderConfidence,
} from '@/lib/adaptive'
import { type CatalogScenario, parseScenarioVariantTags } from '@/lib/firstSession'
import type { ReturnCatalogScenario, ReturnSlot } from '@/lib/returnLoop'
import { recognitionReason } from '@/lib/recognitionSurface'

/** Default freshness window — scenarios added within this many days
 *  before the player's last session count as "fresh" for the
 *  return-loop composer. Mirrors strategy §6. */
export const RETURN_FRESHNESS_DAYS = 14

/** Founder decoder set (Pack 1). The home decoder ring renders
 *  exactly these four whether or not the player has touched them, so
 *  the strip looks consistent for every founder-pack player. Pack 2
 *  decoders (`READ_THE_COVERAGE`, `HUNT_THE_ADVANTAGE`) are
 *  intentionally NOT here — admitting them unconditionally would
 *  surface "ghost rings" for founders before any LIVE Pack 2
 *  scenario ships. They get added per-player once the catalog and
 *  the player's own attempt history reach them; see
 *  `decoderTagsFromAttempts` and `decoderTagsInCatalog`. */
export const ALL_DECODERS: DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
  'ADVANTAGE_OR_RESET',
] as DecoderTag[]

/** Decoder tags the player has actually attempted, deduped, in the
 *  order they first appear in the input. Pure helper. Pack-2-aware
 *  consumers union this with `ALL_DECODERS` to surface confidence
 *  rows for `READ_THE_COVERAGE` / `HUNT_THE_ADVANTAGE` once the
 *  player has at least one attempt on them, without causing founders
 *  with zero Pack 2 history to grow phantom rings. Attempts whose
 *  scenario has a null `decoder_tag` (legacy fixtures) are dropped. */
export function decoderTagsFromAttempts(
  attempts: readonly AttemptWithScenario[],
): DecoderTag[] {
  const seen = new Set<string>()
  const out: DecoderTag[] = []
  for (const a of attempts) {
    const tag = a.scenario.decoder_tag
    if (!tag) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

/** Decoder tags present in a LIVE-scenario catalog, deduped, in the
 *  order they first appear. Pure helper. Used by future routing
 *  layers to gate Pack 2 admission on actual catalog content
 *  ("READ_THE_COVERAGE rings only if at least one LIVE
 *  READ_THE_COVERAGE scenario exists") rather than on the schema
 *  enum (which advances ahead of authored content). */
export function decoderTagsInCatalog(
  scenarios: readonly Pick<Scenario, 'decoder_tag'>[],
): DecoderTag[] {
  const seen = new Set<string>()
  const out: DecoderTag[] = []
  for (const s of scenarios) {
    const tag = s.decoder_tag
    if (!tag) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

/** Lightweight Attempt + Scenario shape the glue accepts. Decoupled
 *  from Prisma's full row types so call sites can pass pared-down
 *  selects without casting.
 *
 *  Phase 10 — `choice_quality` is denormalized onto Attempt rows on
 *  write. Pre-Phase-10 rows have `null` here; the glue falls back to
 *  the legacy `correct → best, wrong → wrong` proxy when it sees one.
 *
 *  Phase 11 — `replay_count` records how many times the player re-
 *  watched the demo on this rep. Pre-Phase-11 rows are 0 by column
 *  default. The glue sums the most recent 5 attempts globally to
 *  drive the Phase 4 `mystery-mode` probe.
 */
export interface AttemptWithScenario {
  is_correct: boolean
  choice_quality?: 'best' | 'acceptable' | 'wrong' | null
  replay_count?: number
  time_ms: number
  created_at: Date
  scenario: Pick<Scenario, 'decoder_tag' | 'sub_concepts' | 'difficulty'>
}

/** How many of the player's most recent attempts (across all
 *  decoders) feed into `recentReplayViews`. Matches strategy §4 —
 *  "the last 5 reps", any decoder, sums replay views. */
export const REPLAY_VIEW_WINDOW = 5

/** Full Scenario+choices shape the catalog builders accept. */
export type ScenarioWithChoices = Scenario & { choices: ScenarioChoice[] }

/**
 * Build per-decoder DecoderConfidence[] from raw Attempt rows.
 *
 * Phase 10 — reads the denormalized `choice_quality` column when
 * present so band promotion sees the real `best | acceptable |
 * wrong` signal. Pre-Phase-10 rows (null) fall back to the legacy
 * `correct → best, wrong → wrong` proxy.
 */
export function buildDecoderConfidences(
  attempts: readonly AttemptWithScenario[],
  now: Date,
): DecoderConfidence[] {
  const byDecoder = new Map<string, AdaptiveAttempt[]>()
  for (const a of attempts) {
    const tag = a.scenario.decoder_tag
    if (!tag) continue
    const v = parseScenarioVariantTags(a.scenario.sub_concepts ?? [])
    const list = byDecoder.get(tag) ?? []
    list.push({
      decoderTag: tag,
      templateId: v.templateId,
      signature: v.signature,
      disguise: v.disguise,
      difficulty: a.scenario.difficulty,
      isCorrect: a.is_correct,
      choiceQuality: resolveChoiceQuality(a),
      timeMs: a.time_ms,
      createdAt: a.created_at,
    })
    byDecoder.set(tag, list)
  }

  // Phase 11 — sum replay_count across the most recent
  // REPLAY_VIEW_WINDOW=5 attempts globally (any decoder). The
  // adaptive layer flips to mystery-mode when this exceeds its
  // threshold (default ≥3). The input list is oldest-first by
  // contract, so .slice(-N) is the trailing window.
  const recentReplayViews = attempts
    .slice(-REPLAY_VIEW_WINDOW)
    .reduce((acc, a) => acc + (a.replay_count ?? 0), 0)

  return ALL_DECODERS.map((tag) => {
    const decoderAttempts = byDecoder.get(tag) ?? []
    const last = decoderAttempts[decoderAttempts.length - 1]
    const days = last
      ? Math.floor((now.getTime() - last.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      : Number.POSITIVE_INFINITY
    return computeDecoderConfidence({
      decoderTag: tag,
      attempts: decoderAttempts,
      daysSinceLastAttempt: Number.isFinite(days) ? days : 9999,
      recentReplayViews,
    })
  })
}

/**
 * Pick the ChoiceQuality used by the adaptive classifier. Prefers
 * the row's denormalized value (Phase 10) and falls back to the
 * legacy proxy when it's missing — this keeps reads honest while
 * pre-migration rows phase out naturally.
 *
 * Exported so the contract is unit-testable in isolation.
 */
export function resolveChoiceQuality(
  a: Pick<AttemptWithScenario, 'is_correct' | 'choice_quality'>,
): 'best' | 'acceptable' | 'wrong' {
  if (a.choice_quality === 'best' || a.choice_quality === 'acceptable' || a.choice_quality === 'wrong') {
    return a.choice_quality
  }
  return a.is_correct ? 'best' : 'wrong'
}

/** Build the firstSession composer's CatalogScenario[] from LIVE
 *  scenario rows. The composer uses sub_concepts to read template +
 *  signature + disguise + mirror flags. */
export function buildFirstSessionCatalog(
  scenarios: readonly ScenarioWithChoices[],
): CatalogScenario[] {
  return scenarios.map((s) => {
    const v = parseScenarioVariantTags(s.sub_concepts ?? [])
    return {
      id: s.id,
      decoderTag: s.decoder_tag,
      templateId: v.templateId,
      signature: v.signature,
      disguise: v.disguise,
      mirror: v.mirror,
      difficulty: s.difficulty,
    }
  })
}

/** Build the returnLoop composer's ReturnCatalogScenario[]. The
 *  `isFresh` flag is derived from `created_at` against
 *  (lastSessionAt - RETURN_FRESHNESS_DAYS). When the user has no
 *  prior session at all, nothing is fresh. */
export function buildReturnCatalog(
  scenarios: readonly ScenarioWithChoices[],
  lastSessionAt: Date | null,
  freshnessDays: number = RETURN_FRESHNESS_DAYS,
): ReturnCatalogScenario[] {
  const freshCutoff = lastSessionAt
    ? new Date(lastSessionAt.getTime() - freshnessDays * 24 * 60 * 60 * 1000)
    : null
  return scenarios.map((s) => {
    const v = parseScenarioVariantTags(s.sub_concepts ?? [])
    const isFresh = freshCutoff ? s.created_at > freshCutoff : false
    return {
      id: s.id,
      decoderTag: s.decoder_tag,
      templateId: v.templateId,
      difficulty: s.difficulty,
      isFresh,
    }
  })
}

/**
 * Pick the recognition-reason eyebrow for a return-loop slot.
 * Anchors fall through to the per-decoder nextProbe (so a player on
 * a 3-recognized streak still sees disguise-up framing on an anchor
 * rep). Transfer + fresh slots use fixed reasons regardless of the
 * decoder's current band.
 */
export function recognitionReasonForReturnSlot(
  slot: ReturnSlot | null,
  conf: DecoderConfidence | undefined,
): string | null {
  if (!slot) return null
  if (slot === 'transfer') return recognitionReason('transfer-probe')
  if (slot === 'fresh') return recognitionReason('maintain')
  const probe: NextProbe = conf?.nextProbe ?? 'maintain'
  return recognitionReason(probe)
}
