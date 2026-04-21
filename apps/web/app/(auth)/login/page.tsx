'use client'

import { useState, useEffect } from 'react'
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  )
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
      {/* Center circle */}
      <circle cx="400" cy="400" r="120" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      <circle cx="400" cy="400" r="4" fill="white" fillOpacity="0.06" />
      {/* Three-point arc */}
      <path
        d="M 160 680 L 160 460 A 240 240 0 0 1 640 460 L 640 680"
        stroke="white"
        strokeOpacity="0.04"
        strokeWidth="1"
      />
      {/* Paint */}
      <rect x="280" y="440" width="240" height="240" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      {/* Free-throw circle */}
      <circle cx="400" cy="440" r="72" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      {/* Baseline */}
      <line x1="100" y1="680" x2="700" y2="680" stroke="white" strokeOpacity="0.05" strokeWidth="1" />
      {/* Midcourt line */}
      <line x1="100" y1="400" x2="700" y2="400" stroke="white" strokeOpacity="0.03" strokeWidth="1" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'auth_callback_error') setError('Sign-in failed. Please try again.')
  }, [searchParams])

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Wrong email or password. Check your details and try again.'
        : authError.message)
      setLoading(false)
    } else {
      router.push('/home')
      router.refresh()
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/home`,
      },
    })
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

      {/* Court line decorations */}
      <CourtLines />

      {/* Content */}
      <div className="relative z-10 w-full max-w-[400px]">
        {/* Logo + wordmark */}
        <motion.div
          className="mb-10 flex flex-col items-center gap-3"
          custom={0}
          initial="hidden"
          animate="show"
          variants={fadeUp}
        >
          {/* Basketball icon with brand glow */}
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

          {/* Google OAuth */}
          <motion.button
            whileTap={{ scale: 0.98, y: 1 }}
            transition={{ duration: 0.08 }}
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="mb-4 flex h-[46px] w-full items-center justify-center gap-3 rounded-xl border border-hairline-2 bg-bg-2 font-ui text-[14px] font-semibold text-foreground transition-colors hover:border-hairline hover:bg-bg-3 disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0"
          >
            {googleLoading ? (
              <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
                <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
              </svg>
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </motion.button>

          {/* Divider */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-hairline" />
            <span className="font-ui text-[11px] uppercase tracking-[1px] text-foreground-mute">or</span>
            <div className="h-px flex-1 bg-hairline" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            {/* Email */}
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
              <PrimaryButton type="submit" loading={loading} disabled={googleLoading}>
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
