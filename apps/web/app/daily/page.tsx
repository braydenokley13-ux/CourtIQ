'use client'

/**
 * Phase 8 — Daily Challenge play surface.
 *
 * Mystery Mode 5-rep run. Same 5 reps for every player on the same
 * UTC day (with at most one transfer-probe swap, computed server-
 * side). Decoder labels are hidden until the result screen — the
 * point is to recognize the cue without a tag.
 *
 * Side effects on the daily are intentionally narrow: Attempt rows
 * are written for analytics; mastery + training-streak +badges are
 * skipped (see /api/session/[id]/attempt — reads SessionRun.mode).
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Court } from '@/components/court'
import type { CourtState } from '@/components/court'
import { ChoiceCard, deriveChoiceState } from '@/app/train/ChoiceCard'
import { createClient } from '@/lib/supabase/client'

interface DailyScenario {
  id: string
  difficulty: number
  prompt: string
  court_state: CourtState
  choices: Array<{ id: string; label: string; order: number }>
}

interface DailyBundle {
  session_run_id: string
  date: string
  scenarios: DailyScenario[]
  already_completed: boolean
  mystery_mode: true
}

interface AttemptFeedback {
  scenario_id: string
  choice_id: string
  is_correct: boolean
  correct_choice_id: string
}

export default function DailyPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [bundle, setBundle] = useState<DailyBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<AttemptFeedback | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [startMs, setStartMs] = useState<number>(() => Date.now())

  useEffect(() => {
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)
      try {
        const res = await fetch('/api/daily/today', { method: 'POST' })
        const body = (await res.json().catch(() => ({}))) as
          | DailyBundle
          | { error?: string; message?: string }
        if (!res.ok || !('session_run_id' in body)) {
          setError(
            'message' in body && body.message
              ? body.message
              : "Today's daily isn't ready.",
          )
          return
        }
        setBundle(body)
        if (body.already_completed) {
          router.replace(`/daily/result?id=${body.session_run_id}`)
        }
      } catch {
        setError('Network error. Try again.')
      }
    })()
  }, [router])

  useEffect(() => {
    setSelected(null)
    setFeedback(null)
    setStartMs(Date.now())
  }, [idx])

  const current = bundle?.scenarios[idx]
  const orderedChoices = useMemo(
    () => [...(current?.choices ?? [])].sort((a, b) => a.order - b.order),
    [current],
  )

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-0 px-6 text-text">
        <div className="max-w-sm rounded-2xl border border-hairline-2 bg-bg-1 p-6 text-center">
          <h1 className="font-display text-[20px] font-bold">Daily not ready</h1>
          <p className="mt-2 text-sm text-text-dim">{error}</p>
          <Link
            href="/home"
            className="mt-4 block w-full rounded-xl bg-bg-2 py-3 font-display text-[13px] font-semibold text-text-dim"
          >
            Back home
          </Link>
        </div>
      </main>
    )
  }

  if (!bundle || !current) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text-dim">
        <p className="text-sm">Setting today&apos;s reads…</p>
      </main>
    )
  }

  const submitChoice = async (choiceId: string) => {
    if (feedback || submitting || !userId) return
    setSubmitting(true)
    setSelected(choiceId)
    const timeMs = Date.now() - startMs
    try {
      const res = await fetch(`/api/session/${bundle.session_run_id}/attempt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          scenarioId: current.id,
          choiceId,
          timeMs,
        }),
      })
      const data = (await res.json()) as AttemptFeedback
      setFeedback(data)
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    if (idx < bundle.scenarios.length - 1) {
      setIdx((v) => v + 1)
      return
    }
    router.replace(`/daily/result?id=${bundle.session_run_id}`)
  }

  const progress = ((idx + (feedback ? 1 : 0)) / bundle.scenarios.length) * 100

  return (
    <main className="min-h-dvh bg-bg-0 text-text">
      <div className="mx-auto max-w-md space-y-3 px-4 pt-6 pb-8">
        {/* Daily eyebrow — Mystery Mode framing. The decoder noun is
            never named here; the result screen reveals what each rep
            was when the daily ends. */}
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[1.4px] text-text-dim transition-colors hover:text-text"
          >
            <span aria-hidden>✕</span> Quit
          </Link>
          <p
            data-testid="daily-mystery-eyebrow"
            className="text-[10px] font-bold uppercase tracking-[1.5px] text-brand"
          >
            Daily · Mystery Mode
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg-2">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-brand"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-text-dim">
            {idx + 1}/{bundle.scenarios.length}
          </span>
        </div>

        <div className="ciq-module-panel space-y-3 p-3">
          <div className="ciq-canvas-inset relative overflow-hidden bg-bg-0">
            <Court width={360} height={280} courtState={current.court_state} you="you" />
          </div>
        </div>

        <div>
          <p className="text-[12px] font-semibold leading-snug text-text-dim">
            {current.prompt}
          </p>
          <p className="mt-1 font-display text-[22px] font-bold leading-tight text-text">
            What do you do?
          </p>
        </div>

        <div className="space-y-2">
          {orderedChoices.map((choice, i) => {
            const letter = String.fromCharCode(65 + i)
            const state = deriveChoiceState({
              choiceId: choice.id,
              selected,
              feedback: feedback
                ? { is_correct: feedback.is_correct, correct_choice_id: feedback.correct_choice_id }
                : null,
              submitting,
            })
            return (
              <ChoiceCard
                key={choice.id}
                letter={letter}
                label={choice.label}
                state={state}
                disabled={!!feedback || submitting}
                onSelect={() => void submitChoice(choice.id)}
              />
            )
          })}
        </div>

        {feedback ? (
          <button
            onClick={next}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 font-display text-[15px] font-bold uppercase tracking-[1px] text-brand-ink shadow-brand"
          >
            {idx === bundle.scenarios.length - 1 ? 'See your daily' : 'Next rep'}
          </button>
        ) : null}
      </div>
    </main>
  )
}
