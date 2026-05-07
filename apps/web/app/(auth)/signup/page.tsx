'use client'

import { useState, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from '@/components/ui/Button'
import { trackSignup } from '@/features/auth/analytics'

const ease = [0.22, 1, 0.36, 1]

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.48, ease, delay: i * 0.07 },
  }),
}

const USERNAME_RE = /^[a-zA-Z0-9_.\-]{3,30}$/

function validateUsername(value: string): string | null {
  if (!USERNAME_RE.test(value)) {
    if (value.length < 3) return 'Username must be at least 3 characters.'
    if (value.length > 30) return 'Username must be 30 characters or fewer.'
    return 'Only letters, numbers, and . _ - are allowed.'
  }
  if (/^[._-]|[._-]$/.test(value)) return 'Username cannot start or end with . _ -'
  if (value.includes('..') || value.includes('--') || value.includes('__')) return 'Username cannot contain consecutive special characters.'
  return null
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak', color: '#FF4D6D' }
  if (score <= 3) return { score, label: 'Fair', color: '#FF8A3D' }
  return { score, label: 'Strong', color: '#3BE383' }
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

function EyeIcon({ open }: { open: boolean }) {
  if (!open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
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
        <p className="font-ui text-[13px] leading-snug text-[#FF4D6D]">{message}</p>
      </div>
    </motion.div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupSkeleton />}>
      <SignupContent />
    </Suspense>
  )
}

function SignupSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-0">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
    </div>
  )
}

function SignupContent() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = getPasswordStrength(password)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()

    const usernameError = validateUsername(username)
    if (usernameError) {
      setError(usernameError)
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    setError(null)

    const syntheticEmail = `${username.trim().toLowerCase()}@users.courtiq.app`
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email: syntheticEmail,
      password,
      options: {
        data: {
          username: username.trim().toLowerCase(),
          display_name: displayName.trim() || undefined,
          recovery_email: recoveryEmail.trim() || undefined,
          onboarded: false,
        },
      },
    })

    if (authError) {
      const msg = authError.message
      if (msg.includes('already registered') || msg.includes('already in use') || msg.includes('already exists')) {
        setError('Username already taken. Please choose a different one.')
      } else {
        setError(msg)
      }
      setLoading(false)
      return
    }

    trackSignup('username')

    if (data.session) {
      router.push('/onboarding')
      router.refresh()
    } else {
      // Should not happen when email confirmation is disabled, but handle gracefully
      router.push('/onboarding')
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
          <h2 className="mb-1 font-display text-[22px] font-bold text-foreground">Create your account</h2>
          <p className="mb-6 font-ui text-sm text-foreground-dim">Start your basketball IQ journey.</p>

          <form onSubmit={handleSignup} className="space-y-3">
            {/* Display name */}
            <div className="space-y-1.5">
              <label htmlFor="displayName" className="block font-ui text-[13px] font-medium text-foreground-dim">
                Display name <span className="text-foreground-mute">(optional)</span>
              </label>
              <input
                id="displayName"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="LeBron"
                className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>

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
                placeholder="e.g. ballislife_23"
                className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
              <p className="font-ui text-[11px] text-foreground-mute">
                Letters, numbers, and . _ - only · 3–30 characters
              </p>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block font-ui text-[13px] font-medium text-foreground-dim">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 pr-11 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-mute hover:text-foreground-dim focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>

              {/* Strength meter */}
              <AnimatePresence>
                {password.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-1.5">
                      <div className="mb-1.5 flex gap-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div
                            key={i}
                            className="h-1 flex-1 rounded-full transition-all duration-300"
                            style={{
                              background: i <= strength.score ? strength.color : 'rgba(255,255,255,0.08)',
                            }}
                          />
                        ))}
                      </div>
                      <p className="font-ui text-[11px]" style={{ color: strength.color }}>
                        {strength.label}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Recovery email toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowRecovery(v => !v)}
                className="flex items-center gap-1.5 font-ui text-[12px] text-foreground-mute transition-colors hover:text-foreground-dim focus:outline-none"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${showRecovery ? 'rotate-45' : ''}`}
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {showRecovery ? 'Remove recovery email' : 'Add recovery email (for password reset)'}
              </button>

              <AnimatePresence>
                {showRecovery && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-1.5">
                      <label htmlFor="recoveryEmail" className="block font-ui text-[13px] font-medium text-foreground-dim">
                        Recovery email
                      </label>
                      <input
                        id="recoveryEmail"
                        type="email"
                        autoComplete="email"
                        value={recoveryEmail}
                        onChange={e => setRecoveryEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                      />
                      <p className="font-ui text-[11px] text-foreground-mute">
                        Only used if you need to reset your password.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && <ErrorBanner message={error} />}
            </AnimatePresence>

            {/* Submit */}
            <div className="pt-1">
              <PrimaryButton type="submit" loading={loading}>
                Create account
              </PrimaryButton>
            </div>

            {/* Terms */}
            <p className="text-center font-ui text-[11px] leading-relaxed text-foreground-mute">
              By creating an account you agree to our{' '}
              <Link href="/terms" className="underline underline-offset-2 hover:text-foreground-dim">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground-dim">
                Privacy Policy
              </Link>
              .
            </p>
          </form>
        </motion.div>

        {/* Sign in link */}
        <motion.p
          custom={2}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="mt-6 text-center font-ui text-[13px] text-foreground-mute"
        >
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand transition-opacity hover:opacity-80">
            Sign in
          </Link>
        </motion.p>
      </div>
    </div>
  )
}
