/**
 * Tests for the pure Player Progress & Performance derivation (PTH-6).
 *
 * Pinned to the priorities the spec calls out:
 *   - decoder grouping thresholds (Strong / Improving / Needs work / Untested)
 *   - weakness detection (< 0.6 accuracy AND >= 3 attempts)
 *   - recommendedNext reason → reason copy mapping
 *   - empty / null summary doesn't crash and produces zeroed insights
 *   - consistency with progressService (uses the same Foundation pathway
 *     + the existing summary shape)
 */

import { describe, expect, it } from 'vitest'
import { getFoundationPathway } from './helpers'
import {
  derivePathwayProgress,
  type DecoderMasteryStat,
  type LatestAttemptQuality,
  type PathwayProgressInput,
} from './progressService'
import {
  derivePlayerInsights,
  groupDecoderStrength,
  DECODER_IMPROVING_THRESHOLD,
  DECODER_MIN_ATTEMPTS_FOR_GROUPING,
  DECODER_STRONG_THRESHOLD,
  WEAKNESS_ACCURACY_CEILING,
  WEAKNESS_MIN_ATTEMPTS,
} from './playerProgressInsights'
import type { DecoderTag, PathwayChallengeAttemptSummary } from './types'

const FOUNDATION = getFoundationPathway()

const FAMILY_IDS: Record<DecoderTag, string[]> = {
  BACKDOOR_WINDOW: ['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'],
  EMPTY_SPACE_CUT: ['ESC-01', 'ESC-02', 'ESC-03', 'ESC-04', 'ESC-05'],
  ADVANTAGE_OR_RESET: ['AOR-01', 'AOR-02', 'AOR-03', 'AOR-04', 'AOR-05'],
  SKIP_THE_ROTATION: ['SKR-01', 'SKR-02', 'SKR-03', 'SKR-04', 'SKR-05'],
}

function bestForFamily(tag: DecoderTag): Record<string, LatestAttemptQuality> {
  return Object.fromEntries(FAMILY_IDS[tag].map((id) => [id, 'best' as LatestAttemptQuality]))
}

function makeInput(
  qualityByScenario: Record<string, LatestAttemptQuality> = {},
  decoderMastery: Partial<Record<DecoderTag, DecoderMasteryStat>> = {},
  challengeAttempts: readonly PathwayChallengeAttemptSummary[] = [],
): PathwayProgressInput {
  return {
    latestQualityByScenarioId: new Map(Object.entries(qualityByScenario)),
    decoderMasteryByTag: new Map(
      (Object.entries(decoderMastery) as [DecoderTag, DecoderMasteryStat][]).filter(
        ([, v]) => Boolean(v),
      ),
    ),
    challengeAttempts,
  }
}

// ---------------------------------------------------------------------------
// groupDecoderStrength — pure threshold tests.
// ---------------------------------------------------------------------------

describe('groupDecoderStrength', () => {
  it('returns untested when accuracy is null', () => {
    expect(groupDecoderStrength({ accuracy: null, attempts: 50 })).toBe('untested')
  })

  it('returns untested when attempts are below the floor', () => {
    expect(
      groupDecoderStrength({
        accuracy: 1,
        attempts: DECODER_MIN_ATTEMPTS_FOR_GROUPING - 1,
      }),
    ).toBe('untested')
  })

  it('returns strong at the strong threshold', () => {
    expect(
      groupDecoderStrength({
        accuracy: DECODER_STRONG_THRESHOLD,
        attempts: DECODER_MIN_ATTEMPTS_FOR_GROUPING,
      }),
    ).toBe('strong')
    expect(groupDecoderStrength({ accuracy: 0.95, attempts: 10 })).toBe('strong')
  })

  it('returns improving in the middle band', () => {
    expect(
      groupDecoderStrength({
        accuracy: DECODER_IMPROVING_THRESHOLD,
        attempts: 5,
      }),
    ).toBe('improving')
    expect(groupDecoderStrength({ accuracy: 0.55, attempts: 5 })).toBe('improving')
  })

  it('returns needs-work below the improving threshold', () => {
    expect(
      groupDecoderStrength({
        accuracy: DECODER_IMPROVING_THRESHOLD - 0.01,
        attempts: 5,
      }),
    ).toBe('needs-work')
    expect(groupDecoderStrength({ accuracy: 0.1, attempts: 10 })).toBe('needs-work')
  })
})

