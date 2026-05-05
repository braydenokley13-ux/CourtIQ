/**
 * POST /api/pathways/challenge-attempt (PTH-4).
 *
 * Records a server-persisted boss / mixed-reads challenge attempt for
 * the authenticated user. The client passes pathway/chapter/mode/
 * challenge metadata + the session_run_id; the server validates each
 * field against config, computes `bestCount` from the authoritative
 * `Attempt -> ScenarioChoice.quality` rows, decides pass/fail using
 * the chapter's configured pass criteria, and writes a
 * `BossChallengeAttempt` row.
 *
 * The endpoint never trusts a client-provided `bestCount`. Its purpose
 * is to take the result of a session that already completed and
 * promote it from localStorage to account-level state.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  recordServerChallengeAttempt,
  type RecordChallengeAttemptInput,
  type ServerChallengeMode,
} from '@/lib/pathways/challengeAttemptService'

interface RequestBody {
  pathwaySlug?: unknown
  chapterSlug?: unknown
  mode?: unknown
  challengeSlug?: unknown
  sessionRunId?: unknown
  scenarioIds?: unknown
  total?: unknown
}

function isMode(v: unknown): v is ServerChallengeMode {
  return v === 'boss-challenge' || v === 'mixed-reads'
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.filter((s): s is string => typeof s === 'string' && s.length > 0)
  return out.length > 0 ? out : null
}

function asPositiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return Math.floor(v)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
  }

  const pathwaySlug = asString(body.pathwaySlug)
  const chapterSlug = asString(body.chapterSlug)
  const mode = body.mode

  if (!pathwaySlug || !chapterSlug) {
    return NextResponse.json(
      { error: 'MISSING_FIELDS', message: 'pathwaySlug and chapterSlug are required' },
      { status: 400 },
    )
  }
  if (!isMode(mode)) {
    return NextResponse.json(
      { error: 'UNSUPPORTED_MODE', message: 'mode must be boss-challenge or mixed-reads' },
      { status: 400 },
    )
  }

  const input: RecordChallengeAttemptInput = {
    userId: user.id,
    pathwaySlug,
    chapterSlug,
    mode,
    challengeSlug: asString(body.challengeSlug),
    sessionRunId: asString(body.sessionRunId),
    scenarioIds: asStringArray(body.scenarioIds),
    total: asPositiveInt(body.total),
  }

  const result = await recordServerChallengeAttempt(input)
  if (!result.ok) {
    const status = result.reason === 'mode-not-supported' ? 400 : 404
    return NextResponse.json({ error: result.reason }, { status })
  }

  return NextResponse.json({ attempt: result.attempt })
}
