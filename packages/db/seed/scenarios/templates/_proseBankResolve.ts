/**
 * Pack 2 §3.3 — Prose-bank feedback resolver.
 *
 * Pure, deterministic functions that turn a prose-bank skeleton into a
 * concrete player-facing feedback string. Used by the materializer
 * (`scripts/materialize-templates.ts`) as the opt-in fallback for a
 * variant choice that omits `feedback_text`.
 *
 * Determinism contract: `resolveChoiceFeedback` is a pure function of
 * its inputs — same bank + quality + seed → byte-identical output.
 * The materializer runs in CI as `--check`; a non-deterministic
 * resolver would make that gate flap.
 */
import {
  findProseBankSlotsIn,
  PROSE_BANK_SLOT_ID_SET,
  type ProseBankTone,
} from './_proseBankSlots'
import type { ProseBank, ChoiceQuality } from './_schema'

/**
 * Default tone per choice quality. `best` and `acceptable` read
 * straight; `wrong` leans corrective. The scaffold never emits an
 * `encouraging` skeleton for `wrong`, so the default avoids it too.
 */
const DEFAULT_TONE_BY_QUALITY: Readonly<Record<ChoiceQuality, ProseBankTone>> = {
  best: 'neutral',
  acceptable: 'neutral',
  wrong: 'corrective',
}

/**
 * FNV-1a 32-bit hash. Deterministic, dependency-free; used only to
 * spread skeleton selection across a bank's options so sibling
 * variants don't all render the same sentence.
 */
function hash32(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic index into a list of length `n` (n > 0). */
export function pickIndex(seed: string, n: number): number {
  if (n <= 0) throw new Error('pickIndex: n must be positive')
  return hash32(seed) % n
}

/**
 * Replace every `{slot}` token in `skeleton` with its value from
 * `slots`. Throws if a canonical slot token has no value — an
 * unresolved token must never reach a materialized scenario.
 */
export function fillSkeleton(
  skeleton: string,
  slots: Readonly<Record<string, string>>,
): string {
  for (const slot of findProseBankSlotsIn(skeleton)) {
    if (PROSE_BANK_SLOT_ID_SET.has(slot) && !(slot in slots)) {
      throw new Error(
        `fillSkeleton: skeleton references slot "{${slot}}" with no value in bank.slots.`,
      )
    }
  }
  return skeleton.replace(/\{([a-z][a-z0-9_]*)\}/g, (whole, slot: string) => {
    const value = slots[slot]
    return value ?? whole
  })
}

/**
 * Resolve the feedback string for one choice from the prose-bank.
 *
 * @throws if the bank has no `slots`, or no entry for `quality`.
 */
export function resolveChoiceFeedback(args: {
  bank: ProseBank
  quality: ChoiceQuality
  /** Stable per-choice seed, e.g. `"ESC-T1-06:fade_to_corner"`. */
  seed: string
}): string {
  const { bank, quality, seed } = args
  if (!bank.slots) {
    throw new Error(
      `resolveChoiceFeedback: prose-bank for "${bank.template}" has no "slots"; ` +
        `cannot back a feedback fallback. Add a slots block or author feedback_text.`,
    )
  }
  const ofQuality = bank.entries.filter((e) => e.quality === quality)
  if (ofQuality.length === 0) {
    throw new Error(
      `resolveChoiceFeedback: prose-bank for "${bank.template}" has no entry ` +
        `for quality "${quality}".`,
    )
  }
  const preferredTone = DEFAULT_TONE_BY_QUALITY[quality]
  const entry =
    ofQuality.find((e) => e.tone === preferredTone) ?? (ofQuality[0] as ProseBank['entries'][number])
  const skeleton = entry.skeletons[pickIndex(seed, entry.skeletons.length)] as string
  return fillSkeleton(skeleton, bank.slots)
}
