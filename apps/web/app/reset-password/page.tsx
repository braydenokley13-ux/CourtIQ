'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
      <path d="M 160 680 L 160 460 A 240 240 0 0 1 640 460 L 640 680" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      <rect x="280" y="440" width="240" height="240" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      <circle cx="400" cy="440" r="72" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
      <line x1="100" y1="680" x2="700" y2="680" stroke="white" strokeOpacity="0.05" strokeWidth="1" />
      <line x1="100" y1="400" x2="700" y2="400" stroke="white" strokeOpacity="0.03" strokeWidth="1" />
    </svg>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const strength = getPasswordStrength(password)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.updateUser({ password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
    setTimeout(() => {
      // After a successful reset, sign the user out and bounce to login so
      // they re-authenticate with the new password.
      void supabase.auth.signOut().then(() => {
        router.push('/login')
        router.refresh()
      })
    }, 1500)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg-0 px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 60%, rgba(59,227,131,0.07) 0%, transparent 70%)',
        }}
      />
      <CourtLines />

      <div className="relative z-10 w-full max-w-[400px]">
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
              <circle cx="20" cy="20" r="7" stroke="#3BE383" strokeWidth="1.5" strokeOpacity="0.5" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">
              Court<span className="text-brand">IQ</span>
            </h1>
          </div>
        </motion.div>

        <motion.div
          custom={1}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="rounded-2xl border border-hairline-2 bg-bg-1 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_48px_rgba(0,0,0,0.5)]"
        >
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.32, ease }}
                className="flex flex-col items-center py-4 text-center"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(59,227,131,0.25)] bg-[rgba(59,227,131,0.08)]">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3BE383" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="mb-2 font-display text-[22px] font-bold text-foreground">Password updated</h2>
                <p className="font-ui text-sm leading-relaxed text-foreground-dim">Signing you out…</p>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <h2 className="mb-1 font-display text-[22px] font-bold text-foreground">Set a new password</h2>
                <p className="mb-6 font-ui text-sm text-foreground-dim">Choose something you&apos;ll remember.</p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="password" className="block font-ui text-[13px] font-medium text-foreground-dim">
                      New password
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

                  <div className="space-y-1.5">
                    <label htmlFor="confirm" className="block font-ui text-[13px] font-medium text-foreground-dim">
                      Confirm password
                    </label>
                    <input
                      id="confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter your new password"
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
                          <p className="font-ui text-[13px] leading-snug text-[#FF4D6D]">{error}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pt-1">
                    <PrimaryButton type="submit" loading={loading}>
                      Update password
                    </PrimaryButton>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

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
