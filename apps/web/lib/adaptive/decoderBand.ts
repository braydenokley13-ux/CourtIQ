/**
 * Computes per-decoder confidence: band + evidence + nextProbe.
 *
 * Inputs are the player's recent attempts on a single decoder. The
 * routing layer composes these per-decoder signals into a session
 * bundle by reading `nextProbe`.
 */
import { classifyAttempt } from './classifyAttempt'
import {
  type AdaptiveAttempt,
  type ClassifiedAttempt,
  type DecoderBand,
  type DecoderConfidence,
  type NextProbe,
  RECOGNITION_LATENCY_MS_BY_DIFFICULTY,
  RECOGNITION_WINDOW,
} from './types'

const DISGUISE_ORDER: Record<'none' | 'light' | 'moderate' | 'heavy', number> = {
  none: 0,
  light: 1,
  moderate: 2,
  heavy: 3,
}

export interface ComputeBandInput {
  decoderTag: string
  /** All player attempts on this decoder, oldest first. The function
   *  uses up to RECOGNITION_WINDOW most-recent admissible attempts. */
  attempts: AdaptiveAttempt[]
  /** Days since the last attempt on this decoder. Used by `nextProbe`
   *  to surface refresh prompts on long-dormant masteries. */
  daysSinceLastAttempt: number
  /** Number of replay-demo views in the user's last 5 reps (any
   *  decoder). When ≥ 3, routing prefers `mystery-mode` next. */
  recentReplayViews: number
}

export function computeDecoderConfidence(input: ComputeBandInput): DecoderConfidence {
  const { decoderTag, attempts, daysSinceLastAttempt, recentReplayViews } = input

  if (attempts.length === 0) {
    return {
      decoderTag,
      band: 'untested',
      evidence: {
        attempts: 0,
        accuracyLastN: 0,
        p50LatencyMs: null,
        transferTemplates: 0,
        hardestDisguiseRecognized: null,
        inadmissibleCount: 0,
      },
      nextProbe: 'first-rep',
    }
  }

  // Classify each attempt with running prior-attempt count, so the
  // first-attempt-on-decoder gets the lucky-guess admissibility check.
  const classified: { attempt: AdaptiveAttempt; result: ClassifiedAttempt }[] = []
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]!
    const result = classifyAttempt(a, { decoderAttemptsBefore: i })
    classified.push({ attempt: a, result })
  }

  // Use the last RECOGNITION_WINDOW admissible attempts.
  const admissible = classified.filter((c) => !c.result.inadmissibleForPromotion)
  const window = admissible.slice(-RECOGNITION_WINDOW)
  const inadmissibleCount = classified.length - admissible.length

  const correct = window.filter(
    (c) => c.result.class === 'recognized' || c.result.class === 'resolved',
  ).length
  const accuracyLastN = window.length === 0 ? 0 : correct / window.length

  const recognized = window.filter((c) => c.result.class === 'recognized').length

  // p50 latency over correct attempts in the window.
  const correctLatencies = window
    .filter((c) => c.attempt.isCorrect)
    .map((c) => c.attempt.timeMs)
    .sort((a, b) => a - b)
  const p50LatencyMs =
    correctLatencies.length === 0
      ? null
      : correctLatencies[Math.floor(correctLatencies.length / 2)]!

  // Transfer = distinct templates the player has at least one
  // `recognized` attempt on. Memorization shows up as transferTemplates=1
  // with high accuracyLastN and a single-template attempt history.
  const recognizedTemplates = new Set<string>()
  let hardestDisguiseRecognized: 'none' | 'light' | 'moderate' | 'heavy' | null = null
  for (const c of admissible) {
    if (c.result.class !== 'recognized') continue
    if (c.attempt.templateId) recognizedTemplates.add(c.attempt.templateId)
    if (
      hardestDisguiseRecognized === null ||
      DISGUISE_ORDER[c.attempt.disguise] > DISGUISE_ORDER[hardestDisguiseRecognized]
    ) {
      hardestDisguiseRecognized = c.attempt.disguise
    }
  }
  const distinctTemplatesAttempted = new Set(
    admissible.map((c) => c.attempt.templateId).filter((id): id is string => Boolean(id)),
  )

  // -------- Band promotion --------
  // Bands are sticky downward; they don't auto-demote from time alone
  // (see strategy §15). Demotion only happens via 3-in-a-row miss-streak
  // detected by `nextProbe` upstream.

  let band: DecoderBand = 'untested'
  if (window.length >= 4 && accuracyLastN >= 0.6) band = 'recognizing'
  if (
    window.length >= 6 &&
    recognized / window.length >= 0.7 &&
    p50LatencyMs !== null &&
    p50LatencyMs <= reflexiveLatencyCeiling(admissible.map((c) => c.attempt.difficulty))
  ) {
    band = 'reflexive'
  }
  if (
    band === 'reflexive' &&
    (hardestDisguiseRecognized === 'moderate' || hardestDisguiseRecognized === 'heavy')
  ) {
    band = 'mastered'
  }

  // -------- nextProbe selection --------
  const nextProbe = pickNextProbe({
    band,
    classified,
    window,
    recognizedTemplates,
    distinctTemplatesAttempted,
    daysSinceLastAttempt,
    recentReplayViews,
  })

  return {
    decoderTag,
    band,
    evidence: {
      attempts: window.length,
      accuracyLastN,
      p50LatencyMs,
      transferTemplates: recognizedTemplates.size,
      hardestDisguiseRecognized,
      inadmissibleCount,
    },
    nextProbe,
  }
}

