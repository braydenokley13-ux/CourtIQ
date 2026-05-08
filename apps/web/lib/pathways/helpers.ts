/**
 * Pathway helpers (PTH-1).
 *
 * Pure selectors over `PATHWAYS` config + URL builders for /train.
 * All Pathway → /train links go through `buildPathwayTrainHref` so the
 * query-param shape (PTH-2 will add `pathway`/`chapter`/`mode` params)
 * lives in one place.
 *
 * Keep this module dependency-free (no Prisma, no Supabase) so it can
 * be imported from both server and client components.
 */

import type {
  DecoderTag,
  PathwayAccentToken,
  PathwayChapterConfig,
  PathwayConfig,
  PathwayTrainingMode,
  SkillNodeConfig,
} from './types'
import { PATHWAYS, FOUNDATION_SLUG } from './config'

export { PATHWAYS, FOUNDATION_SLUG }

export function getAllPathways(): readonly PathwayConfig[] {
  return PATHWAYS
}

export function getActivePathways(): PathwayConfig[] {
  return PATHWAYS.filter((p) => !p.comingSoon)
}

export function getComingSoonPathways(): PathwayConfig[] {
  return PATHWAYS.filter((p) => p.comingSoon)
}

export function getPathwayBySlug(slug: string): PathwayConfig | null {
  return PATHWAYS.find((p) => p.slug === slug) ?? null
}

export function getFoundationPathway(): PathwayConfig {
  const found = getPathwayBySlug(FOUNDATION_SLUG)
  if (!found) {
    throw new Error(`Pathway config missing required Foundation slug: ${FOUNDATION_SLUG}`)
  }
  return found
}

export function getChapterBySlug(
  pathway: PathwayConfig,
  chapterSlug: string,
): PathwayChapterConfig | null {
  return pathway.chapters.find((c) => c.slug === chapterSlug) ?? null
}

export function getSkillNodeBySlug(
  chapter: PathwayChapterConfig,
  nodeSlug: string,
): SkillNodeConfig | null {
  return chapter.skillNodes.find((n) => n.slug === nodeSlug) ?? null
}

/** Every scenario ID referenced by a Pathway's skill nodes (deduped,
 * preserving first-seen order). Excludes boss-only scenarios from the
 * boss config — bosses reuse chapter scenario sets. */
export function getAllScenarioIdsForPathway(pathway: PathwayConfig): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const chapter of pathway.chapters) {
    for (const node of chapter.skillNodes) {
      for (const id of node.scenarioIds) {
        if (!seen.has(id)) {
          seen.add(id)
          out.push(id)
        }
      }
    }
  }
  return out
}

/** Decoder color accents — match §7 of the planning doc. The values are
 * Tailwind / CSS-variable token names; consumers can map them to a
 * concrete color via `getAccentColor`. Pack 2 entries reuse 'heat' as
 * a placeholder; a dedicated palette assignment is a follow-up once
 * Pack 2 surfaces have been designed (the planning-doc §7 palette
 * was scoped to four founders). */
const DECODER_ACCENT: Record<DecoderTag, PathwayAccentToken> = {
  BACKDOOR_WINDOW: 'brand',
  EMPTY_SPACE_CUT: 'info',
  ADVANTAGE_OR_RESET: 'xp',
  SKIP_THE_ROTATION: 'iq',
  // TODO(pack-2): assign distinct palette tokens once Pack 2 visual
  // design lands. Both decoders alias to 'heat' for now so the
  // existing Pathway / progress surfaces don't crash on Pack 2 reps.
  READ_THE_COVERAGE: 'heat',
  HUNT_THE_ADVANTAGE: 'heat',
}

export function getDecoderAccent(tag: DecoderTag | null): PathwayAccentToken {
  if (!tag) return 'heat'
  return DECODER_ACCENT[tag]
}

const ACCENT_HEX: Record<PathwayAccentToken, string> = {
  brand: '#3BE383',
  info: '#5AC8FF',
  xp: '#FF8A3D',
  iq: '#8B7CFF',
  heat: '#FF4D6D',
}

