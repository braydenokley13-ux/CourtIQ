'use client'

import { useState, useEffect, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-0">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
    </div>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'auth_callback_error') setError('Sign-in failed. Please try again.')
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const syntheticEmail = `${username.trim().toLowerCase()}@users.courtiq.app`
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password })

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Wrong username or password. Check your details and try again.'
        : authError.message)
      setLoading(false)
    } else {
      router.push('/home')
      router.refresh()
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
        {/* Logo + wordmark */}
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
          <h2 className="mb-1 font-display text-[22px] font-bold text-foreground">Welcome back</h2>
          <p className="mb-6 font-ui text-sm text-foreground-dim">Sign in to continue your training.</p>

          <form onSubmit={handleLogin} className="space-y-3">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="block font-ui text-[13px] font-medium text-foreground-dim">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your_username"
                className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block font-ui text-[13px] font-medium text-foreground-dim">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="font-ui text-[12px] text-foreground-mute transition-colors hover:text-brand"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 pr-11 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-mute hover:text-foreground-dim focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
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

            {/* Submit */}
            <div className="pt-1">
              <PrimaryButton type="submit" loading={loading}>
                Sign in
              </PrimaryButton>
            </div>
          </form>
        </motion.div>

        {/* Sign up link */}
        <motion.p
          custom={2}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mt-6 text-center font-ui text-[13px] text-foreground-mute"
        >
          New to CourtIQ?{' '}
          <Link href="/signup" className="font-semibold text-brand transition-opacity hover:opacity-80">
            Create an account
          </Link>
        </motion.p>
      </div>
    </div>
  )
}
