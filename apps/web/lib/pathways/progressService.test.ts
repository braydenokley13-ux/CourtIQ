/**
 * Tests for the pure Pathway progress derivation (PTH-1).
 *
 * These exercise the priority order spelled out in §9 of the planning
 * doc: cold start, partial progress, single chapter mastery, full
 * Pathway mastery, weakness detection, and capstone unlock.
 *
 * We test the pure `derivePathwayProgress` function directly so the
 * specs don't need a database. Prisma fan-in is exercised separately
 * by `progressService.ts`'s thin server wrapper.
 */

import { describe, expect, it } from 'vitest'
import {
  derivePathwayProgress,
  type DecoderMasteryStat,
  type LatestAttemptQuality,
  type PathwayProgressInput,
} from './progressService'
import { getFoundationPathway } from './helpers'
import type { DecoderTag } from './types'

const FOUNDATION = getFoundationPathway()

const ALL_DECODERS: DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'ADVANTAGE_OR_RESET',
  'SKIP_THE_ROTATION',
]

function makeInput(
  qualityByScenario: Record<string, LatestAttemptQuality> = {},
  decoderMastery: Partial<Record<DecoderTag, DecoderMasteryStat>> = {},
): PathwayProgressInput {
  return {
    latestQualityByScenarioId: new Map(Object.entries(qualityByScenario)),
    decoderMasteryByTag: new Map(
      (Object.entries(decoderMastery) as [DecoderTag, DecoderMasteryStat][]).filter(
        ([, v]) => Boolean(v),
      ),
    ),
  }
}

const FAMILY_IDS: Record<DecoderTag, string[]> = {
  BACKDOOR_WINDOW: ['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'],
  EMPTY_SPACE_CUT: ['ESC-01', 'ESC-02', 'ESC-03', 'ESC-04', 'ESC-05'],
  ADVANTAGE_OR_RESET: ['AOR-01', 'AOR-02', 'AOR-03', 'AOR-04', 'AOR-05'],
  SKIP_THE_ROTATION: ['SKR-01', 'SKR-02', 'SKR-03', 'SKR-04', 'SKR-05'],
}

function bestForFamily(tag: DecoderTag): Record<string, LatestAttemptQuality> {
  return Object.fromEntries(FAMILY_IDS[tag].map((id) => [id, 'best' as LatestAttemptQuality]))
}

describe('derivePathwayProgress — Foundation cold start', () => {
  it('returns 0% with all chapters unlocked-or-locked and a cold-start CTA', () => {
    const summary = derivePathwayProgress(FOUNDATION, makeInput())

    expect(summary.slug).toBe('complete-iq-foundation')
    expect(summary.pathwayProgress).toBe(0)
    expect(summary.pathwayMastered).toBe(false)
    expect(summary.chapters).toHaveLength(5)
    expect(summary.weakestDecoder).toBeNull()

    // Chapter 1 is always unlocked; subsequent chapters are sequence-locked
    // until prior chapters are mastered.
    expect(summary.chapters[0]!.state).toBe('unlocked')
    expect(summary.chapters[1]!.state).toBe('locked')
    expect(summary.chapters[4]!.state).toBe('locked')

    // Cold-start recommendation points to chapter 1, learn-the-cue.
    expect(summary.recommendedNext).not.toBeNull()
    expect(summary.recommendedNext!.chapterSlug).toBe('read-the-denial')
    expect(summary.recommendedNext!.skillNodeSlug).toBe('learn-the-cue')
    expect(summary.recommendedNext!.reason).toBe('cold-start')
    expect(summary.recommendedNext!.label).toMatch(/Start/)
    expect(summary.recommendedNext!.trainHref).toContain('scenarioIds=BDW-01')
  })
})

describe('derivePathwayProgress — partial progress', () => {
  it('marks a chapter in_progress after a single attempt and sets a resume CTA', () => {
    // Player has tried BDW-01 once and got the best answer.
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        { 'BDW-01': 'best' },
        { BACKDOOR_WINDOW: { attempts: 1, rollingAccuracy: 1.0 } },
      ),
    )

    const ch1 = summary.chapters[0]!
    expect(ch1.state).toBe('in_progress')
    expect(ch1.attemptedCount).toBe(1)
    expect(ch1.bestCount).toBe(1)
    expect(ch1.totalScenarios).toBe(5)
    expect(ch1.decoderAttempts).toBe(1)
    expect(ch1.decoderAccuracy).toBe(1.0)

    // Recommended-next should now use the verb "Continue", not "Start",
    // and should point past learn-the-cue (which has been attempted).
    expect(summary.recommendedNext!.reason).toBe('resume')
    expect(summary.recommendedNext!.chapterSlug).toBe('read-the-denial')
    // BDW-01 is mastered (best on its only scenario), so "first-reps"
    // (BDW-01, BDW-02) is the next un-mastered node.
    expect(summary.recommendedNext!.skillNodeSlug).toBe('first-reps')
    expect(summary.recommendedNext!.label).toMatch(/Continue/)
  })

  it('weakest-decoder ignores tags below the 3-attempt floor', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        {},
        {
          BACKDOOR_WINDOW: { attempts: 1, rollingAccuracy: 0.0 }, // ignored
          EMPTY_SPACE_CUT: { attempts: 5, rollingAccuracy: 0.5 },
          ADVANTAGE_OR_RESET: { attempts: 5, rollingAccuracy: 0.9 },
        },
      ),
    )
    expect(summary.weakestDecoder).toBe('EMPTY_SPACE_CUT')
  })
})

