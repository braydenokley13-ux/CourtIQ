/**
 * Tests for the pure helpers in challengeAttemptService (PTH-4).
 *
 * The Prisma-backed read/write paths are exercised by the route
 * integration test; these specs cover the rules the API depends on:
 * pass-criteria derivation, best-attempt selection, and config
 * resolution against the real Foundation pathway config.
 */

import { describe, expect, it } from 'vitest'
import {
  challengeBucketKey,
  DEFAULT_BOSS_PASS_RATIO,
  DEFAULT_MIXED_PASS_RATIO,
  buildPathwayChallengeSummary,
  isPassingChallenge,
  lookupPathwayChapter,
  passRatioFor,
  resolveChallengeConfig,
  selectBestAttempt,
} from './challengeAttemptService'
import { getFoundationPathway } from './helpers'

const FOUNDATION = getFoundationPathway()
const DENIAL = FOUNDATION.chapters.find((c) => c.slug === 'read-the-denial')!
const CAPSTONE = FOUNDATION.chapters.find((c) => c.slug === 'real-game-mix')!

describe('selectBestAttempt', () => {
  it('returns null on empty input', () => {
    expect(selectBestAttempt([])).toBeNull()
  })

  it('prefers passed over failed', () => {
    const best = selectBestAttempt([
      { passed: false, bestCount: 5, attemptedAt: '2026-01-02T00:00:00Z' },
      { passed: true, bestCount: 4, attemptedAt: '2026-01-01T00:00:00Z' },
    ])
    expect(best?.passed).toBe(true)
    expect(best?.bestCount).toBe(4)
  })

  it('breaks ties by higher bestCount among same pass state', () => {
    const best = selectBestAttempt([
      { passed: true, bestCount: 4, attemptedAt: '2026-01-02T00:00:00Z' },
      { passed: true, bestCount: 5, attemptedAt: '2026-01-01T00:00:00Z' },
    ])
    expect(best?.bestCount).toBe(5)
  })

  it('breaks tied passed + bestCount by newest attemptedAt', () => {
    const best = selectBestAttempt([
      { passed: true, bestCount: 5, attemptedAt: '2026-01-01T00:00:00Z' },
      { passed: true, bestCount: 5, attemptedAt: '2026-01-03T00:00:00Z' },
      { passed: true, bestCount: 5, attemptedAt: '2026-01-02T00:00:00Z' },
    ])
    expect(best?.attemptedAt).toBe('2026-01-03T00:00:00Z')
  })

  it('handles all-failed by picking the highest bestCount', () => {
    const best = selectBestAttempt([
      { passed: false, bestCount: 1, attemptedAt: '2026-01-03T00:00:00Z' },
      { passed: false, bestCount: 3, attemptedAt: '2026-01-01T00:00:00Z' },
      { passed: false, bestCount: 2, attemptedAt: '2026-01-02T00:00:00Z' },
    ])
    expect(best?.bestCount).toBe(3)
  })
})

describe('passRatioFor + isPassingChallenge', () => {
  it('uses the boss pass ratio for boss-challenge mode', () => {
    expect(passRatioFor(DENIAL, 'boss-challenge')).toBe(0.8)
  })

  it('falls back to DEFAULT_MIXED_PASS_RATIO when chapter has no bossBestRatio', () => {
    // The Real Game Mix chapter ships without a chapter-level
    // bossBestRatio, so mixed-reads pass uses the default.
    expect(passRatioFor(CAPSTONE, 'mixed-reads')).toBe(DEFAULT_MIXED_PASS_RATIO)
  })

  it('falls back to DEFAULT_BOSS_PASS_RATIO if the boss has no ratio', () => {
    const stripped = {
      ...DENIAL,
      bossChallenge: {
        ...DENIAL.bossChallenge!,
        passCriteria: {},
      },
    }
    expect(passRatioFor(stripped, 'boss-challenge')).toBe(DEFAULT_BOSS_PASS_RATIO)
  })

  it('passes when bestCount/total >= ratio, fails otherwise', () => {
    expect(isPassingChallenge(DENIAL, 'boss-challenge', 4, 5)).toBe(true)
    expect(isPassingChallenge(DENIAL, 'boss-challenge', 3, 5)).toBe(false)
    expect(isPassingChallenge(DENIAL, 'boss-challenge', 0, 0)).toBe(false)
  })
})

