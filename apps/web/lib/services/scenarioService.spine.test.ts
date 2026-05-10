/**
 * Phase 9 — tests for the spine routing branches of
 * `generateSessionBundle`:
 *
 *   - lifetimeAttempts === 0 → firstSession composer
 *   - returning + classifyReturn !== 'fresh-cold' → returnLoop composer
 *   - concept filter set → bypass spine, use legacy weighted bundle
 *
 * These are mock-driven — Prisma is fully stubbed, so the tests
 * assert the routing decisions and the SessionMode that gets
 * persisted on SessionRun.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    scenario: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    sessionRun: { create: vi.fn(), findFirst: vi.fn() },
    // Phase δ-C — Profile now carries `calibrated_at`, which the HUNT
    // eligibility gate consumes directly. Tests default to a long-ago
    // calibration so the calibration-window check doesn't filter HUNT
    // out of every bundle; specific cases override.
    profile: { findUnique: vi.fn() },
    mastery: { findMany: vi.fn() },
    attempt: { findMany: vi.fn(), count: vi.fn() },
  },
}))

import { prisma } from '@/lib/db/prisma'
import { generateSessionBundle } from './scenarioService'

type MockedFn = ReturnType<typeof vi.fn>

function makeScenario(opts: {
  id: string
  decoder_tag?: string | null
  sub_concepts?: string[]
  difficulty?: number
  created_at?: Date
  concept_tags?: string[]
}) {
  return {
    id: opts.id,
    version: 1,
    status: 'LIVE',
    category: 'OFFENSE',
    concept_tags: opts.concept_tags ?? [],
    sub_concepts: opts.sub_concepts ?? [],
    difficulty: opts.difficulty ?? 1,
    court_state: {},
    scene: null,
    user_role: 'wing',
    prompt: '',
    explanation_md: '',
    xp_reward: 10,
    mastery_weight: 1,
    render_tier: 1,
    media_refs: [],
    decoder_tag: opts.decoder_tag ?? null,
    created_at: opts.created_at ?? new Date('2026-04-01T00:00:00Z'),
    updated_at: new Date('2026-04-01T00:00:00Z'),
    choices: [
      {
        id: `${opts.id}-a`,
        scenario_id: opts.id,
        label: 'A',
        is_correct: true,
        quality: 'best',
        feedback_text: '',
        order: 0,
      },
      {
        id: `${opts.id}-b`,
        scenario_id: opts.id,
        label: 'B',
        is_correct: false,
        quality: 'wrong',
        feedback_text: '',
        order: 1,
      },
    ],
  }
}

/** Catalog rich enough for the firstSession script to compose every
 *  step: one BDW.denied-wing scenario, one mirrored variant, one BDW
 *  alt template, and one AOR scenario. */
function richCatalog() {
  return [
    makeScenario({
      id: 'bdw-1',
      decoder_tag: 'BACKDOOR_WINDOW',
      sub_concepts: ['tpl:BDW.denied-wing', 'sig:|disg:moderate|x'],
    }),
    makeScenario({
      id: 'bdw-2',
      decoder_tag: 'BACKDOOR_WINDOW',
      sub_concepts: ['tpl:BDW.denied-wing', 'sig:mirror|disg:none|x'],
    }),
    makeScenario({
      id: 'bdw-3',
      decoder_tag: 'BACKDOOR_WINDOW',
      sub_concepts: ['tpl:BDW.alt', 'sig:|disg:none|x'],
    }),
    makeScenario({
      id: 'aor-1',
      decoder_tag: 'ADVANTAGE_OR_RESET',
      sub_concepts: ['tpl:AOR.short-closeout-shoot', 'sig:|disg:none|x'],
    }),
    makeScenario({
      id: 'bdw-4',
      decoder_tag: 'BACKDOOR_WINDOW',
      sub_concepts: ['tpl:BDW.denied-wing', 'sig:|disg:light|x'],
      difficulty: 2,
    }),
  ]
}