export function getAccentColor(token: PathwayAccentToken): string {
  return ACCENT_HEX[token]
}

import { decoderLabel as registryDecoderLabel } from '@/lib/decoders/registry'

/** Player-facing decoder label. Routes through the central registry
 *  so all six decoders (founders + Pack 2) resolve consistently. */
export function getDecoderLabel(tag: DecoderTag): string {
  return registryDecoderLabel(tag)
}

const ARCHETYPE_LABEL: Record<string, string> = {
  'ball-watcher': 'Ball Watcher',
  cutter: 'Cutter',
  connector: 'Connector',
  attacker: 'Attacker',
  'floor-general': 'Floor General',
  'off-ball-weapon': 'Off-Ball Weapon',
  'help-defender-punisher': 'Help Defender Punisher',
}

export function getArchetypeLabel(archetype: string): string {
  return ARCHETYPE_LABEL[archetype] ?? archetype
}

export interface BuildTrainHrefInput {
  /** Scenario IDs to pin (CSV in the URL). When non-empty, the
   *  resulting session is exactly these scenarios in order. */
  scenarioIds?: readonly string[] | null
  /** Pathway slug for context. When set, surfaces the Pathway strip
   *  on /train and threads context through to /train/summary. */
  pathwaySlug?: string | null
  /** Chapter slug for context. Requires `pathwaySlug` to be set. */
  chapterSlug?: string | null
  /** Skill-node slug for context. Requires `chapterSlug` to be set.
   *  The server-side context resolver uses this to pick the exact
   *  scenarioIds when none are provided in the URL. */
  nodeSlug?: string | null
  /** PTH-3: training mode hint. `boss-challenge` and `mixed-reads`
   *  flip /train into a no-hint test view. Other values are passed
   *  through but currently behave like normal training. */
  mode?: PathwayTrainingMode | null
}

/**
 * Build a `/train?...` URL for a Pathway-driven session.
 *
 * Supported shapes:
 *   /train
 *   /train?scenarioIds=A,B,C
 *   /train?pathway=foo
 *   /train?pathway=foo&chapter=bar
 *   /train?pathway=foo&chapter=bar&node=baz
 *   /train?pathway=foo&chapter=bar&scenarioIds=A,B
 *
 * When `scenarioIds` are present they always win at the API level —
 * the pathway/chapter/node params are *context*, not selection. This
 * keeps the session reproducible if the pathway config later moves
 * scenarios between nodes.
 */
export function buildPathwayTrainHref(input: BuildTrainHrefInput = {}): string {
  const params = new URLSearchParams()
  if (input.pathwaySlug) params.set('pathway', input.pathwaySlug)
  if (input.chapterSlug) params.set('chapter', input.chapterSlug)
  if (input.nodeSlug) params.set('node', input.nodeSlug)
  if (input.mode) params.set('mode', input.mode)
  const ids = (input.scenarioIds ?? []).filter((id) => id.length > 0)
  if (ids.length > 0) params.set('scenarioIds', ids.join(','))
  const qs = params.toString()
  return qs.length === 0 ? '/train' : `/train?${qs}`
}

/**
 * Build a `/train/summary?...` URL preserving Pathway context. Used
 * by /train when the session completes so the summary page can render
 * the Pathway-aware CTAs.
 */
export interface BuildSummaryHrefInput {
  sessionId?: string | null
  pathwaySlug?: string | null
  chapterSlug?: string | null
  nodeSlug?: string | null
  /** Optional concept tag, preserved for the existing Academy
   *  "Try next" suggestion logic. */
  concept?: string | null
  /** PTH-3: forwarded so /train/summary can render boss/mixed-aware
   *  result copy and CTAs. */
  mode?: PathwayTrainingMode | null
}

export function buildPathwaySummaryHref(
  base: '/train/summary',
  input: BuildSummaryHrefInput,
): string {
  const params = new URLSearchParams()
  if (input.sessionId) params.set('sessionId', input.sessionId)
  if (input.concept) params.set('concept', input.concept)
  if (input.pathwaySlug) params.set('pathway', input.pathwaySlug)
  if (input.chapterSlug) params.set('chapter', input.chapterSlug)
  if (input.nodeSlug) params.set('node', input.nodeSlug)
  if (input.mode) params.set('mode', input.mode)
  const qs = params.toString()
  return qs.length === 0 ? base : `${base}?${qs}`
}

