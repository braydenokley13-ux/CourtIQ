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

export const ALL_DECODERS: DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
  'ADVANTAGE_OR_RESET',
] as DecoderTag[]

/** Lightweight Attempt + Scenario shape the glue accepts. Decoupled
 *  from Prisma's full row types so call sites can pass pared-down
 *  selects without casting. */
export interface AttemptWithScenario {
  is_correct: boolean
  time_ms: number
  created_at: Date
  scenario: Pick<Scenario, 'decoder_tag' | 'sub_concepts' | 'difficulty'>
}

/** Full Scenario+choices shape the catalog builders accept. */
export type ScenarioWithChoices = Scenario & { choices: ScenarioChoice[] }

/**
 * Build per-decoder DecoderConfidence[] from raw Attempt rows.
 *
 * Choice quality is approximated as `'best' | 'wrong'` because the
 * Attempt table doesn't denormalize ScenarioChoice.quality (Phase 10
 * fix). The approximation only affects the `missed_acceptable` class
 * — band promotion and nextProbe selection are robust to it.
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
      choiceQuality: a.is_correct ? 'best' : 'wrong',
      timeMs: a.time_ms,
      createdAt: a.created_at,
    })
    byDecoder.set(tag, list)
  }

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
      // Replay-view telemetry isn't tracked yet — see scenarioService
      // header note. Pass 0 so mystery-mode never spuriously triggers.
      recentReplayViews: 0,
    })
  })
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
