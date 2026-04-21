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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const strength = getPasswordStrength(password)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/home`,
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    trackSignup('email')

    // If session is immediately available, the project has email confirmation disabled
    if (data.session) {
      router.push('/home')
      router.refresh()
    } else {
      setConfirmed(true)
    }
  }

  async function handleGoogleSignup() {
    setGoogleLoading(true)
    setError(null)
    const supabase = createClient()
    trackSignup('google')
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
            {confirmed ? (
              // ── Check-your-email state ──────────────────────────────────────
              <motion.div
                key="confirmed"
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
                  We sent a confirmation link to{' '}
                  <span className="font-semibold text-foreground">{email}</span>.
                  Click it to activate your account.
                </p>
                <p className="mt-4 font-ui text-[12px] text-foreground-mute">
                  Didn&apos;t receive it? Check your spam folder.
                </p>
              </motion.div>
            ) : (
              // ── Signup form ─────────────────────────────────────────────────
              <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <h2 className="mb-1 font-display text-[22px] font-bold text-foreground">Create your account</h2>
                <p className="mb-6 font-ui text-sm text-foreground-dim">Start your basketball IQ journey.</p>

                {/* Google */}
                <motion.button
                  whileTap={{ scale: 0.98, y: 1 }}
                  transition={{ duration: 0.08 }}
                  onClick={handleGoogleSignup}
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

                <form onSubmit={handleSignup} className="space-y-3">
                  {/* Full name */}
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="block font-ui text-[13px] font-medium text-foreground-dim">
                      Full name
                    </label>
                    <input
                      id="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="LeBron James"
                      className="block h-[46px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 font-ui text-[14px] text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                    />
                  </div>

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

                  {/* Error */}
                  <AnimatePresence>
                    {error && <ErrorBanner message={error} />}
                  </AnimatePresence>

                  {/* Submit */}
                  <div className="pt-1">
                    <PrimaryButton type="submit" loading={loading} disabled={googleLoading}>
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
            )}
          </AnimatePresence>
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
