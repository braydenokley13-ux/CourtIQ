/**
 * V1 Premiumization — Pathway CTA helper tests.
 *
 * Locked contracts:
 *  1. Mastered pathway → priority 'mastered', detail page link.
 *  2. recommended.reason === 'capstone' → priority 'capstone'.
 *  3. progress > 0 + recommended → 'continue'.
 *  4. progress === 0 + recommended → 'cold-start'.
 *  5. No recommended + not mastered → 'fallback' (detail page).
 *  6. summarisePathwayProgress counts chapters by state correctly.
 *  7. Helper never throws on null/undefined inputs.
 */

import { describe, it, expect } from 'vitest'
import {
  pickPathwayCta,
  summarisePathwayProgress,
  type PathwayCta,
} from './pathwayCta'
import type {
  PathwayChapterProgress,
  PathwayConfig,
  PathwayProgressSummary,
  PathwayRecommendedNext,
} from './types'

const fixturePathway = (): PathwayConfig =>
  ({
    slug: 'complete-iq-foundation',
    title: 'Complete IQ Foundation',
    subtitle: 'Learn to read every play.',
    description: '',
    parentSummary: '',
    coachSummary: '',
    basketballProblem: '',
    targetArchetype: 'connector',
    decoderTags: ['BACKDOOR_WINDOW'],
    estimatedMinutes: 30,
    difficultyRange: [1, 5],
    accentToken: 'brand',
    comingSoon: false,
    unlockCriteria: { alwaysAvailable: true },
    chapters: [
      {
        slug: 'chapter-1',
        order: 1,
        title: 'Chapter 1',
        subtitle: '',
        description: '',
        basketballCue: '',
        decoderTag: 'BACKDOOR_WINDOW',
        decoderTags: ['BACKDOOR_WINDOW'],
        skillNodes: [],
      },
      {
        slug: 'chapter-2',
        order: 2,
        title: 'Chapter 2',
        subtitle: '',
        description: '',
        basketballCue: '',
        decoderTag: 'EMPTY_SPACE_CUT',
        decoderTags: ['EMPTY_SPACE_CUT'],
        skillNodes: [],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

const buildProgress = (
  override: Partial<PathwayProgressSummary> = {},
): PathwayProgressSummary => ({
  slug: 'complete-iq-foundation',
  pathwayProgress: 0,
  pathwayMastered: false,
  chapters: [],
  recommendedNext: null,
  weakestDecoder: null,
  challengeAttempts: [],
  ...override,
})

const buildChapter = (
  override: Partial<PathwayChapterProgress> = {},
): PathwayChapterProgress => ({
  slug: 'chapter-1',
  state: 'unlocked',
  progress: 0,
  bestCount: 0,
  attemptedCount: 0,
  totalScenarios: 4,
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
  ...override,
})

const buildRecommended = (
  override: Partial<PathwayRecommendedNext> = {},
): PathwayRecommendedNext => ({
  chapterSlug: 'chapter-1',
  skillNodeSlug: 'node-1',
  trainHref: '/train?pathway=complete-iq-foundation&chapter=chapter-1&node=node-1',
  label: 'Backdoor reads',
  reason: 'sequence',
  ...override,
})

describe('pickPathwayCta', () => {
  it('returns a mastered CTA when the pathway is complete', () => {
    const result: PathwayCta = pickPathwayCta({
      pathway: fixturePathway(),
      progress: buildProgress({ pathwayMastered: true, pathwayProgress: 1 }),
    })
    expect(result.priority).toBe('mastered')
    expect(result.eyebrow).toBe('Pathway mastered')
    expect(result.primaryHref).toBe('/pathways/complete-iq-foundation')
  })

  it('returns a capstone CTA when recommended-next.reason is capstone', () => {
    const result = pickPathwayCta({
      pathway: fixturePathway(),
      progress: buildProgress({
        pathwayProgress: 0.8,
        recommendedNext: buildRecommended({
          reason: 'capstone',
          label: 'Final Mix',
        }),
      }),
    })
    expect(result.priority).toBe('capstone')
    expect(result.eyebrow).toBe('Final Mix unlocked')
    expect(result.primaryLabel).toBe('Final Mix')
    expect(result.primaryHref).toMatch(/^\/train\?/)
  })

  it('returns continue CTA when progress > 0 and recommended-next is sequence', () => {
    const result = pickPathwayCta({
      pathway: fixturePathway(),
      progress: buildProgress({
        pathwayProgress: 0.42,
        recommendedNext: buildRecommended(),
      }),
    })
    expect(result.priority).toBe('continue')
    expect(result.eyebrow).toBe('Up next')
    expect(result.primaryLabel).toBe('Continue training')
  })

  it('returns cold-start CTA when progress is 0', () => {
    const result = pickPathwayCta({
      pathway: fixturePathway(),
      progress: buildProgress({
        pathwayProgress: 0,
        recommendedNext: buildRecommended({ reason: 'cold-start' }),
      }),
    })
    expect(result.priority).toBe('cold-start')
    expect(result.eyebrow).toBe('First step')
    expect(result.primaryLabel).toBe('Start training')
  })

  it('returns a fallback CTA when no recommended-next is present', () => {
    const result = pickPathwayCta({
      pathway: fixturePathway(),
      progress: buildProgress({ recommendedNext: null }),
    })
    expect(result.priority).toBe('fallback')
    expect(result.primaryHref).toBe('/pathways/complete-iq-foundation')
  })

  it('does not throw on missing progress (cold session, never trained)', () => {
    expect(() =>
      pickPathwayCta({
        pathway: fixturePathway(),
        progress: null,
      }),
    ).not.toThrow()
  })

  it('passes through an explicit recommended override over progress.recommendedNext', () => {
    const recommendedOverride = buildRecommended({
      label: 'Override label',
      reason: 'capstone',
    })
    const result = pickPathwayCta({
      pathway: fixturePathway(),
      progress: buildProgress({
        recommendedNext: buildRecommended({ label: 'Wrong label' }),
      }),
      recommended: recommendedOverride,
    })
    // Override wins → capstone branch.
    expect(result.priority).toBe('capstone')
    expect(result.primaryLabel).toBe('Override label')
  })
})

describe('summarisePathwayProgress', () => {
  it('returns zeros when progress is null', () => {
    const sum = summarisePathwayProgress(fixturePathway(), null, () => null)
    expect(sum.totalChapters).toBe(2)
    expect(sum.chaptersMastered).toBe(0)
    expect(sum.chaptersInProgress).toBe(0)
    expect(sum.bestReps).toBe(0)
    expect(sum.weakestDecoderLabel).toBeNull()
  })

  it('counts mastered + in-progress chapters from the summary', () => {
    const sum = summarisePathwayProgress(
      fixturePathway(),
      buildProgress({
        chapters: [
          buildChapter({
            slug: 'chapter-1',
            state: 'mastered',
            attemptedCount: 4,
            bestCount: 4,
          }),
          buildChapter({
            slug: 'chapter-2',
            state: 'in_progress',
            attemptedCount: 2,
            bestCount: 1,
          }),
        ],
      }),
      () => null,
    )
    expect(sum.chaptersMastered).toBe(1)
    expect(sum.chaptersInProgress).toBe(1)
    expect(sum.bestReps).toBe(5)
    expect(sum.totalReps).toBe(8)
  })

  it("does not count an unlocked-but-untouched chapter as in progress", () => {
    const sum = summarisePathwayProgress(
      fixturePathway(),
      buildProgress({
        chapters: [
          buildChapter({ state: 'unlocked', attemptedCount: 0 }),
          buildChapter({ state: 'unlocked', attemptedCount: 0 }),
        ],
      }),
      () => null,
    )
    expect(sum.chaptersInProgress).toBe(0)
  })

  it('translates weakestDecoder via the lookup callback', () => {
    const sum = summarisePathwayProgress(
      fixturePathway(),
      buildProgress({ weakestDecoder: 'BACKDOOR_WINDOW' }),
      (tag) => (tag === 'BACKDOOR_WINDOW' ? 'Backdoor Window' : null),
    )
    expect(sum.weakestDecoderLabel).toBe('Backdoor Window')
  })
})
