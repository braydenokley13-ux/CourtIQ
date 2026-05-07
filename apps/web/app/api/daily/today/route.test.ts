/**
 * Phase 9 — tests for the POST /api/daily/today route.
 *
 * Mocks supabase + prisma fully so the routing decisions and
 * SessionMode persistence can be asserted in isolation. The pure
 * Phase 7 daily composer is exercised by its own tests; here we
 * only assert glue.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    scenario: { findMany: vi.fn(), count: vi.fn() },
    attempt: { findMany: vi.fn() },
    sessionRun: { findFirst: vi.fn(), create: vi.fn() },
    user: { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/analytics/serverEvents', () => ({
  captureServerEvent: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { POST } from './route'

type MockedFn = ReturnType<typeof vi.fn>

function authedSupabase(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: 'p@x', user_metadata: {} } },
      }),
    },
  }
}

function unauthedSupabase() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  }
}

function makeLiveScenario(opts: {
  id: string
  decoder?: string | null
  disguise?: string
  difficulty?: number
}) {
  const tag = opts.decoder ?? 'BACKDOOR_WINDOW'
  const disg = opts.disguise ?? 'none'
  return {
    id: opts.id,
    version: 1,
    status: 'LIVE',
    category: 'OFFENSE',
    concept_tags: [],
    sub_concepts: [`tpl:${tag}.t`, `sig:|disg:${disg}|x`],
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
    decoder_tag: tag,
    created_at: new Date('2026-04-01T00:00:00Z'),
    updated_at: new Date('2026-04-01T00:00:00Z'),
    choices: [
      { id: `${opts.id}-a`, scenario_id: opts.id, label: 'A', is_correct: true, quality: 'best', feedback_text: '', order: 0 },
      { id: `${opts.id}-b`, scenario_id: opts.id, label: 'B', is_correct: false, quality: 'wrong', feedback_text: '', order: 1 },
    ],
  }
}

function richDailyCatalog() {
  // Need ≥ 20 LIVE scenarios + diversity across decoders + a heavy-
  // disguise option for the boss slot.
  const decoders = ['BACKDOOR_WINDOW', 'EMPTY_SPACE_CUT', 'SKIP_THE_ROTATION', 'ADVANTAGE_OR_RESET']
  const disguises = ['none', 'light', 'moderate', 'heavy']
  const scenarios: ReturnType<typeof makeLiveScenario>[] = []
  let i = 0
  for (const d of decoders) {
    for (const dg of disguises) {
      scenarios.push(makeLiveScenario({ id: `${d}-${dg}-${i++}`, decoder: d, disguise: dg }))
    }
  }
  // Pad to comfortably > 20.
  for (let n = 0; n < 8; n++) {
    scenarios.push(makeLiveScenario({ id: `pad-${n}`, decoder: 'BACKDOOR_WINDOW', disguise: 'none' }))
  }
  return scenarios
}

describe('POST /api/daily/today', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when the request is unauthenticated', async () => {
    ;(createClient as MockedFn).mockResolvedValue(unauthedSupabase())
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns the existing daily SessionRun when one already exists for today (idempotent)', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValueOnce({
      id: 'sess-existing',
      scenario_ids: ['sc-1', 'sc-2'],
      ended_at: null,
    })
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValueOnce([
      makeLiveScenario({ id: 'sc-1' }),
      makeLiveScenario({ id: 'sc-2' }),
    ])

    const res = await POST()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.session_run_id).toBe('sess-existing')
    expect(body.already_completed).toBe(false)
    // Mystery Mode: decoder_tag is suppressed in the response payload
    // even though the scenarios in the catalog have one.
    for (const s of body.scenarios) {
      expect(s.decoder_tag).toBeNull()
    }
    // No new SessionRun was created.
    expect(prisma.sessionRun.create).not.toHaveBeenCalled()
  })

  it('returns 503 with DAILY_UNAVAILABLE when the catalog is too thin', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null)
    // Only 5 LIVE scenarios — below MIN_LIVE_FOR_DAILY=20.
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue([
      makeLiveScenario({ id: 'a' }),
      makeLiveScenario({ id: 'b' }),
      makeLiveScenario({ id: 'c' }),
      makeLiveScenario({ id: 'd' }),
      makeLiveScenario({ id: 'e' }),
    ])
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])

    const res = await POST()
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body.error).toBe('DAILY_UNAVAILABLE')
    expect(prisma.sessionRun.create).not.toHaveBeenCalled()
  })

  it('creates a new daily SessionRun with mode=daily_challenge and Mystery-Mode scenarios', async () => {
    ;(createClient as MockedFn).mockResolvedValue(authedSupabase())
    ;(prisma.sessionRun.findFirst as MockedFn).mockResolvedValue(null)
    const catalog = richDailyCatalog()
    ;(prisma.scenario.findMany as MockedFn).mockResolvedValue(catalog)
    ;(prisma.attempt.findMany as MockedFn).mockResolvedValue([])
    ;(prisma.user.upsert as MockedFn).mockResolvedValue({ id: 'user-1' })
    ;(prisma.sessionRun.create as MockedFn).mockResolvedValue({
      id: 'sess-new',
      scenario_ids: catalog.slice(0, 5).map((s) => s.id),
    })

    const res = await POST()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.session_run_id).toBe('sess-new')
    expect(body.mystery_mode).toBe(true)

    // Persisted with mode=daily_challenge.
    const createArg = (prisma.sessionRun.create as MockedFn).mock.calls[0]?.[0]
    expect(createArg?.data?.mode).toBe('daily_challenge')

    // Five reps in the bundle, decoder_tag null on every one.
    expect(body.scenarios.length).toBe(5)
    for (const s of body.scenarios) {
      expect(s.decoder_tag).toBeNull()
    }
  })
})
