/**
 * Phase 6 — Return Loop composer.
 *
 * Produces a deterministic 5-rep bundle tuned to the player's return
 * context. Pure function — caller hydrates the inputs (decoder
 * confidences from Phase 4 + the LIVE catalog) and feeds them in.
 *
 * Each context has a *shape* — the slot structure of the 5 reps:
 *
 *   next-day    →  [anchor, anchor, anchor, anchor, transfer]
 *   within-week →  [anchor, anchor, fresh, fresh, transfer]
 *   lapsed      →  [anchor-strongest, anchor-strongest, anchor-strongest,
 *                    fresh, fresh]
 *   long-lapsed →  defers to firstSession with bands preserved
 *   dormant     →  defers to firstSession with bands preserved
 *
 * The composer never invents content. If the catalog can't satisfy a
 * slot, it falls back to the same anchor it would have used and
 * announces the downgrade.
 */
import type { DecoderConfidence } from '../adaptive/types'
import type { ReturnContext } from './classifyReturn'
import { decoderLabel, todaysFocusLine } from '../recognitionSurface/copyForBand'

export interface ReturnCatalogScenario {
  id: string
  decoderTag: string | null
  templateId: string | null
  difficulty: number
  /** True when the scenario was added to LIVE within the freshness
   *  window (typically 14d before the user's last session). */
  isFresh: boolean
}

export type ReturnSlot =
  /** Recognition anchor — strongest decoder, easy disguise. */
  | 'anchor'
  /** Strongest-decoder anchor specifically (used by lapsed). */
  | 'anchor-strongest'
  /** Different template within a known decoder. */
  | 'transfer'
  /** Scenario added since the player's last session. */
  | 'fresh'

export interface ComposedReturnRep {
  scenarioId: string
  slot: ReturnSlot
  downgrades: string[]
}

export interface ComposedReturnSession {
  context: ReturnContext
  banner: string | null
  /** The "today's focus" line for /home, derived from the same
   *  decoder list. Null when no in-progress decoders exist. */
  focusLine: string | null
  reps: ComposedReturnRep[]
  /** True when at least one slot fell back below its preferred shape. */
  catalogIncomplete: boolean
}

const SLOT_SHAPES: Record<ReturnContext, readonly ReturnSlot[]> = {
  'fresh-cold': [],
  'next-session-same-day': ['anchor', 'anchor', 'transfer', 'fresh', 'anchor'],
  'next-day': ['anchor', 'anchor', 'anchor', 'anchor', 'transfer'],
  'within-week': ['anchor', 'anchor', 'fresh', 'fresh', 'transfer'],
  lapsed: ['anchor-strongest', 'anchor-strongest', 'anchor-strongest', 'fresh', 'fresh'],
  'long-lapsed': [], // caller defers to firstSession composer
  dormant: [], // caller defers to firstSession composer
}

/** Returns the strongest in-progress decoder, or null when there are
 *  none. "Strongest" prefers reflexive over recognizing, then ties
 *  break on lower latency. */
export function strongestDecoder(decoders: readonly DecoderConfidence[]): DecoderConfidence | null {
  const inProgress = decoders.filter((d) => d.band === 'recognizing' || d.band === 'reflexive')
  if (inProgress.length === 0) return null
  return [...inProgress].sort((a, b) => {
    const rank = bandRank(b.band) - bandRank(a.band)
    if (rank !== 0) return rank
    const al = a.evidence.p50LatencyMs ?? Number.POSITIVE_INFINITY
    const bl = b.evidence.p50LatencyMs ?? Number.POSITIVE_INFINITY
    return al - bl
  })[0]!
}

function bandRank(b: DecoderConfidence['band']): number {
  return { untested: 0, recognizing: 1, reflexive: 2, mastered: 3 }[b]
}

/**
 * Pick the next scenario for a slot. Deterministic: candidates are
 * sorted by id and the first match wins. The caller passes a
 * `usedIds` set to prevent duplicate selections within one bundle.
 */
