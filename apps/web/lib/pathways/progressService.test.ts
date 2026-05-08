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

// Founder-only fixture map. Pack 2 decoders aren't exercised yet;
// lookups return undefined and the helper falls back to an empty
// array.
const FAMILY_IDS: Partial<Record<DecoderTag, string[]>> = {
  BACKDOOR_WINDOW: ['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'],
  EMPTY_SPACE_CUT: ['ESC-01', 'ESC-02', 'ESC-03', 'ESC-04', 'ESC-05'],
  ADVANTAGE_OR_RESET: ['AOR-01', 'AOR-02', 'AOR-03', 'AOR-04', 'AOR-05'],
  SKIP_THE_ROTATION: ['SKR-01', 'SKR-02', 'SKR-03', 'SKR-04', 'SKR-05'],
}

function bestForFamily(tag: DecoderTag): Record<string, LatestAttemptQuality> {
  const ids = FAMILY_IDS[tag] ?? []
  return Object.fromEntries(ids.map((id) => [id, 'best' as LatestAttemptQuality]))
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
  it('moves the recommendation to the next chapter once chapter 1 boss is cleared', () => {
    // PTH-5: a chapter is only mastered when its boss is cleared
    // server-side. With ch1's boss recorded as passed, the chapter is
    // mastered, ch2 is sequence-unlocked, and the rec lands inside ch2.
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(
        { ...bestForFamily('BACKDOOR_WINDOW') },
        { BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 1.0 } },
      ),
      challengeAttempts: [
        {
          chapterSlug: 'read-the-denial',
          mode: 'boss-challenge',
          challengeSlug: 'denial-reader',
          passed: true,
          bestCount: 4,
          total: 5,
          attemptedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    })

    expect(summary.chapters[0]!.state).toBe('mastered')
    // Sequence-unlock: chapter 2 should now be unlocked.
    expect(summary.chapters[1]!.state).toBe('unlocked')
    expect(summary.recommendedNext!.reason).toBe('sequence')
    expect(summary.recommendedNext!.chapterSlug).toBe('move-when-eyes-leave')
    expect(summary.recommendedNext!.skillNodeSlug).toBe('learn-the-cue')
  })
})

