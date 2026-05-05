/**
 * Pathway training context resolver (PTH-2).
 *
 * Centralizes the "what scenarios should /train run, and what
 * back-link should the summary page show?" decision so both /train
 * and the upcoming /api/pathways/.../training-context endpoint share
 * one source of truth.
 *
 * Inputs come from URL search params; the resolver is otherwise pure
 * w.r.t. config + a pre-fetched PathwayProgressSummary, which keeps
 * it unit-testable without a database.
 *
 * The companion server wrapper `resolvePathwayTrainingContextWithProgress`
 * fetches progress from Prisma when needed and delegates to the pure
 * function.
 */

import {
  buildPathwayDetailHref,
  buildPathwayTrainHref,
  getChapterBySlug,
  getPathwayBySlug,
  getSkillNodeBySlug,
} from './helpers'
import type {
  BossChallengeConfig,
  PassCriteria,
  PathwayChapterConfig,
  PathwayConfig,
  PathwayProgressSummary,
  PathwayTrainingMode,
  SkillNodeConfig,
} from './types'

/**
 * Reasons the resolver can refuse to drop the user into a Pathway
 * session. The /train page surfaces these as soft warnings before
 * falling back to plain weighted training when safe.
 */
export type TrainingContextError =
  | 'pathway-not-found'
  | 'pathway-coming-soon'
  | 'chapter-not-found'
  | 'node-not-found'
  | 'no-trainable-scenarios'
  | 'boss-not-configured'

export type TrainingContextSource =
  | 'explicit-scenario-ids'
  | 'pathway-chapter-node'
  | 'pathway-chapter-recommended'
  | 'pathway-recommended'
  | 'boss-challenge'
  | 'mixed-reads'

/** Fully resolved Pathway training context. The /train page reads
 * this on mount; the summary page reads the same shape for back-links
 * and "Up next" CTAs. */
export interface ResolvedPathwayTrainingContext {
  pathwaySlug: string
  pathwayTitle: string
  chapterSlug: string | null
  chapterTitle: string | null
  nodeSlug: string | null
  nodeTitle: string | null
  /** Scenario IDs the session should run, in order. */
  scenarioIds: string[]
  /** Training mode hint from config; PTH-3 will honor this in
   *  /train. v2 only surfaces the value (no behavior change). */
  trainingMode: PathwayTrainingMode | null
  /** Where the back-link on /train should send the user. */
  returnHref: string
  /** Encoded query-string fragment the /train page can append to its
   *  /train/summary URL when the session completes. */
  summaryParams: {
    pathway: string
    chapter?: string
    node?: string
    mode?: PathwayTrainingMode
  }
  /** True when the resolver fell back to scenarios from a different
   *  source than the URL initially specified — e.g. user passed a
   *  pathway slug only and we picked the recommended-next node. */
  source: TrainingContextSource
  /** Soft-error code; null when the resolution succeeded. */
  error: TrainingContextError | null
  /** PTH-3: when true, /train should hide the decoder pill / decoder
   *  lesson hand-off so a boss/mixed-read run feels like a test. */
  hideDecoderPill: boolean
  /** PTH-3: when true, /train should suppress decoder-tied cue hints
   *  (self-review checklists, micro-praise, etc.). */
  suppressCueHints: boolean
  /** PTH-3: when true, the session is a graded challenge. Surfaces
   *  challenge chrome on /train and pass/fail copy on /train/summary. */
  isChallenge: boolean
  /** PTH-3: human-readable challenge title (e.g. "Boss — Denial Reader"). */
  challengeTitle: string | null
  /** PTH-3: pass criteria for the challenge — used to compute and
   *  display pass/fail on /train/summary. */
  passCriteria: PassCriteria | null
  /** PTH-3: scenario IDs that originated from the boss/mixed config,
   *  even when an explicit `scenarioIds=` URL took precedence. Lets
   *  /train/summary key local pass/fail by canonical challenge IDs. */
  challengeScenarioIds: string[] | null
}

export interface ResolveContextInput {
  pathwaySlug?: string | null
  chapterSlug?: string | null
  nodeSlug?: string | null
  /** Comma-separated scenario IDs from the URL. The resolver doesn't
   *  validate against LIVE here — that happens server-side in
   *  generateSessionBundle. We only check the IDs are non-empty. */
  scenarioIdsCsv?: string | null
  /** PTH-3: requested training mode from the URL. `boss-challenge`
   *  and `mixed-reads` flip the resolver into challenge mode. */
  mode?: PathwayTrainingMode | string | null
  /** Pre-fetched progress for the pathway when one is referenced.
   *  Required to compute the recommended-next node when only a
   *  pathway slug (or pathway+chapter without node) is passed. */
  progress?: PathwayProgressSummary | null
}

