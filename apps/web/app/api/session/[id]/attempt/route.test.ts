/**
 * Phase γ (HUNT) — tests for POST /api/session/[id]/attempt focused on
 * the new optional `beatResults` plumbing.
 *
 * The route does heavy I/O (IQ, XP, mastery, streak, badges, emails);
 * we only exercise the body-parse + Attempt.create write path. The
 * other side effects are stubbed so the test stays fast and the
 * assertion targets the new column.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    sessionRun: { findUnique: vi.fn() },
    scenario: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/services/iqService', () => ({
  applyAttempt: vi.fn(async () => ({ iqBefore: 100, iqAfter: 105, iqDelta: 5 })),
}))
vi.mock('@/lib/services/xpService', () => ({
  award: vi.fn(async () => ({
    xpDelta: 10,
    xpTotal: 110,
    levelBefore: 1,
    levelAfter: 1,
  })),
}))
vi.mock('@/lib/services/masteryService', () => ({ update: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/streakService', () => ({
  tick: vi.fn(async () => ({ current: 1, previous: 0, extended: true, broken: false })),
}))
vi.mock('@/lib/services/badgeService', () => ({ checkAndAward: vi.fn(async () => []) }))
vi.mock('@/lib/analytics/serverEvents', () => ({ captureServerEvent: vi.fn() }))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/email/templates/badge-earned', () => ({
  badgeEarnedEmail: vi.fn(() => ({ subject: '', html: '' })),
}))

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { applyAttempt } from '@/lib/services/iqService'
import { award } from '@/lib/services/xpService'
import { tick as tickStreak } from '@/lib/services/streakService'
import { checkAndAward } from '@/lib/services/badgeService'
import { update as updateMastery } from '@/lib/services/masteryService'
import { parseBeatResults, POST } from './route'

type MockedFn = ReturnType<typeof vi.fn>

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function reqWith(body: Record<string, unknown>) {
  return new NextRequest('http://x/api/session/sess/attempt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setupHappyPath(
  attemptCreate: MockedFn,
  sessionUpdate: MockedFn,
) {
  ;(applyAttempt as MockedFn).mockResolvedValue({ iqBefore: 100, iqAfter: 105, iqDelta: 5 })
  ;(award as MockedFn).mockResolvedValue({ xpDelta: 10, xpTotal: 110, levelBefore: 1, levelAfter: 1 })
  ;(tickStreak as MockedFn).mockResolvedValue({ current: 1, previous: 0, extended: true, broken: false })
  ;(checkAndAward as MockedFn).mockResolvedValue([])
  ;(updateMastery as MockedFn).mockResolvedValue(undefined)
  ;(prisma.sessionRun.findUnique as MockedFn).mockResolvedValue({
    id: 'sess',
    user_id: 'user-1',
    scenario_ids: ['sc-1'],
    mode: 'training',
  })
  ;(prisma.scenario.findUnique as MockedFn).mockResolvedValue({
    id: 'sc-1',
    difficulty: 1,
    concept_tags: [],
    decoder_tag: null,
    explanation_md: '',
    choices: [
      { id: 'ch-1', is_correct: true, quality: 'best', feedback_text: '' },
      { id: 'ch-2', is_correct: false, quality: 'wrong', feedback_text: '' },
    ],
  })
  ;(prisma.$transaction as MockedFn).mockImplementation(async (fn: any) => {
    return fn({
      attempt: { create: attemptCreate },
      sessionRun: { update: sessionUpdate },
    })
  })
}

describe('parseBeatResults', () => {
  it('returns undefined for missing input (single-beat scenarios)', () => {
    expect(parseBeatResults(undefined)).toBeUndefined()
  })

  it('returns the array for a well-formed two-beat HUNT shape', () => {
    const got = parseBeatResults([
      { beatIndex: 0, correct: true },
      { beatIndex: 1, correct: false },
    ])
    expect(got).toEqual([
      { beatIndex: 0, correct: true },
      { beatIndex: 1, correct: false },
    ])
  })

  it('returns undefined for malformed input (negative beatIndex, missing correct, etc.)', () => {
    expect(parseBeatResults([{ beatIndex: -1, correct: true }])).toBeUndefined()
    expect(parseBeatResults([{ beatIndex: 0 }])).toBeUndefined()
    expect(parseBeatResults([{ beatIndex: 'zero', correct: true }])).toBeUndefined()
    expect(parseBeatResults('not-an-array')).toBeUndefined()
  })

  it('accepts an empty array (no beats reported but key was present)', () => {
    expect(parseBeatResults([])).toEqual([])
  })
})

describe('POST /api/session/[id]/attempt — beatResults plumbing', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  // attempt.create takes a `{ data: ... }` arg; declaring it on the
  // vi.fn so mock.calls is typed instead of `unknown[]`. Without this
  // `mock.calls[0]?.[0]` resolves to a 0-length tuple and TS rejects
  // the [0] index.
  type AttemptCreateArg = { data: Record<string, unknown> }
  type AttemptCreate = (arg: AttemptCreateArg) => Promise<undefined>
  type SessionUpdate = (arg: unknown) => Promise<undefined>

  function readAttemptData(fn: ReturnType<typeof vi.fn<AttemptCreate>>): Record<string, unknown> {
    const call = fn.mock.calls[0]
    if (!call) throw new Error('attempt.create was not called')
    return call[0].data
  }

  it('does NOT write beat_results when the field is absent (single-beat scenario)', async () => {
    const attemptCreate = vi.fn<AttemptCreate>(async () => undefined)
    const sessionUpdate = vi.fn<SessionUpdate>(async () => undefined)
    setupHappyPath(attemptCreate, sessionUpdate)

    const res = await POST(
      reqWith({ userId: 'user-1', scenarioId: 'sc-1', choiceId: 'ch-1', timeMs: 1000 }),
      params('sess'),
    )
    expect(res.status).toBe(200)
    expect(attemptCreate).toHaveBeenCalledTimes(1)
    const data = readAttemptData(attemptCreate)
    // Absent input → key is omitted, so the DB default (null) takes over.
    expect('beat_results' in data).toBe(false)
  })

  it('persists beat_results when a HUNT shape is provided', async () => {
    const attemptCreate = vi.fn<AttemptCreate>(async () => undefined)
    const sessionUpdate = vi.fn<SessionUpdate>(async () => undefined)
    setupHappyPath(attemptCreate, sessionUpdate)

    const beatResults = [
      { beatIndex: 0, correct: true },
      { beatIndex: 1, correct: false },
    ]
    const res = await POST(
      reqWith({
        userId: 'user-1',
        scenarioId: 'sc-1',
        choiceId: 'ch-1',
        timeMs: 1000,
        beatResults,
      }),
      params('sess'),
    )
    expect(res.status).toBe(200)
    const data = readAttemptData(attemptCreate)
    expect(data.beat_results).toEqual(beatResults)
  })

  it('falls back to omitting beat_results when the input is malformed', async () => {
    const attemptCreate = vi.fn<AttemptCreate>(async () => undefined)
    const sessionUpdate = vi.fn<SessionUpdate>(async () => undefined)
    setupHappyPath(attemptCreate, sessionUpdate)

    const res = await POST(
      reqWith({
        userId: 'user-1',
        scenarioId: 'sc-1',
        choiceId: 'ch-1',
        timeMs: 1000,
        beatResults: 'oops-not-an-array',
      }),
      params('sess'),
    )
    expect(res.status).toBe(200)
    const data = readAttemptData(attemptCreate)
    expect('beat_results' in data).toBe(false)
  })
})
