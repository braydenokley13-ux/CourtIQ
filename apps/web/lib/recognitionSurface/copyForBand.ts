/**
 * Phase 6 — Recognition Surface: copy generator.
 *
 * Pure functions that turn a Phase 4 DecoderConfidence into the
 * one-line, plain-language strings the player actually sees. The
 * engineering vocabulary (`band`, `p50LatencyMs`, `nextProbe`) never
 * leaves this module — every string returned here is final UI copy.
 *
 * Voice rules (strict):
 *   - Past-tense action verbs ("you read", "you saw").
 *   - Latency in seconds with one decimal.
 *   - No emojis, no exclamation marks.
 *   - One sentence per surface, never two.
 */
import type { DecoderConfidence, NextProbe } from '../adaptive/types'

const DECODER_LABELS: Record<string, string> = {
  BACKDOOR_WINDOW: 'Backdoor Window',
  EMPTY_SPACE_CUT: 'Empty-Space Cut',
  ADVANTAGE_OR_RESET: 'Advantage or Reset',
  SKIP_THE_ROTATION: 'Skip the Rotation',
}

export function decoderLabel(tag: string): string {
  return DECODER_LABELS[tag] ?? tag
}

/**
 * Player-facing band copy. The band noun is intentionally not
 * "recognizing/reflexive/mastered" — those are engineering bands and
 * are NEVER shown.
 */
export interface BandCopy {
  /** A single noun for the player's current state. ≤ 12 chars. */
  status: string
  /** A short evidence line. ≤ 48 chars. */
  evidence: string
  /** True when the next-up segment of the decoder ring should pulse. */
  showProgressPulse: boolean
}

export function copyForBand(c: DecoderConfidence): BandCopy {
  const label = decoderLabel(c.decoderTag)
  switch (c.band) {
    case 'untested':
      return {
        status: 'New',
        evidence: `Take your first ${label} read.`,
        showProgressPulse: false,
      }
    case 'recognizing':
      return {
        status: 'Reading it',
        evidence: evidenceForRecognizing(c),
        showProgressPulse: true,
      }
    case 'reflexive':
      return {
        status: 'Sharp',
        evidence: evidenceForReflexive(c),
        showProgressPulse: c.evidence.hardestDisguiseRecognized !== 'heavy',
      }
    case 'mastered':
      return {
        status: 'Nailed it',
        evidence: evidenceForMastered(c),
        showProgressPulse: false,
      }
  }
}

function evidenceForRecognizing(c: DecoderConfidence): string {
  if (c.evidence.transferTemplates >= 2) {
    return `Reading ${c.evidence.transferTemplates} shapes.`
  }
  if (c.evidence.p50LatencyMs !== null) {
    return `Average ${secondsLabel(c.evidence.p50LatencyMs)}.`
  }
  return `${c.evidence.attempts} reads logged.`
}

function evidenceForReflexive(c: DecoderConfidence): string {
  if (c.evidence.p50LatencyMs !== null) {
    return `Reads in ${secondsLabel(c.evidence.p50LatencyMs)}.`
  }
  return `${c.evidence.attempts} clean reads.`
}

function evidenceForMastered(c: DecoderConfidence): string {
  if (c.evidence.hardestDisguiseRecognized === 'heavy') {
    return 'Reading it under pressure.'
  }
  return 'You see this one before it happens.'
}

function secondsLabel(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Recognition reason shown above each /train rep. Driven by Phase 4
 * `nextProbe` — never exposes the probe word itself to the player.
 */
export function recognitionReason(probe: NextProbe): string {
  switch (probe) {
    case 'first-rep':
      return 'First read on this pattern.'
    case 'disguise-up':
      return "You've been reading this fast. One cue removed."
    case 'transfer-probe':
      return 'Same read, new shape.'
    case 'lesson-refresh':
      return 'Quick re-read before the next try.'
    case 'mystery-mode':
      return 'No hints this rep.'
    case 'boss-ready':
      return 'Boss read. Distractor on the floor.'
    case 'maintain':
      return 'Stay sharp.'
  }
}

/**
 * The "today's focus" card line for /home. One decoder, one sentence.
 * The decoder is the *strongest in-progress* one — players pick up
 * where they left off, not where they're weakest.
 */
export function todaysFocusLine(decoders: readonly DecoderConfidence[]): string | null {
  const inProgress = decoders.filter((d) => d.band === 'recognizing' || d.band === 'reflexive')
  if (inProgress.length === 0) return null
  // Prefer reflexive over recognizing (closer to next milestone).
  inProgress.sort((a, b) => bandRank(b.band) - bandRank(a.band))
  const top = inProgress[0]!
  const label = decoderLabel(top.decoderTag)
  if (top.band === 'reflexive') {
    if (top.nextProbe === 'boss-ready') {
      return `${label} — boss read is open.`
    }
    return `${label} — one boss read away from sharp.`
  }
  // recognizing
  if (top.nextProbe === 'transfer-probe') {
    return `${label} — same read, new shape today.`
  }
  if (top.evidence.p50LatencyMs !== null) {
    return `${label} — read in ${secondsLabel(top.evidence.p50LatencyMs)}. Lock it in.`
  }
  return `${label} — keep building reps.`
}

function bandRank(b: DecoderConfidence['band']): number {
  return { untested: 0, recognizing: 1, reflexive: 2, mastered: 3 }[b]
}
