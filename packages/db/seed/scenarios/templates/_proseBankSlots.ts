/**
 * Pack 2 §3.3 — Prose-bank slot vocabulary.
 *
 * The prose-bank is a per-template library of slot-fillable feedback
 * skeletons. An author writing a new variant fills in the slot values
 * (one per cue atom / choice quality / decoder family) instead of
 * authoring four full feedback paragraphs from scratch.
 *
 * The blueprint §3.3 estimates this converts ~40% of prose authoring
 * from a writing task to a slot-filling task. The skeleton-and-slot
 * architecture has the additional benefits of:
 *
 *   1. Determinism — the same slot values produce the same prose
 *      every render, so a CI snapshot of generated prose is stable.
 *   2. Lint-readiness — a small allowlist of slot identifiers means
 *      a typo (`{cue_atom_short_dsc}` vs `{cue_atom_short_desc}`) is
 *      caught at parse time rather than shipped as a literal bracket.
 *   3. Future AI-assist compatibility — when AI prose drafts are
 *      added, the model fills slot values, not free-form sentences,
 *      so generations stay on-voice.
 *
 * This module ships the vocabulary. The schema lands the bank shape
 * (`_schema.ts`); the scaffolder lands the per-template author starter
 * (`scripts/scaffold-prose-bank.ts`); the resolver (`_proseBankResolve.ts`)
 * fills skeletons at materialize time when a variant choice omits
 * `feedback_text` (opt-in fallback).
 *
 * Adding a slot
 * -------------
 * 1. Add the identifier to `PROSE_BANK_SLOT_IDS` below.
 * 2. Add a one-line description to the JSDoc above each constant.
 * 3. Update the scaffolder's defaults map if there's a sensible
 *    default phrasing per decoder.
 * 4. Re-run `pnpm templates:lint`. Every prose-bank entry referencing
 *    the new slot must populate it.
 */

/**
 * Canonical slot identifiers. The leading `{` and trailing `}` are
 * NOT part of the identifier — they are the prose-bank token markers
 * (e.g. the skeleton `"He {cue_atom_short_desc}, so {action_short_desc}."`
 * references slots `cue_atom_short_desc` and `action_short_desc`).
 *
 * Sorted alphabetically; new entries land in alphabetical position.
 */
export const PROSE_BANK_SLOT_IDS = [
  /** Short description of what to do. e.g. "cut backdoor". */
  'action_short_desc',
  /** Short human description of the cue atom. e.g. "puts his hand in the lane". */
  'cue_atom_short_desc',
  /** One-sentence decoder summary. e.g. "When the denial is committed, the rim is yours.". */
  'decoder_micro_explainer',
  /** Short description of what space opened. e.g. "the rim is open behind him". */
  'open_space_short_desc',
  /** The middle-quality choice short label. e.g. "v-cut to relief". */
  'partial_choice_short_desc',
  /** Short pronoun-style user reference. e.g. "you, the cutter". */
  'user_role_short',
  /** The wrong-choice short label. e.g. "step out". */
  'wrong_choice_short_desc',
] as const

export type ProseBankSlotId = (typeof PROSE_BANK_SLOT_IDS)[number]

/** Convenience set for O(1) lookup at lint / parse time. */
export const PROSE_BANK_SLOT_ID_SET: ReadonlySet<string> = new Set(
  PROSE_BANK_SLOT_IDS,
)

/**
 * Recognized prose tones. Tone × quality is a coarse axis the bank
 * uses to give variants stylistic variation without the author
 * authoring four distinct voices per scenario. Adding a tone is
 * intentionally low-friction (the schema only validates membership);
 * removing one is breaking — variants in flight reference it.
 */
export const PROSE_BANK_TONES = ['encouraging', 'neutral', 'corrective'] as const
export type ProseBankTone = (typeof PROSE_BANK_TONES)[number]

/**
 * Token-extraction regex. Pure helper so callers can find every slot
 * referenced in a skeleton string. Returns the SLOT IDENTIFIER ONLY
 * (no surrounding braces).
 *
 *   findProseBankSlotsIn("He {cue_atom_short_desc}, so {x}.")
 *     → ['cue_atom_short_desc', 'x']
 *
 * Caller is responsible for filtering against PROSE_BANK_SLOT_ID_SET
 * to detect typos. We keep extraction permissive so the linter can
 * also report unknown identifiers (rather than the regex hiding them).
 */
const SLOT_TOKEN_REGEX = /\{([a-z][a-z0-9_]*)\}/g

export function findProseBankSlotsIn(skeleton: string): string[] {
  const out: string[] = []
  let match: RegExpExecArray | null
  // Reset lastIndex so callers can reuse the regex across calls in
  // unbounded loops without a global-state surprise.
  SLOT_TOKEN_REGEX.lastIndex = 0
  while ((match = SLOT_TOKEN_REGEX.exec(skeleton)) !== null) {
    out.push(match[1] as string)
  }
  return out
}
