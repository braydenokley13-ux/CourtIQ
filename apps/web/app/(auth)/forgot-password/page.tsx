'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from '@/components/ui/Button'

const ease = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.48, ease, delay: i * 0.07 },
  }),
}

function CourtLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 800 800"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden
    >
      <circle cx="400" cy="400" r="120" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      <circle cx="400" cy="400" r="4" fill="white" fillOpacity="0.06" />
      <path
        d="M 160 680 L 160 460 A 240 240 0 0 1 640 460 L 640 680"
        stroke="white"
        strokeOpacity="0.04"
        strokeWidth="1"
      />
      <rect x="280" y="440" width="240" height="240" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      <circle cx="400" cy="440" r="72" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      <line x1="100" y1="680" x2="700" y2="680" stroke="white" strokeOpacity="0.05" strokeWidth="1" />
      <line x1="100" y1="400" x2="700" y2="400" stroke="white" strokeOpacity="0.03" strokeWidth="1" />
    </svg>
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg-0 px-4 py-12">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 60%, rgba(59,227,131,0.07) 0%, transparent 70%)',
        }}
      />
      <CourtLines />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Logo */}
        <motion.div
          className="mb-10 flex flex-col items-center gap-3"
          custom={0}
          initial="hidden"
          animate="show"
          variants={fadeUp}
        >
          <div className="relative flex h-14 w-14 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: 'rgba(59,227,131,0.15)', filter: 'blur(12px)' }}
            />
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
              <circle cx="20" cy="20" r="19" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.6" />
              <path d="M20 1C20 1 20 39 20 39" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" />
              <path d="M1 20C1 20 39 20 39 20" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" />
              <path d="M3.5 10C11 14 11 26 3.5 30" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
              <path d="M36.5 10C29 14 29 26 36.5 30" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
              <circle cx="20" cy="20" r="7" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.5" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">
              Court<span className="text-brand">IQ</span>
            </h1>
            <p className="mt-1 font-ui text-sm text-foreground-dim">
              Train your brain like you train your game.
            </p>
          </div>
        </motion.div>

        {/* Card */}
        <motion.div
          custom={1}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="rounded-2xl border border-hairline-2 bg-bg-1 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_48px_rgba(0,0,0,0.5)]"
        >
          <AnimatePresence mode="wait">
            {sent ? (
              // ── Success state ────────────────────────────────────────────────
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.32, ease }}
                className="flex flex-col items-center py-4 text-center"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(59,227,131,0.25)] bg-[rgba(59,227,131,0.08)]">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3BE383" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-[22px] font-bold text-foreground">Check your email</h2>
                <p className="font-ui text-sm leading-relaxed text-foreground-dim">
                  If{' '}
                  <span className="font-semibold text-foreground">{email}</span>{' '}
                  is registered, you&apos;ll receive a reset link shortly.
                </p>
                <p className="mt-4 font-ui text-[12px] text-foreground-mute">
                  Didn&apos;t receive it? Check your spam folder or{' '}
                  <button
                    onClick={() => { setSent(false); setEmail('') }}
                    className="text-brand underline underline-offset-2 hover:opacity-80"
                  >
                    try again
                  </button>
                  .
                </p>
              </motion.div>
            ) : (
              // ── Form state ───────────────────────────────────────────────────
              <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <div className="mb-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-hairline-2 bg-bg-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9BA1AD" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <h2 className="mb-1 font-display text-[22px] font-bold text-foreground">Forgot password?</h2>
                  <p className="font-ui text-sm text-foreground-dim">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block font-ui text-[13px] font-medium text-foreground-dim">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                    />
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-start gap-2.5 rounded-lg border border-[rgba(255,77,109,0.25)] bg-[rgba(255,77,109,0.08)] px-3.5 py-3">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4D6D" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <p className="font-ui text-[13px] leading-snug text-[#FF4D6D]">{error}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pt-1">
                    <PrimaryButton type="submit" loading={loading}>
                      Send reset link
                    </PrimaryButton>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Back to login */}
        <motion.p
          custom={2}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mt-6 text-center font-ui text-[13px] text-foreground-mute"
        >
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 font-semibold text-brand transition-opacity hover:opacity-80"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to sign in
          </Link>
        </motion.p>
      </div>
    </div>
  )
}
