'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Court } from '@/components/court'
import type { CourtState } from '@/components/court/types'

type SessionScenario = {
  id: string
  difficulty: number
  prompt: string
  court_state: CourtState
  concept_tags: string[]
  render_tier: number
  choices: Array<{ id: string; label: string; order: number }>
}

type AttemptFeedback = {
  scenario_id: string
  choice_id: string
  is_correct: boolean
  feedback_text: string
  explanation_md: string
  correct_choice_id: string
  iq_delta: number
  xp_delta: number
  iq_after: number
  xp_total: number
  level: number
}

const USER_ID = 'demo-player'

export default function TrainPage() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<SessionScenario[]>([])
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<AttemptFeedback | null>(null)
  const [timeLeft, setTimeLeft] = useState(8)
  const [iq, setIq] = useState(500)
  const [xp, setXp] = useState(0)
  const [loading, setLoading] = useState(true)

  const current = scenarios[idx]
  const phase = feedback ? 'feedback' : 'prompt'

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, n: 5 }),
      })
      const data = await res.json()
      setSessionId(data.session_run_id)
      setScenarios(data.scenarios)
      setIq(data.meta.user_iq)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (phase !== 'prompt') return
    if (timeLeft <= 0) return
    const t = setTimeout(() => setTimeLeft((v) => Math.max(0, Number((v - 0.1).toFixed(1)))), 100)
    return () => clearTimeout(t)
  }, [phase, timeLeft])

  useEffect(() => {
    setTimeLeft(8)
    setSelected(null)
    setFeedback(null)
  }, [idx])

  const orderedChoices = useMemo(() => [...(current?.choices ?? [])].sort((a, b) => a.order - b.order), [current])

  if (loading || !current || !sessionId) {
    return <main className="p-6 text-text-dim">Loading session…</main>
  }

  const submitChoice = async (choiceId: string) => {
    if (feedback) return
    setSelected(choiceId)
    const spentMs = Math.round((8 - timeLeft) * 1000)
    const res = await fetch(`/api/session/${sessionId}/attempt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: USER_ID,
        scenarioId: current.id,
        choiceId,
        timeMs: spentMs,
      }),
    })
    const data = await res.json() as AttemptFeedback
    setFeedback(data)
    setIq(data.iq_after)
    setXp(data.xp_total)
  }

  const next = async () => {
    if (idx < scenarios.length - 1) {
      setIdx((v) => v + 1)
      return
    }

    const res = await fetch(`/api/session/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID }),
    })
    const data = await res.json()
    const qs = new URLSearchParams({
      sessionId,
      correct: String(data.correct_count),
      total: String(data.total),
      xp: String(data.xp_earned),
      iq: String(data.iq_delta),
      duration: String(data.duration_ms),
    })
    router.push(`/train/summary?${qs.toString()}`)
  }

  return (
    <main className="min-h-dvh bg-bg-0 text-text pb-8">
      <div className="max-w-md mx-auto px-4 pt-10 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-bg-2 rounded-full overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${((idx + 1) / scenarios.length) * 100}%` }} />
          </div>
          <div className="text-xs text-xp font-bold">XP {xp}</div>
          <div className="text-xs text-iq font-bold">IQ {iq}</div>
        </div>

        <div className="flex items-center justify-between text-xs text-text-dim">
          <span>{idx + 1}/{scenarios.length} · Difficulty {current.difficulty}</span>
          {phase === 'prompt' ? (
            <span className={timeLeft < 2 ? 'text-heat font-bold' : ''}>{timeLeft.toFixed(1)}s</span>
          ) : null}
        </div>

        <div className="rounded-2xl border border-hairline-2 overflow-hidden bg-bg-1">
          <Court
            width={360}
            height={280}
            courtState={current.court_state}
            you="you"
          />
        </div>

        <div>
          <p className="text-sm text-text-dim">{current.prompt}</p>
          <p className="text-xl font-bold mt-1">What do you do?</p>
        </div>

        <div className="space-y-2">
          {orderedChoices.map((choice, index) => {
            const letter = String.fromCharCode(65 + index)
            const isSelected = selected === choice.id
            const isCorrect = feedback?.correct_choice_id === choice.id
            const wrongPick = feedback && isSelected && !feedback.is_correct
            return (
              <button
                key={choice.id}
                onClick={() => void submitChoice(choice.id)}
                disabled={!!feedback}
                className="w-full text-left rounded-xl border px-4 py-3 bg-bg-1"
                style={{
                  borderColor: isCorrect ? 'var(--brand)' : wrongPick ? 'var(--heat)' : 'var(--hairline-2)',
                }}
              >
                <span className="text-text-dim mr-3">{letter}</span>
                {choice.label}
              </button>
            )
          })}
        </div>

        {feedback ? (
          <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4 space-y-2">
            <div className={feedback.is_correct ? 'text-brand font-semibold' : 'text-heat font-semibold'}>
              {feedback.is_correct ? 'Correct read.' : 'Not quite.'}
            </div>
            <p className="text-sm text-text-dim">{feedback.feedback_text}</p>
            <div className="flex gap-4 text-sm font-bold">
              <span className="text-xp">XP {feedback.xp_delta > 0 ? '+' : ''}{feedback.xp_delta}</span>
              <span className="text-iq">IQ {feedback.iq_delta > 0 ? '+' : ''}{feedback.iq_delta}</span>
            </div>
            <button onClick={() => void next()} className="w-full rounded-xl bg-brand text-black font-bold py-3 mt-2">
              {idx === scenarios.length - 1 ? 'Finish Session' : 'Next'}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  )
}