function reflexiveLatencyCeiling(difficulties: number[]): number {
  // Reflexive ceiling = average of the difficulty thresholds the player
  // has actually been seeing on this decoder. Prevents punishing players
  // who've graduated to higher difficulty bands.
  if (difficulties.length === 0) return RECOGNITION_LATENCY_MS_BY_DIFFICULTY[1]!
  const sum = difficulties.reduce(
    (acc, d) =>
      acc + (RECOGNITION_LATENCY_MS_BY_DIFFICULTY[d] ?? RECOGNITION_LATENCY_MS_BY_DIFFICULTY[5]!),
    0,
  )
  return sum / difficulties.length
}

interface PickNextProbeArgs {
  band: DecoderBand
  classified: { attempt: AdaptiveAttempt; result: ClassifiedAttempt }[]
  window: { attempt: AdaptiveAttempt; result: ClassifiedAttempt }[]
  recognizedTemplates: Set<string>
  distinctTemplatesAttempted: Set<string>
  daysSinceLastAttempt: number
  recentReplayViews: number
}

function pickNextProbe(args: PickNextProbeArgs): NextProbe {
  const { band, classified, window, recognizedTemplates, distinctTemplatesAttempted } = args

  if (band === 'untested') return 'first-rep'

  // 1. Lesson refresh always wins — two wrongs back-to-back means stop
  //    advancing and re-teach the cue.
  const lastTwo = classified.slice(-2)
  const twoWrongs = lastTwo.length === 2 && lastTwo.every((c) => !c.attempt.isCorrect)
  if (twoWrongs) return 'lesson-refresh'

  // 2. Replay abuse → mystery mode.
  if (args.recentReplayViews >= 3) return 'mystery-mode'

  // 3. Boss-ready gate (mastered band + recent activity).
  if (band === 'mastered') {
    if (args.daysSinceLastAttempt > 30) return 'maintain' // refresh prompt
    return 'boss-ready'
  }

  // 4. Three recognized in a row → push disguise up.
  const lastThree = window.slice(-3)
  const threeRec =
    lastThree.length === 3 && lastThree.every((c) => c.result.class === 'recognized')
  if (threeRec) return 'disguise-up'

  // 5. Memorization signal: recognized on only one template, but the
  //    player has had ≥ 4 admissible attempts on this decoder. Probe
  //    transfer.
  if (
    recognizedTemplates.size === 1 &&
    distinctTemplatesAttempted.size === 1 &&
    window.length >= 4
  ) {
    return 'transfer-probe'
  }

  // 6. Default: keep building reps at current level.
  return 'maintain'
}