// ---------------------------------------------------------------------------
// derivePlayerInsights — empty / cold-start.
// ---------------------------------------------------------------------------

describe('derivePlayerInsights — empty / cold-start', () => {
  it('does not crash when summary is null and returns zeroed insights', () => {
    const insights = derivePlayerInsights(FOUNDATION, null)
    expect(insights.pathwaySlug).toBe(FOUNDATION.slug)
    expect(insights.pathwayProgress).toBe(0)
    expect(insights.pathwayMastered).toBe(false)
    expect(insights.chaptersMastered).toBe(0)
    expect(insights.chaptersTotal).toBe(0)
    expect(insights.bossesCleared).toBe(0)
    expect(insights.bossesTotal).toBe(0)
    expect(insights.finalMixStatus).toBe('none')
    expect(insights.lastActivityAt).toBeNull()
    expect(insights.decoders).toEqual([])
    expect(insights.weakness).toBeNull()
    expect(insights.recent).toEqual([])
    expect(insights.next.recommendation).toBeNull()
    expect(insights.next.reasonCopy).toBeNull()
  })

  it('cold-start summary surfaces every Foundation decoder as untested', () => {
    const summary = derivePathwayProgress(FOUNDATION, makeInput())
    const insights = derivePlayerInsights(FOUNDATION, summary)

    expect(insights.decoders).toHaveLength(FOUNDATION.decoderTags.length)
    for (const d of insights.decoders) {
      expect(d.group).toBe('untested')
      expect(d.accuracy).toBeNull()
      expect(d.attempts).toBe(0)
    }
    expect(insights.weakness).toBeNull()
    expect(insights.bossesTotal).toBeGreaterThan(0)
    expect(insights.bossesCleared).toBe(0)
    expect(insights.finalMixStatus).toBe('not_started')
    expect(insights.next.recommendation).not.toBeNull()
    expect(insights.next.recommendation!.reason).toBe('cold-start')
    expect(insights.next.reasonCopy).toMatch(/Start/)
  })
})

// ---------------------------------------------------------------------------
// Decoder grouping over a real Foundation summary.
// ---------------------------------------------------------------------------

describe('derivePlayerInsights — decoder grouping consistency', () => {
  it('groups decoders using their owning chapter accuracy/attempts', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        {},
        {
          BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.9 }, // strong
          EMPTY_SPACE_CUT: { attempts: 5, rollingAccuracy: 0.55 }, // improving
          ADVANTAGE_OR_RESET: { attempts: 5, rollingAccuracy: 0.2 }, // needs-work
          SKIP_THE_ROTATION: { attempts: 1, rollingAccuracy: 1.0 }, // untested (low reps)
        },
      ),
    )
    const insights = derivePlayerInsights(FOUNDATION, summary)
    const byTag = new Map(insights.decoders.map((d) => [d.tag, d] as const))

    expect(byTag.get('BACKDOOR_WINDOW')!.group).toBe('strong')
    expect(byTag.get('EMPTY_SPACE_CUT')!.group).toBe('improving')
    expect(byTag.get('ADVANTAGE_OR_RESET')!.group).toBe('needs-work')
    expect(byTag.get('SKIP_THE_ROTATION')!.group).toBe('untested')

    // Per-decoder accuracy should match the mastery row exactly because
    // each decoder chapter is single-tag in Foundation.
    expect(byTag.get('BACKDOOR_WINDOW')!.accuracy).toBeCloseTo(0.9, 5)
    expect(byTag.get('BACKDOOR_WINDOW')!.attempts).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Weakness detection — single insight, threshold-driven.
// ---------------------------------------------------------------------------

