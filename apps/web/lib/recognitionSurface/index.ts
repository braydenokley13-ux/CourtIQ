/**
 * Phase 6 — Recognition Surface barrel.
 *
 * Pure copy + data-shape generators that turn the Phase 4 adaptive
 * signals into player-facing strings and UI data. No JSX. No I/O.
 */
export { copyForBand, decoderLabel, recognitionReason, todaysFocusLine } from './copyForBand'
export type { BandCopy } from './copyForBand'

export { decoderRingData, decoderRingStrip } from './decoderRing'
export type { DecoderRingData, SegmentState } from './decoderRing'

export { fasterCallout, latencyWindow } from './fasterCallout'
export type { FasterCallout, FasterCalloutInput, LatencyWindow } from './fasterCallout'
