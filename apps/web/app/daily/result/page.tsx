'use client'

/**
 * Phase 8 — Daily Challenge result screen.
 *
 * Renders the in-app headline + recognition strip + the share-string
 * the player can copy to clipboard. The share-string is the only
 * social hook in the product — it's intentionally short, decoder-
 * free, and meaningless to anyone who hasn't done today's, which is
 * what makes it spread.
 */

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { track } from '@/lib/analytics/events'

interface DailyResultPayload {
  session_run_id: string
  date: string
  headline: string
  sub: string
  hits: number
  total: number
  total_time_ms: number
  dots: { hit: boolean }[]
  share_string: string
  streak: {
    current: number
    extended: boolean
    reset: boolean
    idempotent: boolean
  }
}

export default function DailyResultPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text-dim">
          <p className="text-sm">Tallying today&apos;s reads…</p>
        </main>
      }
    >
      <DailyResultInner />
    </Suspense>
  )
}

function DailyResultInner() {
  const params = useSearchParams()
  const id = params.get('id')
  const [data, setData] = useState<DailyResultPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setError('Missing daily session id.')
      return
    }
    void (async () => {
      try {
        const res = await fetch(`/api/daily/${id}/result`)
        if (!res.ok) {
          setError("Couldn't load today's result.")
          return
        }
        const body = (await res.json()) as DailyResultPayload
        setData(body)
      } catch {
        setError('Network error.')
      }
    })()
  }, [id])

  const onCopy = async () => {
    if (!data) return
    let method: 'clipboard' | 'fallback' = 'clipboard'
    try {
      // Modern clipboard API. Older Safari + insecure contexts fall
      // through to the textarea fallback.
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.share_string)
      } else {
        method = 'fallback'
        const ta = document.createElement('textarea')
        ta.value = data.share_string
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setCopyError(null)
      // Phase 9 — fire the daily_shared event so we can measure
      // share-rate. The strict event map enforces the payload shape.
      track('daily_shared', {
        session_run_id: data.session_run_id,
        date: data.date,
        hits: data.hits,
        total: data.total,
        method,
      })
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopyError("Couldn't copy. Tap the box and copy manually.")
    }
  }

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-0 px-6 text-text">
        <div className="max-w-sm rounded-2xl border border-hairline-2 bg-bg-1 p-6 text-center">
          <h1 className="font-display text-[20px] font-bold">{error}</h1>
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

  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text-dim">
        <p className="text-sm">Tallying today&apos;s reads…</p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-bg-0 text-text">
      <div className="mx-auto max-w-md space-y-5 px-4 pt-10 pb-12">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
            Daily · {data.date}
          </p>
          <h1 className="mt-2 font-display text-[26px] font-black leading-tight text-text">
            {data.headline}
          </h1>
          <p className="mt-1 text-[13px] text-text-dim">{data.sub}</p>
        </div>

        {/* Recognition strip — 5 dots, hit/miss. Mirrors the share-
            string but rendered without emoji so it reads on any
            device. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex items-center justify-center gap-2"
          data-testid="daily-result-strip"
        >
          {data.dots.map((d, i) => (
            <span
              key={i}
              aria-label={d.hit ? 'recognized' : 'missed'}
              className={[
                'inline-block h-4 w-4 rounded-full',
                d.hit ? 'bg-brand shadow-[0_0_12px_rgba(59,227,131,0.55)]' : 'bg-[#1F2937]',
              ].join(' ')}
            />
          ))}
        </motion.div>

        {/* Streak — independent from training. Idempotent re-completes
            don't re-render the streak; we only celebrate the actual
            extend / reset. */}
        {data.streak.current > 0 ? (
          <p
            data-testid="daily-result-streak"
            className="text-center text-[12px] font-semibold uppercase tracking-[1.3px] text-text-dim"
          >
            {data.streak.current === 1
              ? 'Day 1.'
              : `${data.streak.current}-day daily streak${data.streak.extended ? ' — extended.' : '.'}`}
          </p>
        ) : null}

        {/* Share — the entire point of the result screen. Plain
            <pre> so the strip + emoji render verbatim. The button
            is the primary action; tapping the box copies too. */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void onCopy()}
            data-testid="daily-result-share-box"
            className="ciq-press-soft w-full rounded-2xl border border-brand/30 bg-brand/5 p-4 text-left transition-colors hover:border-brand/60"
          >
            <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
              Share string · tap to copy
            </p>
            <pre
              data-testid="daily-result-share-string"
              className="mt-2 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-text"
            >
              {data.share_string}
            </pre>
          </button>
          <button
            type="button"
            onClick={() => void onCopy()}
            data-testid="daily-result-copy-button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 font-display text-[15px] font-bold uppercase tracking-[1px] text-brand-ink shadow-brand"
          >
            {copied ? 'Copied' : 'Copy result'}
          </button>
          {copyError ? (
            <p className="text-center text-[11px] text-heat">{copyError}</p>
          ) : null}
        </div>

        <div className="space-y-2 pt-2">
          <Link
            href="/home"
            className="block w-full rounded-2xl border border-hairline-2 bg-bg-2 py-3 text-center font-display text-[13px] font-semibold text-text-dim transition-colors hover:text-text"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  )
}
