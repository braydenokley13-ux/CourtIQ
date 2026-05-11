'use client'

/**
 * Branded route-level error boundary. Sits inside RootLayout so the
 * fonts + theme are already mounted. The catastrophic case
 * (RootLayout itself throws) is handled by app/global-error.tsx.
 *
 * Sentry capture happens here too so we still log when the parent
 * layout is intact and only a child segment threw.
 */
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className="min-h-[100dvh] bg-bg-0 text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-foreground-mute mb-3">
          Error
        </p>
        <h1 className="font-display font-bold text-3xl leading-tight mb-3">
          Something went sideways.
        </h1>
        <p className="font-ui text-[15px] text-foreground-dim mb-2">
          We&apos;ve been notified and are on it. Try the play again.
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] text-foreground-mute mb-8">
            ref · {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center justify-center h-[58px] px-7 rounded-xl bg-brand text-brand-ink font-display font-bold uppercase tracking-[0.3px] text-[17px] shadow-brand cursor-pointer"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