/** Build the canonical `/pathways/<slug>` href so components don't
 * concatenate strings inline. */
export function buildPathwayDetailHref(pathwaySlug: string): string {
  return `/pathways/${encodeURIComponent(pathwaySlug)}`
}

/** Convenience: build a /train href for a specific skill node, with
 * the pathway + chapter + node context threaded through. */
export function buildSkillNodeTrainHref(
  node: SkillNodeConfig,
  context?: { pathwaySlug?: string; chapterSlug?: string },
): string {
  return buildPathwayTrainHref({
    scenarioIds: node.scenarioIds,
    pathwaySlug: context?.pathwaySlug ?? null,
    chapterSlug: context?.chapterSlug ?? null,
    nodeSlug: node.slug,
  })
}

/** Convenience: build a /train href for a chapter. Picks the chapter's
 * first skill node by order; pathway/chapter context is always
 * threaded through so the summary page can route the user back. */
export function buildChapterTrainHref(
  chapter: PathwayChapterConfig,
  context?: { pathwaySlug?: string },
): string {
  const firstNode = chapter.skillNodes[0]
  if (firstNode) {
    return buildSkillNodeTrainHref(firstNode, {
      pathwaySlug: context?.pathwaySlug,
      chapterSlug: chapter.slug,
    })
  }
  return buildPathwayTrainHref({
    pathwaySlug: context?.pathwaySlug ?? null,
    chapterSlug: chapter.slug,
  })
}

/** Sum of unique scenario IDs across all skill nodes in a chapter. */
export function countChapterScenarios(chapter: PathwayChapterConfig): number {
  const seen = new Set<string>()
  for (const node of chapter.skillNodes) {
    for (const id of node.scenarioIds) seen.add(id)
  }
  return seen.size
}

/** Build a /train href for a chapter's boss challenge (PTH-3). Pins
 *  the boss scenario list, threads pathway/chapter context, and sets
 *  `mode=boss-challenge` so /train hides the decoder pill and /train
 *  /summary renders pass/fail copy. Returns null when the chapter has
 *  no boss configured. */
export function buildBossChallengeTrainHref(
  pathway: PathwayConfig,
  chapter: PathwayChapterConfig,
): string | null {
  const boss = chapter.bossChallenge
  if (!boss || boss.scenarioIds.length === 0) return null
  return buildPathwayTrainHref({
    pathwaySlug: pathway.slug,
    chapterSlug: chapter.slug,
    mode: 'boss-challenge',
    scenarioIds: boss.scenarioIds,
  })
}

/** Build a /train href for the mixed-reads capstone session (PTH-3).
 *  Targets a specific node when its `trainingMode` is `mixed-reads`;
 *  falls back to the chapter's union of scenarios when no node match
 *  exists. Returns null when the chapter has no scenarios at all. */
export function buildMixedReadsTrainHref(
  pathway: PathwayConfig,
  chapter: PathwayChapterConfig,
  options?: { nodeSlug?: string | null },
): string | null {
  const targetNode = options?.nodeSlug
    ? getSkillNodeBySlug(chapter, options.nodeSlug)
    : chapter.skillNodes.find((n) => n.trainingMode === 'mixed-reads') ??
      chapter.skillNodes[0] ??
      null
  const ids =
    targetNode && targetNode.scenarioIds.length > 0
      ? targetNode.scenarioIds
      : Array.from(
          new Set(chapter.skillNodes.flatMap((n) => n.scenarioIds)),
        )
  if (ids.length === 0) return null
  return buildPathwayTrainHref({
    pathwaySlug: pathway.slug,
    chapterSlug: chapter.slug,
    nodeSlug: targetNode?.slug ?? null,
    mode: 'mixed-reads',
    scenarioIds: ids,
  })
}
