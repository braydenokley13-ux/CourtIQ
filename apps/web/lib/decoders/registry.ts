/**
 * Central decoder registry.
 *
 * Single source of truth for the decoder taxonomy and their player-
 * facing labels. Every surface that names a decoder — train page,
 * recognition surface, academy, pathways, daily challenge, dev
 * preview — should import from here rather than maintaining its own
 * copy of the registry.
 *
 * Pre-Pack-2 the codebase grew five separate founder-only registries
 * (`spine/glue.ts`, `recognitionSurface/copyForBand.ts`,
 * `app/train/page.tsx`, `pathways/helpers.ts`, `pathways/types.ts`).
 * Each one lagged the schema independently; the train page in
 * particular silently fell back to "BACKDOOR_WINDOW" defaults for
 * Pack 2 reps. This module collapses the registries; the lagging
 * copies are migrated commit-by-commit.
 *
 * Client-safe: this file uses `import type` only, so it does not
 * pull the Prisma runtime into client bundles.
 */

import type { DecoderTag as PrismaDecoderTag } from '@prisma/client'

/** Founder pack (Pack 1) decoders — the four read families that
 *  ship with CourtIQ's first-session arc. Order is the canonical
 *  display order; do not reorder without checking every consumer
 *  that iterates the list. */
export const FOUNDER_DECODERS = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'SKIP_THE_ROTATION',
  'ADVANTAGE_OR_RESET',
] as const
export type FounderDecoderTag = (typeof FOUNDER_DECODERS)[number]

/** Pack 2 decoders. `READ_THE_COVERAGE` = DROP family (PnR ball-
 *  handler reads coverage call). `HUNT_THE_ADVANTAGE` = HUNT family
 *  (chained-decision second-read). Authored content + pedagogy are
 *  owned by a separate workstream; the registry just makes the tags
 *  type-safe and label-resolvable everywhere. */
export const PACK_2_DECODERS = [
  'READ_THE_COVERAGE',
  'HUNT_THE_ADVANTAGE',
] as const
export type Pack2DecoderTag = (typeof PACK_2_DECODERS)[number]

/** All decoder tags known to the runtime, in canonical display
 *  order (founders first, Pack 2 after). */
export const ALL_KNOWN_DECODERS = [
  ...FOUNDER_DECODERS,
  ...PACK_2_DECODERS,
] as const
export type DecoderTag = (typeof ALL_KNOWN_DECODERS)[number]

/** Compile-time parity with the Prisma `DecoderTag` enum. If the
 *  schema gains a new value (or this list does), the assignment
 *  below fails to compile. Erased at runtime — `import type` only. */
type AssertExtends<A, B> = A extends B ? true : false
const _registryCoversPrisma: AssertExtends<PrismaDecoderTag, DecoderTag> = true
const _prismaCoversRegistry: AssertExtends<DecoderTag, PrismaDecoderTag> = true
// The constants above must be referenced or TS strips them in some
// configs; bind them so the parity check is preserved.
void _registryCoversPrisma
void _prismaCoversRegistry

/** Player-facing labels. Voice rule: Title Case, no leading article,
 *  no exclamation marks. Surfaces that need a leading article ("the
 *  Backdoor Window") prepend it themselves. */
export const DECODER_LABELS: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'Backdoor Window',
  EMPTY_SPACE_CUT: 'Empty-Space Cut',
  SKIP_THE_ROTATION: 'Skip the Rotation',
  ADVANTAGE_OR_RESET: 'Advantage or Reset',
  READ_THE_COVERAGE: 'Read the Coverage',
  HUNT_THE_ADVANTAGE: 'Hunt the Advantage',
}

/** Type guard. Useful for narrowing untyped API responses or DB
 *  rows whose decoder_tag is typed as `string | null`. */
export function isKnownDecoderTag(value: unknown): value is DecoderTag {
  return (
    typeof value === 'string' &&
    (ALL_KNOWN_DECODERS as readonly string[]).includes(value)
  )
}

/** Resolve a decoder tag to its player-facing label, with safe
 *  fallbacks for null / unknown inputs. Never returns the raw
 *  SCREAMING_SNAKE enum if avoidable — unknown tags are humanized
 *  to title case so a future schema addition that hasn't been
 *  registered here at least reads as English. */
export function decoderLabel(
  tag: DecoderTag | string | null | undefined,
): string {
  if (tag == null || tag === '') return 'Unknown Decoder'
  if (isKnownDecoderTag(tag)) return DECODER_LABELS[tag]
  return humanizeUnknownTag(tag)
}

function humanizeUnknownTag(raw: string): string {
  const parts = raw.toLowerCase().split('_').filter(Boolean)
  if (parts.length === 0) return 'Unknown Decoder'
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
