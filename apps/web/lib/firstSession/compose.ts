/**
 * Composes the first-session arc against the LIVE catalog.
 *
 * Pure function. The caller hydrates a CatalogScenario[] from
 * Prisma (status=LIVE) and feeds it in. The composer returns scenario
 * ids in script order, plus the per-step UI mode the train page reads.
 *
 * The composer never invents content. If the library can't satisfy a
 * step, it downgrades the preferences from right to left:
 *
 *     templateId → mirror → difficulty → decoder → ANY
 *
 * The downgrade is *announced* in the result so callers (and tests)
 * can see what happened.
 */
import { FIRST_SESSION_SCRIPT, type FirstSessionStep, type FirstSessionUiMode } from './script'

export interface CatalogScenario {
  id: string
  decoderTag: string | null
  /** Template id pulled from sub_concepts (`tpl:<id>`). null for
   *  founder-v0 scenarios. */
  templateId: string | null
  /** Variation signature pulled from sub_concepts (`sig:<...>`). */
  signature: string | null
  /** Disguise level lifted from the signature. */
  disguise: 'none' | 'light' | 'moderate' | 'heavy'
  /** True when the signature contains "mirror". */
  mirror: boolean
  difficulty: number
}

export interface ComposedStep {
  rep: number
  scenarioId: string
  uiMode: FirstSessionUiMode
  recognitionLine: FirstSessionStep['recognitionLine']
  /** Diagnostic — non-empty when the composer relaxed preferences to
   *  satisfy the step. e.g. ['no-template-match', 'no-mirror-match']. */
  downgrades: string[]
}

export interface ComposedFirstSession {
  steps: ComposedStep[]
  /** True when at least one step had to downgrade past `decoder`. */
  catalogIncomplete: boolean
}

/** Parse the disguise + mirror flags from sub_concepts. The signature
 *  prefix lives at `sig:<axes>` where axes is pipe-separated. */
export function parseScenarioVariantTags(subConcepts: string[]): {
  templateId: string | null
  signature: string | null
  disguise: 'none' | 'light' | 'moderate' | 'heavy'
  mirror: boolean
} {
  const templateTag = subConcepts.find((t) => t.startsWith('tpl:'))
  const sigTag = subConcepts.find((t) => t.startsWith('sig:'))
  const sig = sigTag?.slice('sig:'.length) ?? null
  const tplId = templateTag?.slice('tpl:'.length) ?? null
  let disguise: 'none' | 'light' | 'moderate' | 'heavy' = 'none'
  let mirror = false
  if (sig) {
    mirror = sig.startsWith('mirror|')
    const m = /\|disg:([a-z]+)/.exec(sig)
    if (m && (m[1] === 'light' || m[1] === 'moderate' || m[1] === 'heavy')) {
      disguise = m[1]
    }
  }
  return { templateId: tplId, signature: sig, disguise, mirror }
}

/**
 * Pick the best catalog scenario for one script step.
 * Returns the scenario id + the list of downgrades the composer
 * applied. Returns null only when the catalog has zero LIVE scenarios.
 */
function pickForStep(
  step: FirstSessionStep,
  catalog: CatalogScenario[],
  prevSteps: ComposedStep[],
  alreadyUsed: Set<string>,
): { scenario: CatalogScenario; downgrades: string[] } | null {
  if (catalog.length === 0) return null
  const downgrades: string[] = []

  let pool = catalog.filter((s) => !alreadyUsed.has(s.id))
  if (pool.length === 0) {
    // The first session is 5 reps; with a thin catalog the same scenario
    // may need to repeat. Fall back to the full catalog and announce it.
    pool = catalog
    downgrades.push('reused-from-earlier-rep')
  }

  // Apply the script preferences in priority order. Each filter is
  // attempted; if it produces zero candidates, we record the downgrade
  // and skip that filter.
  let cands = filterByDecoder(pool, step.decoder)
  if (cands.length === 0) {
    downgrades.push('no-decoder-match')
    cands = pool
  }

  // Disguise is preferred but not required.
  const disguiseMatched = cands.filter((s) => s.disguise === step.disguise)
  if (disguiseMatched.length > 0) cands = disguiseMatched
  else downgrades.push('no-disguise-match')

  // Difficulty preference.
  if (typeof step.prefer.difficulty === 'number') {
    const dMatched = cands.filter((s) => s.difficulty === step.prefer.difficulty)
    if (dMatched.length > 0) cands = dMatched
    else downgrades.push('no-difficulty-match')
  }

  // Template preference (string match).
  if (step.prefer.templateId) {
    const tMatched = cands.filter((s) => s.templateId === step.prefer.templateId)
    if (tMatched.length > 0) cands = tMatched
    else downgrades.push('no-template-match')
  }

  // Mirror preference.
  if (typeof step.prefer.mirror === 'boolean') {
    const mMatched = cands.filter((s) => s.mirror === step.prefer.mirror)
    if (mMatched.length > 0) cands = mMatched
    else downgrades.push('no-mirror-match')
  }

  // Different-template-than-prev preference (transfer probe).
  if (typeof step.prefer.differentTemplateThanRep === 'number') {
    const prev = prevSteps.find((s) => s.rep === step.prefer.differentTemplateThanRep)
    const prevTpl = prev
      ? catalog.find((c) => c.id === prev.scenarioId)?.templateId ?? null
      : null
    if (prevTpl) {
      const xfer = cands.filter((s) => s.templateId !== null && s.templateId !== prevTpl)
      if (xfer.length > 0) cands = xfer
      else downgrades.push('no-transfer-match')
    }
  }

  // Stable pick — sort by id and take the first to keep the composer
  // deterministic across runs.
  cands.sort((a, b) => a.id.localeCompare(b.id))
  return { scenario: cands[0]!, downgrades }
}

function filterByDecoder(pool: CatalogScenario[], decoder: string): CatalogScenario[] {
  return pool.filter((s) => s.decoderTag === decoder)
}

export function composeFirstSession(catalog: CatalogScenario[]): ComposedFirstSession {
  const steps: ComposedStep[] = []
  const used = new Set<string>()
  let catalogIncomplete = false

  for (const step of FIRST_SESSION_SCRIPT) {
    const picked = pickForStep(step, catalog, steps, used)
    if (!picked) {
      // Hard empty catalog — caller should fall back to the standard
      // weighted bundle.
      return { steps: [], catalogIncomplete: true }
    }
    used.add(picked.scenario.id)
    if (picked.downgrades.includes('no-decoder-match')) catalogIncomplete = true

    steps.push({
      rep: step.rep,
      scenarioId: picked.scenario.id,
      uiMode: step.uiMode,
      recognitionLine: step.recognitionLine,
      downgrades: picked.downgrades,
    })
  }

  return { steps, catalogIncomplete }
}