/** Construct an error context. We still emit a partial shape so the
 * /train page can render a sensible warning. */
function makeError(
  pathway: PathwayConfig | null,
  pathwaySlug: string,
  error: TrainingContextError,
): ResolvedPathwayTrainingContext {
  return {
    pathwaySlug,
    pathwayTitle: pathway?.title ?? pathwaySlug,
    chapterSlug: null,
    chapterTitle: null,
    nodeSlug: null,
    nodeTitle: null,
    scenarioIds: [],
    trainingMode: null,
    returnHref: pathway ? buildPathwayDetailHref(pathway.slug) : '/pathways',
    summaryParams: { pathway: pathwaySlug },
    source: 'explicit-scenario-ids',
    error,
    hideDecoderPill: false,
    suppressCueHints: false,
    isChallenge: false,
    challengeTitle: null,
    passCriteria: null,
    challengeScenarioIds: null,
  }
}

const KNOWN_MODES: ReadonlySet<PathwayTrainingMode> = new Set([
  'learn-the-cue',
  'freeze-frame-read',
  'no-hint',
  'mixed-reads',
  'boss-challenge',
  'film-room',
  'pressure-test',
])

function normalizeMode(raw: string | null | undefined): PathwayTrainingMode | null {
  if (!raw) return null
  return KNOWN_MODES.has(raw as PathwayTrainingMode) ? (raw as PathwayTrainingMode) : null
}

function parseScenarioIdsCsv(csv: string | null | undefined): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface BuildContextOptions {
  /** Override `trainingMode` (e.g. URL `mode=boss-challenge`). When
   *  unset, falls back to the node's configured trainingMode. */
  modeOverride?: PathwayTrainingMode | null
  hideDecoderPill?: boolean
  suppressCueHints?: boolean
  isChallenge?: boolean
  challengeTitle?: string | null
  passCriteria?: PassCriteria | null
  challengeScenarioIds?: string[] | null
}

function buildContext(
  pathway: PathwayConfig,
  chapter: PathwayChapterConfig | null,
  node: SkillNodeConfig | null,
  scenarioIds: string[],
  source: TrainingContextSource,
  options: BuildContextOptions = {},
): ResolvedPathwayTrainingContext {
  const trainingMode = options.modeOverride ?? node?.trainingMode ?? null
  const summaryMode =
    trainingMode && (trainingMode === 'boss-challenge' || trainingMode === 'mixed-reads')
      ? trainingMode
      : null
  return {
    pathwaySlug: pathway.slug,
    pathwayTitle: pathway.title,
    chapterSlug: chapter?.slug ?? null,
    chapterTitle: chapter?.title ?? null,
    nodeSlug: node?.slug ?? null,
    nodeTitle: node?.title ?? null,
    scenarioIds,
    trainingMode,
    returnHref: buildPathwayDetailHref(pathway.slug),
    summaryParams: {
      pathway: pathway.slug,
      ...(chapter ? { chapter: chapter.slug } : {}),
      ...(node ? { node: node.slug } : {}),
      ...(summaryMode ? { mode: summaryMode } : {}),
    },
    source,
    error: null,
    hideDecoderPill: options.hideDecoderPill ?? false,
    suppressCueHints: options.suppressCueHints ?? false,
    isChallenge: options.isChallenge ?? false,
    challengeTitle: options.challengeTitle ?? null,
    passCriteria: options.passCriteria ?? null,
    challengeScenarioIds: options.challengeScenarioIds ?? null,
  }
}

function bossOptions(boss: BossChallengeConfig): BuildContextOptions {
  return {
    modeOverride: 'boss-challenge',
    hideDecoderPill: true,
    suppressCueHints: true,
    isChallenge: true,
    challengeTitle: boss.title,
    passCriteria: boss.passCriteria,
    challengeScenarioIds: [...boss.scenarioIds],
  }
}

function mixedOptions(
  chapter: PathwayChapterConfig,
  scenarioIds: string[],
): BuildContextOptions {
  return {
    modeOverride: 'mixed-reads',
    hideDecoderPill: true,
    suppressCueHints: true,
    isChallenge: true,
    challengeTitle: chapter.title,
    passCriteria: chapter.passCriteria,
    challengeScenarioIds: [...scenarioIds],
  }
}

/** Walk a chapter's skill nodes and pick the first one that isn't
 * already mastered (or, if all are mastered, the first non-locked
 * one). When progress is unavailable we fall back to the first node
 * by order. */