describe('derivePathwayProgress — full Foundation mastery', () => {
  it('reports pathwayMastered=true and recommendedNext=null when every scenario has best AND every boss + the capstone are cleared', () => {
    // PTH-5: full pathway mastery now requires every chapter boss to
    // be cleared server-side AND the capstone to be cleared. Node-level
    // best alone isn't enough — that's the whole point of the boss as
    // a no-hint final check.
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

    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(allBest, masteryAll),
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
        {
          chapterSlug: 'move-when-eyes-leave',
          mode: 'boss-challenge',
          challengeSlug: 'cutter',
          passed: true,
          bestCount: 5,
          total: 5,
          attemptedAt: '2026-05-02T00:00:00.000Z',
        },
        {
          chapterSlug: 'beat-the-closeout',
          mode: 'boss-challenge',
          challengeSlug: 'catch-decider',
          passed: true,
          bestCount: 5,
          total: 5,
          attemptedAt: '2026-05-03T00:00:00.000Z',
        },
        {
          chapterSlug: 'punish-the-help',
          mode: 'boss-challenge',
          challengeSlug: 'rotation-reader',
          passed: true,
          bestCount: 5,
          total: 5,
          attemptedAt: '2026-05-03T12:00:00.000Z',
        },
        {
          chapterSlug: 'real-game-mix',
          mode: 'mixed-reads',
          challengeSlug: 'mixed-warmup',
          passed: true,
          bestCount: 9,
          total: 10,
          attemptedAt: '2026-05-04T00:00:00.000Z',
        },
      ],
    })
    expect(summary.pathwayProgress).toBe(1)
    expect(summary.pathwayMastered).toBe(true)
    expect(summary.recommendedNext).toBeNull()
    expect(summary.chapters.every((c) => c.state === 'mastered')).toBe(true)
  })

  it('without the capstone clear, all-best on ch1–4 leaves the capstone unlocked (not mastered)', () => {
    // This is the inverse of the prior test: the capstone is no
    // longer auto-mastered just because prior chapters are mastered.
    // PTH-5 promotes mixed-reads attempts into the only signal that
    // can clear the capstone.
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
    expect(summary.pathwayMastered).toBe(false)
    const capstone = summary.chapters[4]!
    expect(capstone.state).toBe('unlocked')
    expect(capstone.progress).toBe(0)
    expect(capstone.challengeState.kind).toBe('capstone')
    expect(capstone.challengeState.state).toBe('not_started')
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

describe('derivePathwayProgress — challenge attempts (PTH-4)', () => {
  it('passes challengeAttempts straight through to the summary', () => {
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
          attemptedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    })
    expect(summary.challengeAttempts).toHaveLength(1)
    expect(summary.challengeAttempts[0]!.passed).toBe(true)
    expect(summary.challengeAttempts[0]!.challengeSlug).toBe('denial-reader')
  })

  it('defaults challengeAttempts to [] when input omits the field', () => {
    const summary = derivePathwayProgress(FOUNDATION, makeInput())
    expect(summary.challengeAttempts).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// PTH-5 — chapter / capstone state driven by server-persisted attempts.
// ---------------------------------------------------------------------------

const passedBoss = (
  chapterSlug: string,
  challengeSlug: string,
  overrides: Partial<{
    bestCount: number
    total: number
    passed: boolean
    attemptedAt: string
  }> = {},
) => ({
  chapterSlug,
  mode: 'boss-challenge' as const,
  challengeSlug,
  passed: true,
  bestCount: 5,
  total: 5,
  attemptedAt: '2026-05-01T00:00:00.000Z',
  ...overrides,
})

describe('PTH-5 — boss-cleared promotes chapter to mastered', () => {
  it('promotes a chapter with cleared boss to mastered even with imperfect node-best', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(
        // Imperfect node attempts: best on first 3 reps only.
        { 'BDW-01': 'best', 'BDW-02': 'best', 'BDW-03': 'best' },
        { BACKDOOR_WINDOW: { attempts: 3, rollingAccuracy: 1.0 } },
      ),
      challengeAttempts: [passedBoss('read-the-denial', 'denial-reader')],
    })
    const ch1 = summary.chapters[0]!
    expect(ch1.state).toBe('mastered')
    expect(ch1.progress).toBe(1)
    expect(ch1.challengeState.state).toBe('cleared')
    expect(ch1.challengeState.passed).toBe(true)
  })

  it('all-non-boss-nodes complete with no boss clear holds chapter at "completed" with 0.8 floor', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        // Every non-boss node "completed" via attempted (not best) so
        // node mastery is partial.
        {
          'BDW-01': 'acceptable',
          'BDW-02': 'acceptable',
          'BDW-03': 'acceptable',
          'BDW-04': 'acceptable',
          'BDW-05': 'acceptable',
        },
        { BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 0.7 } },
      ),
    )
    const ch1 = summary.chapters[0]!
    expect(ch1.state).toBe('completed')
    expect(ch1.progress).toBeGreaterThanOrEqual(0.8)
    expect(ch1.challengeState.state).toBe('not_started')
  })

  it('attempted-but-failed boss prevents auto-master on node attempts alone', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(
        { ...bestForFamily('BACKDOOR_WINDOW') },
        { BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 1.0 } },
      ),
      challengeAttempts: [
        passedBoss('read-the-denial', 'denial-reader', {
          passed: false,
          bestCount: 2,
          total: 5,
        }),
      ],
    })
    const ch1 = summary.chapters[0]!
    expect(ch1.state).not.toBe('mastered')
    expect(ch1.challengeState.state).toBe('attempted')
    expect(ch1.challengeState.passed).toBe(false)
  })
})

