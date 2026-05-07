/**
 * Phase 7 — Daily Challenge: per-user composer.
 *
 * Wraps the deterministic `seedDailyChallenge` with the single
 * personalization the daily allows: a transfer-probe swap when the
 * player has a memorization signal on one of the day's decoders.
 *
 * The shareable result string is computed against the GLOBAL seed
 * (not the per-user swap), so two players sharing "4/5 14.2s" can
 * compare even though their slot-3 may have differed. The slot is
 * still marked recognized/missed based on what the user actually
 * answered — which is honest because Mystery Mode hides the decoder
 * either way.
 */
import type { DecoderConfidence } from '../adaptive/types'
import { seedDailyChallenge, type DailyCatalogScenario } from './seed'

export interface ComposeDailyInput {
  utcDate: Date
  catalog: readonly DailyCatalogScenario[]
  /** Decoder confidences from Phase 4. Used to pick the transfer-probe
   *  swap target. Pass an empty array for brand-new players — the
   *  composer becomes a pass-through to the global seed. */
  decoderConfidences: readonly DecoderConfidence[]
}

export interface DailyChallengeBundle {
  available: boolean
  /** UTC date string ("YYYY-MM-DD") of the challenge. */
  date: string
  /** Per-user ordered scenario ids — identical to global seed unless
   *  the personalization swapped one slot. */
  scenarioIds: string[]
  /** When set, indicates the index in `scenarioIds` that was swapped
   *  for transfer-probe personalization. The shareable result still
   *  scores against the global slot — see `result.ts`. */
  swappedSlotIndex: number | null
  /** UI mode flag — daily challenge always uses Mystery Mode. */
  mysteryMode: true
  catalogIncomplete: boolean
  seedKey: string
  globalScenarioIds: string[]
}

export function composeDailyChallenge(input: ComposeDailyInput): DailyChallengeBundle {
  const seed = seedDailyChallenge({ utcDate: input.utcDate, catalog: input.catalog })
  const dateKey = utcDateKey(input.utcDate)

  if (!seed.available) {
    return {
      available: false,
      date: dateKey,
      scenarioIds: [],
      swappedSlotIndex: null,
      mysteryMode: true,
      catalogIncomplete: true,
      seedKey: '',
      globalScenarioIds: [],
    }
  }

  // Identify a swap candidate: the player's memorization-flagged
  // decoder, if any of today's slots land on it.
  const memorizationDecoder = pickMemorizationDecoder(input.decoderConfidences)
  let swappedSlotIndex: number | null = null
  const scenarioIds = [...seed.scenarioIds]

  if (memorizationDecoder) {
    const slotIdx = seed.slotPicks.findIndex(
      (p) => p.slot.kind !== 'boss' && p.slot.decoder === memorizationDecoder.decoderTag,
    )
    if (slotIdx >= 0) {
      const picked = seed.slotPicks[slotIdx]!
      const currentTpl = input.catalog.find((c) => c.id === picked.scenarioId)?.templateId ?? null
      const swapCandidate = pickTransferSwap({
        catalog: input.catalog,
        decoderTag: memorizationDecoder.decoderTag,
        excludeTemplateId: currentTpl,
        excludeIds: new Set(scenarioIds),
      })
      if (swapCandidate) {
        scenarioIds[slotIdx] = swapCandidate.id
        swappedSlotIndex = slotIdx
      }
    }
  }

  return {
    available: true,
    date: dateKey,
    scenarioIds,
    swappedSlotIndex,
    mysteryMode: true,
    catalogIncomplete: seed.catalogIncomplete,
    seedKey: seed.seedKey,
    globalScenarioIds: seed.scenarioIds,
  }
}

function pickMemorizationDecoder(
  confidences: readonly DecoderConfidence[],
): DecoderConfidence | null {
  // Player has memorization signal when:
  //   - they're at recognizing+ on a decoder
  //   - transferTemplates === 1 (only one template has been recognized)
  //   - attempts >= 4 (enough signal)
  const candidates = confidences.filter(
    (c) =>
      (c.band === 'recognizing' || c.band === 'reflexive') &&
      c.evidence.transferTemplates === 1 &&
      c.evidence.attempts >= 4,
  )
  if (candidates.length === 0) return null
  // Prefer the decoder whose nextProbe is already 'transfer-probe' —
  // the engine has already flagged it.
  const flagged = candidates.find((c) => c.nextProbe === 'transfer-probe')
  return flagged ?? candidates[0]!
}

function pickTransferSwap(input: {
  catalog: readonly DailyCatalogScenario[]
  decoderTag: string
  excludeTemplateId: string | null
  excludeIds: Set<string>
}): DailyCatalogScenario | null {
  const cands = input.catalog
    .filter(
      (s) =>
        s.isLive &&
        s.decoderTag === input.decoderTag &&
        s.templateId !== null &&
        s.templateId !== input.excludeTemplateId &&
        !input.excludeIds.has(s.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
  return cands[0] ?? null
}

function utcDateKey(d: Date): string {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