function pickFirstTrainableNode(
  chapter: PathwayChapterConfig,
  progress: PathwayProgressSummary | null,
): SkillNodeConfig | null {
  if (chapter.skillNodes.length === 0) return null
  const chapterProgress = progress?.chapters.find((c) => c.slug === chapter.slug)
  if (!chapterProgress) return chapter.skillNodes[0] ?? null

  for (const node of chapter.skillNodes) {
    const np = chapterProgress.skillNodes.find((n) => n.slug === node.slug)
    if (!np) return node
    if (np.state === 'locked') continue
    if (np.state === 'mastered') continue
    return node
  }
  // All mastered — give them the first node so "Continue chapter"
  // still drops somewhere coherent.
  for (const node of chapter.skillNodes) {
    const np = chapterProgress.skillNodes.find((n) => n.slug === node.slug)
    if (np?.state !== 'locked') return node
  }
  return chapter.skillNodes[0] ?? null
}

/**
 * Pure resolver — given the URL params + pre-fetched progress,
 * decide what scenarios /train should run and what context to
 * surface. Returns null when no Pathway context was requested at
 * all (e.g. plain `/train` or `/train?concept=...`); the caller can
 * then run the existing weighted/random behavior unchanged.
 */
export function resolvePathwayTrainingContext(
  input: ResolveContextInput,
): ResolvedPathwayTrainingContext | null {
  const explicitIds = parseScenarioIdsCsv(input.scenarioIdsCsv)
  const hasAnyPathwayParam = Boolean(input.pathwaySlug)
  const mode = normalizeMode(input.mode ?? null)

  // No Pathway context at all → caller handles the legacy weighted /
  // concept / scenarioId paths. Even if explicit scenarioIds are
  // present, those are handled by /train itself; the resolver only
  // produces a *Pathway* context.
  if (!hasAnyPathwayParam) return null

  const pathway = getPathwayBySlug(input.pathwaySlug!)
  if (!pathway) return makeError(null, input.pathwaySlug!, 'pathway-not-found')
  if (pathway.comingSoon) return makeError(pathway, pathway.slug, 'pathway-coming-soon')

  const chapter = input.chapterSlug ? getChapterBySlug(pathway, input.chapterSlug) : null
  if (input.chapterSlug && !chapter) {
    return makeError(pathway, pathway.slug, 'chapter-not-found')
  }

  const node = chapter && input.nodeSlug ? getSkillNodeBySlug(chapter, input.nodeSlug) : null
  if (input.nodeSlug && !node) {
    return makeError(pathway, pathway.slug, 'node-not-found')
  }

  // Branch 0a (PTH-3): boss challenge mode. Requires a chapter; uses
  // the chapter's bossChallenge.scenarioIds unless the URL pinned an
  // explicit list (e.g. retry from summary).
  if (mode === 'boss-challenge') {
    if (!chapter) {
      // Fall through to non-challenge branches; the user opted into
      // boss mode without specifying a chapter.
      return buildContext(pathway, null, null, [], 'pathway-recommended', {
        modeOverride: 'boss-challenge',
      })
    }
    const boss = chapter.bossChallenge
    if (!boss || boss.scenarioIds.length === 0) {
      return {
        ...makeError(pathway, pathway.slug, 'boss-not-configured'),
        chapterSlug: chapter.slug,
        chapterTitle: chapter.title,
      }
    }
    const ids = explicitIds.length > 0 ? explicitIds : [...boss.scenarioIds]
    return buildContext(pathway, chapter, node, ids, 'boss-challenge', bossOptions(boss))
  }

  // Branch 0b (PTH-3): mixed-reads mode. Targets the chapter's
  // mixed-reads node (or the URL-pinned node) and bundles its
  // scenarios; if elsewhere, falls back to whatever scenarios the
  // URL exposes and surfaces a softer "challenge" frame.
  if (mode === 'mixed-reads') {
    if (!chapter) {
      return buildContext(pathway, null, null, [], 'pathway-recommended', {
        modeOverride: 'mixed-reads',
      })
    }
    const targetNode =
      node ??
      chapter.skillNodes.find((n) => n.trainingMode === 'mixed-reads') ??
      chapter.skillNodes[0] ??
      null
    const baseIds =
      targetNode && targetNode.scenarioIds.length > 0
        ? targetNode.scenarioIds
        : Array.from(new Set(chapter.skillNodes.flatMap((n) => n.scenarioIds)))
    const ids = explicitIds.length > 0 ? explicitIds : baseIds
    if (ids.length === 0) {
      return makeError(pathway, pathway.slug, 'no-trainable-scenarios')
    }
    return buildContext(
      pathway,
      chapter,
      targetNode,
      ids,
      'mixed-reads',
      mixedOptions(chapter, baseIds),
    )
  }

  // Branch 1: Explicit scenarioIds + pathway context. Use the URL ids
  // verbatim and surface the pathway context for the strip / summary.
  // This is the canonical Pathways link shape.
  if (explicitIds.length > 0) {
    return buildContext(pathway, chapter, node, explicitIds, 'explicit-scenario-ids', {
      modeOverride: mode ?? null,
    })
  }

  // Branch 2: pathway + chapter + node → pick that node's scenarios.
  if (chapter && node) {
    if (node.scenarioIds.length === 0) {
      return makeError(pathway, pathway.slug, 'no-trainable-scenarios')
    }
    return buildContext(pathway, chapter, node, node.scenarioIds, 'pathway-chapter-node')
  }

  // Branch 3: pathway + chapter (no node) → first trainable node in
  // the chapter, preferring the recommended-next when progress is
  // available and points into this chapter.
  if (chapter) {
    let target: SkillNodeConfig | null = null
    const recommended = input.progress?.recommendedNext
    if (recommended && recommended.chapterSlug === chapter.slug) {
      target = getSkillNodeBySlug(chapter, recommended.skillNodeSlug)
    }
    if (!target) target = pickFirstTrainableNode(chapter, input.progress ?? null)
    if (!target || target.scenarioIds.length === 0) {
      return makeError(pathway, pathway.slug, 'no-trainable-scenarios')
    }
    return buildContext(
      pathway,
      chapter,
      target,
      target.scenarioIds,
      'pathway-chapter-recommended',
    )
  }

  // Branch 4: pathway only → use recommendedNext if present, else
  // fall back to chapter 1 / skill node 1.
  const recommended = input.progress?.recommendedNext
  if (recommended) {
    const recChapter = getChapterBySlug(pathway, recommended.chapterSlug)
    const recNode = recChapter ? getSkillNodeBySlug(recChapter, recommended.skillNodeSlug) : null
    if (recChapter && recNode && recNode.scenarioIds.length > 0) {
      return buildContext(pathway, recChapter, recNode, recNode.scenarioIds, 'pathway-recommended')
    }
  }

  const firstChapter = pathway.chapters[0] ?? null
  const firstNode = firstChapter ? pickFirstTrainableNode(firstChapter, input.progress ?? null) : null
  if (firstChapter && firstNode && firstNode.scenarioIds.length > 0) {
    return buildContext(pathway, firstChapter, firstNode, firstNode.scenarioIds, 'pathway-recommended')
  }

  return makeError(pathway, pathway.slug, 'no-trainable-scenarios')
}

