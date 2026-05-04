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
 * concrete color via `getAccentColor`. */
const DECODER_ACCENT: Record<DecoderTag, PathwayAccentToken> = {
  BACKDOOR_WINDOW: 'brand',
  EMPTY_SPACE_CUT: 'info',
  ADVANTAGE_OR_RESET: 'xp',
  SKIP_THE_ROTATION: 'iq',
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

const DECODER_LABEL: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'Backdoor Window',
  EMPTY_SPACE_CUT: 'Empty Space Cut',
  ADVANTAGE_OR_RESET: 'Advantage or Reset',
  SKIP_THE_ROTATION: 'Skip the Rotation',
}

export function getDecoderLabel(tag: DecoderTag): string {
  return DECODER_LABEL[tag]
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
  /** Scenario IDs to pin (CSV in the URL). When empty, returns plain `/train`. */
  scenarioIds?: readonly string[] | null
}

/**
 * Build a `/train?...` URL for a Pathway-driven session.
 *
 * v1 only honors `scenarioIds=` (a comma-separated list). PTH-2 will
 * add `pathway=`, `chapter=`, `mode=` params here without changing the
 * call sites.
 */
export function buildPathwayTrainHref(input: BuildTrainHrefInput = {}): string {
  const ids = (input.scenarioIds ?? []).filter((id) => id.length > 0)
  if (ids.length === 0) return '/train'
  const params = new URLSearchParams()
  params.set('scenarioIds', ids.join(','))
  return `/train?${params.toString()}`
}

/** Convenience: build a /train href for a specific skill node. */
export function buildSkillNodeTrainHref(node: SkillNodeConfig): string {
  return buildPathwayTrainHref({ scenarioIds: node.scenarioIds })
}

/** Convenience: build a /train href for a chapter (uses the first
 * un-mastered skill node's scenarios; fallback to the whole chapter
 * scenario list). */
export function buildChapterTrainHref(chapter: PathwayChapterConfig): string {
  const firstNode = chapter.skillNodes[0]
  if (firstNode) return buildSkillNodeTrainHref(firstNode)
  return '/train'
}

/** Sum of unique scenario IDs across all skill nodes in a chapter. */
export function countChapterScenarios(chapter: PathwayChapterConfig): number {
  const seen = new Set<string>()
  for (const node of chapter.skillNodes) {
    for (const id of node.scenarioIds) seen.add(id)
  }
  return seen.size
}