describe('PTH-5 — Real Game Mix capstone state machine', () => {
  it('locks the capstone when prior chapters are not all mastered', () => {
    const summary = derivePathwayProgress(FOUNDATION, makeInput())
    const capstone = summary.chapters[4]!
    expect(capstone.state).toBe('locked')
    expect(capstone.progress).toBe(0)
  })

  it('unlocks the capstone (progress=0) once all decoder chapters are mastered', () => {
    const allBest = {
      ...bestForFamily('BACKDOOR_WINDOW'),
      ...bestForFamily('EMPTY_SPACE_CUT'),
      ...bestForFamily('ADVANTAGE_OR_RESET'),
      ...bestForFamily('SKIP_THE_ROTATION'),
    }
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(allBest, {
        BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.95 },
        EMPTY_SPACE_CUT: { attempts: 6, rollingAccuracy: 0.95 },
        ADVANTAGE_OR_RESET: { attempts: 6, rollingAccuracy: 0.95 },
        SKIP_THE_ROTATION: { attempts: 6, rollingAccuracy: 0.95 },
      }),
      challengeAttempts: [
        passedBoss('read-the-denial', 'denial-reader'),
        passedBoss('move-when-eyes-leave', 'cutter'),
        passedBoss('beat-the-closeout', 'catch-decider'),
        passedBoss('punish-the-help', 'rotation-reader'),
      ],
    })
    const capstone = summary.chapters[4]!
    expect(capstone.state).toBe('unlocked')
    expect(capstone.progress).toBe(0)
    expect(capstone.challengeState.state).toBe('not_started')
  })

  it('marks capstone in_progress with 0.5 progress when mixed-reads attempted but failed', () => {
    const allBest = {
      ...bestForFamily('BACKDOOR_WINDOW'),
      ...bestForFamily('EMPTY_SPACE_CUT'),
      ...bestForFamily('ADVANTAGE_OR_RESET'),
      ...bestForFamily('SKIP_THE_ROTATION'),
    }
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(allBest, {
        BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.95 },
        EMPTY_SPACE_CUT: { attempts: 6, rollingAccuracy: 0.95 },
        ADVANTAGE_OR_RESET: { attempts: 6, rollingAccuracy: 0.95 },
        SKIP_THE_ROTATION: { attempts: 6, rollingAccuracy: 0.95 },
      }),
      challengeAttempts: [
        passedBoss('read-the-denial', 'denial-reader'),
        passedBoss('move-when-eyes-leave', 'cutter'),
        passedBoss('beat-the-closeout', 'catch-decider'),
        passedBoss('punish-the-help', 'rotation-reader'),
        {
          chapterSlug: 'real-game-mix',
          mode: 'mixed-reads',
          challengeSlug: 'mixed-warmup',
          passed: false,
          bestCount: 5,
          total: 10,
          attemptedAt: '2026-05-04T00:00:00.000Z',
        },
      ],
    })
    const capstone = summary.chapters[4]!
    expect(capstone.state).toBe('in_progress')
    expect(capstone.progress).toBe(0.5)
    expect(capstone.challengeState.state).toBe('attempted')
  })

  it('marks capstone mastered with 1.0 progress when mixed-reads passed', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(),
      challengeAttempts: [
        {
          chapterSlug: 'real-game-mix',
          mode: 'mixed-reads',
          challengeSlug: 'mixed-warmup',
          passed: true,
          bestCount: 9,
          total: 10,
          attemptedAt: '2026-05-04T00:00:00.000Z',
        },
      ],
    })
    const capstone = summary.chapters[4]!
    expect(capstone.state).toBe('mastered')
    expect(capstone.progress).toBe(1)
    expect(capstone.challengeState.state).toBe('cleared')
  })
})