/** Convenience: rebuild a /train href from a resolved context. The
 * /train page uses this in the "Replay this set" CTA on the summary
 * page so the same scenarios run again with the same context. */
export function buildTrainHrefFromContext(ctx: ResolvedPathwayTrainingContext): string {
  // Boss/mixed challenges replay against the canonical challenge
  // scenario set, not whatever (potentially shuffled) ids ran. This
  // keeps Retry behavior stable across reloads.
  const replayIds =
    ctx.isChallenge && ctx.challengeScenarioIds && ctx.challengeScenarioIds.length > 0
      ? ctx.challengeScenarioIds
      : ctx.scenarioIds
  const mode =
    ctx.trainingMode === 'boss-challenge' || ctx.trainingMode === 'mixed-reads'
      ? ctx.trainingMode
      : null
  return buildPathwayTrainHref({
    scenarioIds: replayIds,
    pathwaySlug: ctx.pathwaySlug,
    chapterSlug: ctx.chapterSlug,
    nodeSlug: ctx.nodeSlug,
    mode,
  })
}

// ---------------------------------------------------------------------------
// Server wrapper — fetches progress and delegates to the pure resolver.
// Imported only by the API route so the rest of the file can stay
// dependency-free for client-side consumption (even though we don't
// import this from the client today, the split keeps the door open).
// ---------------------------------------------------------------------------

import { getPathwayProgress } from './progressService'

export async function resolvePathwayTrainingContextWithProgress(
  userId: string | null,
  input: ResolveContextInput,
): Promise<ResolvedPathwayTrainingContext | null> {
  // Skip the progress fetch when the URL fully specifies the
  // scenarios + node — saves a Prisma round-trip on the hot path.
  const needsProgress =
    Boolean(input.pathwaySlug) &&
    parseScenarioIdsCsv(input.scenarioIdsCsv).length === 0 &&
    !input.nodeSlug

  let progress: PathwayProgressSummary | null = null
  if (needsProgress && input.pathwaySlug) {
    progress = await getPathwayProgress(userId, input.pathwaySlug)
  }

  return resolvePathwayTrainingContext({ ...input, progress })
}