describe('derivePlayerInsights — weakness detection', () => {
  it('does not fire when accuracy is below the ceiling but attempts < min', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        {},
        {
          // 0.2 << 0.6 but attempts 1 < 3 — should be ignored.
          BACKDOOR_WINDOW: { attempts: WEAKNESS_MIN_ATTEMPTS - 1, rollingAccuracy: 0.2 },
        },
      ),
    )
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.weakness).toBeNull()
  })

  it('fires when a decoder is below the ceiling with enough attempts', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        {},
        {
          BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.9 },
          EMPTY_SPACE_CUT: {
            attempts: WEAKNESS_MIN_ATTEMPTS,
            rollingAccuracy: WEAKNESS_ACCURACY_CEILING - 0.2,
          },
        },
      ),
    )
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.weakness).not.toBeNull()
    expect(insights.weakness!.tag).toBe('EMPTY_SPACE_CUT')
    expect(insights.weakness!.attempts).toBe(WEAKNESS_MIN_ATTEMPTS)
    expect(insights.weakness!.message.length).toBeGreaterThan(0)
  })

  it('picks the lowest-accuracy decoder when multiple qualify', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        {},
        {
          EMPTY_SPACE_CUT: { attempts: 5, rollingAccuracy: 0.5 },
          ADVANTAGE_OR_RESET: { attempts: 5, rollingAccuracy: 0.15 },
          SKIP_THE_ROTATION: { attempts: 5, rollingAccuracy: 0.45 },
        },
      ),
    )
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.weakness?.tag).toBe('ADVANTAGE_OR_RESET')
  })

  it('does not fire when every decoder is above the ceiling', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        {},
        {
          BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 0.85 },
          EMPTY_SPACE_CUT: { attempts: 5, rollingAccuracy: 0.75 },
          ADVANTAGE_OR_RESET: { attempts: 5, rollingAccuracy: 0.95 },
          SKIP_THE_ROTATION: { attempts: 5, rollingAccuracy: 0.7 },
        },
      ),
    )
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.weakness).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// recommendedNext mapping — reason copy is present for every reason.
// ---------------------------------------------------------------------------

describe('derivePlayerInsights — next action mapping', () => {
  it('cold-start produces cold-start reason copy', () => {
    const summary = derivePathwayProgress(FOUNDATION, makeInput())
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.next.recommendation?.reason).toBe('cold-start')
    expect(insights.next.reasonCopy).toMatch(/Start/)
  })

  it('resume produces resume reason copy', () => {
    // One attempted scenario in the middle of chapter 1 → resume.
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        { 'BDW-01': 'best' },
        { BACKDOOR_WINDOW: { attempts: 1, rollingAccuracy: 1 } },
      ),
    )
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.next.recommendation?.reason).toBe('resume')
    expect(insights.next.reasonCopy).toMatch(/Pick up/)
  })

  it('sequence (next chapter) after a chapter boss is cleared', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(
        { ...bestForFamily('BACKDOOR_WINDOW') },
        { BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 1 } },
      ),
      challengeAttempts: [
        {
          chapterSlug: 'read-the-denial',
          mode: 'boss-challenge',
          challengeSlug: 'denial-reader',
          passed: true,
          bestCount: 5,
          total: 5,
          attemptedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    })
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.next.recommendation?.reason).toBe('sequence')
    expect(insights.next.reasonCopy).toMatch(/chapter/i)
    expect(insights.bossesCleared).toBe(1)
  })

  it('null recommendation when every chapter + capstone are mastered', () => {
    const allBest: Record<string, LatestAttemptQuality> = {
      ...bestForFamily('BACKDOOR_WINDOW'),
      ...bestForFamily('EMPTY_SPACE_CUT'),
      ...bestForFamily('ADVANTAGE_OR_RESET'),
      ...bestForFamily('SKIP_THE_ROTATION'),
    }
    const decoderMastery: Partial<Record<DecoderTag, DecoderMasteryStat>> = {
      BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.95 },
      EMPTY_SPACE_CUT: { attempts: 6, rollingAccuracy: 0.95 },
      ADVANTAGE_OR_RESET: { attempts: 6, rollingAccuracy: 0.95 },
      SKIP_THE_ROTATION: { attempts: 6, rollingAccuracy: 0.95 },
    }
    const challengeAttempts: PathwayChallengeAttemptSummary[] = []
    for (const chapter of FOUNDATION.chapters) {
      if (chapter.bossChallenge) {
        challengeAttempts.push({
          chapterSlug: chapter.slug,
          mode: 'boss-challenge',
          challengeSlug: chapter.bossChallenge.slug,
          passed: true,
          bestCount: 5,
          total: 5,
          attemptedAt: '2026-05-01T00:00:00.000Z',
        })
      }
    }
    const capstone = FOUNDATION.chapters.find((c) => c.decoderTag === null)!
    const mixedNode =
      capstone.skillNodes.find((n) => n.trainingMode === 'mixed-reads') ?? capstone.skillNodes[0]!
    challengeAttempts.push({
      chapterSlug: capstone.slug,
      mode: 'mixed-reads',
      challengeSlug: mixedNode.slug,
      passed: true,
      bestCount: 5,
      total: 5,
      attemptedAt: '2026-05-02T00:00:00.000Z',
    })
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(allBest, decoderMastery),
      challengeAttempts,
    })
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.pathwayMastered).toBe(true)
    expect(insights.next.recommendation).toBeNull()
    expect(insights.next.reasonCopy).toBeNull()
    expect(insights.finalMixStatus).toBe('cleared')
    expect(insights.bossesCleared).toBe(insights.bossesTotal)
  })
})