describe('generateSessionBundle — spine routing', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  beforeEach(() => {
    // No-op — profile mocks (which now carry `calibrated_at`) are
    // configured per-test below.
  })

  it('routes brand-new players (lifetimeAttempts === 0) through firstSession and persists mode=first_session', async () => {
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValue({
      iq_score: 500,
      current_streak: 0,
      calibrated_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    })
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue(richCatalog())
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.attempt.count as MockedFn).mockResolvedValue(0)
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null)
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValue({ id: 'sess-fs' })

    const bundle = await generateSessionBundle('user-1', 5)
    expect(bundle.scenarios.length).toBeGreaterThan(0)
    expect(bundle.meta.mode).toBe('first_session')
    expect(bundle.meta.return_context).toBe('fresh-cold')

    // SessionRun was created with mode = 'first_session'.
    const createCall = (prisma.sessionRun.create as MockedFn).mock.calls[0]?.[0]
    expect(createCall?.data?.mode).toBe('first_session')

    // Every scenario carries a recognition_reason eyebrow.
    for (const s of bundle.scenarios) {
      expect(s.recognition_reason).toBeTruthy()
    }

    // The legacy weighted-bundle queries are not run on this branch.
    expect(prisma.mastery.findMany).not.toHaveBeenCalled()
  })

  it('routes returning players (next-day) through returnLoop and surfaces a banner', async () => {
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValue({
      iq_score: 600,
      current_streak: 2,
      calibrated_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    })
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue(richCatalog())
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.attempt.count as MockedFn).mockResolvedValue(20)
    // Last session 1 day ago → classifyReturn returns 'next-day'.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue({ started_at: yesterday })
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValue({ id: 'sess-rl' })

    const bundle = await generateSessionBundle('user-2', 5)
    expect(bundle.meta.mode).toBe('return_loop')
    expect(bundle.meta.return_context).toBe('next-day')
    expect(bundle.meta.banner).toBeTruthy()

    const createCall = (prisma.sessionRun.create as MockedFn).mock.calls[0]?.[0]
    expect(createCall?.data?.mode).toBe('return_loop')
  })

  it('bypasses spine composers when concept filter is set, falling back to weighted bundle (mode=training)', async () => {
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValue({
      iq_score: 500,
      current_streak: 0,
      calibrated_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    })
    // Brand-new player (would normally route to firstSession), but
    // concept filter forces legacy weighted path.
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue([
      makeScenario({ id: 'sc-1', concept_tags: ['off-ball'] }),
      makeScenario({ id: 'sc-2', concept_tags: ['off-ball'] }),
      makeScenario({ id: 'sc-3', concept_tags: ['off-ball'] }),
      makeScenario({ id: 'sc-4', concept_tags: ['off-ball'] }),
      makeScenario({ id: 'sc-5', concept_tags: ['off-ball'] }),
    ])
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.attempt.count as MockedFn).mockResolvedValue(0)
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null)
    ;(prisma.mastery.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValue({ id: 'sess-w' })

    const bundle = await generateSessionBundle('user-3', 5, { concept: 'off-ball' })
    expect(bundle.meta.mode).toBe('training')
    expect(bundle.meta.return_context).toBeNull()
    expect(bundle.meta.banner).toBeNull()

    // The legacy-path mastery query DID run (proves we took the
    // legacy bundle, not the spine composer).
    expect(prisma.mastery.findMany).toHaveBeenCalled()
  })

  it('routes a daily-only player (no training attempts) through firstSession by filtering daily reps out of lifetimeCount', async () => {
    // The mock doesn't actually evaluate the where clause — but the
    // query whose result drives `lifetimeCount` is the second
    // attempt.count call. We assert here that scenarioService passes
    // a filter that excludes daily_challenge attempts.
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValue({
      iq_score: 500,
      current_streak: 0,
      calibrated_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    })
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue(richCatalog())
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    // The route should call attempt.count with a where clause that
    // filters out daily_challenge sessions. Stub it to return 0 so
    // the firstSession arc fires; we still inspect the call args.
    ;(prisma.attempt.count as MockedFn).mockResolvedValue(0)
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null)
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValue({ id: 'sess-fs-daily-only' })

    const bundle = await generateSessionBundle('user-daily-only', 5)
    expect(bundle.meta.mode).toBe('first_session')

    // Verify the count query passed the daily-exclusion filter.
    const countCall = (prisma.attempt.count as MockedFn).mock.calls[0]?.[0]
    expect(countCall?.where).toBeDefined()
    expect(JSON.stringify(countCall.where)).toContain('daily_challenge')
    expect(JSON.stringify(countCall.where)).toContain('not')

    // Same filter must apply to the lastSession lookup so a daily
    // completion an hour ago doesn't read as a "next-day" return.
    const sessionCall = (prisma.sessionRun.findFirst as MockedFn).mock.calls[0]?.[0]
    expect(JSON.stringify(sessionCall?.where)).toContain('daily_challenge')
  })

  it('persists SessionMode.training on the pinned scenarioIds (Pathways) path', async () => {
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValueOnce([
      makeScenario({ id: 'BDW-01' }),
      makeScenario({ id: 'BDW-02' }),
    ])
    ;(prisma.profile.findUnique as MockedFn).mockResolvedValueOnce({
      iq_score: 500,
      current_streak: 0,
      calibrated_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    })
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValueOnce({ id: 'sess-p' })

    const bundle = await generateSessionBundle('user-4', 2, {
      scenarioIds: ['BDW-01', 'BDW-02'],
    })
    expect(bundle.meta.mode).toBe('training')

    const createCall = (prisma.sessionRun.create as MockedFn).mock.calls[0]?.[0]
    expect(createCall?.data?.mode).toBe('training')

    // Spine composer queries are NOT run on the pinned path.
    expect(prisma.attempt.count).not.toHaveBeenCalled()
    expect(prisma.sessionRun.findFirst).not.toHaveBeenCalled()
  })
})