describe('derivePathwayProgress — single chapter mastered', () => {
  it('moves the recommendation to the next chapter once chapter 1 is mastered', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        { ...bestForFamily('BACKDOOR_WINDOW') },
        { BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 1.0 } },
      ),
    )

    expect(summary.chapters[0]!.state).toBe('mastered')
    // Sequence-unlock: chapter 2 should now be unlocked.
    expect(summary.chapters[1]!.state).toBe('unlocked')
    expect(summary.recommendedNext!.reason).toBe('sequence')
    expect(summary.recommendedNext!.chapterSlug).toBe('move-when-eyes-leave')
    expect(summary.recommendedNext!.skillNodeSlug).toBe('learn-the-cue')
  })
})

describe('derivePathwayProgress — full Foundation mastery', () => {
  it('reports pathwayMastered=true and recommendedNext=null when every scenario has best', () => {
    const allBest = {
      ...bestForFamily('BACKDOOR_WINDOW'),
      ...bestForFamily('EMPTY_SPACE_CUT'),
      ...bestForFamily('ADVANTAGE_OR_RESET'),
      ...bestForFamily('SKIP_THE_ROTATION'),
    }
    const masteryAll: Partial<Record<DecoderTag, DecoderMasteryStat>> = {}
    for (const tag of ALL_DECODERS) {
      masteryAll[tag] = { attempts: 6, rollingAccuracy: 0.95 }
    }

    const summary = derivePathwayProgress(FOUNDATION, makeInput(allBest, masteryAll))
    expect(summary.pathwayProgress).toBe(1)
    expect(summary.pathwayMastered).toBe(true)
    expect(summary.recommendedNext).toBeNull()
    expect(summary.chapters.every((c) => c.state === 'mastered')).toBe(true)
  })
})

describe('derivePathwayProgress — recommendation priority', () => {
  it('prioritizes resume over sequence when a later chapter is in_progress', () => {
    // Chapter 1 mastered, chapter 2 has one attempt → resume should win
    // and point inside chapter 2.
    const input = makeInput(
      {
        ...bestForFamily('BACKDOOR_WINDOW'),
        'ESC-01': 'best', // attempted ch2
      },
      {
        BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 1.0 },
        EMPTY_SPACE_CUT: { attempts: 1, rollingAccuracy: 1.0 },
      },
    )
    const summary = derivePathwayProgress(FOUNDATION, input)
    expect(summary.recommendedNext!.reason).toBe('resume')
    expect(summary.recommendedNext!.chapterSlug).toBe('move-when-eyes-leave')
  })

  it('locks the capstone (Real Game Mix) until prior chapters are mastered', () => {
    // Three chapters mastered, ch4 still in progress. The capstone
    // (decoderTag === null) must stay locked because incidental
    // attempts on ch1–4 scenarios should not bleed into the capstone
    // ring in v1. Boss / mixed-read mode tracking arrives in PTH-3.
    const input = makeInput(
      {
        ...bestForFamily('BACKDOOR_WINDOW'),
        ...bestForFamily('EMPTY_SPACE_CUT'),
        ...bestForFamily('ADVANTAGE_OR_RESET'),
        'SKR-01': 'best',
      },
      {
        BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.95 },
        EMPTY_SPACE_CUT: { attempts: 6, rollingAccuracy: 0.95 },
        ADVANTAGE_OR_RESET: { attempts: 6, rollingAccuracy: 0.95 },
        SKIP_THE_ROTATION: { attempts: 1, rollingAccuracy: 1.0 },
      },
    )
    const summary = derivePathwayProgress(FOUNDATION, input)
    expect(summary.chapters[4]!.state).toBe('locked')
    expect(summary.chapters[4]!.attemptedCount).toBe(0) // not inflated by ch1–3 attempts
    expect(summary.pathwayMastered).toBe(false)
    // Resume points back into chapter 4 (in progress), not the capstone.
    expect(summary.recommendedNext!.chapterSlug).toBe('punish-the-help')
    expect(summary.recommendedNext!.reason).toBe('resume')
  })
})