function pickForSlot(
  slot: ReturnSlot,
  decoders: readonly DecoderConfidence[],
  catalog: readonly ReturnCatalogScenario[],
  usedIds: Set<string>,
): { scenarioId: string; downgrades: string[] } | null {
  const downgrades: string[] = []
  let pool = catalog.filter((s) => !usedIds.has(s.id))
  if (pool.length === 0) {
    pool = [...catalog]
    downgrades.push('reused-from-earlier-rep')
  }

  const strongest = strongestDecoder(decoders)

  if (slot === 'anchor' || slot === 'anchor-strongest') {
    if (strongest) {
      const anchor = pool.filter((s) => s.decoderTag === strongest.decoderTag && s.difficulty <= 2)
      if (anchor.length > 0) {
        anchor.sort((a, b) => a.id.localeCompare(b.id))
        return { scenarioId: anchor[0]!.id, downgrades }
      }
      downgrades.push('no-anchor-match')
    } else {
      downgrades.push('no-strongest-decoder')
    }
  }

  if (slot === 'transfer') {
    const used = [...usedIds]
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is ReturnCatalogScenario => Boolean(c))
    const usedTemplates = new Set(used.map((c) => c.templateId).filter(Boolean) as string[])
    if (strongest) {
      const xfer = pool.filter(
        (s) =>
          s.decoderTag === strongest.decoderTag &&
          s.templateId !== null &&
          !usedTemplates.has(s.templateId),
      )
      if (xfer.length > 0) {
        xfer.sort((a, b) => a.id.localeCompare(b.id))
        return { scenarioId: xfer[0]!.id, downgrades }
      }
      downgrades.push('no-transfer-match')
    }
  }

  if (slot === 'fresh') {
    const fresh = pool.filter((s) => s.isFresh)
    if (fresh.length > 0) {
      fresh.sort((a, b) => a.id.localeCompare(b.id))
      return { scenarioId: fresh[0]!.id, downgrades }
    }
    downgrades.push('no-fresh-match')
  }

  // Final fallback: any candidate, deterministic.
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id))
  if (sorted.length === 0) return null
  return { scenarioId: sorted[0]!.id, downgrades }
}

export interface ComposeReturnInput {
  context: ReturnContext
  banner: string | null
  decoders: readonly DecoderConfidence[]
  catalog: readonly ReturnCatalogScenario[]
}

export function composeReturnSession(input: ComposeReturnInput): ComposedReturnSession {
  const shape = SLOT_SHAPES[input.context]
  if (shape.length === 0) {
    // fresh-cold / long-lapsed / dormant — caller routes to the
    // firstSession composer. We still hand back a useful focus line
    // so the home screen can render something honest.
    return {
      context: input.context,
      banner: input.banner,
      focusLine: todaysFocusLine(input.decoders),
      reps: [],
      catalogIncomplete: true,
    }
  }

  const used = new Set<string>()
  const reps: ComposedReturnRep[] = []
  let catalogIncomplete = false

  for (const slot of shape) {
    const picked = pickForSlot(slot, input.decoders, input.catalog, used)
    if (!picked) {
      catalogIncomplete = true
      continue
    }
    if (
      picked.downgrades.includes('no-anchor-match') ||
      picked.downgrades.includes('no-fresh-match') ||
      picked.downgrades.includes('no-transfer-match') ||
      picked.downgrades.includes('reused-from-earlier-rep')
    ) {
      catalogIncomplete = true
    }
    used.add(picked.scenarioId)
    reps.push({
      scenarioId: picked.scenarioId,
      slot,
      downgrades: picked.downgrades,
    })
  }

  return {
    context: input.context,
    banner: input.banner,
    focusLine: focusLineForReturn(input),
    reps,
    catalogIncomplete,
  }
}

function focusLineForReturn(input: ComposeReturnInput): string | null {
  const strongest = strongestDecoder(input.decoders)
  if (!strongest) return todaysFocusLine(input.decoders)

  const label = decoderLabel(strongest.decoderTag)
  if (input.context === 'lapsed' || input.context === 'long-lapsed') {
    if (strongest.evidence.attempts > 0) {
      return `${label} — ${strongest.evidence.attempts} reads logged. Run it back.`
    }
  }
  if (input.context === 'dormant') {
    return `You were close on ${label}. Let's get it back.`
  }
  return todaysFocusLine(input.decoders)
}