describe('PTH-5 — recommendedNext for boss + capstone', () => {
  it('recommends running the boss when all non-boss nodes are clear and boss not attempted', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        bestForFamily('BACKDOOR_WINDOW'),
        { BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 1.0 } },
      ),
    )
    const rec = summary.recommendedNext!
    expect(rec.chapterSlug).toBe('read-the-denial')
    expect(rec.skillNodeSlug).toBe('denial-reader')
    expect(rec.label).toMatch(/Run the Boss/)
    expect(rec.trainHref).toContain('mode=boss-challenge')
  })

  it('recommends retrying a failed boss when nodes are clear', () => {
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(
        bestForFamily('BACKDOOR_WINDOW'),
        { BACKDOOR_WINDOW: { attempts: 5, rollingAccuracy: 1.0 } },
      ),
      challengeAttempts: [
        passedBoss('read-the-denial', 'denial-reader', {
          passed: false,
          bestCount: 2,
          total: 5,
        }),
      ],
    })
    const rec = summary.recommendedNext!
    expect(rec.chapterSlug).toBe('read-the-denial')
    expect(rec.label).toMatch(/Run it back/)
  })

  it('recommends Final Mix capstone after chapters 1–4 are mastered', () => {
    const allBest = {
      ...bestForFamily('BACKDOOR_WINDOW'),
      ...bestForFamily('EMPTY_SPACE_CUT'),
      ...bestForFamily('ADVANTAGE_OR_RESET'),
      ...bestForFamily('SKIP_THE_ROTATION'),
    }
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(allBest, {
        BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.95 },
        EMPTY_SPACE_CUT: { attempts: 6, rollingAccuracy: 0.95 },
        ADVANTAGE_OR_RESET: { attempts: 6, rollingAccuracy: 0.95 },
        SKIP_THE_ROTATION: { attempts: 6, rollingAccuracy: 0.95 },
      }),
      challengeAttempts: [
        passedBoss('read-the-denial', 'denial-reader'),
        passedBoss('move-when-eyes-leave', 'cutter'),
        passedBoss('beat-the-closeout', 'catch-decider'),
        passedBoss('punish-the-help', 'rotation-reader'),
      ],
    })
    const rec = summary.recommendedNext!
    expect(rec.chapterSlug).toBe('real-game-mix')
    expect(rec.reason).toBe('capstone')
    expect(rec.label).toMatch(/Final Mix/)
    expect(rec.trainHref).toContain('mode=mixed-reads')
  })

  it('recommends retrying the mixed-reads capstone when it was attempted but failed', () => {
    const allBest = {
      ...bestForFamily('BACKDOOR_WINDOW'),
      ...bestForFamily('EMPTY_SPACE_CUT'),
      ...bestForFamily('ADVANTAGE_OR_RESET'),
      ...bestForFamily('SKIP_THE_ROTATION'),
    }
    const summary = derivePathwayProgress(FOUNDATION, {
      ...makeInput(allBest, {
        BACKDOOR_WINDOW: { attempts: 6, rollingAccuracy: 0.95 },
        EMPTY_SPACE_CUT: { attempts: 6, rollingAccuracy: 0.95 },
        ADVANTAGE_OR_RESET: { attempts: 6, rollingAccuracy: 0.95 },
        SKIP_THE_ROTATION: { attempts: 6, rollingAccuracy: 0.95 },
      }),
      challengeAttempts: [
        passedBoss('read-the-denial', 'denial-reader'),
        passedBoss('move-when-eyes-leave', 'cutter'),
        passedBoss('beat-the-closeout', 'catch-decider'),
        passedBoss('punish-the-help', 'rotation-reader'),
        {
          chapterSlug: 'real-game-mix',
          mode: 'mixed-reads',
          challengeSlug: 'mixed-warmup',
          passed: false,
          bestCount: 5,
          total: 10,
          attemptedAt: '2026-05-04T00:00:00.000Z',
        },
      ],
    })
    const rec = summary.recommendedNext!
    expect(rec.chapterSlug).toBe('real-game-mix')
    expect(rec.label).toMatch(/Retry Mixed Reads/)
  })

  it('falls back to in-chapter resume when the chapter still has node-level work', () => {
    const summary = derivePathwayProgress(
      FOUNDATION,
      makeInput(
        // Two BDW reps best, three pending.
        { 'BDW-01': 'best', 'BDW-02': 'best' },
        { BACKDOOR_WINDOW: { attempts: 2, rollingAccuracy: 1.0 } },
      ),
    )
    expect(summary.recommendedNext!.reason).toBe('resume')
    expect(summary.recommendedNext!.chapterSlug).toBe('read-the-denial')
    // Should NOT route to the boss yet — nodes still pending.
    expect(summary.recommendedNext!.trainHref).not.toContain('mode=boss-challenge')
  })
})