describe('resolveChallengeConfig', () => {
  it('returns the boss scenario set + canonical slug', () => {
    const result = resolveChallengeConfig(FOUNDATION, DENIAL, 'boss-challenge')
    expect(result).not.toBeNull()
    expect(result!.challengeSlug).toBe('denial-reader')
    expect(result!.scenarioIds).toEqual([
      'BDW-01',
      'BDW-02',
      'BDW-03',
      'BDW-04',
      'BDW-05',
    ])
    expect(result!.bossConfig).not.toBeNull()
  })

  it('rejects a mismatched boss challenge slug', () => {
    expect(
      resolveChallengeConfig(FOUNDATION, DENIAL, 'boss-challenge', 'wrong-slug'),
    ).toBeNull()
  })

  it('returns the mixed-reads node scenario set for the capstone chapter', () => {
    const result = resolveChallengeConfig(FOUNDATION, CAPSTONE, 'mixed-reads')
    expect(result).not.toBeNull()
    expect(result!.bossConfig).toBeNull()
    expect(result!.challengeSlug).toBe('mixed-warmup')
    expect(result!.scenarioIds.length).toBeGreaterThan(0)
  })

  it('returns null when the chapter has no boss configured', () => {
    const noBoss = { ...DENIAL, bossChallenge: undefined }
    expect(resolveChallengeConfig(FOUNDATION, noBoss, 'boss-challenge')).toBeNull()
  })
})

describe('lookupPathwayChapter', () => {
  it('finds a real chapter on a real pathway', () => {
    const lookup = lookupPathwayChapter('complete-iq-foundation', 'read-the-denial')
    expect(lookup).not.toBeNull()
    expect(lookup!.chapter.slug).toBe('read-the-denial')
  })

  it('returns null for an unknown pathway', () => {
    expect(lookupPathwayChapter('not-a-pathway', 'whatever')).toBeNull()
  })

  it('returns null for a coming-soon pathway', () => {
    expect(
      lookupPathwayChapter('off-ball-weapon', 'whatever'),
    ).toBeNull()
  })

  it('returns null for an unknown chapter on a real pathway', () => {
    expect(
      lookupPathwayChapter('complete-iq-foundation', 'made-up-chapter'),
    ).toBeNull()
  })
})

describe('buildPathwayChallengeSummary + challengeBucketKey', () => {
  it('keys are stable per (chapter, mode, challenge)', () => {
    const k = challengeBucketKey('read-the-denial', 'boss-challenge', 'denial-reader')
    expect(k).toBe('read-the-denial|boss-challenge|denial-reader')
  })

  it('summarizes only the passed/best-attempt fields the UI needs', () => {
    const summary = buildPathwayChallengeSummary(
      new Map([
        [
          'read-the-denial|boss-challenge|denial-reader',
          {
            id: 'row-1',
            pathwaySlug: 'complete-iq-foundation',
            chapterSlug: 'read-the-denial',
            mode: 'boss-challenge' as const,
            challengeSlug: 'denial-reader',
            sessionRunId: 'sess-1',
            bestCount: 5,
            total: 5,
            passed: true,
            scenarioIds: ['BDW-01'],
            attemptedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      ]),
    )
    expect(summary).toEqual([
      {
        chapterSlug: 'read-the-denial',
        mode: 'boss-challenge',
        challengeSlug: 'denial-reader',
        passed: true,
        bestCount: 5,
        total: 5,
        attemptedAt: '2026-05-01T00:00:00.000Z',
      },
    ])
  })
})
