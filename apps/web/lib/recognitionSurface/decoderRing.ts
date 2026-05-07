/**
 * Phase 6 — Recognition Surface: decoder ring data shape.
 *
 * The 3-segment ring is the player's long-term scoreboard. This
 * module turns DecoderConfidence into the data shape the React
 * component renders — no JSX, no styling here.
 *
 * Lit/unlit is binary except on the *next-up* segment, which can be
 * `progress` to drive a partial fill. Burning all three segments in
 * one rep is forbidden by upstream pacing (strategy §16) — this
 * module trusts the band but never invents progress.
 */
import type { DecoderBand, DecoderConfidence } from '../adaptive/types'
import { copyForBand, decoderLabel, type BandCopy } from './copyForBand'

export type SegmentState = 'lit' | 'unlit' | 'progress'

export interface DecoderRingData {
  decoder: string
  label: string
  segments: {
    recognizing: SegmentState
    reflexive: SegmentState
    mastered: SegmentState
  }
  /** Visible label below the ring. */
  status: BandCopy['status']
  /** Optional secondary line. ≤ 48 chars. */
  evidence: BandCopy['evidence']
  /** True when the next-up segment should pulse. */
  showProgressPulse: boolean
  /** ARIA label combining label + status + evidence — for screen
   *  readers and PostHog event payloads. */
  ariaLabel: string
}

const BAND_ORDER: DecoderBand[] = ['untested', 'recognizing', 'reflexive', 'mastered']

export function decoderRingData(c: DecoderConfidence): DecoderRingData {
  const copy = copyForBand(c)
  return {
    decoder: c.decoderTag,
    label: decoderLabel(c.decoderTag),
    segments: {
      recognizing: segmentState(c, 'recognizing'),
      reflexive: segmentState(c, 'reflexive'),
      mastered: segmentState(c, 'mastered'),
    },
    status: copy.status,
    evidence: copy.evidence,
    showProgressPulse: copy.showProgressPulse,
    ariaLabel: `${decoderLabel(c.decoderTag)} — ${copy.status}. ${copy.evidence}`,
  }
}

function segmentState(c: DecoderConfidence, segment: Exclude<DecoderBand, 'untested'>): SegmentState {
  const reached = BAND_ORDER.indexOf(c.band)
  const target = BAND_ORDER.indexOf(segment)
  if (reached > target) return 'lit'
  if (reached === target) return 'lit'
  if (reached === target - 1 && hasMeasurableProgress(c, segment)) return 'progress'
  return 'unlit'
}

/**
 * "Progress" is shown only when the player has accumulated *measurable*
 * partial credit toward the next band. This avoids the dishonest case
 * where a player at recognizing band sees the reflexive segment glow
 * after one good rep.
 */
function hasMeasurableProgress(
  c: DecoderConfidence,
  target: Exclude<DecoderBand, 'untested'>,
): boolean {
  if (target === 'recognizing') {
    // Show progress on a brand-new player after their first ≥1 admissible
    // attempt (the first rep is always "first-rep" probe; once they've
    // logged one rep we can show the recognizing segment as progress).
    return c.evidence.attempts >= 1
  }
  if (target === 'reflexive') {
    // Need at least 4 attempts and ≥0.5 accuracy to honestly show
    // the reflexive segment as in-progress.
    return c.evidence.attempts >= 4 && c.evidence.accuracyLastN >= 0.5
  }
  if (target === 'mastered') {
    // Mastered progress requires the player to have at least one
    // recognized rep at disguise ≥ light.
    return (
      c.evidence.hardestDisguiseRecognized === 'light' ||
      c.evidence.hardestDisguiseRecognized === 'moderate'
    )
  }
  return false
}

/** Convenience: ring strip for `/home`. Filters out the untested
 *  decoders only when *all* are untested and we'd render four empty
 *  rings — in that case render nothing and let the first-session
 *  arc carry the moment. */
export function decoderRingStrip(decoders: readonly DecoderConfidence[]): DecoderRingData[] {
  if (decoders.every((d) => d.band === 'untested')) return []
  return decoders.map((d) => decoderRingData(d))
}
