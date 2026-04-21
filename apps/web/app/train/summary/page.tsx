'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

export default function TrainSummaryPage() {
  return (
    <Suspense fallback={<SummaryFallback />}>
      <SummaryContent />
    </Suspense>
  )
}

function SummaryFallback() {
  return (
    <main className="min-h-dvh bg-bg-0 text-text p-6">
      <div className="max-w-md mx-auto rounded-3xl border border-hairline-2 bg-bg-1 p-6">
        <p className="text-text-dim">Loading summary…</p>
      </div>
    </main>
  )
}

function SummaryContent() {
  const params = useSearchParams()
  const correct = Number(params.get('correct') ?? 0)
  const total = Number(params.get('total') ?? 0)
  const xp = Number(params.get('xp') ?? 0)
  const iq = Number(params.get('iq') ?? 0)
  const duration = Number(params.get('duration') ?? 0)

  return (
    <main className="min-h-dvh bg-bg-0 text-text p-6">
      <div className="max-w-md mx-auto rounded-3xl border border-hairline-2 bg-bg-1 p-6 space-y-4">
        <h1 className="text-2xl font-bold">Session Complete</h1>
        <p className="text-text-dim">Great work. Review your deltas and queue up your next 5.</p>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Score" value={`${correct}/${total}`} />
          <Stat label="Duration" value={`${Math.round(duration / 1000)}s`} />
          <Stat label="XP" value={`+${xp}`} accent="xp" />
          <Stat label="IQ" value={`${iq > 0 ? '+' : ''}${iq}`} accent="iq" />
        </div>

        <div className="flex gap-2">
          <Link className="flex-1 rounded-xl bg-brand text-black text-center font-bold py-3" href="/train">
            Train Again
          </Link>
          <Link className="flex-1 rounded-xl bg-bg-3 text-center font-bold py-3" href="/">
            Home
          </Link>
        </div>
      </div>
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'xp' | 'iq' }) {
  const color = accent === 'xp' ? 'var(--xp)' : accent === 'iq' ? 'var(--iq)' : 'var(--text)'
  return (
    <div className="rounded-xl border border-hairline bg-bg-2 p-3">
      <div className="text-xs text-text-dim">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  )
}
