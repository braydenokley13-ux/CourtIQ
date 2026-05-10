/**
 * Tests for the `scenarioIds` (plural) pin path on
 * `generateSessionBundle` (PTH-1).
 *
 * The plural path mirrors the existing `scenarioId` (singular) pin —
 * it bypasses weighted-bucket selection and returns the requested
 * LIVE scenarios in the requested order. Invalid IDs drop out; if
 * *every* requested ID is invalid the function throws
 * `InvalidScenarioIdsError` so the API can surface a 400 instead of
 * silently downgrading.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    scenario: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    sessionRun: { create: vi.fn(), findFirst: vi.fn() },
    // Phase δ-C — Profile now carries `calibrated_at`, consumed
    // directly by the HUNT eligibility gate. Replaces the prior
    // `User.created_at` proxy hydration.
    profile: { findUnique: vi.fn() },
    mastery: { findMany: vi.fn() },
    attempt: { findMany: vi.fn(), count: vi.fn() },
  },
}))

import { prisma } from '@/lib/db/prisma'
import {
  InvalidScenarioIdsError,
  generateSessionBundle,
} from './scenarioService'

type MockedFn = ReturnType<typeof vi.fn>

function makeScenario(id: string, choices = ['a', 'b']) {
  return {
    id,
    version: 1,
    status: 'LIVE',
    category: 'OFFENSE',
    concept_tags: ['off-ball'],
    sub_concepts: [],
    difficulty: 1,
    court_state: {},
    scene: null,
    user_role: 'wing',
    prompt: 'What do you do?',
    explanation_md: '',
    xp_reward: 10,
    mastery_weight: 1.0,
    render_tier: 1,
    media_refs: [],
    decoder_tag: null,
    created_at: new Date(),
    updated_at: new Date(),
    choices: choices.map((label, i) => ({
      id: `${id}-${label}`,
      scenario_id: id,
      label,
      is_correct: i === 0,
      quality: i === 0 ? 'best' : 'wrong',
      feedback_text: '',
      order: i,
    })),
  }
}

describe('generateSessionBundle — scenarioIds (plural) pin', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  beforeEach(() => {
    // No-op — profile mocks (which now carry `calibrated_at`) are
    // configured per-test. Tests that exercise the weighted-fallback
    // path set a long-ago calibration so HUNT stays in the pool.
  })

  it('returns the requested scenarios in the requested order, ignoring weighted bucket logic', async () => {
    const sA = makeScenario('BDW-01')
    const sB = makeScenario('BDW-02')
    const sC = makeScenario('BDW-03')
    // Prisma will return them in a non-deterministic order; the bundle
    // must still surface the requested order.
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValueOnce([sC, sA, sB])
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValueOnce({
      iq_score: 700,
      current_streak: 3,
      calibrated_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    })
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValueOnce({ id: 'sess-1' })

    const bundle = await generateSessionBundle('user-1', 3, {
      scenarioIds: ['BDW-01', 'BDW-02', 'BDW-03'],
    })

    expect(bundle.session_run_id).toBe('sess-1')
    expect(bundle.scenarios.map((s) => s.id)).toEqual(['BDW-01', 'BDW-02', 'BDW-03'])
    expect(bundle.meta.user_iq).toBe(700)

    // Critical: weighted-pool branches must not have run.
    expect(prisma.mastery.findMany).not.toHaveBeenCalled()
    expect(prisma.attempt.findMany).not.toHaveBeenCalled()

    // Sanitized — no choice answer keys leak.
    for (const s of bundle.scenarios) {
      for (const c of s.choices) {
        expect(c).not.toHaveProperty('is_correct')
        expect(c).not.toHaveProperty('feedback_text')
        expect(c).not.toHaveProperty('quality')
      }
    }
  })

  it('drops invalid IDs but still returns the valid ones in order', async () => {
    const sA = makeScenario('BDW-01')
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValueOnce([sA])
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValueOnce(null)
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValueOnce({ id: 'sess-2' })

    const bundle = await generateSessionBundle('user-1', 3, {
      scenarioIds: ['BDW-01', 'NOT-A-REAL-ID'],
    })

    expect(bundle.scenarios.map((s) => s.id)).toEqual(['BDW-01'])
  })

  it('throws InvalidScenarioIdsError when no requested IDs match a LIVE scenario', async () => {
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValueOnce([])

    await expect(
      generateSessionBundle('user-1', 2, { scenarioIds: ['NOPE-01', 'NOPE-02'] }),
    ).rejects.toBeInstanceOf(InvalidScenarioIdsError)

    expect(prisma.sessionRun.create).not.toHaveBeenCalled()
  })

  it('falls through to weighted bundle when scenarioIds is undefined or empty', async () => {
    // No scenarioIds → path should hit the standard weighted bundle.
    // Stub all the queries the weighted path makes.
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValue({
      iq_score: 500,
      current_streak: 0,
      calibrated_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    })
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue([
      makeScenario('SC-1'),
      makeScenario('SC-2'),
      makeScenario('SC-3'),
      makeScenario('SC-4'),
      makeScenario('SC-5'),
    ])
    ;(prisma.mastery.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.attempt.count as MockedFn).mockResolvedValue(50)
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null)
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValue({ id: 'sess-3' })

    const bundle = await generateSessionBundle('user-1', 5, { scenarioIds: [] })
    expect(bundle.scenarios.length).toBeGreaterThan(0)
    // The weighted path runs the mastery / attempt queries; the pinned
    // path doesn't.
    expect(prisma.mastery.findMany).toHaveBeenCalled()
  })
})