// ---------------------------------------------------------------------------
// Recent runs + last activity.
// ---------------------------------------------------------------------------

describe('derivePlayerInsights — recent runs', () => {
  it('orders recent challenge runs by attemptedAt desc and caps at 3', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(),
      challengeAttempts: [
        {
          chapterSlug: 'read-the-denial',
          mode: 'boss-challenge',
          challengeSlug: 'denial-reader',
          passed: true,
          bestCount: 4,
          total: 5,
          attemptedAt: '2026-04-30T10:00:00.000Z',
        },
        {
          chapterSlug: 'move-when-eyes-leave',
          mode: 'boss-challenge',
          challengeSlug: 'gap-finder',
          passed: false,
          bestCount: 2,
          total: 5,
          attemptedAt: '2026-05-02T10:00:00.000Z',
        },
        {
          chapterSlug: 'beat-the-closeout',
          mode: 'boss-challenge',
          challengeSlug: 'closeout-killer',
          passed: true,
          bestCount: 5,
          total: 5,
          attemptedAt: '2026-05-01T10:00:00.000Z',
        },
        // 4th — should be dropped from recent (cap = 3) but should not
        // affect the most-recent ordering.
        {
          chapterSlug: 'punish-the-help',
          mode: 'boss-challenge',
          challengeSlug: 'help-punisher',
          passed: false,
          bestCount: 1,
          total: 5,
          attemptedAt: '2026-04-15T10:00:00.000Z',
        },
      ],
    })

    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.recent).toHaveLength(3)
    expect(insights.recent[0]!.chapterSlug).toBe('move-when-eyes-leave')
    expect(insights.recent[1]!.chapterSlug).toBe('beat-the-closeout')
    expect(insights.recent[2]!.chapterSlug).toBe('read-the-denial')
    expect(insights.lastActivityAt).toBe('2026-05-02T10:00:00.000Z')
  })

  it('returns empty recent + null lastActivity when nothing has been recorded', () => {
    const summary = derivePathwayProgress(FOUNDATION, makeInput())
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.recent).toEqual([])
    expect(insights.lastActivityAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Final Mix status mirrors the capstone challengeState.
// ---------------------------------------------------------------------------

describe('derivePlayerInsights — Final Mix status', () => {
  const capstone = FOUNDATION.chapters.find((c) => c.decoderTag === null)!
  const mixedNode =
    capstone.skillNodes.find((n) => n.trainingMode === 'mixed-reads') ?? capstone.skillNodes[0]!

  it('attempted (failed) capstone surfaces as attempted', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(),
      challengeAttempts: [
        {
          chapterSlug: capstone.slug,
          mode: 'mixed-reads',
          challengeSlug: mixedNode.slug,
          passed: false,
          bestCount: 2,
          total: 5,
          attemptedAt: '2026-05-03T00:00:00.000Z',
        },
      ],
    })
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.finalMixStatus).toBe('attempted')
  })

  it('cleared capstone surfaces as cleared', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(),
      challengeAttempts: [
        {
          chapterSlug: capstone.slug,
          mode: 'mixed-reads',
          challengeSlug: mixedNode.slug,
          passed: true,
          bestCount: 5,
          total: 5,
          attemptedAt: '2026-05-03T00:00:00.000Z',
        },
      ],
    })
    const insights = derivePlayerInsights(FOUNDATION, summary)
    expect(insights.finalMixStatus).toBe('cleared')
  })
})
