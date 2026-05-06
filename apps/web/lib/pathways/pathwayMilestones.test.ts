/**
 * V2-F — pathway milestone helper tests.
 *
 * Locks the priority table:
 *   1. pathwayMastered → 'mastered'
 *   2. recommendedNext.reason === 'capstone' → 'capstone-unlocked'
 *   3. all non-capstone chapters mastered, capstone not yet
 *      recommended → 'capstone-near'
 *   4. recommended-next chapter is within 2 reps of mastery →
 *      'chapter-near'
 *   5. recommended-next exists with progress 0 → 'cold-start'
 *   6. otherwise fallback.
 */

import { describe, it, expect } from 'vitest'
import { deriveMilestone, ALL_MILESTONE_TONES } from './pathwayMilestones'
import type {
  PathwayConfig,
  PathwayChapterConfig,
  PathwayChapterProgress,
  PathwayProgressSummary,
  DecoderTag,
} from './types'

function chapter(
  slug: string,
  order: number,
  decoderTag: DecoderTag | null,
  title = `Chapter ${order}`,
): PathwayChapterConfig {
  return {
    slug,
    order,
    title,
    subtitle: '',
    basketballCue: '',
    decoderTag,
    skillNodes: [],
    passCriteria: {},
    masteryCriteria: {},
    parentSummary: '',
    coachSummary: '',
    goal: '',
  }
}

function pathway(chapters: PathwayChapterConfig[]): PathwayConfig {
  return {
    slug: 'test',
    title: 'Test pathway',
    subtitle: '',
    description: '',
    decoderTags: [],
    chapters,
    unlockCriteria: { alwaysAvailable: true },
    passCriteria: {},
    estimatedMinutes: 30,
    recommendedFor: [],
    targetArchetype: 'cutter',
    comingSoon: false,
    parentSummary: '',
    coachSummary: '',
    basketballProblem: '',
    difficultyRange: [1, 3],
  }
}

function chapterProgress(
  slug: string,
  overrides: Partial<PathwayChapterProgress> = {},
): PathwayChapterProgress {
  return {
    slug,
    state: 'unlocked',
    progress: 0,
    bestCount: 0,
    attemptedCount: 0,
    totalScenarios: 5,
    decoderAccuracy: null,
    decoderAttempts: 0,
    skillNodes: [],
    challengeState: {
      kind: 'none',
      state: 'not_started',
      bestCount: 0,
      total: 0,
      passed: false,
      attemptedAt: null,
      challengeSlug: null,
    },
    ...overrides,
  }
}

function summary(
  overrides: Partial<PathwayProgressSummary> = {},
): PathwayProgressSummary {
  return {
    slug: 'test',
    pathwayProgress: 0,
    pathwayMastered: false,
    chapters: [],
    recommendedNext: null,
    weakestDecoder: null,
    challengeAttempts: [],
    ...overrides,
  }
}

describe('deriveMilestone', () => {
  const cfg = pathway([
    chapter('c1', 1, 'BACKDOOR_WINDOW', 'Backdoor Window'),
    chapter('c2', 2, 'EMPTY_SPACE_CUT', 'Empty Space Cut'),
    chapter('c3', 3, null, 'Real Game Mix'),
  ])

  it('returns the fallback line when no progress is loaded yet', () => {
    expect(deriveMilestone(cfg, null).tone).toBe('fallback')
  })

  it('returns "mastered" when the whole pathway is done', () => {
    const m = deriveMilestone(
      cfg,
      summary({ pathwayMastered: true, pathwayProgress: 1 }),
    )
    expect(m.tone).toBe('mastered')
    expect(m.headline.toLowerCase()).toContain('mastered')
  })

  it('returns "capstone-unlocked" when recommended-next reason is capstone', () => {
    const m = deriveMilestone(
      cfg,
      summary({
        pathwayProgress: 0.7,
        recommendedNext: {
          chapterSlug: 'c3',
          skillNodeSlug: 'mixed',
          trainHref: '/train?mixed=1',
          label: 'Run Final Mix',
          reason: 'capstone',
        },
      }),
    )
    expect(m.tone).toBe('capstone-unlocked')
    expect(m.headline.toLowerCase()).toContain('final mix')
  })

  it('returns "capstone-near" when every non-capstone chapter is mastered', () => {
    const m = deriveMilestone(
      cfg,
      summary({
        pathwayProgress: 0.8,
        chapters: [
          chapterProgress('c1', { state: 'mastered', bestCount: 5, totalScenarios: 5 }),
          chapterProgress('c2', { state: 'mastered', bestCount: 5, totalScenarios: 5 }),
          chapterProgress('c3', { state: 'unlocked' }),
        ],
        recommendedNext: null,
      }),
    )
    expect(m.tone).toBe('capstone-near')
  })

  it('returns "chapter-near" when the active chapter is 1 rep short', () => {
    const m = deriveMilestone(
      cfg,
      summary({
        pathwayProgress: 0.4,
        chapters: [
          chapterProgress('c1', {
            state: 'in_progress',
            bestCount: 4,
            totalScenarios: 5,
          }),
        ],
        recommendedNext: {
          chapterSlug: 'c1',
          skillNodeSlug: 'node-1',
          trainHref: '/train',
          label: 'Continue',
          reason: 'resume',
        },
      }),
    )
    expect(m.tone).toBe('chapter-near')
    expect(m.headline.toLowerCase()).toContain('1 rep')
  })

  it('returns "cold-start" when nothing has been done yet', () => {
    const m = deriveMilestone(
      cfg,
      summary({
        pathwayProgress: 0,
        chapters: [
          chapterProgress('c1', { state: 'unlocked', bestCount: 0, totalScenarios: 5 }),
        ],
        recommendedNext: {
          chapterSlug: 'c1',
          skillNodeSlug: 'node-1',
          trainHref: '/train',
          label: 'Start',
          reason: 'cold-start',
        },
      }),
    )
    expect(m.tone).toBe('cold-start')
    expect(m.headline.toLowerCase()).toContain('start')
    expect(m.headline.toLowerCase()).toContain('backdoor')
  })

  it('returns fallback when no recommendation and progress is mid-path', () => {
    const m = deriveMilestone(
      cfg,
      summary({
        pathwayProgress: 0.5,
        chapters: [
          chapterProgress('c1', { state: 'in_progress', bestCount: 1, totalScenarios: 5 }),
        ],
        recommendedNext: null,
      }),
    )
    expect(m.tone).toBe('fallback')
  })

  it('exposes every tone via the ALL_MILESTONE_TONES export', () => {
    expect(ALL_MILESTONE_TONES).toContain('mastered')
    expect(ALL_MILESTONE_TONES).toContain('capstone-unlocked')
    expect(ALL_MILESTONE_TONES).toContain('capstone-near')
    expect(ALL_MILESTONE_TONES).toContain('chapter-near')
    expect(ALL_MILESTONE_TONES).toContain('cold-start')
    expect(ALL_MILESTONE_TONES).toContain('fallback')
  })

  it('is pure: same inputs return identical objects', () => {
    const s = summary({ pathwayMastered: true, pathwayProgress: 1 })
    const a = deriveMilestone(cfg, s)
    const b = deriveMilestone(cfg, s)
    expect(a).toEqual(b)
  })
})
