/**
 * Persistence tests for challengeAttemptService (PTH-4).
 *
 * Mocks `@/lib/db/prisma` so we can verify:
 *   - bestCount is computed from Attempt -> ScenarioChoice.quality === 'best'
 *     (not from any client-supplied count);
 *   - passed is computed from chapter pass criteria;
 *   - the persisted row uses canonical scenarioIds from config;
 *   - getBestChallengeAttempt picks passed > bestCount > attemptedAt;
 *   - getChallengeAttemptSummary surfaces best-of-attempts only.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    attempt: { findMany: vi.fn() },
    scenarioChoice: { findMany: vi.fn() },
    bossChallengeAttempt: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db/prisma'
import {
  computeServerBestCount,
  getBestChallengeAttempt,
  getChallengeAttemptSummary,
  recordServerChallengeAttempt,
} from './challengeAttemptService'

type MockedFn = ReturnType<typeof vi.fn>

afterEach(() => {
  vi.resetAllMocks()
})

describe('computeServerBestCount', () => {
  it('counts only attempts whose ScenarioChoice.quality === "best"', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValueOnce([
      { scenario_id: 'BDW-01', choice_id: 'c-1', created_at: new Date('2026-04-01') },
      { scenario_id: 'BDW-02', choice_id: 'c-2', created_at: new Date('2026-04-01') },
      { scenario_id: 'BDW-03', choice_id: 'c-3', created_at: new Date('2026-04-01') },
    ])
    ;(prisma.scenarioChoice.findMany as MockedFn).mockResolvedValueOnce([
      { id: 'c-1', quality: 'best' },
      { id: 'c-2', quality: 'acceptable' },
      { id: 'c-3', quality: 'best' },
    ])

    const bestCount = await computeServerBestCount({
      userId: 'user-1',
      scenarioIds: ['BDW-01', 'BDW-02', 'BDW-03'],
    })
    expect(bestCount).toBe(2)
  })

  it('returns 0 when no attempts exist for the scenarios', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValueOnce([])
    const bestCount = await computeServerBestCount({
      userId: 'user-1',
      scenarioIds: ['BDW-01'],
    })
    expect(bestCount).toBe(0)
    expect(prisma.scenarioChoice.findMany).not.toHaveBeenCalled()
  })

  it('keeps the latest attempt per scenario when multiple exist', async () => {
    // findMany returns desc by created_at; the helper picks the first
    // one per scenario, so a later "wrong" attempt doesn't promote the
    // bestCount above an earlier "best" attempt.
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValueOnce([
      { scenario_id: 'BDW-01', choice_id: 'c-wrong', created_at: new Date('2026-04-02') },
      { scenario_id: 'BDW-01', choice_id: 'c-best', created_at: new Date('2026-04-01') },
    ])
    ;(prisma.scenarioChoice.findMany as MockedFn).mockResolvedValueOnce([
      { id: 'c-wrong', quality: 'wrong' },
      { id: 'c-best', quality: 'best' },
    ])
    const bestCount = await computeServerBestCount({
      userId: 'user-1',
      scenarioIds: ['BDW-01'],
    })
    expect(bestCount).toBe(0)
  })

  it('restricts the lookup to a session_run when provided', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValueOnce([])
    await computeServerBestCount({
      userId: 'user-1',
      scenarioIds: ['BDW-01'],
      sessionRunId: 'sess-9',
    })
    const call = (prisma.attempt.findMany as MockedFn).mock.calls[0]?.[0]
    expect(call?.where?.session_run_id).toBe('sess-9')
  })
})

describe('recordServerChallengeAttempt', () => {
  it('records a passed boss attempt with bestCount derived from server', async () => {
    // 5 attempts, 4 best-quality → 4/5 = 0.8, passes the boss ratio.
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValueOnce(
      ['BDW-01', 'BDW-02', 'BDW-03', 'BDW-04', 'BDW-05'].map((id, i) => ({
        scenario_id: id,
        choice_id: `c-${i}`,
        created_at: new Date('2026-04-10'),
      })),
    )
    ;(prisma.scenarioChoice.findMany as MockedFn).mockResolvedValueOnce([
      { id: 'c-0', quality: 'best' },
      { id: 'c-1', quality: 'best' },
      { id: 'c-2', quality: 'best' },
      { id: 'c-3', quality: 'best' },
      { id: 'c-4', quality: 'wrong' },
    ])
    ;(prisma.bossChallengeAttempt.create as MockedFn).mockImplementationOnce(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'row-1',
        attempted_at: new Date('2026-04-10T12:00:00Z'),
        ...data,
      }),
    )

    const result = await recordServerChallengeAttempt({
      userId: 'user-1',
      pathwaySlug: 'complete-iq-foundation',
      chapterSlug: 'read-the-denial',
      mode: 'boss-challenge',
      challengeSlug: 'denial-reader',
      sessionRunId: 'sess-1',
      // Client lies and says 5/5 — the server should ignore it.
      total: 99,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attempt.bestCount).toBe(4)
    expect(result.attempt.total).toBe(5)
    expect(result.attempt.passed).toBe(true)
    expect(result.attempt.scenarioIds).toEqual([
      'BDW-01',
      'BDW-02',
      'BDW-03',
      'BDW-04',
      'BDW-05',
    ])

    const createCall = (prisma.bossChallengeAttempt.create as MockedFn).mock.calls[0]?.[0]
    expect(createCall?.data?.best_count).toBe(4)
    expect(createCall?.data?.total).toBe(5)
    expect(createCall?.data?.passed).toBe(true)
    expect(createCall?.data?.session_run_id).toBe('sess-1')
  })

  it('records a failed boss attempt below the pass ratio', async () => {
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValueOnce(
      ['BDW-01', 'BDW-02'].map((id, i) => ({
        scenario_id: id,
        choice_id: `c-${i}`,
        created_at: new Date(),
      })),
    )
    ;(prisma.scenarioChoice.findMany as MockedFn).mockResolvedValueOnce([
      { id: 'c-0', quality: 'best' },
      { id: 'c-1', quality: 'wrong' },
    ])
    ;(prisma.bossChallengeAttempt.create as MockedFn).mockImplementationOnce(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'row-2',
        attempted_at: new Date(),
        ...data,
      }),
    )

    const result = await recordServerChallengeAttempt({
      userId: 'user-1',
      pathwaySlug: 'complete-iq-foundation',
      chapterSlug: 'read-the-denial',
      mode: 'boss-challenge',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attempt.bestCount).toBe(1)
    expect(result.attempt.passed).toBe(false)
  })

  it('returns pathway-not-found for an unknown pathway', async () => {
    const result = await recordServerChallengeAttempt({
      userId: 'user-1',
      pathwaySlug: 'not-a-real-pathway',
      chapterSlug: 'whatever',
      mode: 'boss-challenge',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('pathway-not-found')
    expect(prisma.bossChallengeAttempt.create).not.toHaveBeenCalled()
  })

  it('returns chapter-not-found for an unknown chapter slug', async () => {
    const result = await recordServerChallengeAttempt({
      userId: 'user-1',
      pathwaySlug: 'complete-iq-foundation',
      chapterSlug: 'made-up-chapter',
      mode: 'boss-challenge',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('chapter-not-found')
  })

  it('returns challenge-not-configured when boss config is missing', async () => {
    // The capstone chapter (real-game-mix) has a boss configured, but
    // a mismatched challengeSlug should fail config resolution.
    const result = await recordServerChallengeAttempt({
      userId: 'user-1',
      pathwaySlug: 'complete-iq-foundation',
      chapterSlug: 'real-game-mix',
      mode: 'boss-challenge',
      challengeSlug: 'definitely-wrong-slug',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('challenge-not-configured')
  })
})

describe('getBestChallengeAttempt', () => {
  it('uses the selectBestAttempt rule (passed > bestCount > attemptedAt)', async () => {
    ;(prisma.bossChallengeAttempt.findMany as MockedFn).mockResolvedValueOnce([
      {
        id: '1',
        user_id: 'u',
        pathway_slug: 'complete-iq-foundation',
        chapter_slug: 'read-the-denial',
        mode: 'boss-challenge',
        challenge_slug: 'denial-reader',
        session_run_id: null,
        best_count: 5,
        total: 5,
        passed: false,
        scenario_ids: [],
        attempted_at: new Date('2026-05-01'),
      },
      {
        id: '2',
        user_id: 'u',
        pathway_slug: 'complete-iq-foundation',
        chapter_slug: 'read-the-denial',
        mode: 'boss-challenge',
        challenge_slug: 'denial-reader',
        session_run_id: null,
        best_count: 4,
        total: 5,
        passed: true,
        scenario_ids: [],
        attempted_at: new Date('2026-04-01'),
      },
    ])

    const best = await getBestChallengeAttempt('u', {
      pathwaySlug: 'complete-iq-foundation',
      chapterSlug: 'read-the-denial',
      mode: 'boss-challenge',
      challengeSlug: 'denial-reader',
    })
    expect(best?.id).toBe('2')
    expect(best?.passed).toBe(true)
  })

  it('returns null when nothing is recorded', async () => {
    ;(prisma.bossChallengeAttempt.findMany as MockedFn).mockResolvedValueOnce([])
    const best = await getBestChallengeAttempt('u', {
      pathwaySlug: 'complete-iq-foundation',
      chapterSlug: 'read-the-denial',
      mode: 'boss-challenge',
      challengeSlug: 'denial-reader',
    })
    expect(best).toBeNull()
  })
})

describe('getChallengeAttemptSummary', () => {
  it('emits one summary row per challenge bucket using best-of-attempts', async () => {
    ;(prisma.bossChallengeAttempt.findMany as MockedFn).mockResolvedValueOnce([
      // Two boss attempts for denial-reader; best is the passing one.
      {
        id: 'a',
        user_id: 'u',
        pathway_slug: 'complete-iq-foundation',
        chapter_slug: 'read-the-denial',
        mode: 'boss-challenge',
        challenge_slug: 'denial-reader',
        session_run_id: null,
        best_count: 4,
        total: 5,
        passed: true,
        scenario_ids: [],
        attempted_at: new Date('2026-04-01'),
      },
      {
        id: 'b',
        user_id: 'u',
        pathway_slug: 'complete-iq-foundation',
        chapter_slug: 'read-the-denial',
        mode: 'boss-challenge',
        challenge_slug: 'denial-reader',
        session_run_id: null,
        best_count: 5,
        total: 5,
        passed: false, // (would never normally happen, but test the rule)
        scenario_ids: [],
        attempted_at: new Date('2026-04-02'),
      },
      // One mixed-reads attempt.
      {
        id: 'c',
        user_id: 'u',
        pathway_slug: 'complete-iq-foundation',
        chapter_slug: 'real-game-mix',
        mode: 'mixed-reads',
        challenge_slug: 'mixed-warmup',
        session_run_id: null,
        best_count: 8,
        total: 10,
        passed: true,
        scenario_ids: [],
        attempted_at: new Date('2026-04-03'),
      },
    ])

    const summary = await getChallengeAttemptSummary('u', 'complete-iq-foundation')
    expect(summary).toHaveLength(2)
    const denial = summary.find((r) => r.challengeSlug === 'denial-reader')!
    expect(denial.passed).toBe(true)
    expect(denial.bestCount).toBe(4)

    const mixed = summary.find((r) => r.challengeSlug === 'mixed-warmup')!
    expect(mixed.passed).toBe(true)
    expect(mixed.bestCount).toBe(8)
  })
})
